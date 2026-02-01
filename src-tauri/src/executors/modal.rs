//! Modal executor - runs agents on Modal serverless infrastructure

use super::{ExecuteRequest, ExecutionResult, ExecutorError, ExecutorResult};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

/// Execution timeout (30 minutes for Modal - can be long-running)
const EXECUTION_TIMEOUT: Duration = Duration::from_secs(30 * 60);

/// Execute an agent on Modal
pub async fn execute_modal<F>(
    request: &ExecuteRequest,
    on_output: F,
) -> ExecutorResult<ExecutionResult>
where
    F: Fn(String) + Send + 'static,
{
    let modal_config = request
        .execution_config
        .as_ref()
        .and_then(|c| c.modal.as_ref());

    let function_name = modal_config
        .and_then(|c| c.function_name.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("run_agent");

    // Build Modal run command
    // Assumes there's a Modal app with a function that accepts agent type and prompt
    let mut args = vec![
        "run".to_string(),
        "--detach".to_string(),
        format!("orchestra_modal.py::{}", function_name),
        "--executor".to_string(),
        request.executor.clone(),
        "--prompt".to_string(),
        request.prompt.clone(),
    ];

    // Add GPU if specified
    if let Some(config) = modal_config {
        if let Some(gpu) = &config.gpu {
            args.push("--gpu".to_string());
            args.push(gpu.clone());
        }
        if let Some(mem) = config.memory {
            args.push("--memory".to_string());
            args.push(mem.to_string());
        }
    }

    // Add options
    if let Some(options) = &request.options {
        args.push("--options".to_string());
        args.push(serde_json::to_string(options).unwrap_or_default());
    }

    tracing::info!("Executing on Modal: modal {}", args.join(" "));

    // Check if modal CLI is available
    if which::which("modal").is_err() {
        return Err(ExecutorError::Modal(
            "Modal CLI not found. Install with: pip install modal".to_string(),
        ));
    }

    // Spawn Modal process
    let mut child = Command::new("modal")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| ExecutorError::Modal(format!("Failed to start Modal: {}", e)))?;

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
                    message: format!("Modal execution failed with code {}", status.code().unwrap_or(-1)),
                })
            }
        }
        Ok(Err(e)) => Err(ExecutorError::Modal(e.to_string())),
        Err(_) => {
            let _ = child.kill().await;
            Err(ExecutorError::Timeout)
        }
    }
}
