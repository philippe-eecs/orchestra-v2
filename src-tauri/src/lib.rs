//! Orchestra Desktop - Tauri Application
//!
//! This is the main entry point for the Orchestra desktop application.
//! It sets up the Tauri runtime, registers commands, and initializes services.

mod commands;
mod db;
mod executors;

use tauri::Manager;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

pub use commands::*;
pub use db::Database;

/// Initialize the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging
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
        .setup(|app| {
            // Initialize the database
            let app_handle = app.handle().clone();
            let db = Database::new(&app_handle)?;
            app.manage(db);

            // macOS-specific setup is handled in tauri.conf.json

            tracing::info!("Orchestra Desktop initialized successfully");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Project commands
            commands::projects::list_projects,
            commands::projects::get_project,
            commands::projects::create_project,
            commands::projects::update_project,
            commands::projects::delete_project,
            // Node commands
            commands::nodes::add_node,
            commands::nodes::update_node,
            commands::nodes::delete_node,
            // Execution commands
            commands::execution::execute_node,
            commands::execution::stop_execution,
            commands::execution::get_execution_status,
            // Session commands
            commands::sessions::list_sessions,
            commands::sessions::get_session,
            commands::sessions::get_session_output,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
