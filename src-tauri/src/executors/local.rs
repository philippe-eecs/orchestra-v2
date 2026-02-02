use std::process::Stdio;

/// Default models for each agent (using latest versions)
fn default_model(agent: &str) -> Option<&'static str> {
    match agent {
        "claude" => Some("sonnet"), // Claude Code uses "opus", "sonnet", "haiku"
        "codex" => None,            // Codex uses its default
        "gemini" => Some("gemini-2.5-pro"),
        _ => None,
    }
}

pub fn spawn_agent(
    agent: &str,
    model: Option<&str>,
    extra_args: Option<&[String]>,
    prompt: &str,
    cwd: &Option<String>,
) -> Result<tokio::process::Child, String> {
    let bin = which::which(agent).map_err(|_| format!("Could not find `{agent}` on PATH"))?;

    let mut cmd = tokio::process::Command::new(bin);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }

    // Add agent-specific arguments
    let extra_args = extra_args.unwrap_or(&[]);
    match agent {
        "claude" => {
            // Claude Code CLI: claude -p "prompt" --model sonnet
            cmd.arg("-p");
            cmd.arg(prompt);
            cmd.arg("--allowedTools");
            cmd.arg("Bash,Read,Write,Edit,Glob,Grep"); // Common tools
            if let Some(m) = model.or_else(|| default_model(agent)) {
                cmd.arg("--model");
                cmd.arg(m);
            }
            cmd.args(extra_args);
        }
        "codex" => {
            // Codex CLI: codex exec "prompt"
            cmd.arg("exec");
            if let Some(m) = model {
                cmd.arg("--model");
                cmd.arg(m);
            }
            cmd.args(extra_args);
            cmd.arg(prompt);
        }
        "gemini" => {
            // Gemini CLI: gemini "prompt" -m model
            if let Some(m) = model.or_else(|| default_model(agent)) {
                cmd.arg("-m");
                cmd.arg(m);
            }
            cmd.args(extra_args);
            cmd.arg(prompt);
        }
        _ => {}
    }

    // One-shot execution should not require stdin; prompts are passed as args above.
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    cmd.spawn()
        .map_err(|e| format!("failed to spawn `{agent}`: {e}"))
}
