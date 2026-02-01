//! Node management commands

use crate::db::Database;
use super::projects::{Node, NodeStatus};
use tauri::State;

/// Add a new node to a project
#[tauri::command]
pub async fn add_node(
    db: State<'_, Database>,
    project_id: String,
    node: Node,
) -> Result<Node, String> {
    db.add_node(&project_id, &node).map_err(|e| e.to_string())
}

/// Update an existing node
#[tauri::command]
pub async fn update_node(
    db: State<'_, Database>,
    project_id: String,
    node: Node,
) -> Result<Node, String> {
    db.update_node(&project_id, &node).map_err(|e| e.to_string())
}

/// Delete a node from a project
#[tauri::command]
pub async fn delete_node(
    db: State<'_, Database>,
    project_id: String,
    node_id: String,
) -> Result<(), String> {
    db.delete_node(&project_id, &node_id).map_err(|e| e.to_string())
}

/// Set node status
#[tauri::command]
pub async fn set_node_status(
    db: State<'_, Database>,
    project_id: String,
    node_id: String,
    status: NodeStatus,
) -> Result<(), String> {
    db.set_node_status(&project_id, &node_id, &status)
        .map_err(|e| e.to_string())
}
