"""
ExecutorService - Main service for running agent executions.

This service runs on the VM and receives execution requests from the Hub.
It manages tmux sessions, git worktrees, and orchestrates agent pipelines.

Flow:
1. Hub sends execution request with template + context
2. Executor creates tmux session (optional worktree)
3. Executor runs steps respecting DAG dependencies
4. Output streams via WebSocket back to Hub
5. On completion: create PR if code changes, update status
"""

import asyncio
import logging
import json
from dataclasses import dataclass, asdict
from typing import Optional, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from .tmux_manager import TmuxManager
from .worktree_manager import WorktreeManager
from .dag_executor import DAGExecutor, DAGStep

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Agent Executor Service")


@app.get("/health")
def health():
    return {"status": "ok"}


# Global managers
tmux_manager = TmuxManager()
worktree_manager = WorktreeManager()

# Active executions and their WebSocket connections
active_executions: dict[int, "ExecutionContext"] = {}


class StepConfig(BaseModel):
    """Configuration for a single step."""
    id: int
    name: str
    agent_type: str
    prompt_template: str


class EdgeConfig(BaseModel):
    """Configuration for a DAG edge."""
    parent_id: int
    child_id: int


class ExecutionRequest(BaseModel):
    """Request to start an execution."""
    execution_id: int
    template_name: str
    steps: list[StepConfig]
    edges: list[EdgeConfig]
    context: dict[str, Any]
    repo_path: Optional[str] = None
    create_worktree: bool = False
    base_branch: str = "main"


class ExecutionStatus(BaseModel):
    """Current status of an execution."""
    execution_id: int
    status: str  # pending, running, completed, failed
    current_step: Optional[str] = None
    completed_steps: list[str] = []
    error: Optional[str] = None


@dataclass
class ExecutionContext:
    """Runtime context for an execution."""
    execution_id: int
    status: str = "pending"
    current_step: Optional[str] = None
    completed_steps: list[str] = None
    websockets: list[WebSocket] = None
    error: Optional[str] = None

    def __post_init__(self):
        if self.completed_steps is None:
            self.completed_steps = []
        if self.websockets is None:
            self.websockets = []


@app.post("/executions/start")
async def start_execution(request: ExecutionRequest):
    """Start a new execution."""
    exec_id = request.execution_id

    # Create execution context
    ctx = ExecutionContext(execution_id=exec_id)
    active_executions[exec_id] = ctx

    # Determine working directory
    working_dir = request.repo_path

    # Create worktree if requested
    if request.create_worktree and request.repo_path:
        try:
            worktree = await worktree_manager.create_worktree(
                execution_id=exec_id,
                repo_path=request.repo_path,
                base_branch=request.base_branch
            )
            working_dir = worktree.path
        except Exception as e:
            logger.error(f"Failed to create worktree: {e}")
            ctx.status = "failed"
            ctx.error = str(e)
            return {"success": False, "error": str(e)}

    # Create tmux session
    try:
        session = await tmux_manager.create_session(
            execution_id=exec_id,
            working_dir=working_dir
        )
    except Exception as e:
        logger.error(f"Failed to create tmux session: {e}")
        ctx.status = "failed"
        ctx.error = str(e)
        return {"success": False, "error": str(e)}

    # Start execution in background
    asyncio.create_task(run_execution(request, ctx, working_dir))

    return {
        "success": True,
        "execution_id": exec_id,
        "tmux_session": session.session_name,
        "attach_command": tmux_manager.get_attach_command(exec_id)
    }


