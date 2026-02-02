use serde::Serialize;

use super::checks::CheckResult;

/// Event emitted when an agent session completes (agent exits, not session termination)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCompletedEvent {
    /// ID of the tmux session
    pub session_id: String,
    /// ID of the node this session was running for
    pub node_id: String,
    /// Overall success: exit_code == 0 && all_checks_passed
    pub success: bool,
    /// Exit code from the agent process
    pub exit_code: i32,
    /// Final captured output from the terminal
    pub output: String,
    /// Results of running the node's checks
    pub check_results: Vec<CheckResult>,
    /// Whether all automated checks passed
    pub all_checks_passed: bool,
}
