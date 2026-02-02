mod commands;
mod executors;
mod sessions;
mod state;

use sessions::manager::SessionManager;
use tauri::{Manager, WindowEvent};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

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

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(state::AppState::new())
        .manage(SessionManager::new())
        .on_window_event(|window, event| {
            // Avoid treating a window close as an app crash; keep the process alive and minimize instead.
            // Users can quit explicitly via Cmd+Q (macOS) or the app menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.minimize();
            }
        })
        .setup(|app| {
            // Get the main window for event emission
            let window = app
                .get_webview_window("main")
                .or_else(|| app.webview_windows().into_values().next());
            let Some(window) = window else {
                tracing::error!("No webview window found; session monitor not started");
                return Ok(());
            };

            // Get state for accessing projects
            let app_state = app.state::<state::AppState>().inner().clone();

            // Get session manager for the monitor
            let session_manager = app.state::<SessionManager>().inner().clone();

            sessions::monitor::start_monitor(window, session_manager, app_state);

            tracing::info!("Session completion monitor started");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::projects::list_projects,
            commands::projects::get_project,
            commands::projects::create_project,
            commands::projects::create_test_project,
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
