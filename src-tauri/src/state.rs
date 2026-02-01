use std::{collections::HashMap, sync::Arc};

use tokio::sync::{Mutex, RwLock};

use crate::commands::projects::Project;

#[derive(Clone)]
pub struct AppState {
    pub projects: Arc<RwLock<HashMap<String, Project>>>,
    pub processes: Arc<Mutex<HashMap<String, Arc<RunningProcess>>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            projects: Arc::new(RwLock::new(HashMap::new())),
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
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
