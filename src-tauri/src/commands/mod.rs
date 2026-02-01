//! Tauri IPC Commands
//!
//! This module contains all the commands that can be invoked from the frontend.
//! Commands are organized by domain: projects, nodes, execution, sessions.

pub mod execution;
pub mod nodes;
pub mod projects;
pub mod sessions;

// Re-export common types for convenience
pub use execution::*;
pub use nodes::*;
pub use projects::*;
pub use sessions::*;
