"""Deliverables models for structured outputs from pipeline phases."""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class DeliverableType(str, Enum):
    """Types of deliverables that can be produced."""
    PLAN = "plan"           # plan.md - Implementation plan
    SOURCES = "sources"     # sources.md - Citations with URLs
    TOY_TEST = "toy_test"   # test_results.md - Quick experiment results
    CODE = "code"           # Code artifacts
    CUSTOM = "custom"       # User-defined deliverable


class DeliverableStatus(str, Enum):
    """Status of a deliverable."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    VALIDATED = "validated"  # Passed hook validation


class DeliverableSchema(BaseModel):
    """Schema defining an expected deliverable."""
    type: DeliverableType
    name: str                    # e.g., "plan.md", "sources.md"
    required: bool = True
    description: str = ""


class DeliverableBase(BaseModel):
    """Base deliverable model."""
    type: DeliverableType
    name: str
    content: str = ""
    status: DeliverableStatus = DeliverableStatus.PENDING
    validation_errors: list[str] = Field(default_factory=list)


class DeliverableCreate(BaseModel):
    """Create a new deliverable."""
    node_id: int
    execution_id: Optional[int] = None
    type: DeliverableType
    name: str
    content: str = ""
    status: DeliverableStatus = DeliverableStatus.PENDING


class DeliverableUpdate(BaseModel):
    """Update an existing deliverable."""
    content: Optional[str] = None
    status: Optional[DeliverableStatus] = None
    validation_errors: Optional[list[str]] = None


class Deliverable(DeliverableBase):
    """Full deliverable model."""
    id: int
    node_id: int
    execution_id: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True


# Default deliverable schemas for the research-driven pipeline
DEFAULT_DELIVERABLE_SCHEMAS = [
    DeliverableSchema(
        type=DeliverableType.SOURCES,
        name="sources.md",
        required=True,
        description="Research citations with URLs from web search",
    ),
    DeliverableSchema(
        type=DeliverableType.PLAN,
        name="plan.md",
        required=True,
        description="Finalized implementation plan",
    ),
    DeliverableSchema(
        type=DeliverableType.TOY_TEST,
        name="test_results.md",
        required=False,
        description="Results from quick validation experiments",
    ),
]
