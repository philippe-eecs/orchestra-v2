"""API routes for managing hook nodes."""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import NodeModel, HookNodeModel
from app.models.hooks import (
    HookNode, HookNodeCreate, HookNodeUpdate,
    HookResult, HookStatus,
)
from app.services.hook_executor import HookExecutor

router = APIRouter(tags=["hooks"])


def hook_to_response(hook: HookNodeModel) -> HookNode:
    """Convert DB model to response model."""
    return HookNode(
        id=hook.id,
        node_id=hook.node_id,
        name=hook.name,
        trigger=hook.trigger,
        action=hook.action,
        required_deliverables=hook.required_deliverables or [],
        validation_rules=hook.validation_rules or {},
        requires_human_approval=hook.requires_human_approval,
        max_retries=hook.max_retries,
        created_at=hook.created_at.isoformat() if hook.created_at else None,
        updated_at=hook.updated_at.isoformat() if hook.updated_at else None,
    )


@router.get("/projects/{project_id}/nodes/{node_id}/hook")
def get_hook_config(
    project_id: int,
    node_id: int,
    db: Session = Depends(get_db),
) -> HookNode:
    """Get hook configuration for a node."""
    node = db.query(NodeModel).filter(
        NodeModel.id == node_id,
        NodeModel.project_id == project_id,
        NodeModel.node_type == "hook",
    ).first()

    if not node:
        raise HTTPException(status_code=404, detail="Hook node not found")

    if not node.hook_config:
        raise HTTPException(status_code=404, detail="Hook configuration not found")

    return hook_to_response(node.hook_config)


@router.post("/projects/{project_id}/nodes/{node_id}/hook")
def create_hook_config(
    project_id: int,
    node_id: int,
    data: HookNodeCreate,
    db: Session = Depends(get_db),
) -> HookNode:
    """Create hook configuration for a node."""
    node = db.query(NodeModel).filter(
        NodeModel.id == node_id,
        NodeModel.project_id == project_id,
    ).first()

    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # Update node type to hook
    node.node_type = "hook"

    # Check if hook config already exists
    if node.hook_config:
        raise HTTPException(status_code=400, detail="Hook configuration already exists")

    hook = HookNodeModel(
        node_id=node_id,
        name=data.name,
        trigger=data.trigger.value,
        action=data.action.value,
        required_deliverables=data.required_deliverables,
        validation_rules=data.validation_rules,
        requires_human_approval=data.requires_human_approval,
        max_retries=data.max_retries,
    )

    db.add(hook)
    db.commit()
    db.refresh(hook)

    return hook_to_response(hook)


@router.patch("/projects/{project_id}/nodes/{node_id}/hook")
def update_hook_config(
    project_id: int,
    node_id: int,
    data: HookNodeUpdate,
    db: Session = Depends(get_db),
) -> HookNode:
    """Update hook configuration for a node."""
    node = db.query(NodeModel).filter(
        NodeModel.id == node_id,
        NodeModel.project_id == project_id,
        NodeModel.node_type == "hook",
    ).first()

    if not node:
        raise HTTPException(status_code=404, detail="Hook node not found")

    hook = node.hook_config
    if not hook:
        raise HTTPException(status_code=404, detail="Hook configuration not found")

    if data.name is not None:
        hook.name = data.name
    if data.trigger is not None:
        hook.trigger = data.trigger.value
    if data.action is not None:
        hook.action = data.action.value
    if data.required_deliverables is not None:
        hook.required_deliverables = data.required_deliverables
    if data.validation_rules is not None:
        hook.validation_rules = data.validation_rules
    if data.requires_human_approval is not None:
        hook.requires_human_approval = data.requires_human_approval
    if data.max_retries is not None:
        hook.max_retries = data.max_retries

    db.commit()
    db.refresh(hook)

    return hook_to_response(hook)


@router.delete("/projects/{project_id}/nodes/{node_id}/hook")
def delete_hook_config(
    project_id: int,
    node_id: int,
    db: Session = Depends(get_db),
):
    """Delete hook configuration from a node."""
    node = db.query(NodeModel).filter(
        NodeModel.id == node_id,
        NodeModel.project_id == project_id,
    ).first()

    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    if node.hook_config:
        db.delete(node.hook_config)
        node.node_type = "task"  # Revert to regular task node
        db.commit()

    return {"status": "deleted"}


@router.post("/projects/{project_id}/nodes/{node_id}/hook/execute")
async def execute_hook(
    project_id: int,
    node_id: int,
    source_node_id: int,
    db: Session = Depends(get_db),
) -> HookResult:
    """Execute a hook against a source node."""
    # Get the hook node
    hook_node = db.query(NodeModel).filter(
        NodeModel.id == node_id,
        NodeModel.project_id == project_id,
        NodeModel.node_type == "hook",
    ).first()

    if not hook_node:
        raise HTTPException(status_code=404, detail="Hook node not found")

    if not hook_node.hook_config:
        raise HTTPException(status_code=400, detail="Hook has no configuration")

    # Get the source node
    source_node = db.query(NodeModel).filter(
        NodeModel.id == source_node_id,
        NodeModel.project_id == project_id,
    ).first()

    if not source_node:
        raise HTTPException(status_code=404, detail="Source node not found")

    # Execute the hook
    executor = HookExecutor(db, project_id)
    result = await executor.execute_hook(hook_node, source_node)

    return result


@router.post("/projects/{project_id}/nodes/{node_id}/validate")
async def validate_node_deliverables(
    project_id: int,
    node_id: int,
    required_deliverables: list[str],
    db: Session = Depends(get_db),
) -> HookResult:
    """Validate deliverables for a node without a hook node."""
    node = db.query(NodeModel).filter(
        NodeModel.id == node_id,
        NodeModel.project_id == project_id,
    ).first()

    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    executor = HookExecutor(db, project_id)
    result = await executor.execute_validation_hook(
        node_id,
        required_deliverables,
    )

    return result
