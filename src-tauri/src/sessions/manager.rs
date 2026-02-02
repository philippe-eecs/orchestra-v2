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
        extra_args: Option<&[String]>,
        prompt: &str,
        cwd: Option<&str>,
    ) -> Result<Session, String> {
        let session_id = format!("orchestra-{}", uuid::Uuid::new_v4());

        let agent_kind = parse_agent(agent)?;
        let command = build_agent_command(&session_id, agent_kind, model, extra_args, prompt)?;

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

    pub async fn list_sessions(&self) -> Vec<Session> {
        self.sessions.lock().await.values().cloned().collect()
    }

    pub async fn kill_session(&self, session_id: &str) -> Result<(), String> {
        tmux::kill_session(session_id).map_err(|e| e.0)?;
        self.sessions.lock().await.remove(session_id);
        Ok(())
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

    // Note: node_label is included on the session struct for future UX, but we don't currently
    // populate it from the backend project store.
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
    extra_args: Option<&[String]>,
    prompt: &str,
) -> Result<String, String> {
    let exit_file = format!("/tmp/orchestra-sessions/{}.exit", session_id);

    let model = match model {
        Some(m) => {
            validate_model(m)?;
            Some(m)
        }
        None => None,
    };

    let extra_args = extra_args.unwrap_or(&[]);
    if extra_args.len() > 64 {
        return Err("Too many extraArgs (max 64)".to_string());
    }
    for a in extra_args {
        if a.is_empty() {
            return Err("extraArgs contains an empty argument".to_string());
        }
        if a.len() > 1024 {
            return Err("extraArgs contains an argument that is too long".to_string());
        }
        if a.contains('\0') {
            return Err("extraArgs contains an invalid character".to_string());
        }
    }

    let prompt = prompt.trim();
    let mut argv: Vec<&str> = Vec::new();
    match agent {
        AgentKind::Claude => {
            // Claude Code CLI (aligned with `executors/local.rs`):
            // One-shot uses `-p/--print`, but interactive sessions should start interactive by
            // default and pass the initial message as a positional [prompt] argument.
            //   claude --allowedTools ... --model sonnet [extraArgs...] [prompt]
            argv.push("claude");
            argv.push("--allowedTools");
            argv.push("Bash,Read,Write,Edit,Glob,Grep");
            if let Some(m) = model {
                argv.push("--model");
                argv.push(m);
            }
            for a in extra_args {
                argv.push(a);
            }
            if !prompt.is_empty() {
                argv.push(prompt);
            }
        }
        AgentKind::Codex => {
            // Codex CLI (aligned with `executors/local.rs`):
            // One-shot uses `codex exec`, but interactive sessions should omit the subcommand.
            //   codex [--model ...] [extraArgs...] [prompt]
            argv.push("codex");
            if let Some(m) = model {
                argv.push("--model");
                argv.push(m);
            }
            for a in extra_args {
                argv.push(a);
            }
            if !prompt.is_empty() {
                argv.push(prompt);
            }
        }
        AgentKind::Gemini => {
            // Gemini CLI:
            // Positional prompt defaults to one-shot; for interactive, use -i/--prompt-interactive.
            //   gemini [-m model] [extraArgs...] [-i prompt]
            argv.push("gemini");
            if let Some(m) = model {
                argv.push("-m");
                argv.push(m);
            }
            for a in extra_args {
                argv.push(a);
            }
            if !prompt.is_empty() {
                argv.push("-i");
                argv.push(prompt);
            }
        }
    }

    let (prog, args) = argv.split_first().ok_or_else(|| "empty argv".to_string())?;
    let mut agent_cmd = prog.to_string();
    for a in args {
        agent_cmd.push(' ');
        agent_cmd.push_str(&sh_escape_single_arg(a));
    }

    // Wrap the command to:
    // 1. Create the exit directory
    // 2. Run the agent command
    // 3. Capture exit code to file when agent finishes
    // 4. Drop user into shell so they can inspect results
    Ok(format!(
        "mkdir -p /tmp/orchestra-sessions && {} ; echo $? > '{}' && echo '\\n✓ Session ended. Type exit to close.' && exec ${{SHELL:-/bin/bash}}",
        agent_cmd, exit_file
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_agent_command_claude_includes_prompt_flag() {
        let cmd = build_agent_command(
            "orchestra-test",
            AgentKind::Claude,
            Some("sonnet"),
            None,
            "hello",
        )
        .expect("command");
        assert!(cmd.contains("claude"), "cmd was: {}", cmd);
        assert!(cmd.contains("'hello'"), "cmd was: {}", cmd);
        assert!(
            cmd.contains("'--allowedTools' 'Bash,Read,Write,Edit,Glob,Grep'"),
            "cmd was: {}",
            cmd
        );
        assert!(cmd.contains("'--model' 'sonnet'"), "cmd was: {}", cmd);
    }

    #[test]
    fn build_agent_command_codex_is_interactive_by_default() {
        let cmd = build_agent_command(
            "orchestra-test",
            AgentKind::Codex,
            Some("gpt-5"),
            None,
            "do it",
        )
        .expect("command");
        assert!(cmd.contains("codex"), "cmd was: {}", cmd);
        assert!(!cmd.contains("'exec'"), "cmd was: {}", cmd);
        assert!(cmd.contains("'do it'"), "cmd was: {}", cmd);
    }

    #[test]
    fn build_agent_command_codex_includes_extra_args_before_prompt() {
        let cmd = build_agent_command(
            "orchestra-test",
            AgentKind::Codex,
            Some("gpt-5"),
            Some(&vec!["--yolo".to_string()]),
            "do it",
        )
        .expect("command");
        assert!(
            cmd.contains("codex '--model' 'gpt-5' '--yolo' 'do it'"),
            "cmd was: {}",
            cmd
        );
    }
}
