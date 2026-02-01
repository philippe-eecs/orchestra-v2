use std::process::Stdio;

pub fn spawn_agent(agent: &str, cwd: &Option<String>) -> Result<tokio::process::Child, String> {
    let bin = which::which(agent).map_err(|_| format!("Could not find `{agent}` on PATH"))?;

    let mut cmd = tokio::process::Command::new(bin);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }

    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    cmd.spawn().map_err(|e| format!("failed to spawn `{agent}`: {e}"))
}

