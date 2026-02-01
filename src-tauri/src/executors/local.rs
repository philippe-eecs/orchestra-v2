//! Local executor - runs agents directly via process spawning

use super::{ExecuteRequest, ExecutionResult, ExecutorError, ExecutorResult};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

/// Execution timeout (5 minutes)
const EXECUTION_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// Allowed executor types
const ALLOWED_EXECUTORS: [&str; 3] = ["claude", "codex", "gemini"];

/// Execute an agent command locally
pub async fn execute_local<F>(request: &ExecuteRequest, on_output: F) -> ExecutorResult<ExecutionResult>
where
    F: Fn(String) + Send + 'static,
{
    // Validate executor
    if !ALLOWED_EXECUTORS.contains(&request.executor.as_str()) {
        return Err(ExecutorError::InvalidExecutor(format!(
            "Invalid executor: {}. Allowed: {}",
            request.executor,
            ALLOWED_EXECUTORS.join(", ")
        )));
    }

    // Build command arguments
    let args = build_command_args(&request.executor, &request.prompt, &request.options);

    tracing::info!(
        "Executing locally: {} {}",
        args[0],
        args[1..].join(" ")
    );

    // Find the executable
    let executable = which::which(&args[0]).map_err(|e| {
        ExecutorError::Process(format!("Executable '{}' not found: {}", args[0], e))
    })?;

    // Spawn the process
    let mut child = Command::new(executable)
        .args(&args[1..])
        .current_dir(request.project_path.as_deref().unwrap_or("."))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| ExecutorError::Io(e))?;

    // Stream output
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();

    let mut output = String::new();

    // Read output with timeout
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
                        Err(e) => {
                            tracing::warn!("Error reading stdout: {}", e);
                            break;
                        }
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
                        Err(e) => {
                            tracing::warn!("Error reading stderr: {}", e);
                        }
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
                    message: format!("Process exited with code {}", status.code().unwrap_or(-1)),
                })
            }
        }
        Ok(Err(e)) => Err(ExecutorError::Io(e)),
        Err(_) => {
            // Timeout - kill the process
            let _ = child.kill().await;
            Err(ExecutorError::Timeout)
        }
    }
}

/// Build command arguments for the specified executor
fn build_command_args(
    executor: &str,
    prompt: &str,
    options: &Option<serde_json::Value>,
) -> Vec<String> {
    match executor {
        "claude" => {
            let mut args = vec![
                "claude".to_string(),
                "-p".to_string(),
                prompt.to_string(),
                "--output-format".to_string(),
                "text".to_string(),
                "--no-session-persistence".to_string(),
                "--permission-mode".to_string(),
                "dontAsk".to_string(),
                "--tools".to_string(),
                "".to_string(),
            ];

            if let Some(opts) = options {
                if let Some(model) = opts.get("model").and_then(|v| v.as_str()) {
                    args.push("--model".to_string());
                    args.push(model.to_string());
                }
                if let Some(budget) = opts.get("thinkingBudget").and_then(|v| v.as_i64()) {
                    args.push("--append-system-prompt".to_string());
                    args.push(format!("Think for at most {} tokens.", budget));
                }
            }

            args
        }

        "codex" => {
            let mut args = vec![
                "codex".to_string(),
                "exec".to_string(),
                "--skip-git-repo-check".to_string(),
            ];

            if let Some(opts) = options {
                let reasoning = opts
                    .get("reasoningEffort")
                    .or_else(|| opts.get("reasoningLevel"))
                    .and_then(|v| v.as_str());

                if let Some(level) = reasoning {
                    if ["low", "medium", "high", "xhigh"].contains(&level) {
                        args.push("-c".to_string());
                        args.push(format!("reasoning.effort={}", level));
                    }
                }

                if let Some(model) = opts.get("model").and_then(|v| v.as_str()) {
                    args.push("-m".to_string());
                    args.push(model.to_string());
                }
            }

            args.push(prompt.to_string());
            args
        }

        "gemini" => {
            let model = options
                .as_ref()
                .and_then(|o| o.get("model"))
                .and_then(|v| v.as_str())
                .unwrap_or("gemini-3-pro-preview");

            // Sanitize model name
            let model: String = model
                .chars()
                .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '.')
                .collect();

            vec![
                "gemini".to_string(),
                prompt.to_string(),
                "-m".to_string(),
                model,
                "-o".to_string(),
                "text".to_string(),
            ]
        }

        _ => vec![],
    }
}
