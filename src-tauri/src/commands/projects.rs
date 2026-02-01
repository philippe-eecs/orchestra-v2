use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    pub r#type: String,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodePosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: String,
    pub title: String,
    pub position: NodePosition,
    pub agent: AgentConfig,
    pub prompt: String,
    pub context: Vec<serde_json::Value>,
    pub deliverables: Vec<serde_json::Value>,
    pub checks: Vec<serde_json::Value>,
    pub status: String,
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
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub location: Option<String>,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub created_at: i64,
    pub updated_at: i64,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[tauri::command]
pub async fn list_projects(state: tauri::State<'_, AppState>) -> Result<Vec<Project>, String> {
    let guard = state.projects.read().await;
    Ok(guard.values().cloned().collect())
}

#[tauri::command]
pub async fn get_project(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<Option<Project>, String> {
    let guard = state.projects.read().await;
    Ok(guard.get(&id).cloned())
}

#[tauri::command]
pub async fn create_project(
    state: tauri::State<'_, AppState>,
    name: String,
    description: String,
) -> Result<Project, String> {
    let id = Uuid::new_v4().to_string();
    let ts = now_ms();
    let project = Project {
        id: id.clone(),
        name,
        description,
        location: None,
        nodes: vec![],
        edges: vec![],
        created_at: ts,
        updated_at: ts,
    };

    state.projects.write().await.insert(id, project.clone());
    Ok(project)
}

#[tauri::command]
pub async fn save_project(
    state: tauri::State<'_, AppState>,
    project: Project,
) -> Result<Project, String> {
    let mut project = project;
    project.updated_at = now_ms();
    state
        .projects
        .write()
        .await
        .insert(project.id.clone(), project.clone());
    Ok(project)
}

#[tauri::command]
pub async fn delete_project(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    state.projects.write().await.remove(&id);
    Ok(())
}

