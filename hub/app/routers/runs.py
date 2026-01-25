from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import RunModel, ProjectModel, NodeModel
from app.models import Run, RunCreate, RunUpdate
from app.services.broadcast import manager

router = APIRouter(prefix="/projects/{project_id}/runs", tags=["runs"])


def run_to_response(run: RunModel) -> Run:
    """Convert RunModel to Run response."""
    return Run(
        id=run.id,
        project_id=run.project_id,
        node_id=run.node_id,
        agent_type=run.agent_type,
        prompt=run.prompt,
        status=run.status,
        output=run.output,
        error=run.error,
        metadata=run.run_metadata or {},
        started_at=run.started_at,
        finished_at=run.finished_at,
        created_at=run.created_at,
        updated_at=run.updated_at,
    )


@router.get("", response_model=list[Run])
def list_runs(
    project_id: int,
    node_id: int | None = Query(None),
    db: Session = Depends(get_db)
):
    project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    query = db.query(RunModel).filter(RunModel.project_id == project_id)

    if node_id is not None:
        query = query.filter(RunModel.node_id == node_id)

    runs = query.order_by(RunModel.created_at.desc()).all()
    return [run_to_response(r) for r in runs]


@router.post("", response_model=Run, status_code=201)
async def create_run(project_id: int, run: RunCreate, db: Session = Depends(get_db)):
    project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    node = db.query(NodeModel).filter(
        NodeModel.id == run.node_id,
        NodeModel.project_id == project_id
    ).first()
    if not node:
        raise HTTPException(status_code=400, detail="Node not found in this project")

    db_run = RunModel(project_id=project_id, **run.model_dump(mode="json"))
    db.add(db_run)
    db.commit()
    db.refresh(db_run)

    await manager.broadcast(project_id, "run.created", {
        "id": db_run.id,
        "node_id": db_run.node_id,
        "status": db_run.status,
    })

    return run_to_response(db_run)


@router.get("/{run_id}", response_model=Run)
def get_run(project_id: int, run_id: int, db: Session = Depends(get_db)):
    run = db.query(RunModel).filter(
        RunModel.id == run_id,
        RunModel.project_id == project_id
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run_to_response(run)


@router.patch("/{run_id}", response_model=Run)
async def update_run(project_id: int, run_id: int, run: RunUpdate, db: Session = Depends(get_db)):
    db_run = db.query(RunModel).filter(
        RunModel.id == run_id,
        RunModel.project_id == project_id
    ).first()
    if not db_run:
        raise HTTPException(status_code=404, detail="Run not found")

    update_data = run.model_dump(mode="json", exclude_unset=True)

    # Auto-set timestamps based on status
    if "status" in update_data:
        if update_data["status"] == "running" and not db_run.started_at:
            db_run.started_at = datetime.utcnow()
        elif update_data["status"] in ("completed", "failed", "cancelled"):
            db_run.finished_at = datetime.utcnow()

    # Map metadata to run_metadata for ORM
    if "metadata" in update_data:
        update_data["run_metadata"] = update_data.pop("metadata")

    for key, value in update_data.items():
        setattr(db_run, key, value)

    db.commit()
    db.refresh(db_run)

    await manager.broadcast(project_id, "run.updated", {
        "id": db_run.id,
        "node_id": db_run.node_id,
        "status": db_run.status,
    })

    return run_to_response(db_run)
