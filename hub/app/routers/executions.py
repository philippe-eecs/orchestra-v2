import re
import asyncio
import logging
import httpx
import websockets
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import get_db
from app.db.models import ExecutionModel, StepRunModel, ProjectModel, NodeModel, AgentTemplateModel
from app.models import (
    Execution, ExecutionCreate, ExecutionUpdate, ExecutionWithStepRuns,
    StepRun, StepRunUpdate,
)
from app.services.broadcast import manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/executions", tags=["executions"])


def step_run_to_response(step_run: StepRunModel) -> StepRun:
    """Convert StepRunModel to StepRun response."""
    return StepRun(
        id=step_run.id,
        execution_id=step_run.execution_id,
        step_id=step_run.step_id,
        agent_type=step_run.agent_type,
        prompt=step_run.prompt,
        status=step_run.status,
        output=step_run.output,
        error=step_run.error,
        metadata=step_run.step_run_metadata or {},
        started_at=step_run.started_at,
        finished_at=step_run.finished_at,
        created_at=step_run.created_at,
        updated_at=step_run.updated_at,
    )


def execution_to_response(execution: ExecutionModel) -> Execution:
    """Convert ExecutionModel to Execution response."""
    return Execution(
        id=execution.id,
        project_id=execution.project_id,
        node_id=execution.node_id,
        template_id=execution.template_id,
        status=execution.status,
        tmux_session=execution.tmux_session,
        worktree_path=execution.worktree_path,
        worktree_branch=execution.worktree_branch,
        metadata=execution.execution_metadata or {},
        started_at=execution.started_at,
        finished_at=execution.finished_at,
        created_at=execution.created_at,
        updated_at=execution.updated_at,
    )


def execution_to_response_with_steps(execution: ExecutionModel) -> ExecutionWithStepRuns:
    """Convert ExecutionModel to ExecutionWithStepRuns response."""
    return ExecutionWithStepRuns(
        id=execution.id,
        project_id=execution.project_id,
        node_id=execution.node_id,
        template_id=execution.template_id,
        status=execution.status,
        tmux_session=execution.tmux_session,
        worktree_path=execution.worktree_path,
        worktree_branch=execution.worktree_branch,
        metadata=execution.execution_metadata or {},
        started_at=execution.started_at,
        finished_at=execution.finished_at,
        created_at=execution.created_at,
        updated_at=execution.updated_at,
        step_runs=[step_run_to_response(sr) for sr in execution.step_runs],
    )


def resolve_prompt_template(template: str, context: dict) -> str:
    """Resolve {{variable.path}} placeholders in prompt template."""
    def replace_var(match):
        var_path = match.group(1)
        parts = var_path.split('.')
        value = context
        for part in parts:
            if isinstance(value, dict) and part in value:
                value = value[part]
            else:
                return match.group(0)  # Return original if not found
        return str(value)

    return re.sub(r'\{\{([^}]+)\}\}', replace_var, template)


@router.get("", response_model=list[Execution])
def list_executions(
    project_id: int,
    node_id: int | None = Query(None),
    template_id: int | None = Query(None),
    db: Session = Depends(get_db)
):
    project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    query = db.query(ExecutionModel).filter(ExecutionModel.project_id == project_id)

    if node_id is not None:
        query = query.filter(ExecutionModel.node_id == node_id)
    if template_id is not None:
        query = query.filter(ExecutionModel.template_id == template_id)

    executions = query.order_by(ExecutionModel.created_at.desc()).all()
    return [execution_to_response(e) for e in executions]


