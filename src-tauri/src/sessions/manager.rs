use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use super::tmux;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub node_id: String,
    pub agent: String,
    pub status: SessionStatus,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    /// Hash of last captured output (for staleness detection)
    #[serde(skip)]
    pub last_output_hash: Option<u64>,
    /// Count of consecutive polls with same output hash
    #[serde(skip)]
    pub stale_poll_count: u32,
    /// Detected question text when awaiting input
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detected_question: Option<String>,
    /// Node label for notifications
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Running,
    AwaitingInput,
    Completed,
    Failed,
}

pub struct StalenessUpdate {
    pub stale_count: u32,
    pub is_stale: bool,
    pub status: SessionStatus,
    pub cleared_awaiting_input: bool,
}

#[derive(Clone)]
pub struct SessionManager {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn create_session(
        &self,
        node_id: &str,
        agent: &str,
        model: Option<&str>,
        prompt: &str,
        cwd: Option<&str>,
    ) -> Result<Session, String> {
        let session_id = format!("orchestra-{}", uuid::Uuid::new_v4());

        let agent_kind = parse_agent(agent)?;
        let command = build_agent_command(&session_id, agent_kind, model, prompt)?;

        tmux::create_session(&session_id, &command, cwd).map_err(|e| e.0)?;

        let session = Session {
            id: session_id.clone(),
            node_id: node_id.to_string(),
            agent: agent.to_string(),
            status: SessionStatus::Running,
            created_at: chrono::Utc::now().timestamp_millis(),
            exit_code: None,
            cwd: cwd.map(|s| s.to_string()),
            last_output_hash: None,
            stale_poll_count: 0,
            detected_question: None,
            node_label: None,
        };

        self.sessions
            .lock()
            .await
            .insert(session_id.clone(), session.clone());

        Ok(session)
    }

    pub async fn get_session(&self, session_id: &str) -> Option<Session> {
        self.sessions.lock().await.get(session_id).cloned()
    }

    pub async fn list_sessions(&self) -> Vec<Session> {
        self.sessions.lock().await.values().cloned().collect()
    }

    pub async fn kill_session(&self, session_id: &str) -> Result<(), String> {
        tmux::kill_session(session_id).map_err(|e| e.0)?;
        self.sessions.lock().await.remove(session_id);
        Ok(())
    }

    /// Returns all sessions that are currently marked as running
    pub async fn list_running_sessions(&self) -> Vec<Session> {
        self.sessions
            .lock()
            .await
            .values()
            .filter(|s| s.status == SessionStatus::Running)
            .cloned()
            .collect()
    }

    /// Mark a session as completed with the given exit code
    pub async fn mark_completed(&self, session_id: &str, exit_code: i32) {
        if let Some(session) = self.sessions.lock().await.get_mut(session_id) {
            session.status = if exit_code == 0 {
                SessionStatus::Completed
            } else {
                SessionStatus::Failed
            };
            session.exit_code = Some(exit_code);
        }
    }

    /// Remove a session from tracking (used when session dies unexpectedly)
    pub async fn remove_session(&self, session_id: &str) {
        self.sessions.lock().await.remove(session_id);
    }

    /// Get the working directory for a session's node
    pub async fn get_session_cwd(&self, session_id: &str) -> Option<String> {
        self.sessions
            .lock()
            .await
            .get(session_id)
            .and_then(|s| s.cwd.clone())
    }

    /// Mark a session as awaiting input with optional detected question
    pub async fn mark_awaiting_input(&self, session_id: &str, detected_question: Option<String>) {
        if let Some(session) = self.sessions.lock().await.get_mut(session_id) {
            if session.status != SessionStatus::AwaitingInput {
                session.status = SessionStatus::AwaitingInput;
                session.detected_question = detected_question;
            }
        }
    }

    /// Update session's staleness tracking
    pub async fn update_staleness(
        &self,
        session_id: &str,
        output_hash: u64,
    ) -> Option<StalenessUpdate> {
        if let Some(session) = self.sessions.lock().await.get_mut(session_id) {
            let mut cleared_awaiting_input = false;
            let is_stale = session.last_output_hash == Some(output_hash);
            if is_stale {
                session.stale_poll_count += 1;
            } else {
                session.stale_poll_count = 0;
                session.last_output_hash = Some(output_hash);
                // Reset to running if output changed
                if session.status == SessionStatus::AwaitingInput {
                    session.status = SessionStatus::Running;
                    session.detected_question = None;
                    cleared_awaiting_input = true;
                }
            }
            Some(StalenessUpdate {
                stale_count: session.stale_poll_count,
                is_stale,
                status: session.status.clone(),
                cleared_awaiting_input,
            })
        } else {
            None
        }
    }

    /// Set the node label for a session (for notifications)
    pub async fn set_node_label(&self, session_id: &str, label: &str) {
        if let Some(session) = self.sessions.lock().await.get_mut(session_id) {
            session.node_label = Some(label.to_string());
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum AgentKind {
    Claude,
    Codex,
    Gemini,
}

fn parse_agent(agent: &str) -> Result<AgentKind, String> {
    match agent {
        "claude" => Ok(AgentKind::Claude),
        "codex" => Ok(AgentKind::Codex),
        "gemini" => Ok(AgentKind::Gemini),
        other => Err(format!("Unsupported agent type: {}", other)),
    }
}

fn validate_model(model: &str) -> Result<(), String> {
    if model.is_empty() {
        return Err("Model must not be empty".to_string());
    }
    if model.len() > 128 {
        return Err("Model is too long".to_string());
    }
    if !model
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | ':' | '/'))
    {
        return Err("Model contains invalid characters".to_string());
    }
    Ok(())
}

fn sh_escape_single_arg(s: &str) -> String {
    // Wrap in single quotes and escape embedded single quotes: ' -> '\''.
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn build_agent_command(
    session_id: &str,
    agent: AgentKind,
    model: Option<&str>,
    prompt: &str,
) -> Result<String, String> {
    let escaped_prompt = prompt.replace('\'', "'\\''");
    let exit_file = format!("/tmp/orchestra-sessions/{}.exit", session_id);

    let model = match model {
        Some(m) => {
            validate_model(m)?;
            Some(m)
        }
        None => None,
    };

    let agent_cmd = match agent {
        AgentKind::Claude => {
            let model_arg = model
                .map(|m| format!(" --model {}", sh_escape_single_arg(m)))
                .unwrap_or_default();
            format!(
                "claude{} --allowedTools Bash,Read,Write,Edit,Glob,Grep -p '{}'",
                model_arg, escaped_prompt
            )
        }
        AgentKind::Codex => {
            let model_arg = model
                .map(|m| format!(" --model {}", sh_escape_single_arg(m)))
                .unwrap_or_default();
            format!("codex{} exec '{}'", model_arg, escaped_prompt)
        }
        AgentKind::Gemini => {
            let model_arg = model
                .map(|m| format!(" -m {}", sh_escape_single_arg(m)))
                .unwrap_or_default();
            format!("gemini{} '{}'", model_arg, escaped_prompt)
        }
    };

    // Wrap the command to:
    // 1. Create the exit directory
    // 2. Run the agent command
    // 3. Capture exit code to file when agent finishes
    // 4. Drop user into shell so they can inspect results
    Ok(format!(
        "mkdir -p /tmp/orchestra-sessions && {} ; echo $? > '{}' && echo '\\n✓ Agent finished. You can inspect results or type exit to close.' && exec ${{SHELL:-/bin/bash}}",
        agent_cmd, exit_file
    ))
}
