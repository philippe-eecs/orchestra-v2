from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey, JSON, Table
from sqlalchemy.orm import relationship

from .database import Base


# Association table for node parent-child relationships
node_edges = Table(
    "node_edges",
    Base.metadata,
    Column("parent_id", Integer, ForeignKey("nodes.id", ondelete="CASCADE"), primary_key=True),
    Column("child_id", Integer, ForeignKey("nodes.id", ondelete="CASCADE"), primary_key=True),
)

# Association table for agent step parent-child relationships (DAG edges)
agent_step_edges = Table(
    "agent_step_edges",
    Base.metadata,
    Column("parent_id", Integer, ForeignKey("agent_steps.id", ondelete="CASCADE"), primary_key=True),
    Column("child_id", Integer, ForeignKey("agent_steps.id", ondelete="CASCADE"), primary_key=True),
)


class ProjectModel(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    nodes = relationship("NodeModel", back_populates="project", cascade="all, delete-orphan")
    tasks = relationship("TaskModel", back_populates="project", cascade="all, delete-orphan")
    runs = relationship("RunModel", back_populates="project", cascade="all, delete-orphan")


class NodeModel(Base):
    __tablename__ = "nodes"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="pending")
    agent_type = Column(String(50), nullable=True)
    prompt = Column(Text, nullable=True)
    node_metadata = Column(JSON, default=dict)
    position_x = Column(Float, default=0.0)
    position_y = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("ProjectModel", back_populates="nodes")
    tasks = relationship("TaskModel", back_populates="node", cascade="all, delete-orphan")
    runs = relationship("RunModel", back_populates="node", cascade="all, delete-orphan")

    parents = relationship(
        "NodeModel",
        secondary=node_edges,
        primaryjoin=id == node_edges.c.child_id,
        secondaryjoin=id == node_edges.c.parent_id,
        backref="children",
    )


class TaskModel(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    node_id = Column(Integer, ForeignKey("nodes.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    completed = Column(Boolean, default=False)
    priority = Column(Integer, default=0)
    due_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("ProjectModel", back_populates="tasks")
    node = relationship("NodeModel", back_populates="tasks")


class RunModel(Base):
    __tablename__ = "runs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    node_id = Column(Integer, ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False)
    agent_type = Column(String(50), nullable=False)
    prompt = Column(Text, nullable=False)
    status = Column(String(50), default="queued")
    output = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    run_metadata = Column(JSON, default=dict)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("ProjectModel", back_populates="runs")
    node = relationship("NodeModel", back_populates="runs")


class AgentTemplateModel(Base):
    __tablename__ = "agent_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    template_metadata = Column(JSON, default=dict)  # icon, tags, etc.
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    steps = relationship("AgentStepModel", back_populates="template", cascade="all, delete-orphan")
    executions = relationship("ExecutionModel", back_populates="template")


class AgentStepModel(Base):
    __tablename__ = "agent_steps"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("agent_templates.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    agent_type = Column(String(50), nullable=False)  # claude, codex, gemini, custom
    prompt_template = Column(Text, nullable=False)  # Supports {{context.node.title}} vars
    output_format = Column(String(50), default="text")  # text, json, code, markdown
    position_x = Column(Float, default=0.0)
    position_y = Column(Float, default=0.0)
    step_metadata = Column(JSON, default=dict)  # model params, temperature, etc.
    # Model/reasoning configuration
    model_version = Column(String(100), nullable=True)  # e.g., "claude-opus-4-5", "codex-5.2"
    thinking_budget = Column(Integer, nullable=True)  # Claude: 4000, 8000, 16000, 32000
    reasoning_level = Column(String(50), nullable=True)  # Codex: "low", "medium", "high", "xhigh"
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    template = relationship("AgentTemplateModel", back_populates="steps")
    step_runs = relationship("StepRunModel", back_populates="step")

    # DAG relationships for step dependencies
    parents = relationship(
        "AgentStepModel",
        secondary=agent_step_edges,
        primaryjoin=id == agent_step_edges.c.child_id,
        secondaryjoin=id == agent_step_edges.c.parent_id,
        backref="children",
    )


class ExecutionModel(Base):
    __tablename__ = "executions"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    node_id = Column(Integer, ForeignKey("nodes.id", ondelete="SET NULL"), nullable=True)
    template_id = Column(Integer, ForeignKey("agent_templates.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(50), default="pending")  # pending, running, completed, failed, cancelled
    tmux_session = Column(String(255), nullable=True)  # tmux session name
    worktree_path = Column(String(512), nullable=True)  # Path to git worktree
    worktree_branch = Column(String(255), nullable=True)  # Branch name for worktree
    execution_metadata = Column(JSON, default=dict)  # Additional config
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("ProjectModel", backref="executions")
    node = relationship("NodeModel", backref="executions")
    template = relationship("AgentTemplateModel", back_populates="executions")
    step_runs = relationship("StepRunModel", back_populates="execution", cascade="all, delete-orphan")


class StepRunModel(Base):
    __tablename__ = "step_runs"

    id = Column(Integer, primary_key=True, index=True)
    execution_id = Column(Integer, ForeignKey("executions.id", ondelete="CASCADE"), nullable=False)
    step_id = Column(Integer, ForeignKey("agent_steps.id", ondelete="SET NULL"), nullable=True)
    agent_type = Column(String(50), nullable=False)
    prompt = Column(Text, nullable=False)  # Resolved prompt with variables substituted
    status = Column(String(50), default="pending")  # pending, running, completed, failed, skipped
    output = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    step_run_metadata = Column(JSON, default=dict)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    execution = relationship("ExecutionModel", back_populates="step_runs")
    step = relationship("AgentStepModel", back_populates="step_runs")
