"""SQLAlchemy models - 5 tables, nothing more."""

from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey, JSON
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


class Node(Base):
    __tablename__ = "node"

    id = Column(Integer, primary_key=True)
    graph_id = Column(Integer, ForeignKey("graph.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    prompt = Column(Text, nullable=False)
    agent_type = Column(String, nullable=False)  # claude, codex, gemini
    pos_x = Column(Float, default=100)
    pos_y = Column(Float, default=100)

    graph = relationship("Graph", back_populates="nodes")
    node_runs = relationship("NodeRun", back_populates="node")


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