@router.post("", response_model=ExecutionWithStepRuns, status_code=201)
async def create_execution(project_id: int, execution: ExecutionCreate, db: Session = Depends(get_db)):
    project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Validate node if provided
    node = None
    if execution.node_id:
        node = db.query(NodeModel).filter(
            NodeModel.id == execution.node_id,
            NodeModel.project_id == project_id
        ).first()
        if not node:
            raise HTTPException(status_code=400, detail="Node not found in this project")

    # Validate template if provided
    template = None
    if execution.template_id:
        template = db.query(AgentTemplateModel).filter(
            AgentTemplateModel.id == execution.template_id
        ).first()
        if not template:
            raise HTTPException(status_code=400, detail="Template not found")

    # Build context from node if available
    context = execution.context.copy()
    if node:
        context["node"] = {
            "id": node.id,
            "title": node.title,
            "description": node.description,
            "prompt": node.prompt,
            "metadata": node.node_metadata,
        }

    # Generate tmux session name and worktree info
    tmux_session = f"exec-{project_id}"  # Will be appended with ID after creation
    worktree_branch = None
    worktree_path = None

    if execution.create_worktree:
        worktree_branch = f"agent/exec-{project_id}"  # Will be updated after creation
        worktree_path = f"/worktrees/exec-{project_id}"  # Will be updated after creation

    # Create execution
    db_execution = ExecutionModel(
        project_id=project_id,
        node_id=execution.node_id,
        template_id=execution.template_id,
        status="pending",
        execution_metadata={**execution.context, "_create_worktree": execution.create_worktree},
    )
    db.add(db_execution)
    db.flush()

    # Update tmux session and worktree with actual ID
    db_execution.tmux_session = f"exec-{db_execution.id}"
    if execution.create_worktree:
        db_execution.worktree_branch = f"agent/exec-{db_execution.id}"
        db_execution.worktree_path = f"/worktrees/exec-{db_execution.id}"

    # Create step runs from template
    if template:
        for step in template.steps:
            resolved_prompt = resolve_prompt_template(step.prompt_template, context)
            db_step_run = StepRunModel(
                execution_id=db_execution.id,
                step_id=step.id,
                agent_type=step.agent_type,
                prompt=resolved_prompt,
                status="pending",
            )
            db.add(db_step_run)

    db.commit()
    db.refresh(db_execution)

    await manager.broadcast(project_id, "execution.created", {
        "id": db_execution.id,
        "node_id": db_execution.node_id,
        "template_id": db_execution.template_id,
        "status": db_execution.status,
    })

    return execution_to_response_with_steps(db_execution)


@router.get("/{exec_id}", response_model=ExecutionWithStepRuns)
def get_execution(project_id: int, exec_id: int, db: Session = Depends(get_db)):
    execution = db.query(ExecutionModel).filter(
        ExecutionModel.id == exec_id,
        ExecutionModel.project_id == project_id
    ).first()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return execution_to_response_with_steps(execution)


@router.patch("/{exec_id}", response_model=Execution)
async def update_execution(project_id: int, exec_id: int, execution: ExecutionUpdate, db: Session = Depends(get_db)):
    db_execution = db.query(ExecutionModel).filter(
        ExecutionModel.id == exec_id,
        ExecutionModel.project_id == project_id
    ).first()
    if not db_execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    update_data = execution.model_dump(exclude_unset=True)

    # Auto-set timestamps based on status
    if "status" in update_data:
        if update_data["status"] == "running" and not db_execution.started_at:
            db_execution.started_at = datetime.utcnow()
        elif update_data["status"] in ("completed", "failed", "cancelled"):
            db_execution.finished_at = datetime.utcnow()

    # Map metadata to execution_metadata for ORM
    if "metadata" in update_data:
        update_data["execution_metadata"] = update_data.pop("metadata")

    for key, value in update_data.items():
        setattr(db_execution, key, value)

    db.commit()
    db.refresh(db_execution)

    await manager.broadcast(project_id, "execution.updated", {
        "id": db_execution.id,
        "node_id": db_execution.node_id,
        "status": db_execution.status,
    })

    return execution_to_response(db_execution)


@router.post("/{exec_id}/cancel", response_model=Execution)
async def cancel_execution(project_id: int, exec_id: int, db: Session = Depends(get_db)):
    db_execution = db.query(ExecutionModel).filter(
        ExecutionModel.id == exec_id,
        ExecutionModel.project_id == project_id
    ).first()
    if not db_execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    if db_execution.status in ("completed", "failed", "cancelled"):
        raise HTTPException(status_code=400, detail="Execution already finished")

    db_execution.status = "cancelled"
    db_execution.finished_at = datetime.utcnow()

    # Cancel any pending step runs
    for step_run in db_execution.step_runs:
        if step_run.status in ("pending", "running"):
            step_run.status = "skipped"
            step_run.finished_at = datetime.utcnow()

    db.commit()
    db.refresh(db_execution)

    await manager.broadcast(project_id, "execution.updated", {
        "id": db_execution.id,
        "node_id": db_execution.node_id,
        "status": "cancelled",
    })

    return execution_to_response(db_execution)


# Step run endpoints

@router.patch("/{exec_id}/steps/{step_run_id}", response_model=StepRun)
async def update_step_run(
    project_id: int,
    exec_id: int,
    step_run_id: int,
    step_run: StepRunUpdate,
    db: Session = Depends(get_db)
):
    db_step_run = db.query(StepRunModel).filter(
        StepRunModel.id == step_run_id,
        StepRunModel.execution_id == exec_id
    ).first()

    if not db_step_run:
        raise HTTPException(status_code=404, detail="Step run not found")

    # Verify execution belongs to project
    execution = db_step_run.execution
    if execution.project_id != project_id:
        raise HTTPException(status_code=404, detail="Step run not found")

    update_data = step_run.model_dump(exclude_unset=True)

    # Auto-set timestamps based on status
    if "status" in update_data:
        if update_data["status"] == "running" and not db_step_run.started_at:
            db_step_run.started_at = datetime.utcnow()
        elif update_data["status"] in ("completed", "failed", "skipped"):
            db_step_run.finished_at = datetime.utcnow()

    # Map metadata to step_run_metadata for ORM
    if "metadata" in update_data:
        update_data["step_run_metadata"] = update_data.pop("metadata")

    for key, value in update_data.items():
        setattr(db_step_run, key, value)

    db.commit()
    db.refresh(db_step_run)

    await manager.broadcast(project_id, "step_run.updated", {
        "id": db_step_run.id,
        "execution_id": exec_id,
        "status": db_step_run.status,
    })

    return step_run_to_response(db_step_run)


