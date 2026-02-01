//! Session management commands

use crate::db::{Database, Session};
use tauri::State;

/// List all sessions
#[tauri::command]
pub async fn list_sessions(db: State<'_, Database>) -> Result<Vec<Session>, String> {
    db.list_sessions().map_err(|e| e.to_string())
}

/// Get a single session by ID
#[tauri::command]
pub async fn get_session(
    db: State<'_, Database>,
    session_id: String,
) -> Result<Option<Session>, String> {
    db.get_session(&session_id).map_err(|e| e.to_string())
}

/// Get session output
#[tauri::command]
pub async fn get_session_output(
    db: State<'_, Database>,
    session_id: String,
) -> Result<Option<String>, String> {
    db.get_session_output(&session_id).map_err(|e| e.to_string())
}
