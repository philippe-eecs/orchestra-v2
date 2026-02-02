use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    pub r#type: String,
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra_args: Option<Vec<String>>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub launch_mode: Option<String>,
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
    // If the user has no projects yet, auto-create a helpful Test project.
    {
        let guard = state.projects.read().await;
        if guard.is_empty() {
            drop(guard);
            let _ = create_or_update_test_project(state.inner()).await;
        }
    }

    // Reset transient statuses on startup/restart so the UI doesn't get stuck in "Starting...".
    // (We don't attempt to reconcile old tmux sessions here; this is a safe default.)
    let mut changed = false;
    {
        let mut guard = state.projects.write().await;
        for project in guard.values_mut() {
            for node in project.nodes.iter_mut() {
                if node.status == "running" || node.status == "awaiting_input" {
                    node.status = "pending".to_string();
                    changed = true;
                }
            }
        }
    }
    if changed {
        state.persist_projects().await?;
    }

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
    state.persist_projects().await?;
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
    state.persist_projects().await?;
    Ok(project)
}

#[tauri::command]
pub async fn delete_project(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    state.projects.write().await.remove(&id);
    state.persist_projects().await?;
    Ok(())
}

#[tauri::command]
pub async fn create_test_project(state: tauri::State<'_, AppState>) -> Result<Project, String> {
    create_or_update_test_project(state.inner()).await
}

