from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field

from .enums import AgentType, OutputFormat


class AgentStepEdge(BaseModel):
    parent_id: int
    child_id: int


class AgentStepBase(BaseModel):
    name: str
    agent_type: AgentType
    prompt_template: str
    output_format: OutputFormat = OutputFormat.TEXT
    position_x: float = 0.0
    position_y: float = 0.0
    metadata: dict[str, Any] = Field(default_factory=dict)
    # Model/reasoning configuration (optional)
    model_version: Optional[str] = None  # e.g., "claude-opus-4-5", "codex-5.2", "gemini-3-pro"
    thinking_budget: Optional[int] = None  # Claude: 4000, 8000, 16000, 32000, or None (OFF)
    reasoning_level: Optional[str] = None  # Codex: "low", "medium", "high", "xhigh"


class AgentStepCreate(AgentStepBase):
    pass


class AgentStepUpdate(BaseModel):
    name: str | None = None
    agent_type: AgentType | None = None
    prompt_template: str | None = None
    output_format: OutputFormat | None = None
    position_x: float | None = None
    position_y: float | None = None
    metadata: dict[str, Any] | None = None
    # Model/reasoning configuration
    model_version: str | None = None
    thinking_budget: int | None = None
    reasoning_level: str | None = None


class AgentStep(AgentStepBase):
    id: int
    template_id: int
    parent_ids: list[int] = Field(default_factory=list)
    child_ids: list[int] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AgentTemplateBase(BaseModel):
    name: str
    description: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentTemplateCreate(AgentTemplateBase):
    steps: list[AgentStepCreate] = Field(default_factory=list)
    edges: list[AgentStepEdge] = Field(default_factory=list)


class AgentTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    metadata: dict[str, Any] | None = None


class AgentTemplate(AgentTemplateBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AgentTemplateWithSteps(AgentTemplate):
    steps: list[AgentStep] = Field(default_factory=list)
    edges: list[AgentStepEdge] = Field(default_factory=list)
