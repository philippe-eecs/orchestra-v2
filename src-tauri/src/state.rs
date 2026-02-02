use std::{collections::HashMap, fs, path::PathBuf, sync::Arc};

use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, RwLock};

use crate::commands::projects::Project;

#[derive(Clone)]
pub struct AppState {
    pub projects: Arc<RwLock<HashMap<String, Project>>>,
    pub processes: Arc<Mutex<HashMap<String, Arc<RunningProcess>>>>,
    projects_file: Arc<PathBuf>,
    workspaces_dir: Arc<PathBuf>,
}

impl AppState {
    pub fn new() -> Self {
        let (projects_file, workspaces_dir) = app_storage_paths();
        let projects = load_projects_from_disk(&projects_file)
            .unwrap_or_else(|e| {
                tracing::warn!("Failed to load projects from disk: {e}");
                Vec::new()
            })
            .into_iter()
            .map(|p| (p.id.clone(), p))
            .collect::<HashMap<_, _>>();

        Self {
            projects: Arc::new(RwLock::new(projects)),
            processes: Arc::new(Mutex::new(HashMap::new())),
            projects_file: Arc::new(projects_file),
            workspaces_dir: Arc::new(workspaces_dir),
        }
    }

    pub fn projects_file(&self) -> &PathBuf {
        &self.projects_file
    }

    pub fn workspaces_dir(&self) -> &PathBuf {
        &self.workspaces_dir
    }

    pub async fn persist_projects(&self) -> Result<(), String> {
        persist_projects_to_disk(&self.projects, self.projects_file()).await
    }
}

pub struct RunningProcess {
    child: Mutex<Option<tokio::process::Child>>,
}

impl RunningProcess {
    pub fn new(child: tokio::process::Child) -> Arc<Self> {
        Arc::new(Self {
            child: Mutex::new(Some(child)),
        })
    }

    pub async fn kill(&self) -> Result<(), std::io::Error> {
        let mut guard = self.child.lock().await;
        if let Some(child) = guard.as_mut() {
            child.kill().await?;
        }
        Ok(())
    }

    pub async fn wait(&self) -> Result<std::process::ExitStatus, std::io::Error> {
        let mut guard = self.child.lock().await;
        if let Some(mut child) = guard.take() {
            let status = child.wait().await?;
            Ok(status)
        } else {
            Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "process already awaited",
            ))
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectsFileV1 {
    version: u32,
    projects: Vec<Project>,
}

fn app_storage_paths() -> (PathBuf, PathBuf) {
    // Prefer OS-appropriate app data dir; fall back to a temp directory.
    let base_dir = ProjectDirs::from("ai", "Orchestra", "Orchestra")
        .map(|d| d.data_dir().to_path_buf())
        .unwrap_or_else(|| std::env::temp_dir().join("orchestra"));

    if let Err(e) = fs::create_dir_all(&base_dir) {
        tracing::warn!("Failed to create app data dir {:?}: {}", base_dir, e);
    }

    let workspaces_dir = base_dir.join("workspaces");
    if let Err(e) = fs::create_dir_all(&workspaces_dir) {
        tracing::warn!(
            "Failed to create workspaces dir {:?}: {}",
            workspaces_dir,
            e
        );
    }

    (base_dir.join("projects.json"), workspaces_dir)
}

fn load_projects_from_disk(path: &PathBuf) -> Result<Vec<Project>, String> {
    if !path.is_file() {
        return Ok(Vec::new());
    }

    let bytes = fs::read(path).map_err(|e| format!("read failed: {e}"))?;
    if bytes.is_empty() {
        return Ok(Vec::new());
    }

    let parsed: ProjectsFileV1 =
        serde_json::from_slice(&bytes).map_err(|e| format!("parse failed: {e}"))?;
    if parsed.version != 1 {
        return Err(format!("unsupported projects.json version: {}", parsed.version));
    }
    Ok(parsed.projects)
}

async fn persist_projects_to_disk(
    projects: &RwLock<HashMap<String, Project>>,
    path: &PathBuf,
) -> Result<(), String> {
    let mut list = projects.read().await.values().cloned().collect::<Vec<_>>();
    // Keep stable ordering in the file for easier diffs.
    list.sort_by_key(|p| std::cmp::Reverse(p.updated_at));

    let payload = ProjectsFileV1 {
        version: 1,
        projects: list,
    };
    let bytes = serde_json::to_vec_pretty(&payload).map_err(|e| format!("serialize failed: {e}"))?;

    let parent = path
        .parent()
        .ok_or_else(|| "invalid projects file path".to_string())?;
    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|e| format!("create_dir_all failed: {e}"))?;

    let tmp = path.with_extension("json.tmp");
    tokio::fs::write(&tmp, bytes)
        .await
        .map_err(|e| format!("write failed: {e}"))?;

    // Prefer atomic replace (works on Unix). If it fails (e.g. Windows), remove and retry.
    if let Err(e) = tokio::fs::rename(&tmp, path).await {
        let _ = tokio::fs::remove_file(path).await;
        tokio::fs::rename(&tmp, path)
            .await
            .map_err(|e2| format!("rename failed: {e} / retry: {e2}"))?;
    }
    Ok(())
}
