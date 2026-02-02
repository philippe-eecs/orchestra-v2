use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::task;
use tokio::time::{interval, Duration};

use crate::state::AppState;

use super::checks::{self, Check};
use super::events::{
    SessionAwaitingInputClearedEvent, SessionAwaitingInputEvent, SessionCompletedEvent,
};
use super::input_detection::detect_input_waiting;
use super::manager::{SessionManager, SessionStatus};
use super::tmux;

/// Number of stale polls before considering the agent to be waiting for input.
/// With a 3s poll interval and threshold=2, this triggers after ~6s of unchanged output.
const STALE_THRESHOLD: u32 = 2;

const MAX_OUTPUT_PREVIEW_CHARS: usize = 2000;
const MAX_NOTIFICATION_CHARS: usize = 220;

fn hash_output(output: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    output.hash(&mut hasher);
    hasher.finish()
}

fn get_output_preview(output: &str, lines: usize) -> String {
    output
        .lines()
        .rev()
        .take(lines)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n")
}

fn truncate_one_line(s: &str, max_chars: usize) -> String {
    let mut out = s.replace(['\n', '\r'], " ");
    if out.chars().count() > max_chars {
        out = out.chars().take(max_chars).collect::<String>() + "…";
    }
    out
}

async fn tmux_capture_pane(session_id: String, lines: usize) -> Result<String, String> {
    task::spawn_blocking(move || tmux::capture_pane(&session_id, lines).map_err(|e| e.0))
        .await
        .map_err(|e| format!("capture task failed: {e}"))?
}

async fn tmux_session_exists(session_id: String) -> bool {
    task::spawn_blocking(move || tmux::session_exists(&session_id))
        .await
        .unwrap_or(false)
}

async fn get_node_checks_and_label(
    app_state: &AppState,
    node_id: &str,
) -> (Vec<Check>, Option<String>) {
    let projects = app_state.projects.read().await;
    for project in projects.values() {
        if let Some(node) = project.nodes.iter().find(|n| n.id == node_id) {
            let checks = node
                .checks
                .iter()
                .filter_map(|v| serde_json::from_value(v.clone()).ok())
                .collect::<Vec<Check>>();
            return (checks, Some(node.title.clone()));
        }
    }
    (Vec::new(), None)
}

