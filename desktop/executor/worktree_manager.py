"""
WorktreeManager - Manages git worktrees for isolated agent execution.

Each execution can optionally run in its own git worktree, allowing
parallel development without conflicts. On completion, changes can
be merged back via PR.
"""

import asyncio
import os
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class Worktree:
    """Represents a git worktree for an execution."""
    execution_id: int
    path: str
    branch: str
    base_branch: str


class WorktreeManager:
    """Manages git worktrees for agent executions."""

    def __init__(self, worktrees_dir: str = "/tmp/worktrees"):
        self.worktrees_dir = worktrees_dir
        self.worktrees: dict[int, Worktree] = {}

        # Ensure worktrees directory exists
        os.makedirs(worktrees_dir, exist_ok=True)

    async def create_worktree(
        self,
        execution_id: int,
        repo_path: str,
        base_branch: str = "main"
    ) -> Worktree:
        """Create a new worktree for an execution."""
        branch_name = f"agent/exec-{execution_id}"
        worktree_path = os.path.join(self.worktrees_dir, f"exec-{execution_id}")

        # Create worktree with new branch
        cmd = [
            "git", "-C", repo_path,
            "worktree", "add",
            "-b", branch_name,
            worktree_path,
            base_branch
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f"Failed to create worktree: {stderr.decode()}")

        worktree = Worktree(
            execution_id=execution_id,
            path=worktree_path,
            branch=branch_name,
            base_branch=base_branch
        )
        self.worktrees[execution_id] = worktree

        logger.info(f"Created worktree at {worktree_path} on branch {branch_name}")
        return worktree

    async def has_changes(self, execution_id: int) -> bool:
        """Check if the worktree has uncommitted or unpushed changes."""
        worktree = self.worktrees.get(execution_id)
        if not worktree:
            return False

        # Check for uncommitted changes
        cmd = ["git", "-C", worktree.path, "status", "--porcelain"]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc.communicate()

        return bool(stdout.decode().strip())

    async def commit_and_push(
        self,
        execution_id: int,
        message: str
    ) -> bool:
        """Commit all changes and push to remote."""
        worktree = self.worktrees.get(execution_id)
        if not worktree:
            return False

        # Add all changes
        add_cmd = ["git", "-C", worktree.path, "add", "-A"]
        proc = await asyncio.create_subprocess_exec(*add_cmd)
        await proc.communicate()

        # Commit
        commit_cmd = ["git", "-C", worktree.path, "commit", "-m", message]
        proc = await asyncio.create_subprocess_exec(
            *commit_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()

        if proc.returncode != 0:
            logger.warning("Nothing to commit")
            return False

        # Push
        push_cmd = ["git", "-C", worktree.path, "push", "-u", "origin", "HEAD"]
        proc = await asyncio.create_subprocess_exec(
            *push_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f"Failed to push: {stderr.decode()}")

        logger.info(f"Pushed changes for execution {execution_id}")
        return True

    async def create_pull_request(
        self,
        execution_id: int,
        title: str,
        body: str
    ) -> Optional[str]:
        """Create a pull request using gh CLI."""
        worktree = self.worktrees.get(execution_id)
        if not worktree:
            return None

        cmd = [
            "gh", "pr", "create",
            "--title", title,
            "--body", body,
            "--base", worktree.base_branch,
            "--head", worktree.branch
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=worktree.path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f"Failed to create PR: {stderr.decode()}")

        pr_url = stdout.decode().strip()
        logger.info(f"Created PR: {pr_url}")
        return pr_url

    async def remove_worktree(self, execution_id: int) -> bool:
        """Remove a worktree and optionally delete the branch."""
        worktree = self.worktrees.get(execution_id)
        if not worktree:
            return False

        # Remove worktree
        cmd = ["git", "worktree", "remove", worktree.path, "--force"]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()

        del self.worktrees[execution_id]
        logger.info(f"Removed worktree for execution {execution_id}")

        return True

    def get_worktree_path(self, execution_id: int) -> Optional[str]:
        """Get the path to a worktree."""
        worktree = self.worktrees.get(execution_id)
        return worktree.path if worktree else None
