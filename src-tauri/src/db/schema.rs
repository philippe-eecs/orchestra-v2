//! Database schema initialization

use rusqlite::Connection;

/// Initialize the database schema
pub fn initialize(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        r#"
        -- Projects table
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            location TEXT,
            context TEXT NOT NULL DEFAULT '{"resources":[],"notes":"","variables":{}}',
            nodes TEXT NOT NULL DEFAULT '[]',
            edges TEXT NOT NULL DEFAULT '[]',
            default_execution_config TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        -- Sessions table
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            node_id TEXT NOT NULL,
            agent_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'running',
            output TEXT,
            error TEXT,
            backend TEXT,
            attach_command TEXT,
            container_id TEXT,
            started_at INTEGER NOT NULL,
            completed_at INTEGER
        );

        -- Agent library table
        CREATE TABLE IF NOT EXISTS agent_library (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            category TEXT,
            data TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );

        -- Node runs table (execution history)
        CREATE TABLE IF NOT EXISTS node_runs (
            id TEXT PRIMARY KEY,
            node_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            session_id TEXT,
            compiled_context TEXT,
            prompt TEXT NOT NULL,
            agent_type TEXT NOT NULL,
            agent_command TEXT,
            status TEXT NOT NULL DEFAULT 'running',
            output TEXT,
            error TEXT,
            started_at INTEGER NOT NULL,
            completed_at INTEGER
        );

        -- Sync metadata for future CloudKit integration
        CREATE TABLE IF NOT EXISTS sync_metadata (
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            sync_version INTEGER NOT NULL DEFAULT 0,
            synced_at INTEGER,
            device_id TEXT,
            deleted INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (entity_type, entity_id)
        );

        -- TODO items extracted from code
        CREATE TABLE IF NOT EXISTS code_todos (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            line_number INTEGER NOT NULL,
            content TEXT NOT NULL,
            todo_type TEXT NOT NULL,
            tracked INTEGER NOT NULL DEFAULT 0,
            linked_node_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        -- Notification events
        CREATE TABLE IF NOT EXISTS notification_events (
            id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            project_id TEXT NOT NULL,
            node_id TEXT,
            message TEXT NOT NULL,
            priority TEXT NOT NULL DEFAULT 'normal',
            acknowledged INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        );

        -- Indexes for common queries
        CREATE INDEX IF NOT EXISTS idx_sessions_node_id ON sessions(node_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
        CREATE INDEX IF NOT EXISTS idx_node_runs_project ON node_runs(project_id);
        CREATE INDEX IF NOT EXISTS idx_node_runs_node ON node_runs(node_id);
        CREATE INDEX IF NOT EXISTS idx_code_todos_project ON code_todos(project_id);
        CREATE INDEX IF NOT EXISTS idx_notification_events_project ON notification_events(project_id);
        "#,
    )?;

    Ok(())
}
