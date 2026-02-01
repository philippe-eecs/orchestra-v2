//! Remote executor - runs agents on remote VMs via SSH

use super::{ExecuteRequest, ExecutionResult, ExecutorError, ExecutorResult};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

/// Execution timeout (15 minutes for remote)
const EXECUTION_TIMEOUT: Duration = Duration::from_secs(15 * 60);

/// Execute an agent on a remote VM via SSH + Docker
pub async fn execute_remote<F>(
    request: &ExecuteRequest,
    on_output: F,
) -> ExecutorResult<ExecutionResult>
where
    F: Fn(String) + Send + 'static,
{
    let remote_config = request
        .execution_config
        .as_ref()
        .and_then(|c| c.remote.as_ref())
        .ok_or_else(|| ExecutorError::Remote("Remote config required".to_string()))?;

    let host = &remote_config.host;
    let user = remote_config.user.as_deref().unwrap_or("root");
    let port = remote_config.port.unwrap_or(22);

    // Build SSH connection arguments
    let mut ssh_args = vec![
        "-o".to_string(),
        "StrictHostKeyChecking=no".to_string(),
        "-o".to_string(),
        "BatchMode=yes".to_string(),
        "-p".to_string(),
        port.to_string(),
    ];

    if let Some(key_path) = &remote_config.key_path {
        ssh_args.push("-i".to_string());
        ssh_args.push(key_path.clone());
    }

    ssh_args.push(format!("{}@{}", user, host));

    // Build the remote Docker command
    let docker_config = request
        .execution_config
        .as_ref()
        .and_then(|c| c.docker.as_ref());

    let image = docker_config
        .and_then(|c| c.image.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("orchestra-agent:full");

    let agent_command = build_agent_command(&request.executor, &request.prompt, &request.options);

    // Build Docker run command for remote
    let docker_command = format!(
        "docker run --rm {} sh -c {}",
        image,
        shell_escape(&agent_command)
    );

    ssh_args.push(docker_command);

    tracing::info!("Executing on remote: ssh {}@{}", user, host);

    // Spawn SSH process
    let mut child = Command::new("ssh")
        .args(&ssh_args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| ExecutorError::Remote(format!("Failed to start SSH: {}", e)))?;

    // Stream output
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();

    let mut output = String::new();

    let result = timeout(EXECUTION_TIMEOUT, async {
        loop {
            tokio::select! {
                line = stdout_reader.next_line() => {
                    match line {
                        Ok(Some(line)) => {
                            output.push_str(&line);
                            output.push('\n');
                            on_output(format!("{}\n", line));
                        }
                        Ok(None) => break,
                        Err(_) => break,
                    }
                }
                line = stderr_reader.next_line() => {
                    match line {
                        Ok(Some(line)) => {
                            // SSH stderr might contain connection info, still output it
                            output.push_str(&line);
                            output.push('\n');
                            on_output(format!("{}\n", line));
                        }
                        Ok(None) => {}
                        Err(_) => {}
                    }
                }
            }
        }

        child.wait().await
    })
    .await;

    match result {
        Ok(Ok(status)) => {
            if status.success() {
                Ok(ExecutionResult::Done { output })
            } else {
                Ok(ExecutionResult::Error {
                    message: format!("Remote execution failed with code {}", status.code().unwrap_or(-1)),
                })
            }
        }
        Ok(Err(e)) => Err(ExecutorError::Remote(e.to_string())),
        Err(_) => {
            let _ = child.kill().await;
            Err(ExecutorError::Timeout)
        }
    }
}

/// Build the agent command string
fn build_agent_command(
    executor: &str,
    prompt: &str,
    options: &Option<serde_json::Value>,
) -> String {
    let escaped_prompt = shell_escape(prompt);

    match executor {
        "claude" => {
            let mut cmd = format!(
                "claude -p {} --output-format text --no-session-persistence --permission-mode dontAsk --tools ''",
                escaped_prompt
            );

            if let Some(opts) = options {
                if let Some(model) = opts.get("model").and_then(|v| v.as_str()) {
                    cmd.push_str(&format!(" --model {}", model));
                }
            }

            cmd
        }

        "codex" => {
            let mut cmd = "codex exec --skip-git-repo-check".to_string();

            if let Some(opts) = options {
                let reasoning = opts
                    .get("reasoningEffort")
                    .or_else(|| opts.get("reasoningLevel"))
                    .and_then(|v| v.as_str());

                if let Some(level) = reasoning {
                    cmd.push_str(&format!(" -c reasoning.effort={}", level));
                }
            }

            cmd.push_str(&format!(" {}", escaped_prompt));
            cmd
        }

        "gemini" => {
            let model = options
                .as_ref()
                .and_then(|o| o.get("model"))
                .and_then(|v| v.as_str())
                .unwrap_or("gemini-3-pro-preview");

            format!("gemini {} -m {} -o text", escaped_prompt, model)
        }

        _ => escaped_prompt,
    }
}

/// Escape a string for shell use
fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace("'", "'\\''"))
}
