"""API routes for managing deliverables."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from app.db.database import get_db
from app.db.models import DeliverableModel, NodeModel
from app.models.deliverables import (
    Deliverable, DeliverableCreate, DeliverableUpdate, DeliverableStatus,
)

router = APIRouter(tags=["deliverables"])


def deliverable_to_response(d: DeliverableModel) -> Deliverable:
    """Convert DB model to response model."""
    return Deliverable(
        id=d.id,
        node_id=d.node_id,
        execution_id=d.execution_id,
        type=d.type,
        name=d.name,
        content=d.content,
        status=d.status,
        validation_errors=d.validation_errors or [],
        created_at=d.created_at.isoformat() if d.created_at else None,
        updated_at=d.updated_at.isoformat() if d.updated_at else None,
    )


@router.get("/projects/{project_id}/nodes/{node_id}/deliverables")
def list_node_deliverables(
    project_id: int,
    node_id: int,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
) -> list[Deliverable]:
    """List all deliverables for a node."""
    # Verify node exists and belongs to project
    node = db.query(NodeModel).filter(
        NodeModel.id == node_id,
        NodeModel.project_id == project_id
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    query = db.query(DeliverableModel).filter(DeliverableModel.node_id == node_id)

    if status:
        query = query.filter(DeliverableModel.status == status)

    deliverables = query.order_by(DeliverableModel.created_at.desc()).all()
    return [deliverable_to_response(d) for d in deliverables]


@router.get("/projects/{project_id}/nodes/{node_id}/deliverables/{deliverable_id}")
def get_deliverable(
    project_id: int,
    node_id: int,
    deliverable_id: int,
    db: Session = Depends(get_db),
) -> Deliverable:
    """Get a specific deliverable."""
    deliverable = db.query(DeliverableModel).filter(
        DeliverableModel.id == deliverable_id,
        DeliverableModel.node_id == node_id,
    ).first()

    if not deliverable:
        raise HTTPException(status_code=404, detail="Deliverable not found")

    # Verify node belongs to project
    node = db.query(NodeModel).filter(
        NodeModel.id == node_id,
        NodeModel.project_id == project_id
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    return deliverable_to_response(deliverable)


@router.post("/projects/{project_id}/nodes/{node_id}/deliverables")
def create_deliverable(
    project_id: int,
    node_id: int,
    data: DeliverableCreate,
    db: Session = Depends(get_db),
) -> Deliverable:
    """Create a new deliverable for a node."""
    # Verify node exists and belongs to project
    node = db.query(NodeModel).filter(
        NodeModel.id == node_id,
        NodeModel.project_id == project_id
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    deliverable = DeliverableModel(
        node_id=node_id,
        execution_id=data.execution_id,
        type=data.type.value,
        name=data.name,
        content=data.content,
        status=data.status.value if data.status else DeliverableStatus.PENDING.value,
    )

    db.add(deliverable)
    db.commit()
    db.refresh(deliverable)

    return deliverable_to_response(deliverable)


@router.patch("/projects/{project_id}/nodes/{node_id}/deliverables/{deliverable_id}")
def update_deliverable(
    project_id: int,
    node_id: int,
    deliverable_id: int,
    data: DeliverableUpdate,
    db: Session = Depends(get_db),
) -> Deliverable:
    """Update a deliverable."""
    deliverable = db.query(DeliverableModel).filter(
        DeliverableModel.id == deliverable_id,
        DeliverableModel.node_id == node_id,
    ).first()

    if not deliverable:
        raise HTTPException(status_code=404, detail="Deliverable not found")

    # Verify node belongs to project
    node = db.query(NodeModel).filter(
        NodeModel.id == node_id,
        NodeModel.project_id == project_id
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    if data.content is not None:
        deliverable.content = data.content
    if data.status is not None:
        deliverable.status = data.status.value
    if data.validation_errors is not None:
        deliverable.validation_errors = data.validation_errors

    db.commit()
    db.refresh(deliverable)

    return deliverable_to_response(deliverable)


@router.delete("/projects/{project_id}/nodes/{node_id}/deliverables/{deliverable_id}")
def delete_deliverable(
    project_id: int,
    node_id: int,
    deliverable_id: int,
    db: Session = Depends(get_db),
):
    """Delete a deliverable."""
    deliverable = db.query(DeliverableModel).filter(
        DeliverableModel.id == deliverable_id,
        DeliverableModel.node_id == node_id,
    ).first()

    if not deliverable:
        raise HTTPException(status_code=404, detail="Deliverable not found")

    db.delete(deliverable)
    db.commit()

    return {"status": "deleted"}
