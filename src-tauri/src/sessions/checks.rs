use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::Duration;

/// Represents a check to validate after an agent completes
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Check {
    FileExists {
        id: String,
        path: String,
        #[serde(rename = "autoRetry")]
        auto_retry: Option<bool>,
        #[serde(rename = "maxRetries")]
        max_retries: Option<u32>,
    },
    Command {
        id: String,
        cmd: String,
        #[serde(rename = "autoRetry")]
        auto_retry: Option<bool>,
        #[serde(rename = "maxRetries")]
        max_retries: Option<u32>,
    },
    Contains {
        id: String,
        path: String,
        pattern: String,
        #[serde(rename = "autoRetry")]
        auto_retry: Option<bool>,
        #[serde(rename = "maxRetries")]
        max_retries: Option<u32>,
    },
    HumanApproval {
        id: String,
    },
    TestRunner {
        id: String,
        framework: String,
        #[serde(rename = "autoRetry")]
        auto_retry: Option<bool>,
        #[serde(rename = "maxRetries")]
        max_retries: Option<u32>,
    },
}

impl Check {
    fn retry_config(&self) -> (bool, u32) {
        match self {
            Check::FileExists {
                auto_retry,
                max_retries,
                ..
            }
            | Check::Command {
                auto_retry,
                max_retries,
                ..
            }
            | Check::Contains {
                auto_retry,
                max_retries,
                ..
            }
            | Check::TestRunner {
                auto_retry,
                max_retries,
                ..
            } => (auto_retry.unwrap_or(false), max_retries.unwrap_or(2).min(10)),
            Check::HumanApproval { .. } => (false, 0),
        }
    }
}

/// Result of running a single check
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
    pub id: String,
    pub check_type: String,
    pub passed: bool,
    pub message: Option<String>,
}

/// Run all checks and return results
pub fn run_checks(checks: &[Check], cwd: Option<&str>) -> Vec<CheckResult> {
    checks.iter().map(|check| run_single_check(check, cwd)).collect()
}

/// Run a single check and return its result
pub fn run_single_check(check: &Check, cwd: Option<&str>) -> CheckResult {
    let (auto_retry, max_retries) = check.retry_config();
    let mut attempt = 0u32;
    loop {
        let result = run_single_check_once(check, cwd);
        if result.passed {
            return result;
        }
        if !auto_retry || attempt >= max_retries {
            return result;
        }
        attempt += 1;
        // Small backoff for eventual consistency (file writes, test runners, etc.)
        thread::sleep(Duration::from_millis(300));
    }
}

fn run_single_check_once(check: &Check, cwd: Option<&str>) -> CheckResult {
    match check {
        Check::FileExists { id, path, .. } => {
            let full_path = resolve_path(path, cwd);
            let exists = full_path.exists();
            CheckResult {
                id: id.clone(),
                check_type: "file_exists".into(),
                passed: exists,
                message: if exists {
                    None
                } else {
                    Some(format!("File not found: {}", path))
                },
            }
        }

        Check::Command { id, cmd, .. } => {
            let mut command = Command::new("sh");
            command.args(["-c", cmd]);
            if let Some(dir) = cwd {
                command.current_dir(dir);
            }

            match command.output() {
                Ok(output) => CheckResult {
                    id: id.clone(),
                    check_type: "command".into(),
                    passed: output.status.success(),
                    message: if output.status.success() {
                        None
                    } else {
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        Some(if stderr.is_empty() {
                            format!(
                                "Command exited with code {}",
                                output.status.code().unwrap_or(-1)
                            )
                        } else {
                            stderr.to_string()
                        })
                    },
                },
                Err(e) => CheckResult {
                    id: id.clone(),
                    check_type: "command".into(),
                    passed: false,
                    message: Some(format!("Failed to execute command: {}", e)),
                },
            }
        }

        Check::Contains { id, path, pattern, .. } => {
            let full_path = resolve_path(path, cwd);
            match std::fs::read_to_string(&full_path) {
                Ok(content) => {
                    let contains = content.contains(pattern);
                    CheckResult {
                        id: id.clone(),
                        check_type: "contains".into(),
                        passed: contains,
                        message: if contains {
                            None
                        } else {
                            Some(format!("Pattern '{}' not found in {}", pattern, path))
                        },
                    }
                }
                Err(e) => CheckResult {
                    id: id.clone(),
                    check_type: "contains".into(),
                    passed: false,
                    message: Some(format!("Failed to read file {}: {}", path, e)),
                },
            }
        }

        Check::HumanApproval { id } => {
            // Human approval checks can't be auto-passed
            // They require explicit UI interaction
            CheckResult {
                id: id.clone(),
                check_type: "human_approval".into(),
                passed: false,
                message: Some("Awaiting human approval".into()),
            }
        }

        Check::TestRunner { id, framework, .. } => {
            let cmd = match framework.as_str() {
                "npm" => "npm test",
                "pytest" => "pytest",
                "jest" => "npx jest",
                "cargo" => "cargo test",
                _ => {
                    return CheckResult {
                        id: id.clone(),
                        check_type: "test_runner".into(),
                        passed: false,
                        message: Some(format!("Unknown test framework: {}", framework)),
                    };
                }
            };

            // Delegate to command check logic
            let temp_check = Check::Command {
                id: id.clone(),
                cmd: cmd.to_string(),
                auto_retry: None,
                max_retries: None,
            };
            let mut result = run_single_check_once(&temp_check, cwd);
            result.check_type = "test_runner".into();
            result
        }
    }
}

/// Resolve a path relative to the working directory
fn resolve_path(path: &str, cwd: Option<&str>) -> PathBuf {
    let p = Path::new(path);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        match cwd {
            Some(dir) => Path::new(dir).join(path),
            None => p.to_path_buf(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_file_exists_check() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.txt");
        fs::write(&file_path, "hello").unwrap();

        let check = Check::FileExists {
            id: "test".into(),
            path: "test.txt".into(),
            auto_retry: None,
            max_retries: None,
        };

        let result = run_single_check(&check, Some(dir.path().to_str().unwrap()));
        assert!(result.passed);
        assert!(result.message.is_none());
    }

    #[test]
    fn test_file_not_exists_check() {
        let check = Check::FileExists {
            id: "test".into(),
            path: "/nonexistent/file.txt".into(),
            auto_retry: None,
            max_retries: None,
        };

        let result = run_single_check(&check, None);
        assert!(!result.passed);
        assert!(result.message.is_some());
    }

    #[test]
    fn test_command_check_success() {
        let check = Check::Command {
            id: "test".into(),
            cmd: "echo hello".into(),
            auto_retry: None,
            max_retries: None,
        };

        let result = run_single_check(&check, None);
        assert!(result.passed);
    }

    #[test]
    fn test_command_check_failure() {
        let check = Check::Command {
            id: "test".into(),
            cmd: "exit 1".into(),
            auto_retry: None,
            max_retries: None,
        };

        let result = run_single_check(&check, None);
        assert!(!result.passed);
    }

    #[test]
    fn test_contains_check() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.txt");
        fs::write(&file_path, "hello world").unwrap();

        let check = Check::Contains {
            id: "test".into(),
            path: "test.txt".into(),
            pattern: "world".into(),
            auto_retry: None,
            max_retries: None,
        };

        let result = run_single_check(&check, Some(dir.path().to_str().unwrap()));
        assert!(result.passed);
    }
}
