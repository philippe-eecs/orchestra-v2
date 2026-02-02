use std::path::Path;
use std::sync::Arc;
use std::fs;
use tokio::sync::Mutex;
use tokio::time::{interval, Duration};
use tauri::Emitter;

use super::checks::{self, Check};
use super::events::SessionCompletedEvent;
use super::manager::SessionManager;
use super::tmux;

/// Start the background monitor that detects agent completion
///
/// This monitor runs every 3 seconds and:
/// 1. Checks for exit files written when agents finish
/// 2. Runs the node's checks when an agent completes
/// 3. Emits session://completed events to the frontend
/// 4. Cleans up tracking for dead sessions
pub fn start_monitor(
    window: tauri::WebviewWindow,
    session_manager: Arc<Mutex<SessionManager>>,
    get_node_checks: impl Fn(&str) -> Vec<Check> + Send + Sync + 'static,
) {
    // Use tauri's async runtime which is already initialized
    tauri::async_runtime::spawn(async move {
        let mut poll_interval = interval(Duration::from_secs(3));

        loop {
            poll_interval.tick().await;

            // Get all currently running sessions
            let sessions = {
                let manager = session_manager.lock().await;
                manager.list_running_sessions().await
            };

            for session in sessions {
                let exit_file = format!("/tmp/orchestra-sessions/{}.exit", session.id);

                // Check if exit file exists (agent finished)
                if Path::new(&exit_file).exists() {
                    tracing::info!(
                        "Detected agent completion for session {} (node {})",
                        session.id,
                        session.node_id
                    );

                    // Read exit code
                    let exit_code = fs::read_to_string(&exit_file)
                        .ok()
                        .and_then(|s| s.trim().parse::<i32>().ok())
                        .unwrap_or(-1);

                    // Capture final output
                    let output = tmux::capture_pane(&session.id, 1000)
                        .map(|s| s.trim().to_string())
                        .unwrap_or_default();

                    // Get checks for this node
                    let node_checks = get_node_checks(&session.node_id);

                    // Run checks
                    let check_results = checks::run_checks(&node_checks, session.cwd.as_deref());
                    let all_checks_passed = check_results.iter().all(|r| r.passed);

                    // Determine success based on exit code AND checks
                    let success = exit_code == 0 && all_checks_passed;

                    // Mark session as completed in manager
                    {
                        let manager = session_manager.lock().await;
                        manager.mark_completed(&session.id, exit_code).await;
                    }

                    // Emit completion event
                    let event = SessionCompletedEvent {
                        session_id: session.id.clone(),
                        node_id: session.node_id.clone(),
                        success,
                        exit_code,
                        output,
                        check_results,
                        all_checks_passed,
                    };

                    if let Err(e) = window.emit("session://completed", &event) {
                        tracing::error!("Failed to emit session completed event: {}", e);
                    }

                    // Clean up exit file (but NOT the tmux session - user can still inspect)
                    if let Err(e) = fs::remove_file(&exit_file) {
                        tracing::warn!("Failed to remove exit file {}: {}", exit_file, e);
                    }
                }
                // Also check for dead sessions (user exited, or process killed externally)
                else if !tmux::session_exists(&session.id) {
                    tracing::info!(
                        "Detected dead session {} (node {})",
                        session.id,
                        session.node_id
                    );

                    // Session died unexpectedly - still run checks!
                    let node_checks = get_node_checks(&session.node_id);
                    let check_results = checks::run_checks(&node_checks, session.cwd.as_deref());
                    let all_checks_passed = check_results.iter().all(|r| r.passed);

                    // Emit completion event
                    let event = SessionCompletedEvent {
                        session_id: session.id.clone(),
                        node_id: session.node_id.clone(),
                        success: all_checks_passed, // Only checks matter if session died
                        exit_code: -1,
                        output: "Session terminated".into(),
                        check_results,
                        all_checks_passed,
                    };

                    if let Err(e) = window.emit("session://completed", &event) {
                        tracing::error!("Failed to emit session completed event: {}", e);
                    }

                    // Remove from tracking
                    {
                        let manager = session_manager.lock().await;
                        manager.remove_session(&session.id).await;
                    }
                }
            }
        }
    });
}

/// Helper to get an empty check list (used as default when node checks aren't available)
pub fn empty_checks(_node_id: &str) -> Vec<Check> {
    Vec::new()
}