/// Start the background monitor that detects agent completion and input waiting.
pub fn start_monitor(
    window: tauri::WebviewWindow,
    session_manager: SessionManager,
    app_state: AppState,
) {
    let app_handle = window.app_handle().clone();

    tauri::async_runtime::spawn(async move {
        let mut poll_interval = interval(Duration::from_secs(3));

        loop {
            poll_interval.tick().await;

            // Only monitor sessions we are tracking.
            // We handle both Running and AwaitingInput so we can detect when output resumes.
            let sessions = session_manager
                .list_sessions()
                .await
                .into_iter()
                .filter(|s| {
                    matches!(
                        s.status,
                        SessionStatus::Running | SessionStatus::AwaitingInput
                    )
                })
                .collect::<Vec<_>>();

            for session in sessions {
                let exit_file = format!("/tmp/orchestra-sessions/{}.exit", session.id);

                // Agent completed (exit code file written by wrapper)
                if tokio::fs::metadata(&exit_file).await.is_ok() {
                    tracing::info!(
                        "Detected agent completion for session {} (node {})",
                        session.id,
                        session.node_id
                    );

                    let exit_code = tokio::fs::read_to_string(&exit_file)
                        .await
                        .ok()
                        .and_then(|s| s.trim().parse::<i32>().ok())
                        .unwrap_or(-1);

                    let output = tmux_capture_pane(session.id.clone(), 1000)
                        .await
                        .map(|s| s.trim().to_string())
                        .unwrap_or_default();

                    let (node_checks, _label) =
                        get_node_checks_and_label(&app_state, &session.node_id).await;

                    let cwd = session.cwd.clone();
                    let check_results_join = task::spawn_blocking(move || {
                        checks::run_checks(&node_checks, cwd.as_deref())
                    })
                    .await;
                    let (check_results, all_checks_passed) = match check_results_join {
                        Ok(results) => {
                            let passed = results.iter().all(|r| r.passed);
                            (results, passed)
                        }
                        Err(e) => {
                            tracing::warn!("Failed to run checks for {}: {}", session.id, e);
                            (Vec::new(), false)
                        }
                    };

                    let success = exit_code == 0 && all_checks_passed;

                    session_manager.mark_completed(&session.id, exit_code).await;

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

                    // Keep the tmux session (user may inspect) but remove the exit file marker.
                    if let Err(e) = tokio::fs::remove_file(&exit_file).await {
                        tracing::warn!("Failed to remove exit file {}: {}", exit_file, e);
                    }

                    continue;
                }

                // Session died unexpectedly (user killed tmux session, etc.)
                if !tmux_session_exists(session.id.clone()).await {
                    tracing::info!(
                        "Detected dead session {} (node {})",
                        session.id,
                        session.node_id
                    );

                    let (node_checks, _label) =
                        get_node_checks_and_label(&app_state, &session.node_id).await;
                    let cwd = session.cwd.clone();
                    let check_results_join = task::spawn_blocking(move || {
                        checks::run_checks(&node_checks, cwd.as_deref())
                    })
                    .await;
                    let (check_results, all_checks_passed) = match check_results_join {
                        Ok(results) => {
                            let passed = results.iter().all(|r| r.passed);
                            (results, passed)
                        }
                        Err(e) => {
                            tracing::warn!("Failed to run checks for {}: {}", session.id, e);
                            (Vec::new(), false)
                        }
                    };

                    let event = SessionCompletedEvent {
                        session_id: session.id.clone(),
                        node_id: session.node_id.clone(),
                        success: all_checks_passed,
                        exit_code: -1,
                        output: "Session terminated".into(),
                        check_results,
                        all_checks_passed,
                    };

                    if let Err(e) = window.emit("session://completed", &event) {
                        tracing::error!("Failed to emit session completed event: {}", e);
                    }

                    session_manager.remove_session(&session.id).await;
                    continue;
                }

                // Capture output for staleness detection and for clearing AwaitingInput when output resumes.
                let output = match tmux_capture_pane(session.id.clone(), 50).await {
                    Ok(o) => o,
                    Err(e) => {
                        tracing::warn!("Failed to capture pane for {}: {}", session.id, e);
                        continue;
                    }
                };

                let output_hash = hash_output(&output);
                let update = match session_manager
                    .update_staleness(&session.id, output_hash)
                    .await
                {
                    Some(u) => u,
                    None => continue,
                };

                // If output changed while we were awaiting input, clear the inbox item.
                if update.cleared_awaiting_input {
                    if let Err(e) = window.emit(
                        "session://awaiting_input_cleared",
                        SessionAwaitingInputClearedEvent {
                            session_id: session.id.clone(),
                            node_id: session.node_id.clone(),
                            timestamp: chrono::Utc::now().timestamp_millis(),
                        },
                    ) {
                        tracing::warn!("Failed to emit awaiting input cleared event: {}", e);
                    }
                }

                // Only detect "awaiting input" when currently running.
                if update.status != SessionStatus::Running {
                    continue;
                }

                if update.is_stale && update.stale_count >= STALE_THRESHOLD {
                    let detection = detect_input_waiting(&output, &session.agent);
                    if !detection.waiting_for_input {
                        continue;
                    }

                    let (_checks, node_label) =
                        get_node_checks_and_label(&app_state, &session.node_id).await;
                    let node_label = node_label.unwrap_or_else(|| "Agent".to_string());

                    session_manager
                        .mark_awaiting_input(&session.id, detection.detected_question.clone())
                        .await;

                    let notification_body = detection
                        .detected_question
                        .as_deref()
                        .map(|q| truncate_one_line(q, MAX_NOTIFICATION_CHARS))
                        .unwrap_or_else(|| "Agent is waiting for your response".into());

                    if let Err(e) = app_handle
                        .notification()
                        .builder()
                        .title(format!("{} needs input", node_label))
                        .body(&notification_body)
                        .show()
                    {
                        tracing::warn!("Failed to send notification: {}", e);
                    }

                    let preview = get_output_preview(&output, 10);
                    let preview = if preview.chars().count() > MAX_OUTPUT_PREVIEW_CHARS {
                        preview
                            .chars()
                            .take(MAX_OUTPUT_PREVIEW_CHARS)
                            .collect::<String>()
                            + "…"
                    } else {
                        preview
                    };

                    let event = SessionAwaitingInputEvent {
                        session_id: session.id.clone(),
                        node_id: session.node_id.clone(),
                        node_label,
                        detected_question: detection.detected_question,
                        output_preview: preview,
                        timestamp: chrono::Utc::now().timestamp_millis(),
                    };

                    if let Err(e) = window.emit("session://awaiting_input", &event) {
                        tracing::error!("Failed to emit awaiting input event: {}", e);
                    }
                }
            }
        }
    });
}
