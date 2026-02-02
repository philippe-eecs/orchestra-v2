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
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Running,
    Completed,
    Failed,
}

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

        let command = build_agent_command(&session_id, agent, model, prompt);

        tmux::create_session(&session_id, &command, cwd).map_err(|e| e.0)?;

        let session = Session {
            id: session_id.clone(),
            node_id: node_id.to_string(),
            agent: agent.to_string(),
            status: SessionStatus::Running,
            created_at: chrono::Utc::now().timestamp_millis(),
            exit_code: None,
            cwd: cwd.map(|s| s.to_string()),
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
        let mut sessions = self.sessions.lock().await;

        let to_update: Vec<String> = sessions
            .iter()
            .filter_map(|(id, s)| {
                if s.status == SessionStatus::Running && !tmux::session_exists(id) {
                    Some(id.clone())
                } else {
                    None
                }
            })
            .collect();

        for id in to_update {
            if let Some(s) = sessions.get_mut(&id) {
                s.status = SessionStatus::Completed;
            }
        }

        sessions.values().cloned().collect()
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
}

fn build_agent_command(session_id: &str, agent: &str, model: Option<&str>, prompt: &str) -> String {
    let escaped_prompt = prompt.replace('\'', "'\\''");
    let exit_file = format!("/tmp/orchestra-sessions/{}.exit", session_id);

    let agent_cmd = match agent {
        "claude" => {
            let model_arg = model
                .map(|m| format!(" --model {}", m))
                .unwrap_or_default();
            format!(
                "claude{} --allowedTools Bash,Read,Write,Edit,Glob,Grep -p '{}'",
                model_arg, escaped_prompt
            )
        }
        "codex" => {
            let model_arg = model
                .map(|m| format!(" --model {}", m))
                .unwrap_or_default();
            format!("codex{} exec '{}'", model_arg, escaped_prompt)
        }
        "gemini" => {
            let model_arg = model.map(|m| format!(" -m {}", m)).unwrap_or_default();
            format!("gemini{} '{}'", model_arg, escaped_prompt)
        }
        _ => format!("{} '{}'", agent, escaped_prompt),
    };

    // Wrap the command to:
    // 1. Create the exit directory
    // 2. Run the agent command
    // 3. Capture exit code to file when agent finishes
    // 4. Drop user into shell so they can inspect results
    format!(
        "mkdir -p /tmp/orchestra-sessions && {} ; echo $? > '{}' && echo '\\n✓ Agent finished. You can inspect results or type exit to close.' && exec $SHELL",
        agent_cmd, exit_file
    )
}

