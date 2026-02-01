mod commands;
mod executors;
mod state;

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
        .manage(state::AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::projects::list_projects,
            commands::projects::get_project,
            commands::projects::create_project,
            commands::projects::save_project,
            commands::projects::delete_project,
            commands::execution::execute_node,
            commands::execution::stop_execution,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

