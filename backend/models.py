"""SQLAlchemy models for Orchestra - Simple blocks, DAG-based parallelism."""

from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from database import Base


class Graph(Base):
    """A DAG of blocks. Can be marked as template for reuse."""
    __tablename__ = "graph"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    created_at = Column(String)

    # Template support - graphs can be saved as reusable templates
    is_template = Column(Boolean, default=False)
    template_category = Column(String)  # e.g., "code-review", "research", "testing"

    blocks = relationship("Block", back_populates="graph", cascade="all, delete-orphan")
    edges = relationship("Edge", back_populates="graph", cascade="all, delete-orphan")
    runs = relationship("Run", back_populates="graph")
    context_items = relationship("ContextItem", back_populates="graph", cascade="all, delete-orphan")


class Block(Base):
    """A single unit of work - one agent, one task.

    Parallelism comes from DAG topology, not from block configuration.
    Multiple blocks with no edges between them run in parallel.
    """
    __tablename__ = "block"

    id = Column(Integer, primary_key=True)
    graph_id = Column(Integer, ForeignKey("graph.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text)

    # Single agent configuration
    agent_type = Column(String, default="claude")  # claude, codex, gemini
    prompt = Column(Text)

    # Win conditions (all must pass for block to be "green")
    # Format: [{type: "test", command: "pytest"}, {type: "human", prompt: "Review this"}]
    win_conditions = Column(JSON, default=list)

    # Position in canvas
    pos_x = Column(Float, default=100)
    pos_y = Column(Float, default=100)

    graph = relationship("Graph", back_populates="blocks")
    block_runs = relationship("BlockRun", back_populates="block")
    contexts = relationship("BlockContext", back_populates="block", cascade="all, delete-orphan")


# Alias for backward compatibility
Node = Block


class Edge(Base):
    """Connects blocks - child waits for parent to complete (and be green if it has conditions)."""
    __tablename__ = "edge"

    id = Column(Integer, primary_key=True)
    graph_id = Column(Integer, ForeignKey("graph.id", ondelete="CASCADE"), nullable=False)
    parent_id = Column(Integer, ForeignKey("block.id", ondelete="CASCADE"), nullable=False)
    child_id = Column(Integer, ForeignKey("block.id", ondelete="CASCADE"), nullable=False)

    graph = relationship("Graph", back_populates="edges")
    parent = relationship("Block", foreign_keys=[parent_id])
    child = relationship("Block", foreign_keys=[child_id])


class Run(Base):
    __tablename__ = "run"

    id = Column(Integer, primary_key=True)
    graph_id = Column(Integer, ForeignKey("graph.id"), nullable=False)
    status = Column(String, default="running")  # running, validating, done, error
    error = Column(Text)
    created_at = Column(String)

    graph = relationship("Graph", back_populates="runs")
    block_runs = relationship("BlockRun", back_populates="run", cascade="all, delete-orphan")


class BlockRun(Base):
    """Execution tracking for a block within a run."""
    __tablename__ = "block_run"

    id = Column(Integer, primary_key=True)
    run_id = Column(Integer, ForeignKey("run.id", ondelete="CASCADE"), nullable=False)
    block_id = Column(Integer, ForeignKey("block.id"), nullable=False)

    # Status: pending | blocked | running | validating | green | red | done
    status = Column(String, default="pending")

    # Agent output
    output = Column(Text)
    tmux_session = Column(String)

    # Win condition results: [{type, passed, details, pending}]
    condition_results = Column(JSON, default=list)

    # Error info
    error = Column(Text)

    # Timing
    started_at = Column(String)
    finished_at = Column(String)

    run = relationship("Run", back_populates="block_runs")
    block = relationship("Block", back_populates="block_runs")
    deliverables = relationship("Deliverable", back_populates="block_run", cascade="all, delete-orphan")


# Alias for backward compatibility
NodeRun = BlockRun


class Deliverable(Base):
    """Outputs/artifacts from a block run (PRs, files, URLs)."""
    __tablename__ = "deliverable"

    id = Column(Integer, primary_key=True)
    block_run_id = Column(Integer, ForeignKey("block_run.id", ondelete="CASCADE"), nullable=False)

    type = Column(String)  # 'pr', 'file', 'url', 'artifact'
    url = Column(String)
    path = Column(String)
    extra = Column(JSON, default=dict)  # renamed from 'metadata' (reserved)

    block_run = relationship("BlockRun", back_populates="deliverables")


class ContextItem(Base):
    __tablename__ = "context_item"

    id = Column(Integer, primary_key=True)
    graph_id = Column(Integer, ForeignKey("graph.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    context_type = Column(String, nullable=False)  # 'file', 'repo', 'github', 'url', 'image'
    config = Column(JSON, nullable=False)
    processed_content = Column(Text)
    created_at = Column(String)

    graph = relationship("Graph", back_populates="context_items")
    block_contexts = relationship("BlockContext", back_populates="context_item", cascade="all, delete-orphan")


class BlockContext(Base):
    """Attaches context items to blocks."""
    __tablename__ = "block_context"

    id = Column(Integer, primary_key=True)
    block_id = Column(Integer, ForeignKey("block.id", ondelete="CASCADE"), nullable=False)
    context_item_id = Column(Integer, ForeignKey("context_item.id", ondelete="CASCADE"), nullable=False)
    injection_mode = Column(String, default="prepend")
    placeholder = Column(String)
    order = Column(Integer, default=0)

    block = relationship("Block", back_populates="contexts")
    context_item = relationship("ContextItem", back_populates="block_contexts")


# Alias for backward compatibility
NodeContext = BlockContext


class HumanReview(Base):
    """Pending human reviews for blocks."""
    __tablename__ = "human_review"

    id = Column(Integer, primary_key=True)
    block_run_id = Column(Integer, ForeignKey("block_run.id", ondelete="CASCADE"), nullable=False)
    prompt = Column(Text)  # What to review
    status = Column(String, default="pending")  # pending, approved, rejected
    reviewer_notes = Column(Text)
    reviewed_at = Column(String)

    block_run = relationship("BlockRun")
