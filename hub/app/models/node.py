from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field

from .enums import NodeStatus, AgentType


class Resource(BaseModel):
    kind: str  # file, url, note, etc.
    title: str
    url: str | None = None
    notes: str | None = None


class NodeMetadata(BaseModel):
    resources: list[Resource] = Field(default_factory=list)
    extra: dict[str, Any] = Field(default_factory=dict)


class NodeBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    status: NodeStatus = NodeStatus.PENDING
    agent_type: AgentType | None = None
    prompt: str | None = None
    context: str | None = None
    metadata: NodeMetadata = Field(default_factory=NodeMetadata)
    position_x: float = 0.0
    position_y: float = 0.0


class NodeCreate(NodeBase):
    parent_ids: list[int] = Field(default_factory=list)


class NodeUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    status: NodeStatus | None = None
    agent_type: AgentType | None = None
    prompt: str | None = None
    context: str | None = None
    metadata: NodeMetadata | None = None
    position_x: float | None = None
    position_y: float | None = None
    parent_ids: list[int] | None = None


class Node(NodeBase):
    id: int
    project_id: int
    parent_ids: list[int] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class Edge(BaseModel):
    source_id: int
    target_id: int


class Graph(BaseModel):
    nodes: list[Node]
    edges: list[Edge]
