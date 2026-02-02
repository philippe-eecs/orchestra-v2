use serde::{Deserialize, Serialize};
use tauri::Emitter;

use crate::executors;
use crate::state::{AppState, RunningProcess};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteNodeInput {
    pub session_id: Option<String>,
    pub node_id: String,
    pub agent: String,
    pub model: Option<String>,
    #[serde(default)]
    pub extra_args: Option<Vec<String>>,
    pub prompt: String,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteNodeOutput {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionChunkEvent {
    pub session_id: String,
    pub stream: String,
    pub chunk: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionDoneEvent {
    pub session_id: String,
    pub success: bool,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionErrorEvent {
    pub session_id: String,
    pub message: String,
}

async fn pump_output(
    window: tauri::Window,
    session_id: String,
    stream: String,
    mut reader: tokio::process::ChildStdout,
) {
    use tokio::io::AsyncReadExt;

    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => {
                let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                if let Err(e) = window.emit(
                    "execution://chunk",
                    ExecutionChunkEvent {
                        session_id: session_id.clone(),
                        stream: stream.clone(),
                        chunk,
                    },
                ) {
                    tracing::warn!("Failed to emit stdout chunk: {e}");
                }
            }
            Err(_) => break,
        }
    }
}

async fn pump_error(
    window: tauri::Window,
    session_id: String,
    stream: String,
    mut reader: tokio::process::ChildStderr,
) {
    use tokio::io::AsyncReadExt;

    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => {
                let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                if let Err(e) = window.emit(
                    "execution://chunk",
                    ExecutionChunkEvent {
                        session_id: session_id.clone(),
                        stream: stream.clone(),
                        chunk,
                    },
                ) {
                    tracing::warn!("Failed to emit stderr chunk: {e}");
                }
            }
            Err(_) => break,
        }
    }
}

#[tauri::command]
pub async fn execute_node(
    window: tauri::Window,
    state: tauri::State<'_, AppState>,
    input: ExecuteNodeInput,
) -> Result<ExecuteNodeOutput, String> {
    let session_id = input
        .session_id
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let mut child =
        executors::local::spawn_agent(
            &input.agent,
            input.model.as_deref(),
            input.extra_args.as_deref(),
            &input.prompt,
            &input.cwd,
        )?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "failed to capture stderr".to_string())?;

    let running = RunningProcess::new(child);
    state
        .processes
        .lock()
        .await
        .insert(session_id.clone(), running.clone());

    let window_stdout = window.clone();
    let window_stderr = window.clone();
    let session_stdout = session_id.clone();
    let session_stderr = session_id.clone();
    tokio::spawn(async move {
        pump_output(window_stdout, session_stdout, "stdout".to_string(), stdout).await
    });
    tokio::spawn(async move {
        pump_error(window_stderr, session_stderr, "stderr".to_string(), stderr).await
    });

    let window_done = window.clone();
    let state_processes = state.processes.clone();
    let session_done = session_id.clone();
    tokio::spawn(async move {
        let status = running.wait().await;
        state_processes.lock().await.remove(&session_done);
        match status {
            Ok(status) => {
                if let Err(e) = window_done.emit(
                    "execution://done",
                    ExecutionDoneEvent {
                        session_id: session_done,
                        success: status.success(),
                        exit_code: status.code(),
                    },
                ) {
                    tracing::warn!("Failed to emit execution done event: {e}");
                }
            }
            Err(e) => {
                if let Err(emit_err) = window_done.emit(
                    "execution://error",
                    ExecutionErrorEvent {
                        session_id: session_done,
                        message: format!("wait error: {e}"),
                    },
                ) {
                    tracing::warn!("Failed to emit execution error event: {emit_err}");
                }
            }
        }
    });

    Ok(ExecuteNodeOutput { session_id })
}

#[tauri::command]
pub async fn stop_execution(
    window: tauri::Window,
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    let running = { state.processes.lock().await.get(&session_id).cloned() };
    let Some(running) = running else {
        return Ok(());
    };

    match running.kill().await {
        Ok(()) => {
            if let Err(e) = window.emit(
                "execution://error",
                ExecutionErrorEvent {
                    session_id,
                    message: "Execution stopped".to_string(),
                },
            ) {
                tracing::warn!("Failed to emit stop execution event: {e}");
            }
            Ok(())
        }
        Err(e) => Err(format!("failed to kill process: {e}")),
    }
}
