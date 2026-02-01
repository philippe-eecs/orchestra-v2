//! Project management commands

use crate::db::Database;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Project data structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub location: Option<String>,
    pub context: ProjectContext,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub default_execution_config: Option<ExecutionConfig>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectContext {
    pub resources: Vec<Resource>,
    pub notes: String,
    pub variables: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum Resource {
    #[serde(rename = "file")]
    File { path: String, name: String },
    #[serde(rename = "url")]
    Url { url: String, name: String },
    #[serde(rename = "document")]
    Document { content: String, name: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: String,
    pub title: String,
    pub description: String,
    pub position: Position,
    pub agent: AgentConfig,
    pub prompt: String,
    pub context: Vec<ContextRef>,
    pub deliverables: Vec<Deliverable>,
    pub checks: Vec<Check>,
    pub status: NodeStatus,
    pub session_id: Option<String>,
    pub execution_config: Option<ExecutionConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum AgentConfig {
    #[serde(rename = "claude")]
    Claude {
        model: Option<String>,
        thinking_budget: Option<i32>,
    },
    #[serde(rename = "codex")]
    Codex {
        model: Option<String>,
        reasoning_effort: Option<String>,
    },
    #[serde(rename = "gemini")]
    Gemini { model: Option<String> },
    #[serde(rename = "composed")]
    Composed { agent_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum ContextRef {
    #[serde(rename = "file")]
    File { path: String },
    #[serde(rename = "url")]
    Url { url: String },
    #[serde(rename = "parent_output")]
    ParentOutput { node_id: String },
    #[serde(rename = "markdown")]
    Markdown { content: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum Deliverable {
    #[serde(rename = "file")]
    File { id: String, path: String },
    #[serde(rename = "response")]
    Response { id: String, description: String },
    #[serde(rename = "pr")]
    Pr { id: String, repo: String },
    #[serde(rename = "edit")]
    Edit { id: String, url: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum Check {
    #[serde(rename = "file_exists")]
    FileExists {
        id: String,
        path: String,
        auto_retry: Option<bool>,
        max_retries: Option<i32>,
    },
    #[serde(rename = "command")]
    Command {
        id: String,
        cmd: String,
        auto_retry: Option<bool>,
        max_retries: Option<i32>,
    },
    #[serde(rename = "human_approval")]
    HumanApproval { id: String },
    #[serde(rename = "contains")]
    Contains {
        id: String,
        path: String,
        pattern: String,
        auto_retry: Option<bool>,
        max_retries: Option<i32>,
    },
    #[serde(rename = "llm_critic")]
    LlmCritic {
        id: String,
        critic_agent: String,
        criteria: String,
        threshold: Option<i32>,
        add_to_context: Option<bool>,
        auto_retry: Option<bool>,
        max_retries: Option<i32>,
    },
    #[serde(rename = "test_runner")]
    TestRunner {
        id: String,
        framework: String,
        command: Option<String>,
        test_pattern: Option<String>,
        auto_retry: Option<bool>,
        max_retries: Option<i32>,
    },
    #[serde(rename = "eval_baseline")]
    EvalBaseline {
        id: String,
        metric: String,
        baseline: f64,
        tolerance: f64,
        command: Option<String>,
        evaluator: Option<String>,
        auto_retry: Option<bool>,
        max_retries: Option<i32>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    pub source_deliverable: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionConfig {
    pub backend: ExecutionBackend,
    pub docker: Option<DockerConfig>,
    pub remote: Option<RemoteConfig>,
    pub modal: Option<ModalConfig>,
    pub interactive: Option<InteractiveConfig>,
    pub sandbox: Option<SandboxConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExecutionBackend {
    Local,
    Docker,
    DockerInteractive,
    Remote,
    Modal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerConfig {
    pub image: Option<String>,
    pub mounts: Option<Vec<DockerMount>>,
    pub env: Option<serde_json::Value>,
    pub resources: Option<DockerResources>,
    pub network: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerMount {
    pub host_path: String,
    pub container_path: String,
    pub readonly: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerResources {
    pub memory: Option<String>,
    pub cpus: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteConfig {
    pub host: String,
    pub user: Option<String>,
    pub key_path: Option<String>,
    pub port: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModalConfig {
    pub function_name: Option<String>,
    pub gpu: Option<String>,
    pub timeout: Option<i32>,
    pub memory: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractiveConfig {
    pub session_name: Option<String>,
    pub timeout: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxConfig {
    pub enabled: bool,
    #[serde(rename = "type")]
    pub sandbox_type: String,
    pub branch_prefix: Option<String>,
    pub create_pr: Option<bool>,
    pub pr_base_branch: Option<String>,
    pub cleanup_on_success: Option<bool>,
    pub keep_on_failure: Option<bool>,
}

/// List all projects
#[tauri::command]
pub async fn list_projects(db: State<'_, Database>) -> Result<Vec<Project>, String> {
    db.list_projects().map_err(|e| e.to_string())
}

/// Get a single project by ID
#[tauri::command]
pub async fn get_project(db: State<'_, Database>, id: String) -> Result<Option<Project>, String> {
    db.get_project(&id).map_err(|e| e.to_string())
}

/// Create a new project
#[tauri::command]
pub async fn create_project(
    db: State<'_, Database>,
    name: String,
    description: Option<String>,
    location: Option<String>,
) -> Result<Project, String> {
    db.create_project(&name, description.as_deref(), location.as_deref())
        .map_err(|e| e.to_string())
}

/// Update an existing project
#[tauri::command]
pub async fn update_project(
    db: State<'_, Database>,
    project: Project,
) -> Result<Project, String> {
    db.update_project(&project).map_err(|e| e.to_string())
}

/// Delete a project
#[tauri::command]
pub async fn delete_project(db: State<'_, Database>, id: String) -> Result<(), String> {
    db.delete_project(&id).map_err(|e| e.to_string())
}
