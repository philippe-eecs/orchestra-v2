from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field

from .enums import ExecutionStatus, StepStatus, AgentType


class StepRunBase(BaseModel):
    step_id: int | None = None
    agent_type: AgentType
    prompt: str


class StepRunCreate(StepRunBase):
    pass


class StepRunUpdate(BaseModel):
    status: StepStatus | None = None
    output: str | None = None
    error: str | None = None
    metadata: dict[str, Any] | None = None


class StepRun(StepRunBase):
    id: int
    execution_id: int
    status: StepStatus = StepStatus.PENDING
    output: str | None = None
    error: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ExecutionBase(BaseModel):
    node_id: int | None = None
    template_id: int | None = None


class ExecutionCreate(ExecutionBase):
    create_worktree: bool = False
    context: dict[str, Any] = Field(default_factory=dict)  # Variables for prompt templates


class ExecutionUpdate(BaseModel):
    status: ExecutionStatus | None = None
    tmux_session: str | None = None
    worktree_path: str | None = None
    worktree_branch: str | None = None
    metadata: dict[str, Any] | None = None


class Execution(ExecutionBase):
    id: int
    project_id: int
    status: ExecutionStatus = ExecutionStatus.PENDING
    tmux_session: str | None = None
    worktree_path: str | None = None
    worktree_branch: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ExecutionWithStepRuns(Execution):
    step_runs: list[StepRun] = Field(default_factory=list)


class LaunchPreview(BaseModel):
    template_id: int
    context: dict[str, Any]
    resolved_prompts: list[dict[str, Any]]  # step_id, step_name, resolved_prompt


class LaunchRequest(BaseModel):
    template_id: int
    context: dict[str, Any] = Field(default_factory=dict)
    create_worktree: bool = False
