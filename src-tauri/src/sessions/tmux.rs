use std::process::Command;

#[derive(Debug)]
pub struct TmuxError(pub String);

pub fn is_available() -> bool {
    which::which("tmux").is_ok()
}

pub fn create_session(session_id: &str, command: &str, cwd: Option<&str>) -> Result<(), TmuxError> {
    if !is_available() {
        return Err(TmuxError(
            "tmux is not installed or not on PATH".to_string(),
        ));
    }

    let mut cmd = Command::new("tmux");
    cmd.args(["new-session", "-d", "-s", session_id]);

    if let Some(dir) = cwd {
        cmd.args(["-c", dir]);
    }

    // Wrap command in sh -c to enable shell interpretation of &&, ;, pipes, etc.
    cmd.args(["sh", "-c", command]);

    let output = cmd.output().map_err(|e| TmuxError(e.to_string()))?;
    if !output.status.success() {
        return Err(TmuxError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }
    Ok(())
}

pub fn session_exists(session_id: &str) -> bool {
    Command::new("tmux")
        .args(["has-session", "-t", session_id])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

pub fn capture_pane(session_id: &str, lines: usize) -> Result<String, TmuxError> {
    if !is_available() {
        return Err(TmuxError(
            "tmux is not installed or not on PATH".to_string(),
        ));
    }

    let output = Command::new("tmux")
        .args([
            "capture-pane",
            "-t",
            session_id,
            "-p",
            "-S",
            &format!("-{}", lines),
        ])
        .output()
        .map_err(|e| TmuxError(e.to_string()))?;

    if !output.status.success() {
        return Err(TmuxError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn send_keys(session_id: &str, keys: &str) -> Result<(), TmuxError> {
    if !is_available() {
        return Err(TmuxError(
            "tmux is not installed or not on PATH".to_string(),
        ));
    }

    let output = Command::new("tmux")
        .args(["send-keys", "-t", session_id, keys, "Enter"])
        .output()
        .map_err(|e| TmuxError(e.to_string()))?;

    if !output.status.success() {
        return Err(TmuxError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }
    Ok(())
}

pub fn kill_session(session_id: &str) -> Result<(), TmuxError> {
    if !is_available() {
        return Err(TmuxError(
            "tmux is not installed or not on PATH".to_string(),
        ));
    }

    let output = Command::new("tmux")
        .args(["kill-session", "-t", session_id])
        .output()
        .map_err(|e| TmuxError(e.to_string()))?;

    if !output.status.success() {
        return Err(TmuxError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }
    Ok(())
}

pub fn list_sessions() -> Result<Vec<String>, TmuxError> {
    if !is_available() {
        return Err(TmuxError(
            "tmux is not installed or not on PATH".to_string(),
        ));
    }

    let output = Command::new("tmux")
        .args(["list-sessions", "-F", "#{session_name}"])
        .output()
        .map_err(|e| TmuxError(e.to_string()))?;

    if !output.status.success() {
        return Err(TmuxError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    let sessions: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|s| s.starts_with("orchestra-"))
        .map(|s| s.to_string())
        .collect();

    Ok(sessions)
}

pub fn get_attach_command(session_id: &str) -> String {
    format!("tmux attach -t {}", session_id)
}
