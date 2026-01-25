"""
TmuxManager - Manages tmux sessions for agent executions.

Each execution gets its own tmux session where agent commands run.
Output is captured and can be streamed to clients.
"""

import asyncio
import subprocess
import logging
from dataclasses import dataclass
from typing import Optional, AsyncGenerator

logger = logging.getLogger(__name__)


@dataclass
class TmuxSession:
    """Represents a tmux session for an execution."""
    session_name: str
    execution_id: int
    worktree_path: Optional[str] = None


class TmuxManager:
    """Manages tmux sessions for agent executions."""

    def __init__(self):
        self.sessions: dict[int, TmuxSession] = {}

    async def create_session(
        self,
        execution_id: int,
        working_dir: Optional[str] = None
    ) -> TmuxSession:
        """Create a new tmux session for an execution."""
        session_name = f"exec-{execution_id}"

        # Build tmux command
        cmd = ["tmux", "new-session", "-d", "-s", session_name]
        if working_dir:
            cmd.extend(["-c", working_dir])

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            _, stderr = await proc.communicate()

            if proc.returncode != 0:
                raise RuntimeError(f"Failed to create tmux session: {stderr.decode()}")

            session = TmuxSession(
                session_name=session_name,
                execution_id=execution_id,
                worktree_path=working_dir
            )
            self.sessions[execution_id] = session

            logger.info(f"Created tmux session: {session_name}")
            return session

        except Exception as e:
            logger.error(f"Error creating tmux session: {e}")
            raise

    async def send_command(
        self,
        execution_id: int,
        command: str,
        wait: bool = True
    ) -> Optional[str]:
        """Send a command to a tmux session."""
        session = self.sessions.get(execution_id)
        if not session:
            raise ValueError(f"No session found for execution {execution_id}")

        # Send keys to tmux
        cmd = ["tmux", "send-keys", "-t", session.session_name, command, "Enter"]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()

        if wait:
            # Wait for command to complete by checking for prompt
            await asyncio.sleep(0.5)

        return None

    async def capture_output(
        self,
        execution_id: int,
        history_lines: int = 2000
    ) -> str:
        """Capture the current output from a tmux session."""
        session = self.sessions.get(execution_id)
        if not session:
            raise ValueError(f"No session found for execution {execution_id}")

        cmd = [
            "tmux", "capture-pane",
            "-t", session.session_name,
            "-p",  # Print to stdout
            "-S", f"-{history_lines}"  # Start from N lines back
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc.communicate()

        return stdout.decode()

    async def stream_output(
        self,
        execution_id: int,
        poll_interval: float = 0.5
    ) -> AsyncGenerator[str, None]:
        """Stream output from a tmux session."""
        last_output = ""

        while execution_id in self.sessions:
            current_output = await self.capture_output(execution_id)

            # Find new content
            if current_output != last_output:
                # Simple diff - yield only new lines
                new_content = current_output[len(last_output):]
                if new_content.strip():
                    yield new_content
                last_output = current_output

            await asyncio.sleep(poll_interval)

    async def kill_session(self, execution_id: int) -> bool:
        """Kill a tmux session."""
        session = self.sessions.get(execution_id)
        if not session:
            return False

        cmd = ["tmux", "kill-session", "-t", session.session_name]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()

        del self.sessions[execution_id]
        logger.info(f"Killed tmux session: {session.session_name}")

        return True

    def get_attach_command(self, execution_id: int) -> Optional[str]:
        """Get the command to attach to a session (for pop-out terminal)."""
        session = self.sessions.get(execution_id)
        if not session:
            return None

        return f"tmux attach -t {session.session_name}"

    async def is_session_active(self, execution_id: int) -> bool:
        """Check if a tmux session is still active."""
        session = self.sessions.get(execution_id)
        if not session:
            return False

        cmd = ["tmux", "has-session", "-t", session.session_name]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()

        return proc.returncode == 0
