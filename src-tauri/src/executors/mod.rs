//! Execution backends for running AI agents
//!
//! This module contains the execution logic for different backends:
//! - local: Direct process spawning
//! - docker: Isolated container execution
//! - docker-interactive: Container with tmux for attach/detach
//! - remote: SSH + Docker on remote VM
//! - modal: Modal serverless execution

mod docker;
mod local;
mod modal;
mod remote;

use crate::commands::projects::ExecutionConfig;
use crate::db::Session;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ExecutorError {
    #[error("Process error: {0}")]
    Process(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Invalid executor: {0}")]
    InvalidExecutor(String),
    #[error("Docker error: {0}")]
    Docker(String),
    #[error("Remote error: {0}")]
    Remote(String),
    #[error("Modal error: {0}")]
    Modal(String),
    #[error("Timeout")]
    Timeout,
}

pub type ExecutorResult<T> = Result<T, ExecutorError>;

/// Request to execute an agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteRequest {
    pub executor: String,
    pub prompt: String,
    pub options: Option<serde_json::Value>,
    pub project_path: Option<String>,
    pub execution_config: Option<ExecutionConfig>,
}

/// Result of an execution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum ExecutionResult {
    #[serde(rename = "done")]
    Done { output: String },
    #[serde(rename = "running")]
    Running {
        session_id: String,
        attach_command: Option<String>,
    },
    #[serde(rename = "error")]
    Error { message: String },
}

/// Execute an agent command using the appropriate backend
pub async fn execute<F>(request: ExecuteRequest, on_output: F) -> ExecutorResult<ExecutionResult>
where
    F: Fn(String) + Send + 'static,
{
    let backend = request
        .execution_config
        .as_ref()
        .map(|c| &c.backend)
        .cloned();

    match backend {
        Some(crate::commands::projects::ExecutionBackend::Docker) => {
            docker::execute_docker(&request, on_output).await
        }
        Some(crate::commands::projects::ExecutionBackend::DockerInteractive) => {
            docker::execute_docker_interactive(&request, on_output).await
        }
        Some(crate::commands::projects::ExecutionBackend::Remote) => {
            remote::execute_remote(&request, on_output).await
        }
        Some(crate::commands::projects::ExecutionBackend::Modal) => {
            modal::execute_modal(&request, on_output).await
        }
        // Default to local execution
        _ => local::execute_local(&request, on_output).await,
    }
}

/// Stop an execution based on session info
pub async fn stop_execution(session: &Session) -> ExecutorResult<()> {
    match session.backend.as_deref() {
        Some("docker") | Some("docker-interactive") => {
            if let Some(container_id) = &session.container_id {
                docker::stop_container(container_id).await
            } else {
                Ok(())
            }
        }
        Some("remote") => {
            // TODO: Implement remote stop
            Ok(())
        }
        Some("modal") => {
            // Modal jobs auto-cleanup
            Ok(())
        }
        _ => {
            // Local processes are stopped via kill
            Ok(())
        }
    }
}
