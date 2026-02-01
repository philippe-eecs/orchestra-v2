//! Docker executor - runs agents in isolated containers

use super::{ExecuteRequest, ExecutionResult, ExecutorError, ExecutorResult};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

/// Default Docker image for agents
const DEFAULT_IMAGE: &str = "orchestra-agent:full";

/// Execution timeout (10 minutes for Docker)
const EXECUTION_TIMEOUT: Duration = Duration::from_secs(10 * 60);

/// Execute an agent command inside a Docker container
pub async fn execute_docker<F>(
    request: &ExecuteRequest,
    on_output: F,
) -> ExecutorResult<ExecutionResult>
where
    F: Fn(String) + Send + 'static,
{
    let docker_config = request
        .execution_config
        .as_ref()
        .and_then(|c| c.docker.as_ref());

    let image = docker_config
        .and_then(|c| c.image.as_ref())
        .map(|s| s.as_str())
        .unwrap_or(DEFAULT_IMAGE);

    // Build the agent command
    let agent_command = build_agent_command(&request.executor, &request.prompt, &request.options);

    // Build Docker run arguments
    let mut args = vec!["run".to_string(), "--rm".to_string()];

    // Resource limits
    if let Some(config) = docker_config {
        if let Some(resources) = &config.resources {
            if let Some(memory) = &resources.memory {
                args.push("--memory".to_string());
                args.push(memory.clone());
            }
            if let Some(cpus) = &resources.cpus {
                args.push("--cpus".to_string());
                args.push(cpus.clone());
            }
        }

        if let Some(network) = &config.network {
            args.push("--network".to_string());
            args.push(network.clone());
        }
    }

    // Mount project directory
    if let Some(project_path) = &request.project_path {
        args.push("-v".to_string());
        args.push(format!("{}:/workspace", project_path));
        args.push("-w".to_string());
        args.push("/workspace".to_string());
    }

    // Pass through environment variables
    for var in ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"] {
        if let Ok(value) = std::env::var(var) {
            args.push("-e".to_string());
            args.push(format!("{}={}", var, value));
        }
    }

    // Image and command
    args.push(image.to_string());
    args.push("sh".to_string());
    args.push("-c".to_string());
    args.push(agent_command);

    tracing::info!("Executing in Docker: docker {}", args.join(" "));

    // Spawn Docker process
    let mut child = Command::new("docker")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| ExecutorError::Docker(format!("Failed to start Docker: {}", e)))?;

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
                    message: format!("Docker process exited with code {}", status.code().unwrap_or(-1)),
                })
            }
        }
        Ok(Err(e)) => Err(ExecutorError::Docker(e.to_string())),
        Err(_) => {
            let _ = child.kill().await;
            Err(ExecutorError::Timeout)
        }
    }
}

/// Execute an agent in a Docker container with tmux (interactive mode)
pub async fn execute_docker_interactive<F>(
    request: &ExecuteRequest,
    on_output: F,
) -> ExecutorResult<ExecutionResult>
where
    F: Fn(String) + Send + 'static,
{
    let docker_config = request
        .execution_config
        .as_ref()
        .and_then(|c| c.docker.as_ref());

    let image = docker_config
        .and_then(|c| c.image.as_ref())
        .map(|s| s.as_str())
        .unwrap_or(DEFAULT_IMAGE);

    // Generate container name
    let container_name = format!("orchestra-{}", uuid::Uuid::new_v4());

    // Build the agent command with tmux wrapper
    let agent_command = build_agent_command(&request.executor, &request.prompt, &request.options);
    let tmux_command = format!(
        "tmux new-session -d -s agent '{}' && tmux wait-for agent-done",
        agent_command.replace("'", "'\\''")
    );

    // Build Docker run arguments
    let mut args = vec![
        "run".to_string(),
        "-d".to_string(), // Detached mode
        "--name".to_string(),
        container_name.clone(),
    ];

    // Mount project directory
    if let Some(project_path) = &request.project_path {
        args.push("-v".to_string());
        args.push(format!("{}:/workspace", project_path));
        args.push("-w".to_string());
        args.push("/workspace".to_string());
    }

    // Pass through environment variables
    for var in ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"] {
        if let Ok(value) = std::env::var(var) {
            args.push("-e".to_string());
            args.push(format!("{}={}", var, value));
        }
    }

    args.push(image.to_string());
    args.push("sh".to_string());
    args.push("-c".to_string());
    args.push(tmux_command);

    tracing::info!("Starting interactive Docker container: {}", container_name);

    // Start the container
    let output = Command::new("docker")
        .args(&args)
        .output()
        .await
        .map_err(|e| ExecutorError::Docker(format!("Failed to start container: {}", e)))?;

    if !output.status.success() {
        return Err(ExecutorError::Docker(format!(
            "Failed to start container: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let attach_command = format!("docker exec -it {} tmux attach -t agent", container_name);

    // Start a background task to monitor the container and stream output
    let container_name_clone = container_name.clone();
    tokio::spawn(async move {
        // Poll container logs
        loop {
            let logs = Command::new("docker")
                .args(["logs", "--tail", "10", &container_name_clone])
                .output()
                .await;

            if let Ok(output) = logs {
                let log_output = String::from_utf8_lossy(&output.stdout);
                if !log_output.is_empty() {
                    on_output(log_output.to_string());
                }
            }

            // Check if container is still running
            let status = Command::new("docker")
                .args(["inspect", "-f", "{{.State.Running}}", &container_name_clone])
                .output()
                .await;

            if let Ok(output) = status {
                let is_running = String::from_utf8_lossy(&output.stdout).trim() == "true";
                if !is_running {
                    break;
                }
            } else {
                break;
            }

            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });

    Ok(ExecutionResult::Running {
        session_id: container_name,
        attach_command: Some(attach_command),
    })
}

/// Stop a Docker container
pub async fn stop_container(container_id: &str) -> ExecutorResult<()> {
    let output = Command::new("docker")
        .args(["stop", container_id])
        .output()
        .await
        .map_err(|e| ExecutorError::Docker(format!("Failed to stop container: {}", e)))?;

    if !output.status.success() {
        return Err(ExecutorError::Docker(format!(
            "Failed to stop container: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

/// Build the agent command string
fn build_agent_command(
    executor: &str,
    prompt: &str,
    options: &Option<serde_json::Value>,
) -> String {
    // Escape the prompt for shell
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
                    if ["low", "medium", "high", "xhigh"].contains(&level) {
                        cmd.push_str(&format!(" -c reasoning.effort={}", level));
                    }
                }

                if let Some(model) = opts.get("model").and_then(|v| v.as_str()) {
                    cmd.push_str(&format!(" -m {}", model));
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
