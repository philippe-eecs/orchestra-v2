import re
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import get_db
from app.db.models import ProjectModel, NodeModel, AgentTemplateModel
from app.models import LaunchPreview, LaunchRequest, ExecutionWithStepRuns
from app.routers.executions import execution_to_response_with_steps, ExecutionModel, StepRunModel
from app.services.broadcast import manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/nodes/{node_id}", tags=["launch"])


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


def build_node_context(node: NodeModel) -> dict:
    """Build context dictionary from a node."""
    return {
        "node": {
            "id": node.id,
            "title": node.title,
            "description": node.description,
            "prompt": node.prompt,
            "context": node.context,
            "agent_type": node.agent_type,
            "status": node.status,
            "metadata": node.node_metadata or {},
        }
    }


@router.post("/preview", response_model=LaunchPreview)
def preview_launch(
    project_id: int,
    node_id: int,
    request: LaunchRequest,
    db: Session = Depends(get_db)
):
    """Preview the resolved prompts for a template launch."""
    # Validate project
    project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Validate node
    node = db.query(NodeModel).filter(
        NodeModel.id == node_id,
        NodeModel.project_id == project_id
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # Validate template
    template = db.query(AgentTemplateModel).filter(
        AgentTemplateModel.id == request.template_id
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Build full context
    context = {**build_node_context(node), **request.context}

    # Resolve prompts for each step
    resolved_prompts = []
    for step in template.steps:
        resolved = resolve_prompt_template(step.prompt_template, context)
        resolved_prompts.append({
            "step_id": step.id,
            "step_name": step.name,
            "agent_type": step.agent_type,
            "prompt_template": step.prompt_template,
            "resolved_prompt": resolved,
        })

    return LaunchPreview(
        template_id=template.id,
        context=context,
        resolved_prompts=resolved_prompts,
    )


async def trigger_executor(
    execution_id: int,
    template_name: str,
    steps: list,
    edges: list,
    context: dict,
    create_worktree: bool,
    project_id: int,
):
    """Background task to trigger the executor service."""
    try:
        # Build executor request
        executor_request = {
            "execution_id": execution_id,
            "template_name": template_name,
            "steps": [
                {
                    "id": s.id,
                    "name": s.name,
                    "agent_type": s.agent_type,
                    "prompt_template": s.prompt_template,
                    # Model/reasoning configuration
                    "model_version": s.model_version,
                    "thinking_budget": s.thinking_budget,
                    "reasoning_level": s.reasoning_level,
                }
                for s in steps
            ],
            "edges": [
                {"parent_id": e.parent_id, "child_id": e.child_id}
                for e in edges
            ],
            "context": context,
            "repo_path": settings.default_repo_path,
            "create_worktree": create_worktree,
            "base_branch": "main",
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.executor_url}/executions/start",
                json=executor_request,
                timeout=30.0
            )

            if response.status_code == 200:
                result = response.json()
                logger.info(f"Executor started execution {execution_id}: {result}")

                # Broadcast running status
                await manager.broadcast(project_id, "execution.status", {
                    "id": execution_id,
                    "status": "running",
                    "tmux_session": result.get("tmux_session"),
                    "attach_command": result.get("attach_command"),
                })
            else:
                logger.error(f"Executor failed to start: {response.text}")
                await manager.broadcast(project_id, "execution.status", {
                    "id": execution_id,
                    "status": "failed",
                    "error": f"Executor error: {response.status_code}",
                })

    except httpx.ConnectError:
        logger.warning(f"Executor service not available at {settings.executor_url}")
        # If executor isn't running, mark as pending (dev mode)
        await manager.broadcast(project_id, "execution.status", {
            "id": execution_id,
            "status": "pending",
            "message": "Executor service not available - run manually",
        })
    except Exception as e:
        logger.error(f"Error triggering executor: {e}")
        await manager.broadcast(project_id, "execution.status", {
            "id": execution_id,
            "status": "failed",
            "error": str(e),
        })


@router.post("/launch", response_model=ExecutionWithStepRuns, status_code=201)
async def launch_execution(
    project_id: int,
    node_id: int,
    request: LaunchRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Launch a template execution from a node."""
    # Validate project
    project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Validate node
    node = db.query(NodeModel).filter(
        NodeModel.id == node_id,
        NodeModel.project_id == project_id
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # Validate template
    template = db.query(AgentTemplateModel).filter(
        AgentTemplateModel.id == request.template_id
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Build full context
    context = {**build_node_context(node), **request.context}

    # Create execution
    db_execution = ExecutionModel(
        project_id=project_id,
        node_id=node_id,
        template_id=request.template_id,
        status="pending",
        execution_metadata={
            "context": context,
            "_create_worktree": request.create_worktree,
        },
    )
    db.add(db_execution)
    db.flush()

    # Update tmux session and worktree with actual ID
    db_execution.tmux_session = f"exec-{db_execution.id}"
    if request.create_worktree:
        db_execution.worktree_branch = f"agent/exec-{db_execution.id}"
        db_execution.worktree_path = f"/worktrees/exec-{db_execution.id}"

    # Create step runs from template
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

    # Broadcast execution created event
    await manager.broadcast(project_id, "execution.created", {
        "id": db_execution.id,
        "node_id": node_id,
        "template_id": request.template_id,
        "status": "pending",
    })

    # Build edges list from step relationships
    edges = []
    for step in template.steps:
        for child in step.children:
            edges.append(type('Edge', (), {'parent_id': step.id, 'child_id': child.id})())

    # Trigger executor service in background
    background_tasks.add_task(
        trigger_executor,
        execution_id=db_execution.id,
        template_name=template.name,
        steps=template.steps,
        edges=edges,
        context=context,
        create_worktree=request.create_worktree,
        project_id=project_id,
    )

    return execution_to_response_with_steps(db_execution)