async fn create_or_update_test_project(state: &AppState) -> Result<Project, String> {
    let ts = now_ms();

    // Create a dedicated workspace under the app data dir.
    let workspace = state.workspaces_dir().join("test");
    tokio::fs::create_dir_all(&workspace)
        .await
        .map_err(|e| format!("failed to create workspace: {e}"))?;

    let readme = workspace.join("README.md");
    if tokio::fs::metadata(&readme).await.is_err() {
        let content = r#"# Orchestra Test Workspace

This folder is used by the built-in "Test" project to exercise:
- interactive tmux sessions
- one-shot streaming runs
- post-run checks (file_exists / contains / command)

You can delete it at any time; Orchestra will recreate it when you re-create the Test project.
"#;
        tokio::fs::write(&readme, content)
            .await
            .map_err(|e| format!("failed to write README: {e}"))?;
    }

    let workspace_str = workspace.to_string_lossy().to_string();

    let mut guard = state.projects.write().await;

    let existing_id = guard
        .values()
        .find(|p| p.name == "Test")
        .map(|p| p.id.clone());
    let id = existing_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let created_at = guard.get(&id).map(|p| p.created_at).unwrap_or(ts);

    let node_interactive = Node {
        id: Uuid::new_v4().to_string(),
        title: "Interactive: Chat (Claude)".into(),
        position: NodePosition { x: 120.0, y: 120.0 },
        agent: AgentConfig {
            r#type: "claude".into(),
            model: Some("sonnet".into()),
            extra_args: None,
        },
        launch_mode: Some("interactive".into()),
        prompt: "Say hello, then ask me a yes/no question and wait for my input.".into(),
        context: vec![],
        deliverables: vec![],
        checks: vec![],
        status: "pending".into(),
    };

    let node_one_shot_stream = Node {
        id: Uuid::new_v4().to_string(),
        title: "One-shot: Stream output (Claude)".into(),
        position: NodePosition { x: 520.0, y: 120.0 },
        agent: AgentConfig {
            r#type: "claude".into(),
            model: Some("sonnet".into()),
            extra_args: None,
        },
        launch_mode: Some("one_shot".into()),
        prompt: "Print a single line that says: OK. Then exit.".into(),
        context: vec![],
        deliverables: vec![],
        checks: vec![],
        status: "pending".into(),
    };

    let node_one_shot_approval = Node {
        id: Uuid::new_v4().to_string(),
        title: "One-shot: Human approval gate".into(),
        position: NodePosition { x: 520.0, y: 320.0 },
        agent: AgentConfig {
            r#type: "claude".into(),
            model: Some("sonnet".into()),
            extra_args: None,
        },
        launch_mode: Some("one_shot".into()),
        prompt: "Print: Ready for approval. Then exit with code 0.".into(),
        context: vec![],
        deliverables: vec![],
        checks: vec![json!({ "id": Uuid::new_v4().to_string(), "type": "human_approval" })],
        status: "pending".into(),
    };

    let check_file_exists_id = Uuid::new_v4().to_string();
    let check_contains_id = Uuid::new_v4().to_string();
    let check_command_id = Uuid::new_v4().to_string();
    let node_one_shot_checks = Node {
        id: Uuid::new_v4().to_string(),
        title: "One-shot: Create file + checks".into(),
        position: NodePosition { x: 920.0, y: 120.0 },
        agent: AgentConfig {
            r#type: "claude".into(),
            model: Some("sonnet".into()),
            extra_args: None,
        },
        launch_mode: Some("one_shot".into()),
        prompt: format!(
            "In the current working directory, create a file named result.txt with content \"hello from Orchestra\". Then exit.\n\n(Workspace: {})",
            workspace_str
        ),
        context: vec![],
        deliverables: vec![],
        checks: vec![
            json!({ "id": check_file_exists_id, "type": "file_exists", "path": "result.txt" }),
            json!({ "id": check_contains_id, "type": "contains", "path": "result.txt", "pattern": "hello from Orchestra" }),
            json!({ "id": check_command_id, "type": "command", "cmd": "ls -la result.txt" }),
        ],
        status: "pending".into(),
    };

    let node_codex_one_shot = Node {
        id: Uuid::new_v4().to_string(),
        title: "One-shot: Codex smoke test".into(),
        position: NodePosition { x: 920.0, y: 320.0 },
        agent: AgentConfig {
            r#type: "codex".into(),
            model: Some("codex-1".into()),
            extra_args: None,
        },
        launch_mode: Some("one_shot".into()),
        prompt: "Say: Codex is wired up. Then exit.".into(),
        context: vec![],
        deliverables: vec![],
        checks: vec![],
        status: "pending".into(),
    };

    let node_gemini_interactive = Node {
        id: Uuid::new_v4().to_string(),
        title: "Interactive: Gemini smoke test".into(),
        position: NodePosition { x: 120.0, y: 320.0 },
        agent: AgentConfig {
            r#type: "gemini".into(),
            model: Some("gemini-2.5-pro".into()),
            extra_args: None,
        },
        launch_mode: Some("interactive".into()),
        prompt: "Say hello and ask me what to do next. Wait for input.".into(),
        context: vec![],
        deliverables: vec![],
        checks: vec![],
        status: "pending".into(),
    };

    // A couple of edges, just to have something on the canvas (execution is still single-node).
    let edges = vec![
        Edge {
            id: Uuid::new_v4().to_string(),
            source_id: node_interactive.id.clone(),
            target_id: node_one_shot_stream.id.clone(),
            source_deliverable: None,
        },
        Edge {
            id: Uuid::new_v4().to_string(),
            source_id: node_one_shot_stream.id.clone(),
            target_id: node_one_shot_checks.id.clone(),
            source_deliverable: None,
        },
    ];

    let project = Project {
        id: id.clone(),
        name: "Test".into(),
        description: "Template project for exercising Orchestra features (interactive tmux sessions, one-shot runs, checks, inbox)."
            .into(),
        location: Some(workspace_str),
        nodes: vec![
            node_interactive,
            node_one_shot_stream,
            node_one_shot_approval,
            node_one_shot_checks,
            node_codex_one_shot,
            node_gemini_interactive,
        ],
        edges,
        created_at,
        updated_at: ts,
    };

    guard.insert(id, project.clone());
    drop(guard);

    state.persist_projects().await?;
    Ok(project)
}
