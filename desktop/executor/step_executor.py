"""
StepExecutor - Executes individual agent steps.

Runs agent CLI commands (claude, codex, gemini) and captures their output.
"""

import asyncio
import logging
from dataclasses import dataclass
from typing import Optional, Callable, Awaitable

logger = logging.getLogger(__name__)


# Default model versions
DEFAULT_MODELS = {
    "claude": "claude-opus-4-5-20251101",
    "codex": "codex-5.2",
    "gemini": "gemini-3-pro",
}


def build_command(agent_type: str, prompt: str, config: Optional[dict] = None) -> str:
    """Build CLI command with model/reasoning config.

    Args:
        agent_type: Type of agent (claude, codex, gemini, custom)
        prompt: The prompt to execute
        config: Optional dict with model_version, thinking_budget, reasoning_level

    Returns:
        The CLI command string
    """
    config = config or {}
    escaped_prompt = prompt.replace("'", "'\"'\"'")

    if agent_type == "claude":
        model = config.get("model_version") or DEFAULT_MODELS["claude"]
        cmd = f"claude -p '{escaped_prompt}' --dangerously-skip-permissions --output-format=text --model {model} --auto-compact"

        # Add thinking budget if set
        thinking = config.get("thinking_budget")
        if thinking:
            cmd += f" --thinking-budget {thinking}"
        return cmd

    elif agent_type == "codex":
        model = config.get("model_version") or DEFAULT_MODELS["codex"]
        reasoning = config.get("reasoning_level") or "xhigh"
        return f"codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check --reasoning {reasoning} --model {model} '{escaped_prompt}'"

    elif agent_type == "gemini":
        model = config.get("model_version") or DEFAULT_MODELS["gemini"]
        return f"gemini '{escaped_prompt}' -m {model} -o text"

    else:  # custom
        return prompt


# Legacy command templates (kept for backwards compatibility)
AGENT_COMMANDS = {
    "claude": "claude -p '{prompt}' --dangerously-skip-permissions --output-format=text",
    "codex": "codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check '{prompt}'",
    "gemini": "gemini '{prompt}' -m gemini-3-pro-preview -o text",
    "custom": "{prompt}",  # Custom is just a raw command
}


@dataclass
class StepResult:
    """Result of executing a step."""
    step_id: int
    success: bool
    output: str
    error: Optional[str] = None
    duration_seconds: float = 0.0


class StepExecutor:
    """Executes individual agent steps."""

    def __init__(
        self,
        on_output: Optional[Callable[[int, str], Awaitable[None]]] = None
    ):
        """
        Args:
            on_output: Callback for streaming output (step_id, output_chunk)
        """
        self.on_output = on_output

    async def execute(
        self,
        step_id: int,
        agent_type: str,
        prompt: str,
        working_dir: Optional[str] = None,
        timeout: float = 600.0,  # 10 minutes default
        config: Optional[dict] = None  # Model/reasoning config
    ) -> StepResult:
        """Execute a single agent step.

        Args:
            step_id: The step ID
            agent_type: Type of agent (claude, codex, gemini, custom)
            prompt: The prompt to execute
            working_dir: Optional working directory
            timeout: Timeout in seconds
            config: Optional dict with model_version, thinking_budget, reasoning_level
        """
        import time
        start_time = time.time()

        # Build command with config
        command = build_command(agent_type, prompt, config)

        logger.info(f"Executing step {step_id}: {agent_type}")
        logger.debug(f"Command: {command}")

        try:
            # Create subprocess
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=working_dir
            )

            output_lines = []

            # Stream stdout
            async def read_stream(stream, is_stderr=False):
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    text = line.decode()
                    output_lines.append(text)
                    if self.on_output:
                        await self.on_output(step_id, text)

            # Read both streams concurrently
            await asyncio.wait_for(
                asyncio.gather(
                    read_stream(proc.stdout),
                    read_stream(proc.stderr, is_stderr=True)
                ),
                timeout=timeout
            )

            await proc.wait()

            duration = time.time() - start_time
            output = "".join(output_lines)

            if proc.returncode == 0:
                logger.info(f"Step {step_id} completed successfully")
                return StepResult(
                    step_id=step_id,
                    success=True,
                    output=output,
                    duration_seconds=duration
                )
            else:
                logger.warning(f"Step {step_id} failed with code {proc.returncode}")
                return StepResult(
                    step_id=step_id,
                    success=False,
                    output=output,
                    error=f"Process exited with code {proc.returncode}",
                    duration_seconds=duration
                )

        except asyncio.TimeoutError:
            logger.error(f"Step {step_id} timed out after {timeout}s")
            proc.kill()
            return StepResult(
                step_id=step_id,
                success=False,
                output="".join(output_lines) if output_lines else "",
                error=f"Timeout after {timeout} seconds",
                duration_seconds=timeout
            )

        except Exception as e:
            logger.error(f"Step {step_id} error: {e}")
            return StepResult(
                step_id=step_id,
                success=False,
                output="",
                error=str(e),
                duration_seconds=time.time() - start_time
            )

    async def execute_in_tmux(
        self,
        step_id: int,
        agent_type: str,
        prompt: str,
        tmux_session: str,
        working_dir: Optional[str] = None,
        config: Optional[dict] = None  # Model/reasoning config
    ) -> bool:
        """Execute a step inside an existing tmux session."""
        command = build_command(agent_type, prompt, config)

        # Send command to tmux
        tmux_cmd = ["tmux", "send-keys", "-t", tmux_session, command, "Enter"]

        proc = await asyncio.create_subprocess_exec(
            *tmux_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()

        return proc.returncode == 0
