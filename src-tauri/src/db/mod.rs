//! Database module for SQLite persistence
//!
//! This module provides a local SQLite database for storing projects, nodes,
//! sessions, and other Orchestra data. It's designed to work offline-first
//! and can sync with CloudKit in future phases.

mod schema;

use crate::commands::projects::{Node, NodeStatus, Project, ProjectContext};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DbError {
    #[error("Database error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Not found: {0}")]
    NotFound(String),
}

pub type DbResult<T> = Result<T, DbError>;

/// Session data structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub node_id: String,
    pub agent_type: String,
    pub status: String,
    pub output: Option<String>,
    pub error: Option<String>,
    pub backend: Option<String>,
    pub attach_command: Option<String>,
    pub container_id: Option<String>,
    pub started_at: i64,
    pub completed_at: Option<i64>,
}

/// Database wrapper with thread-safe connection
pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// Create a new database connection
    pub fn new(app: &AppHandle) -> DbResult<Self> {
        let app_dir = app
            .path()
            .app_data_dir()
            .expect("Failed to get app data directory");

        std::fs::create_dir_all(&app_dir)?;

        let db_path = app_dir.join("orchestra.db");
        tracing::info!("Opening database at {:?}", db_path);

        let conn = Connection::open(&db_path)?;

        // Initialize schema
        schema::initialize(&conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Create a new database connection for testing
    #[cfg(test)]
    pub fn new_in_memory() -> DbResult<Self> {
        let conn = Connection::open_in_memory()?;
        schema::initialize(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    // ========== PROJECT OPERATIONS ==========

    /// List all projects
    pub fn list_projects(&self) -> DbResult<Vec<Project>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, location, context, nodes, edges,
                    default_execution_config, created_at, updated_at
             FROM projects ORDER BY updated_at DESC",
        )?;

        let projects = stmt
            .query_map([], |row| {
                let context_json: String = row.get(4)?;
                let nodes_json: String = row.get(5)?;
                let edges_json: String = row.get(6)?;
                let exec_config_json: Option<String> = row.get(7)?;

                Ok(Project {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    location: row.get(3)?,
                    context: serde_json::from_str(&context_json).unwrap_or_else(|_| {
                        ProjectContext {
                            resources: vec![],
                            notes: String::new(),
                            variables: serde_json::Value::Object(serde_json::Map::new()),
                        }
                    }),
                    nodes: serde_json::from_str(&nodes_json).unwrap_or_default(),
                    edges: serde_json::from_str(&edges_json).unwrap_or_default(),
                    default_execution_config: exec_config_json
                        .and_then(|s| serde_json::from_str(&s).ok()),
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(projects)
    }

    /// Get a project by ID
    pub fn get_project(&self, id: &str) -> DbResult<Option<Project>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, location, context, nodes, edges,
                    default_execution_config, created_at, updated_at
             FROM projects WHERE id = ?",
        )?;

        let project = stmt
            .query_row([id], |row| {
                let context_json: String = row.get(4)?;
                let nodes_json: String = row.get(5)?;
                let edges_json: String = row.get(6)?;
                let exec_config_json: Option<String> = row.get(7)?;

                Ok(Project {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    location: row.get(3)?,
                    context: serde_json::from_str(&context_json).unwrap_or_else(|_| {
                        ProjectContext {
                            resources: vec![],
                            notes: String::new(),
                            variables: serde_json::Value::Object(serde_json::Map::new()),
                        }
                    }),
                    nodes: serde_json::from_str(&nodes_json).unwrap_or_default(),
                    edges: serde_json::from_str(&edges_json).unwrap_or_default(),
                    default_execution_config: exec_config_json
                        .and_then(|s| serde_json::from_str(&s).ok()),
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .optional()?;

        Ok(project)
    }

    /// Create a new project
    pub fn create_project(
        &self,
        name: &str,
        description: Option<&str>,
        location: Option<&str>,
    ) -> DbResult<Project> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();

        let context = ProjectContext {
            resources: vec![],
            notes: String::new(),
            variables: serde_json::Value::Object(serde_json::Map::new()),
        };

        conn.execute(
            "INSERT INTO projects (id, name, description, location, context, nodes, edges, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                &id,
                name,
                description.unwrap_or(""),
                location,
                serde_json::to_string(&context)?,
                "[]",
                "[]",
                now,
                now
            ],
        )?;

        Ok(Project {
            id,
            name: name.to_string(),
            description: description.unwrap_or("").to_string(),
            location: location.map(String::from),
            context,
            nodes: vec![],
            edges: vec![],
            default_execution_config: None,
            created_at: now,
            updated_at: now,
        })
    }

    /// Update a project
    pub fn update_project(&self, project: &Project) -> DbResult<Project> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp_millis();

        conn.execute(
            "UPDATE projects SET name = ?, description = ?, location = ?, context = ?,
             nodes = ?, edges = ?, default_execution_config = ?, updated_at = ? WHERE id = ?",
            params![
                &project.name,
                &project.description,
                &project.location,
                serde_json::to_string(&project.context)?,
                serde_json::to_string(&project.nodes)?,
                serde_json::to_string(&project.edges)?,
                project.default_execution_config.as_ref().map(|c| serde_json::to_string(c).ok()).flatten(),
                now,
                &project.id
            ],
        )?;

        let mut updated = project.clone();
        updated.updated_at = now;
        Ok(updated)
    }

    /// Delete a project
    pub fn delete_project(&self, id: &str) -> DbResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM sessions WHERE node_id IN (SELECT json_extract(value, '$.id') FROM projects, json_each(nodes) WHERE projects.id = ?)", [id])?;
        conn.execute("DELETE FROM projects WHERE id = ?", [id])?;
        Ok(())
    }

    // ========== NODE OPERATIONS ==========

    /// Add a node to a project
    pub fn add_node(&self, project_id: &str, node: &Node) -> DbResult<Node> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        // Get current nodes
        let nodes_json: String = tx.query_row(
            "SELECT nodes FROM projects WHERE id = ?",
            [project_id],
            |row| row.get(0),
        )?;

        let mut nodes: Vec<Node> = serde_json::from_str(&nodes_json)?;
        nodes.push(node.clone());

        // Update project
        let now = chrono::Utc::now().timestamp_millis();
        tx.execute(
            "UPDATE projects SET nodes = ?, updated_at = ? WHERE id = ?",
            params![serde_json::to_string(&nodes)?, now, project_id],
        )?;

        tx.commit()?;
        Ok(node.clone())
    }

    /// Update a node in a project
    pub fn update_node(&self, project_id: &str, node: &Node) -> DbResult<Node> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        // Get current nodes
        let nodes_json: String = tx.query_row(
            "SELECT nodes FROM projects WHERE id = ?",
            [project_id],
            |row| row.get(0),
        )?;

        let mut nodes: Vec<Node> = serde_json::from_str(&nodes_json)?;

        // Find and update the node
        if let Some(idx) = nodes.iter().position(|n| n.id == node.id) {
            nodes[idx] = node.clone();
        } else {
            return Err(DbError::NotFound(format!("Node {} not found", node.id)));
        }

        // Update project
        let now = chrono::Utc::now().timestamp_millis();
        tx.execute(
            "UPDATE projects SET nodes = ?, updated_at = ? WHERE id = ?",
            params![serde_json::to_string(&nodes)?, now, project_id],
        )?;

        tx.commit()?;
        Ok(node.clone())
    }

    /// Delete a node from a project
    pub fn delete_node(&self, project_id: &str, node_id: &str) -> DbResult<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        // Get current nodes and edges
        let (nodes_json, edges_json): (String, String) = tx.query_row(
            "SELECT nodes, edges FROM projects WHERE id = ?",
            [project_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        let mut nodes: Vec<Node> = serde_json::from_str(&nodes_json)?;
        let mut edges: Vec<crate::commands::projects::Edge> = serde_json::from_str(&edges_json)?;

        // Remove node
        nodes.retain(|n| n.id != node_id);

        // Remove connected edges
        edges.retain(|e| e.source_id != node_id && e.target_id != node_id);

        // Update project
        let now = chrono::Utc::now().timestamp_millis();
        tx.execute(
            "UPDATE projects SET nodes = ?, edges = ?, updated_at = ? WHERE id = ?",
            params![
                serde_json::to_string(&nodes)?,
                serde_json::to_string(&edges)?,
                now,
                project_id
            ],
        )?;

        tx.commit()?;
        Ok(())
    }

    /// Set node status
    pub fn set_node_status(
        &self,
        project_id: &str,
        node_id: &str,
        status: &NodeStatus,
    ) -> DbResult<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        // Get current nodes
        let nodes_json: String = tx.query_row(
            "SELECT nodes FROM projects WHERE id = ?",
            [project_id],
            |row| row.get(0),
        )?;

        let mut nodes: Vec<Node> = serde_json::from_str(&nodes_json)?;

        // Find and update the node status
        if let Some(idx) = nodes.iter().position(|n| n.id == node_id) {
            nodes[idx].status = status.clone();
        }

        // Update project
        tx.execute(
            "UPDATE projects SET nodes = ? WHERE id = ?",
            params![serde_json::to_string(&nodes)?, project_id],
        )?;

        tx.commit()?;
        Ok(())
    }

    // ========== SESSION OPERATIONS ==========

    /// Create a new session
    pub fn create_session(
        &self,
        session_id: &str,
        node_id: &str,
        agent_type: &str,
    ) -> DbResult<Session> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp_millis();

        conn.execute(
            "INSERT INTO sessions (id, node_id, agent_type, status, started_at)
             VALUES (?, ?, ?, ?, ?)",
            params![session_id, node_id, agent_type, "running", now],
        )?;

        Ok(Session {
            id: session_id.to_string(),
            node_id: node_id.to_string(),
            agent_type: agent_type.to_string(),
            status: "running".to_string(),
            output: None,
            error: None,
            backend: None,
            attach_command: None,
            container_id: None,
            started_at: now,
            completed_at: None,
        })
    }

    /// List all sessions
    pub fn list_sessions(&self) -> DbResult<Vec<Session>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, node_id, agent_type, status, output, error, backend,
                    attach_command, container_id, started_at, completed_at
             FROM sessions ORDER BY started_at DESC",
        )?;

        let sessions = stmt
            .query_map([], |row| {
                Ok(Session {
                    id: row.get(0)?,
                    node_id: row.get(1)?,
                    agent_type: row.get(2)?,
                    status: row.get(3)?,
                    output: row.get(4)?,
                    error: row.get(5)?,
                    backend: row.get(6)?,
                    attach_command: row.get(7)?,
                    container_id: row.get(8)?,
                    started_at: row.get(9)?,
                    completed_at: row.get(10)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(sessions)
    }

    /// Get a session by ID
    pub fn get_session(&self, id: &str) -> DbResult<Option<Session>> {
        let conn = self.conn.lock().unwrap();
        let session = conn
            .query_row(
                "SELECT id, node_id, agent_type, status, output, error, backend,
                        attach_command, container_id, started_at, completed_at
                 FROM sessions WHERE id = ?",
                [id],
                |row| {
                    Ok(Session {
                        id: row.get(0)?,
                        node_id: row.get(1)?,
                        agent_type: row.get(2)?,
                        status: row.get(3)?,
                        output: row.get(4)?,
                        error: row.get(5)?,
                        backend: row.get(6)?,
                        attach_command: row.get(7)?,
                        container_id: row.get(8)?,
                        started_at: row.get(9)?,
                        completed_at: row.get(10)?,
                    })
                },
            )
            .optional()?;

        Ok(session)
    }

    /// Set session status
    pub fn set_session_status(&self, id: &str, status: &str) -> DbResult<()> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp_millis();

        let completed_at = if status == "completed" || status == "failed" {
            Some(now)
        } else {
            None
        };

        conn.execute(
            "UPDATE sessions SET status = ?, completed_at = ? WHERE id = ?",
            params![status, completed_at, id],
        )?;

        Ok(())
    }

    /// Get session output
    pub fn get_session_output(&self, id: &str) -> DbResult<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let output: Option<String> = conn
            .query_row("SELECT output FROM sessions WHERE id = ?", [id], |row| {
                row.get(0)
            })
            .optional()?
            .flatten();

        Ok(output)
    }

    /// Append output to session
    pub fn append_session_output(&self, id: &str, chunk: &str) -> DbResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET output = COALESCE(output, '') || ? WHERE id = ?",
            params![chunk, id],
        )?;
        Ok(())
    }
}

// Implement Clone for use in async contexts
impl Clone for Database {
    fn clone(&self) -> Self {
        // This is a bit of a hack - we create a new in-memory connection
        // In production, you'd want to use a connection pool
        panic!("Database should not be cloned - use State<Database> or Arc<Database>")
    }
}

// Allow the database to be used across threads
unsafe impl Send for Database {}
unsafe impl Sync for Database {}
