"""Hook models for validation and gate nodes in the pipeline."""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class HookTrigger(str, Enum):
    """When the hook should be triggered."""
    PHASE_END = "phase_end"                    # After a phase completes
    DELIVERABLE_PRODUCED = "deliverable_produced"  # When a deliverable is created
    MANUAL = "manual"                          # Manually triggered


class HookAction(str, Enum):
    """What action the hook performs."""
    VALIDATE = "validate"    # Check deliverables exist and are valid
    GATE = "gate"            # Block until approved (human review)
    RETRY = "retry"          # Retry on failure


class HookStatus(str, Enum):
    """Current status of a hook execution."""
    PENDING = "pending"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"
    AWAITING_APPROVAL = "awaiting_approval"


class HookResult(BaseModel):
    """Result from executing a hook."""
    status: HookStatus
    message: str = ""
    validation_errors: list[str] = Field(default_factory=list)
    passed_deliverables: list[str] = Field(default_factory=list)
    failed_deliverables: list[str] = Field(default_factory=list)


class HookDefinition(BaseModel):
    """Definition of a hook's behavior."""
    name: str
    trigger: HookTrigger
    action: HookAction
    required_deliverables: list[str] = Field(default_factory=list)  # ["plan.md", "sources.md"]
    validation_rules: dict[str, str] = Field(default_factory=dict)  # deliverable_name -> regex pattern
    requires_human_approval: bool = False
    max_retries: int = 1
    retry_on_fail: bool = True


class HookNodeBase(BaseModel):
    """Base model for hook node configuration."""
    name: str = "Validation Hook"
    trigger: HookTrigger = HookTrigger.PHASE_END
    action: HookAction = HookAction.VALIDATE
    required_deliverables: list[str] = Field(default_factory=list)
    validation_rules: dict[str, str] = Field(default_factory=dict)
    requires_human_approval: bool = False
    max_retries: int = 1


class HookNodeCreate(HookNodeBase):
    """Create a hook node configuration."""
    node_id: int


class HookNodeUpdate(BaseModel):
    """Update a hook node configuration."""
    name: Optional[str] = None
    trigger: Optional[HookTrigger] = None
    action: Optional[HookAction] = None
    required_deliverables: Optional[list[str]] = None
    validation_rules: Optional[dict[str, str]] = None
    requires_human_approval: Optional[bool] = None
    max_retries: Optional[int] = None


class HookNode(HookNodeBase):
    """Full hook node model."""
    id: int
    node_id: int
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True


# Default validation rules
DEFAULT_VALIDATION_RULES = {
    "sources.md": r"https?://[^\s]+",  # Must contain at least one URL
    "plan.md": r"##\s+",               # Must have markdown headers
}


# Predefined hook definitions
DELIVERABLE_VALIDATION_HOOK = HookDefinition(
    name="Deliverable Validation",
    trigger=HookTrigger.PHASE_END,
    action=HookAction.VALIDATE,
    required_deliverables=["plan.md", "sources.md"],
    validation_rules=DEFAULT_VALIDATION_RULES,
    requires_human_approval=False,
    max_retries=2,
)

HUMAN_REVIEW_GATE_HOOK = HookDefinition(
    name="Human Review Gate",
    trigger=HookTrigger.PHASE_END,
    action=HookAction.GATE,
    required_deliverables=[],
    requires_human_approval=True,
    max_retries=0,
)
