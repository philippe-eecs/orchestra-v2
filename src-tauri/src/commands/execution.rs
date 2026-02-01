//! Execution commands for running agents

use crate::db::Database;
use crate::executors::{self, ExecuteRequest, ExecutionResult};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

/// Request to execute a node
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteNodeRequest {
    pub project_id: String,
    pub node_id: String,
    pub executor: String,
    pub prompt: String,
    pub options: Option<serde_json::Value>,
    pub project_path: Option<String>,
    pub execution_config: Option<super::projects::ExecutionConfig>,
}

/// Response from execution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteNodeResponse {
    pub session_id: String,
    pub status: String,
}

/// Output chunk event for streaming
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputChunkEvent {
    pub session_id: String,
    pub node_id: String,
    pub chunk: String,
}

/// Execution complete event
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionCompleteEvent {
    pub session_id: String,
    pub node_id: String,
    pub status: String,
    pub output: Option<String>,
    pub error: Option<String>,
}

/// Execute a node
#[tauri::command]
pub async fn execute_node(
    app: AppHandle,
    db: State<'_, Database>,
    request: ExecuteNodeRequest,
) -> Result<ExecuteNodeResponse, String> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let node_id = request.node_id.clone();
    let project_id = request.project_id.clone();

    // Create session in database
    db.create_session(&session_id, &node_id, &request.executor)
        .map_err(|e| e.to_string())?;

    // Set node status to running
    db.set_node_status(
        &project_id,
        &node_id,
        &super::projects::NodeStatus::Running,
    )
    .map_err(|e| e.to_string())?;

    // Build execution request
    let exec_request = ExecuteRequest {
        executor: request.executor.clone(),
        prompt: request.prompt.clone(),
        options: request.options.clone(),
        project_path: request.project_path.clone(),
        execution_config: request.execution_config.clone(),
    };

    // Clones for the output callback
    let session_id_for_output = session_id.clone();
    let node_id_for_output = node_id.clone();
    let app_for_output = app.clone();

    // Clones for the completion handler
    let session_id_for_complete = session_id.clone();
    let node_id_for_complete = node_id.clone();
    let app_for_complete = app.clone();

    tokio::spawn(async move {
        let result = executors::execute(exec_request, move |chunk| {
            // Emit output chunk event
            let _ = app_for_output.emit(
                "execution:output",
                OutputChunkEvent {
                    session_id: session_id_for_output.clone(),
                    node_id: node_id_for_output.clone(),
                    chunk,
                },
            );
        })
        .await;

        // Update session and node status based on result
        let (status, output, error) = match result {
            Ok(ExecutionResult::Done { output }) => ("completed", Some(output), None),
            Ok(ExecutionResult::Running { session_id: _, attach_command: _ }) => {
                ("running", None, None)
            }
            Ok(ExecutionResult::Error { message }) => ("failed", None, Some(message)),
            Err(e) => ("failed", None, Some(e.to_string())),
        };

        // Emit completion event - frontend will update its state
        let _ = app_for_complete.emit(
            "execution:complete",
            ExecutionCompleteEvent {
                session_id: session_id_for_complete,
                node_id: node_id_for_complete,
                status: status.to_string(),
                output,
                error,
            },
        );
    });

    Ok(ExecuteNodeResponse {
        session_id,
        status: "running".to_string(),
    })
}

/// Stop an execution
#[tauri::command]
pub async fn stop_execution(
    db: State<'_, Database>,
    session_id: String,
) -> Result<(), String> {
    // Get session to find container/process info
    let session = db
        .get_session(&session_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Session not found".to_string())?;

    // Stop based on backend type
    executors::stop_execution(&session)
        .await
        .map_err(|e| e.to_string())?;

    // Update session status
    db.set_session_status(&session_id, "failed")
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Get execution status
#[tauri::command]
pub async fn get_execution_status(
    db: State<'_, Database>,
    session_id: String,
) -> Result<Option<crate::db::Session>, String> {
    db.get_session(&session_id).map_err(|e| e.to_string())
}
