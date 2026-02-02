mod commands;
mod executors;
mod sessions;
mod state;

use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use sessions::manager::SessionManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "orchestra_desktop=debug,tauri=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting Orchestra Desktop");

    // Create shared session manager
    let session_manager = Arc::new(Mutex::new(SessionManager::new()));
    let session_manager_for_state = session_manager.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(state::AppState::new())
        .manage(session_manager_for_state)
        .setup(|app| {
            // Get the main window for event emission
            let window = app.get_webview_window("main")
                .expect("main window should exist");

            // Get state for accessing projects
            let app_state = app.state::<state::AppState>().inner().clone();

            // Get session manager for the monitor
            let session_manager = app.state::<Arc<Mutex<SessionManager>>>().inner().clone();

            // Start the background completion monitor
            // The get_node_checks closure retrieves checks from the project store
            let get_node_checks = move |node_id: &str| -> Vec<sessions::checks::Check> {
                // This is a sync closure but we need async access to projects
                // For now, use blocking read - in production, consider a channel-based approach
                let projects = app_state.projects.blocking_read();

                for project in projects.values() {
                    if let Some(node) = project.nodes.iter().find(|n| n.id == node_id) {
                        // Parse checks from the project node
                        return parse_node_checks(&node.checks);
                    }
                }
                Vec::new()
            };

            sessions::monitor::start_monitor(window, session_manager, get_node_checks);

            tracing::info!("Session completion monitor started");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::projects::list_projects,
            commands::projects::get_project,
            commands::projects::create_project,
            commands::projects::save_project,
            commands::projects::delete_project,
            commands::execution::execute_node,
            commands::execution::stop_execution,
            commands::sessions::create_interactive_session,
            commands::sessions::attach_session,
            commands::sessions::send_session_input,
            commands::sessions::capture_session_output,
            commands::sessions::kill_interactive_session,
            commands::sessions::list_interactive_sessions,
            commands::sessions::get_attach_command,
            commands::sessions::open_in_ghostty,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Parse checks from the project node format into our Check enum
fn parse_node_checks(checks: &[serde_json::Value]) -> Vec<sessions::checks::Check> {
    checks
        .iter()
        .filter_map(|v| serde_json::from_value(v.clone()).ok())
        .collect()
}