async def run_execution(
    request: ExecutionRequest,
    ctx: ExecutionContext,
    working_dir: Optional[str]
):
    """Run the execution asynchronously."""
    exec_id = request.execution_id
    ctx.status = "running"

    try:
        # Build DAG steps
        steps_data = [
            {
                "id": s.id,
                "name": s.name,
                "agent_type": s.agent_type,
                "prompt_template": s.prompt_template
            }
            for s in request.steps
        ]
        edges_data = [
            {"parent_id": e.parent_id, "child_id": e.child_id}
            for e in request.edges
        ]

        dag_steps = DAGExecutor.build_dag_from_template(
            steps=steps_data,
            edges=edges_data,
            context=request.context
        )

        # Create executor with callbacks
        async def on_step_start(step_id: int, step_name: str):
            ctx.current_step = step_name
            await broadcast(exec_id, {
                "type": "step_start",
                "execution_id": exec_id,
                "step_id": step_id,
                "step_name": step_name
            })

        async def on_step_complete(step_id: int, result):
            ctx.completed_steps.append(result.output[:100] if result.output else "")
            await broadcast(exec_id, {
                "type": "step_complete",
                "execution_id": exec_id,
                "step_id": step_id,
                "success": result.success,
                "output": result.output[:1000] if result.output else "",
                "error": result.error
            })

        async def on_output(step_id: int, chunk: str):
            await broadcast(exec_id, {
                "type": "output",
                "execution_id": exec_id,
                "step_id": step_id,
                "data": chunk
            })

        executor = DAGExecutor(
            on_step_start=on_step_start,
            on_step_complete=on_step_complete,
            on_output=on_output
        )

        # Run the DAG
        result = await executor.execute(
            steps=dag_steps,
            working_dir=working_dir
        )

        if result.success:
            ctx.status = "completed"

            # Handle worktree completion (commit, PR)
            if request.create_worktree:
                await handle_worktree_completion(exec_id, request.template_name)
        else:
            ctx.status = "failed"
            ctx.error = result.error

        await broadcast(exec_id, {
            "type": "status",
            "execution_id": exec_id,
            "status": ctx.status,
            "error": ctx.error
        })

    except Exception as e:
        logger.error(f"Execution {exec_id} failed: {e}")
        ctx.status = "failed"
        ctx.error = str(e)
        await broadcast(exec_id, {
            "type": "status",
            "execution_id": exec_id,
            "status": "failed",
            "error": str(e)
        })


async def handle_worktree_completion(exec_id: int, template_name: str):
    """Handle post-execution worktree operations."""
    if await worktree_manager.has_changes(exec_id):
        # Commit and push
        await worktree_manager.commit_and_push(
            exec_id,
            message=f"Agent: {template_name}"
        )

        # Create PR
        try:
            pr_url = await worktree_manager.create_pull_request(
                exec_id,
                title=f"Agent execution: {template_name}",
                body=f"Changes from agent execution #{exec_id}\n\nGenerated by agent pipeline."
            )
            logger.info(f"Created PR: {pr_url}")
        except Exception as e:
            logger.error(f"Failed to create PR: {e}")


async def broadcast(exec_id: int, message: dict):
    """Broadcast a message to all WebSocket clients for an execution."""
    ctx = active_executions.get(exec_id)
    if not ctx:
        return

    message_json = json.dumps(message)
    disconnected = []

    for ws in ctx.websockets:
        try:
            await ws.send_text(message_json)
        except Exception:
            disconnected.append(ws)

    for ws in disconnected:
        ctx.websockets.remove(ws)


@app.websocket("/executions/{execution_id}/terminal")
async def terminal_websocket(websocket: WebSocket, execution_id: int):
    """WebSocket endpoint for streaming execution output."""
    await websocket.accept()

    ctx = active_executions.get(execution_id)
    if not ctx:
        await websocket.close(code=4004, reason="Execution not found")
        return

    ctx.websockets.append(websocket)

    try:
        # Keep connection open, handle incoming messages if needed
        while True:
            try:
                data = await websocket.receive_text()
                # Could handle input here if needed
            except WebSocketDisconnect:
                break
    finally:
        if websocket in ctx.websockets:
            ctx.websockets.remove(websocket)


@app.get("/executions/{execution_id}/status")
async def get_execution_status(execution_id: int) -> ExecutionStatus:
    """Get current status of an execution."""
    ctx = active_executions.get(execution_id)
    if not ctx:
        return ExecutionStatus(
            execution_id=execution_id,
            status="not_found"
        )

    return ExecutionStatus(
        execution_id=execution_id,
        status=ctx.status,
        current_step=ctx.current_step,
        completed_steps=ctx.completed_steps,
        error=ctx.error
    )


@app.post("/executions/{execution_id}/cancel")
async def cancel_execution(execution_id: int):
    """Cancel a running execution."""
    ctx = active_executions.get(execution_id)
    if not ctx:
        return {"success": False, "error": "Execution not found"}

    # Kill tmux session
    await tmux_manager.kill_session(execution_id)

    # Update status
    ctx.status = "cancelled"

    await broadcast(execution_id, {
        "type": "status",
        "execution_id": execution_id,
        "status": "cancelled"
    })

    return {"success": True}


@app.get("/executions/{execution_id}/attach-command")
async def get_attach_command(execution_id: int):
    """Get the tmux attach command for pop-out terminal."""
    cmd = tmux_manager.get_attach_command(execution_id)
    if not cmd:
        return {"success": False, "error": "Session not found"}

    return {"success": True, "command": cmd}


@app.on_event("shutdown")
async def cleanup():
    """Cleanup on shutdown."""
    # Kill all tmux sessions
    for exec_id in list(active_executions.keys()):
        await tmux_manager.kill_session(exec_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
