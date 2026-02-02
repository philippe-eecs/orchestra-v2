//! Input detection module for identifying when agents are waiting for user input.
//!
//! This module analyzes terminal output to detect patterns that indicate
//! an agent is waiting for user input (questions, prompts, choices, etc.)

/// Result of input detection analysis
#[derive(Debug, Clone)]
pub struct InputDetectionResult {
    /// Whether input appears to be expected
    pub waiting_for_input: bool,
    /// The detected question or prompt text, if any
    pub detected_question: Option<String>,
    /// Confidence level (0.0 - 1.0)
    pub confidence: f32,
}

/// Patterns that indicate an agent is waiting for input
const QUESTION_ENDINGS: &[&str] = &["?"];

const PROMPT_INDICATORS: &[&str] = &[
    "> ",
    ">> ",
    ">>> ",
    "[y/n]",
    "[Y/n]",
    "[y/N]",
    "(yes/no)",
    "(y/n)",
    "[yes/no]",
    "Press Enter",
    "press enter",
    "Continue?",
    "Proceed?",
    "confirm",
    "Confirm",
];

/// Claude-specific patterns
const CLAUDE_PATTERNS: &[&str] = &[
    "What would you like",
    "Would you like me to",
    "Should I",
    "Do you want",
    "How would you like",
    "Which option",
    "Please choose",
    "Select one",
    "Enter your",
    "Type your",
    "Provide the",
];

/// Patterns indicating numbered choices (e.g., "1. Option A\n2. Option B")
fn has_numbered_choices(text: &str) -> bool {
    let mut count = 0usize;
    for line in text.lines() {
        let trimmed = line.trim_start();
        let mut digits = 0usize;
        for c in trimmed.chars() {
            if c.is_ascii_digit() {
                digits += 1;
                continue;
            }
            break;
        }
        if digits == 0 {
            continue;
        }
        let rest = &trimmed[digits..];
        let is_choice = match rest.chars().next() {
            Some('.') | Some(')') | Some(':') => rest
                .chars()
                .nth(1)
                .map(|c| c.is_whitespace())
                .unwrap_or(false),
            _ => false,
        };
        if is_choice {
            count += 1;
        }
    }
    count >= 2
}

/// Extract the likely question from the output
fn extract_question(text: &str) -> Option<String> {
    let lines: Vec<&str> = text.lines().collect();

    // Look from the end backwards for the question
    for line in lines.iter().rev() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Check if line ends with question mark
        if trimmed.ends_with('?') {
            return Some(trimmed.to_string());
        }

        // Check for prompt indicators
        for pattern in PROMPT_INDICATORS {
            if trimmed.contains(pattern) {
                return Some(trimmed.to_string());
            }
        }

        // Check for Claude patterns
        for pattern in CLAUDE_PATTERNS {
            if trimmed.contains(pattern) {
                return Some(trimmed.to_string());
            }
        }

        // Only check last few non-empty lines
        break;
    }

    None
}

/// Analyze terminal output to detect if an agent is waiting for input
///
/// # Arguments
/// * `output` - The terminal output to analyze (typically last 50 lines)
/// * `agent` - The agent type ("claude", "codex", "gemini") for agent-specific patterns
///
/// # Returns
/// An `InputDetectionResult` with detection status and any extracted question
pub fn detect_input_waiting(output: &str, agent: &str) -> InputDetectionResult {
    // Only analyze the last portion of output (last 15 lines or so)
    let lines: Vec<&str> = output.lines().collect();
    let start_idx = lines.len().saturating_sub(15);
    let recent_output: String = lines[start_idx..].join("\n");

    let mut confidence = 0.0f32;
    let mut detected_question = None;

    // Check for question marks at end of lines
    for line in lines.iter().rev().take(5) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        for ending in QUESTION_ENDINGS {
            if trimmed.ends_with(ending) {
                confidence += 0.4;
                if detected_question.is_none() {
                    detected_question = Some(trimmed.to_string());
                }
                break;
            }
        }
    }

    let recent_lower = recent_output.to_lowercase();

    // Check for prompt indicators (case-insensitive)
    if PROMPT_INDICATORS
        .iter()
        .any(|p| recent_lower.contains(&p.to_lowercase()))
    {
        confidence += 0.3;
    }

    // Check for Claude-specific patterns (case-insensitive)
    if agent == "claude"
        && CLAUDE_PATTERNS
            .iter()
            .any(|p| recent_lower.contains(&p.to_lowercase()))
    {
        confidence += 0.35;
    }

    // Check for numbered choices
    if has_numbered_choices(&recent_output) {
        confidence += 0.25;
    }

    // Try to extract question if we haven't found one yet
    if detected_question.is_none() && confidence > 0.3 {
        detected_question = extract_question(&recent_output);
    }

    // Cap confidence at 1.0
    confidence = confidence.min(1.0);

    InputDetectionResult {
        waiting_for_input: confidence >= 0.5,
        detected_question,
        confidence,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_question() {
        let output = "Some output here\nWhat would you like me to do?";
        let result = detect_input_waiting(output, "claude");
        assert!(result.waiting_for_input);
        assert!(result.detected_question.is_some());
    }

    #[test]
    fn test_yes_no_prompt() {
        let output = "Ready to proceed. Continue? [y/n]";
        let result = detect_input_waiting(output, "claude");
        assert!(result.waiting_for_input);
    }

    #[test]
    fn test_numbered_choices() {
        let output = r#"Which option would you prefer?
1. Create new file
2. Modify existing
3. Delete and recreate"#;
        let result = detect_input_waiting(output, "claude");
        assert!(result.waiting_for_input);
    }

    #[test]
    fn test_no_question() {
        let output = "Running tests...\nAll 42 tests passed.\nDone.";
        let result = detect_input_waiting(output, "claude");
        assert!(!result.waiting_for_input);
    }
}
