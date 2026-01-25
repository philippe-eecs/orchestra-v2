from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field

from .enums import RunStatus, AgentType


class RunBase(BaseModel):
    node_id: int
    agent_type: AgentType
    prompt: str
    status: RunStatus = RunStatus.QUEUED


class RunCreate(RunBase):
    pass


class RunUpdate(BaseModel):
    status: RunStatus | None = None
    output: str | None = None
    error: str | None = None
    metadata: dict[str, Any] | None = None


class Run(RunBase):
    id: int
    project_id: int
    output: str | None = None
    error: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