# WebSocket for terminal streaming

class ExecutionConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, execution_id: int):
        await websocket.accept()
        if execution_id not in self.active_connections:
            self.active_connections[execution_id] = []
        self.active_connections[execution_id].append(websocket)

    def disconnect(self, websocket: WebSocket, execution_id: int):
        if execution_id in self.active_connections:
            if websocket not in self.active_connections[execution_id]:
                return
            self.active_connections[execution_id].remove(websocket)
            if not self.active_connections[execution_id]:
                del self.active_connections[execution_id]

    async def send_output(self, execution_id: int, data: dict):
        if execution_id in self.active_connections:
            for connection in self.active_connections[execution_id]:
                try:
                    await connection.send_json(data)
                except Exception:
                    pass


execution_manager = ExecutionConnectionManager()


@router.websocket("/{exec_id}/terminal")
async def terminal_websocket(
    websocket: WebSocket,
    project_id: int,
    exec_id: int,
):
    """
    WebSocket endpoint that proxies terminal output from the executor service.
    Connects to executor's WebSocket and relays messages to the client.
    """
    from app.db.database import SessionLocal

    db = SessionLocal()
    executor_ws = None

    try:
        execution = db.query(ExecutionModel).filter(
            ExecutionModel.id == exec_id,
            ExecutionModel.project_id == project_id
        ).first()

        if not execution:
            await websocket.close(code=4004)
            return

        await execution_manager.connect(websocket, exec_id)

        # Send initial connection message
        await websocket.send_json({
            "type": "connected",
            "execution_id": exec_id,
            "tmux_session": execution.tmux_session,
        })

        # Try to connect to executor's WebSocket
        executor_ws_url = settings.executor_url.replace("http://", "ws://").replace("https://", "wss://")
        executor_ws_url = f"{executor_ws_url}/executions/{exec_id}/terminal"

        try:
            async with websockets.connect(executor_ws_url) as executor_ws:
                # Relay messages from executor to client
                async def relay_from_executor():
                    try:
                        async for message in executor_ws:
                            await websocket.send_text(message)
                    except Exception as e:
                        logger.debug(f"Executor relay ended: {e}")

                # Relay messages from client to executor (if needed)
                async def relay_from_client():
                    try:
                        while True:
                            data = await websocket.receive_text()
                            await executor_ws.send(data)
                    except WebSocketDisconnect:
                        pass
                    except Exception as e:
                        logger.debug(f"Client relay ended: {e}")

                # Run both relays concurrently
                await asyncio.gather(
                    relay_from_executor(),
                    relay_from_client(),
                    return_exceptions=True
                )

        except (OSError, ConnectionRefusedError) as e:
            # Executor not available - stay connected but notify client
            logger.warning(f"Could not connect to executor WebSocket: {e}")
            await websocket.send_json({
                "type": "info",
                "message": "Executor not connected - terminal streaming unavailable",
            })

            # Keep connection alive for status updates from manager.broadcast
            try:
                while True:
                    data = await websocket.receive_text()
            except WebSocketDisconnect:
                pass

    except WebSocketDisconnect:
        pass
    finally:
        execution_manager.disconnect(websocket, exec_id)
        db.close()


@router.get("/{exec_id}/attach-command")
async def get_attach_command(project_id: int, exec_id: int, db: Session = Depends(get_db)):
    """Get the SSH/tmux command to attach to the execution terminal."""
    execution = db.query(ExecutionModel).filter(
        ExecutionModel.id == exec_id,
        ExecutionModel.project_id == project_id
    ).first()

    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    if not execution.tmux_session:
        raise HTTPException(status_code=400, detail="No tmux session for this execution")

    # Try to get attach command from executor
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{settings.executor_url}/executions/{exec_id}/attach-command",
                timeout=5.0
            )
            if response.status_code == 200:
                return response.json()
    except Exception as e:
        logger.debug(f"Could not get attach command from executor: {e}")

    # Fallback to local command
    return {
        "success": True,
        "command": f"tmux attach -t {execution.tmux_session}",
        "note": "Run this on the machine where the executor is running"
    }
