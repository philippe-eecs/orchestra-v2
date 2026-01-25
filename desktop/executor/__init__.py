"""
Executor Service - Runs agent pipelines in isolated tmux sessions.

This service is meant to run on the VM where agents execute.
It receives execution requests from the Hub and manages:
- Tmux sessions for isolated execution
- Git worktrees for code isolation
- DAG orchestration for multi-step pipelines
- WebSocket streaming for real-time output

To run the service:
    cd executor
    uvicorn executor_service:app --host 0.0.0.0 --port 8001

Architecture:
    Hub (FastAPI)           Executor (FastAPI)           Agent CLIs
         │                        │                          │
         │  POST /start           │                          │
         │ ─────────────────────► │                          │
         │                        │  tmux new-session        │
         │                        │ ─────────────────────►   │
         │                        │                          │
         │  WS /terminal          │  claude -p "..."         │
         │ ◄─────────────────────►│ ─────────────────────►   │
         │     streaming          │     execution            │
         │                        │                          │
         │  {"type":"output"...}  │                          │
         │ ◄───────────────────── │ ◄──────────────────────  │
         │                        │                          │

"""

from .tmux_manager import TmuxManager
from .worktree_manager import WorktreeManager
from .step_executor import StepExecutor
from .dag_executor import DAGExecutor

__all__ = [
    "TmuxManager",
    "WorktreeManager",
    "StepExecutor",
    "DAGExecutor",
]
