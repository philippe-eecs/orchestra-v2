"""Tests for step executor command building."""

import pytest
from executor.step_executor import build_command, DEFAULT_MODELS


class TestBuildCommand:
    """Tests for the build_command function."""

    def test_claude_default(self):
        """Test Claude command with default config."""
        cmd = build_command("claude", "Analyze this code")
        assert "claude -p" in cmd
        assert "Analyze this code" in cmd
        assert f"--model {DEFAULT_MODELS['claude']}" in cmd
        assert "--dangerously-skip-permissions" in cmd
        assert "--auto-compact" in cmd
        assert "--thinking-budget" not in cmd

    def test_claude_with_thinking_budget(self):
        """Test Claude command with thinking budget."""
        cmd = build_command("claude", "Analyze this", {"thinking_budget": 16000})
        assert "--thinking-budget 16000" in cmd

    def test_claude_with_custom_model(self):
        """Test Claude command with custom model version."""
        cmd = build_command("claude", "Test", {"model_version": "claude-sonnet-4-20250514"})
        assert "--model claude-sonnet-4-20250514" in cmd

    def test_claude_full_config(self):
        """Test Claude command with all config options."""
        config = {
            "model_version": "claude-opus-4-5-20251101",
            "thinking_budget": 32000,
        }
        cmd = build_command("claude", "Complex task", config)
        assert "--model claude-opus-4-5-20251101" in cmd
        assert "--thinking-budget 32000" in cmd

    def test_codex_default(self):
        """Test Codex command with default config."""
        cmd = build_command("codex", "Generate code")
        assert "codex exec" in cmd
        assert "--reasoning xhigh" in cmd  # Default reasoning
        assert f"--model {DEFAULT_MODELS['codex']}" in cmd
        assert "--dangerously-bypass-approvals-and-sandbox" in cmd

    def test_codex_with_reasoning_level(self):
        """Test Codex command with custom reasoning level."""
        cmd = build_command("codex", "Simple task", {"reasoning_level": "low"})
        assert "--reasoning low" in cmd

    def test_codex_with_custom_model(self):
        """Test Codex command with custom model version."""
        cmd = build_command("codex", "Test", {"model_version": "codex-6.0"})
        assert "--model codex-6.0" in cmd

    def test_codex_full_config(self):
        """Test Codex command with all config options."""
        config = {
            "model_version": "codex-5.2",
            "reasoning_level": "high",
        }
        cmd = build_command("codex", "Task", config)
        assert "--model codex-5.2" in cmd
        assert "--reasoning high" in cmd

    def test_gemini_default(self):
        """Test Gemini command with default config."""
        cmd = build_command("gemini", "Analyze image")
        assert "gemini" in cmd
        assert f"-m {DEFAULT_MODELS['gemini']}" in cmd
        assert "-o text" in cmd

    def test_gemini_with_custom_model(self):
        """Test Gemini command with custom model version."""
        cmd = build_command("gemini", "Test", {"model_version": "gemini-2.5-pro"})
        assert "-m gemini-2.5-pro" in cmd

    def test_custom_agent(self):
        """Test custom agent returns prompt as-is."""
        cmd = build_command("custom", "echo 'Hello World'")
        assert cmd == "echo 'Hello World'"

    def test_unknown_agent_type(self):
        """Test unknown agent type falls back to custom."""
        cmd = build_command("unknown_agent", "some command")
        assert cmd == "some command"

    def test_prompt_escaping(self):
        """Test that single quotes in prompt are properly escaped."""
        cmd = build_command("claude", "What's the issue?")
        # The prompt should be escaped for shell safety
        assert "'\"'\"'" in cmd or "What" in cmd

    def test_none_config_values(self):
        """Test that None config values use defaults."""
        config = {
            "model_version": None,
            "thinking_budget": None,
            "reasoning_level": None,
        }
        cmd = build_command("claude", "Test", config)
        assert f"--model {DEFAULT_MODELS['claude']}" in cmd
        assert "--thinking-budget" not in cmd

    def test_empty_config(self):
        """Test that empty config dict uses defaults."""
        cmd = build_command("codex", "Test", {})
        assert "--reasoning xhigh" in cmd
        assert f"--model {DEFAULT_MODELS['codex']}" in cmd
