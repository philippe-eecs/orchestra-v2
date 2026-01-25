from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import ProjectModel
from app.services.plan_service import plan_service

router = APIRouter(prefix="/projects/{project_id}/plan", tags=["plan"])


class PlanRequest(BaseModel):
    prompt: str
    resources: list[dict[str, Any]] | None = None


class PlanResponse(BaseModel):
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]


@router.post("", response_model=PlanResponse)
async def generate_plan(project_id: int, request: PlanRequest, db: Session = Depends(get_db)):
    project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await plan_service.generate_plan(request.prompt, request.resources)
    return PlanResponse(**result)
