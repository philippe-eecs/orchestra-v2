from datetime import datetime
from pydantic import BaseModel, Field


class TaskBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    completed: bool = False
    priority: int = 0
    due_date: datetime | None = None


class TaskCreate(TaskBase):
    project_id: int | None = None
    node_id: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    completed: bool | None = None
    priority: int | None = None
    due_date: datetime | None = None
    project_id: int | None = None
    node_id: int | None = None


class Task(TaskBase):
    id: int
    project_id: int | None
    node_id: int | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
