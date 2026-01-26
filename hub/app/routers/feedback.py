"""Human feedback API for multi-agent pipeline."""

import logging
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.db.database import get_db
from app.db.models import NodeModel, ExecutionModel
from app.models.enums import NodeStatus
from app.models.pipeline import (
    HumanFeedback,
    PipelineContext,
    SynthesisResult,
    PipelinePhase,
)
from app.services.broadcast import manager
from app.services.pipeline_executor import PipelineExecutor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}", tags=["feedback"])


class SynthesisQuestionsResponse(BaseModel):
    """Response containing synthesis questions for human review."""
    node_id: int
    node_title: str
    execution_id: Optional[int] = None
    status: str
    agreements: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)
    final_plan: str = ""


class FeedbackSubmission(BaseModel):
    """Human feedback submission."""
    answers: dict[str, str] = Field(default_factory=dict)  # question_index -> answer
    notes: Optional[str] = None
    approved: bool = True


class FeedbackResponse(BaseModel):
    """Response after submitting feedback."""
    status: str
    message: str
    node_id: int
    execution_id: Optional[int] = None


@router.get("/nodes/{node_id}/synthesis", response_model=SynthesisQuestionsResponse)
async def get_synthesis_questions(
    project_id: int,
    node_id: int,
    db: Session = Depends(get_db),
):
    """Get synthesis questions for a node that needs human review."""
    node = db.query(NodeModel).filter(
        NodeModel.id == node_id,
        NodeModel.project_id == project_id,
    ).first()

    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # Get latest execution for this node
    execution = db.query(ExecutionModel).filter(
        ExecutionModel.node_id == node_id,
        ExecutionModel.project_id == project_id,
    ).order_by(ExecutionModel.created_at.desc()).first()

    # Extract synthesis results from execution metadata
    synthesis_data = {}
    if execution and execution.execution_metadata:
        pipeline_context = execution.execution_metadata.get("pipeline_context", {})
        synthesis_data = pipeline_context.get("synthesis", {})

    return SynthesisQuestionsResponse(
        node_id=node.id,
        node_title=node.title,
        execution_id=execution.id if execution else None,
        status=node.status,
        agreements=synthesis_data.get("agreements", []),
        conflicts=synthesis_data.get("conflicts", []),
        questions=synthesis_data.get("questions", []),
        final_plan=synthesis_data.get("final_plan", ""),
    )


@router.post("/nodes/{node_id}/feedback", response_model=FeedbackResponse)
async def submit_human_feedback(
    project_id: int,
    node_id: int,
    feedback: FeedbackSubmission,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Human responds to synthesis questions and approves the plan."""
    node = db.query(NodeModel).filter(
        NodeModel.id == node_id,
        NodeModel.project_id == project_id,
    ).first()

    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    if node.status != NodeStatus.NEEDS_REVIEW.value:
        raise HTTPException(
            status_code=400,
            detail=f"Node is not awaiting review (status: {node.status})"
        )

    # Get latest execution
    execution = db.query(ExecutionModel).filter(
        ExecutionModel.node_id == node_id,
        ExecutionModel.project_id == project_id,
    ).order_by(ExecutionModel.created_at.desc()).first()

    if not execution:
        raise HTTPException(status_code=404, detail="No execution found for this node")

    # Store human feedback in execution metadata
    pipeline_context = execution.execution_metadata.get("pipeline_context", {})
    pipeline_context["human_input"] = {
        "answers": feedback.answers,
        "notes": feedback.notes,
        "approved": feedback.approved,
    }
    execution.execution_metadata = {
        **execution.execution_metadata,
        "pipeline_context": pipeline_context,
    }

    # Update node status based on approval
    if feedback.approved:
        node.status = NodeStatus.IN_PROGRESS.value
        message = "Feedback submitted, resuming execution"
    else:
        node.status = NodeStatus.BLOCKED.value
        message = "Plan rejected, execution paused"

    node.updated_at = datetime.utcnow()
    execution.updated_at = datetime.utcnow()

    db.commit()

    # Broadcast status update
    await manager.broadcast(project_id, "node.updated", {
        "id": node.id,
        "status": node.status,
    })

    await manager.broadcast(project_id, "feedback.submitted", {
        "node_id": node.id,
        "execution_id": execution.id,
        "approved": feedback.approved,
    })

    # Resume pipeline execution if approved
    if feedback.approved:
        async def resume_pipeline():
            executor = PipelineExecutor(db, project_id)
            try:
                await executor.resume_after_human_input(node_id)
            except Exception as e:
                logger.error(f"Pipeline resume failed: {e}")

        background_tasks.add_task(resume_pipeline)

    return FeedbackResponse(
        status="success",
        message=message,
        node_id=node.id,
        execution_id=execution.id,
    )


@router.get("/nodes/needs-review", response_model=list[SynthesisQuestionsResponse])
async def get_nodes_needing_review(
    project_id: int,
    db: Session = Depends(get_db),
):
    """Get all nodes in the project that need human review."""
    nodes = db.query(NodeModel).filter(
        NodeModel.project_id == project_id,
        NodeModel.status == NodeStatus.NEEDS_REVIEW.value,
    ).all()

    results = []
    for node in nodes:
        execution = db.query(ExecutionModel).filter(
            ExecutionModel.node_id == node.id,
            ExecutionModel.project_id == project_id,
        ).order_by(ExecutionModel.created_at.desc()).first()

        synthesis_data = {}
        if execution and execution.execution_metadata:
            pipeline_context = execution.execution_metadata.get("pipeline_context", {})
            synthesis_data = pipeline_context.get("synthesis", {})

        results.append(SynthesisQuestionsResponse(
            node_id=node.id,
            node_title=node.title,
            execution_id=execution.id if execution else None,
            status=node.status,
            agreements=synthesis_data.get("agreements", []),
            conflicts=synthesis_data.get("conflicts", []),
            questions=synthesis_data.get("questions", []),
            final_plan=synthesis_data.get("final_plan", ""),
        ))

    return results
