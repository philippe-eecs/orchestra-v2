"""SQLAlchemy models for Orchestra V3."""

from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from database import Base


class Graph(Base):
    __tablename__ = "graph"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    created_at = Column(String)

    nodes = relationship("Node", back_populates="graph", cascade="all, delete-orphan")
    edges = relationship("Edge", back_populates="graph", cascade="all, delete-orphan")
    runs = relationship("Run", back_populates="graph")
    context_items = relationship("ContextItem", back_populates="graph", cascade="all, delete-orphan")


class Node(Base):
    __tablename__ = "node"

    id = Column(Integer, primary_key=True)
    graph_id = Column(Integer, ForeignKey("graph.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    prompt = Column(Text, nullable=False)
    agent_type = Column(String, nullable=False)  # claude, codex, gemini
    pos_x = Column(Float, default=100)
    pos_y = Column(Float, default=100)
    output_as_context = Column(Boolean, default=True)  # Pass output to children

    graph = relationship("Graph", back_populates="nodes")
    node_runs = relationship("NodeRun", back_populates="node")
    contexts = relationship("NodeContext", back_populates="node", cascade="all, delete-orphan")


class Edge(Base):
    __tablename__ = "edge"

    id = Column(Integer, primary_key=True)
    graph_id = Column(Integer, ForeignKey("graph.id", ondelete="CASCADE"), nullable=False)
    parent_id = Column(Integer, ForeignKey("node.id", ondelete="CASCADE"), nullable=False)
    child_id = Column(Integer, ForeignKey("node.id", ondelete="CASCADE"), nullable=False)

    graph = relationship("Graph", back_populates="edges")
    parent = relationship("Node", foreign_keys=[parent_id])
    child = relationship("Node", foreign_keys=[child_id])


class Run(Base):
    __tablename__ = "run"

    id = Column(Integer, primary_key=True)
    graph_id = Column(Integer, ForeignKey("graph.id"), nullable=False)
    status = Column(String, default="running")  # running, done, error
    error = Column(Text)
    created_at = Column(String)

    graph = relationship("Graph", back_populates="runs")
    node_runs = relationship("NodeRun", back_populates="run", cascade="all, delete-orphan")


class NodeRun(Base):
    __tablename__ = "node_run"

    id = Column(Integer, primary_key=True)
    run_id = Column(Integer, ForeignKey("run.id", ondelete="CASCADE"), nullable=False)
    node_id = Column(Integer, ForeignKey("node.id"), nullable=False)
    status = Column(String, default="pending")  # pending, running, done, error
    output = Column(Text)
    error = Column(Text)
    started_at = Column(String)
    finished_at = Column(String)
    # Clickable links
    tmux_session = Column(String)  # e.g., "run-1-node-3" - ssh attach to this
    artifacts = Column(JSON, default=list)  # URLs, file paths, PR links

    run = relationship("Run", back_populates="node_runs")
    node = relationship("Node", back_populates="node_runs")


class ContextItem(Base):
    __tablename__ = "context_item"

    id = Column(Integer, primary_key=True)
    graph_id = Column(Integer, ForeignKey("graph.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    context_type = Column(String, nullable=False)  # 'file', 'repo', 'github', 'url', 'image'
    config = Column(JSON, nullable=False)  # Type-specific config
    processed_content = Column(Text)  # Cached content for injection
    created_at = Column(String)

    graph = relationship("Graph", back_populates="context_items")
    node_contexts = relationship("NodeContext", back_populates="context_item", cascade="all, delete-orphan")


class NodeContext(Base):
    __tablename__ = "node_context"

    id = Column(Integer, primary_key=True)
    node_id = Column(Integer, ForeignKey("node.id", ondelete="CASCADE"), nullable=False)
    context_item_id = Column(Integer, ForeignKey("context_item.id", ondelete="CASCADE"), nullable=False)
    injection_mode = Column(String, default="prepend")  # 'prepend', 'append', 'replace_placeholder'
    placeholder = Column(String)  # For replace_placeholder mode
    order = Column(Integer, default=0)

    node = relationship("Node", back_populates="contexts")
    context_item = relationship("ContextItem", back_populates="node_contexts")


class AgentSession(Base):
    __tablename__ = "agent_session"

    id = Column(Integer, primary_key=True)
    run_id = Column(Integer, ForeignKey("run.id", ondelete="CASCADE"), nullable=False)
    node_run_id = Column(Integer, ForeignKey("node_run.id", ondelete="CASCADE"), nullable=False)
    tmux_session = Column(String, nullable=False)
    agent_type = Column(String, nullable=False)
    title = Column(String)
    status = Column(String, default="running")  # running, done, error
    started_at = Column(String)
    finished_at = Column(String)

    run = relationship("Run")
    node_run = relationship("NodeRun")
