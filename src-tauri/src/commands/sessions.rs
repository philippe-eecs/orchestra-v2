use crate::sessions::manager::{Session, SessionManager};
use crate::sessions::tmux;
use serde::Deserialize;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

/// Validate session ID to prevent operations on arbitrary tmux sessions.
/// Only allows orchestra-prefixed session IDs with alphanumeric/dash/underscore chars.
fn validate_session_id(session_id: &str) -> Result<(), String> {
    if !session_id.starts_with("orchestra-") {
        return Err("Invalid session ID: must start with 'orchestra-'".to_string());
    }
    if !session_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err("Invalid session ID: contains invalid characters".to_string());
    }
    if session_id.len() > 128 {
        return Err("Invalid session ID: too long".to_string());
    }
    Ok(())
}

/// Escape a string for use inside AppleScript double quotes.
/// Escapes backslashes and double quotes.
fn escape_applescript(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInteractiveSessionInput {
    pub node_id: String,
    pub agent: String,
    pub model: Option<String>,
    pub prompt: String,
    pub cwd: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionIdInput {
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendSessionInput {
    pub session_id: String,
    pub input: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureSessionOutputInput {
    pub session_id: String,
    pub lines: Option<usize>,
}

#[tauri::command]
pub async fn create_interactive_session(
    state: State<'_, Arc<Mutex<SessionManager>>>,
    input: CreateInteractiveSessionInput,
) -> Result<Session, String> {
    let manager = state.lock().await;
    manager
        .create_session(
            &input.node_id,
            &input.agent,
            input.model.as_deref(),
            &input.prompt,
            input.cwd.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn attach_session(input: SessionIdInput) -> Result<(), String> {
    validate_session_id(&input.session_id)?;

    let terminal = std::env::var("ORCHESTRA_TERMINAL").unwrap_or_else(|_| "Ghostty".to_string());
    let attach_cmd = tmux::get_attach_command(&input.session_id);

    #[cfg(target_os = "macos")]
    {
        // Try to invoke terminal directly for proper -e support
        let result = match terminal.as_str() {
            "Ghostty" => {
                let ghostty_path = "/Applications/Ghostty.app/Contents/MacOS/ghostty";
                std::process::Command::new(ghostty_path)
                    .args(["-e", "sh", "-c", &attach_cmd])
                    .spawn()
            }
            "Terminal" => {
                // macOS Terminal.app uses osascript for command execution
                // Escape the command to prevent AppleScript injection
                let escaped_cmd = escape_applescript(&attach_cmd);
                std::process::Command::new("osascript")
                    .args(["-e", &format!("tell app \"Terminal\" to do script \"{}\"", escaped_cmd)])
                    .spawn()
            }
            other => {
                // For other terminals, try direct invocation first
                let app_path = format!("/Applications/{}.app/Contents/MacOS/{}", other, other.to_lowercase());
                std::process::Command::new(&app_path)
                    .args(["-e", "sh", "-c", &attach_cmd])
                    .spawn()
            }
        };

        if result.is_err() {
            // Fallback to Terminal.app with escaped command
            let escaped_cmd = escape_applescript(&attach_cmd);
            std::process::Command::new("osascript")
                .args(["-e", &format!("tell app \"Terminal\" to do script \"{}\"", escaped_cmd)])
                .spawn()
                .map_err(|e| format!("Failed to open terminal: {}", e))?;
        }
    }

    #[cfg(target_os = "linux")]
    {
        let terminals = ["ghostty", "alacritty", "kitty", "gnome-terminal", "xterm"];
        for term in terminals {
            if which::which(term).is_ok() {
                std::process::Command::new(term)
                    .args(["-e", "sh", "-c", &attach_cmd])
                    .spawn()
                    .map_err(|e| format!("Failed to open terminal: {}", e))?;
                return Ok(());
            }
        }
        return Err("No supported terminal found".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn send_session_input(input: SendSessionInput) -> Result<(), String> {
    validate_session_id(&input.session_id)?;
    tmux::send_keys(&input.session_id, &input.input).map_err(|e| e.0)
}

#[tauri::command]
pub async fn capture_session_output(input: CaptureSessionOutputInput) -> Result<String, String> {
    validate_session_id(&input.session_id)?;
    tmux::capture_pane(&input.session_id, input.lines.unwrap_or(50)).map_err(|e| e.0)
}

#[tauri::command]
pub async fn kill_interactive_session(
    state: State<'_, Arc<Mutex<SessionManager>>>,
    input: SessionIdInput,
) -> Result<(), String> {
    validate_session_id(&input.session_id)?;
    let manager = state.lock().await;
    manager.kill_session(&input.session_id).await
}

#[tauri::command]
pub async fn list_interactive_sessions(state: State<'_, Arc<Mutex<SessionManager>>>) -> Result<Vec<Session>, String> {
    let manager = state.lock().await;
    Ok(manager.list_sessions().await)
}

#[tauri::command]
pub fn get_attach_command(input: SessionIdInput) -> Result<String, String> {
    validate_session_id(&input.session_id)?;
    Ok(tmux::get_attach_command(&input.session_id))
}

#[tauri::command]
pub fn open_in_ghostty(input: SessionIdInput) -> Result<(), String> {
    validate_session_id(&input.session_id)?;
    let attach_cmd = tmux::get_attach_command(&input.session_id);

    #[cfg(target_os = "macos")]
    {
        // Invoke Ghostty directly - `open -a` doesn't pass args correctly to terminal emulators
        let ghostty_path = "/Applications/Ghostty.app/Contents/MacOS/ghostty";
        std::process::Command::new(ghostty_path)
            .args(["-e", "sh", "-c", &attach_cmd])
            .spawn()
            .map_err(|e| format!("Failed to open Ghostty: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("ghostty")
            .args(["-e", "sh", "-c", &attach_cmd])
            .spawn()
            .map_err(|e| format!("Failed to open Ghostty: {}", e))?;
    }

    Ok(())
}
