"""FastAPI app for Orchestra - Simple blocks, DAG-based parallelism."""

from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from pathlib import Path

from database import get_db, init_db
from models import (
    Graph, Block, Edge, Run, BlockRun, ContextItem, BlockContext,
    Deliverable, HumanReview
)
from services.runner import run_graph
from services.context_processor import process_context_item
from services.prompt_assist import generate_prompt, improve_prompt

app = FastAPI(title="Orchestra")


# --- Pydantic Schemas ---

class GraphCreate(BaseModel):
    name: str
    description: str | None = None
    is_template: bool = False
    template_category: str | None = None


class WinCondition(BaseModel):
    type: str  # dependency, test, human, llm_judge, metric
    block_id: int | None = None  # for dependency
    command: str | None = None  # for test, metric
    prompt: str | None = None  # for human, llm_judge
    agent: str | None = None  # for llm_judge
    threshold: float | None = None  # for metric
    comparison: str | None = None  # for metric: >=, >, <=, <, ==
    cwd: str | None = None  # working directory for commands


class BlockCreate(BaseModel):
    title: str
    description: str | None = None
    agent_type: str = "claude"
    prompt: str | None = None
    win_conditions: list[dict] | None = None
    pos_x: float = 100
    pos_y: float = 100


class BlockUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    agent_type: str | None = None
    prompt: str | None = None
    win_conditions: list[dict] | None = None
    pos_x: float | None = None
    pos_y: float | None = None


class EdgeCreate(BaseModel):
    parent_id: int
    child_id: int


class ContextItemCreate(BaseModel):
    name: str
    context_type: str
    config: dict


class ContextItemUpdate(BaseModel):
    name: str | None = None
    config: dict | None = None


class BlockContextCreate(BaseModel):
    context_item_id: int
    injection_mode: str = "prepend"
    placeholder: str | None = None
    order: int = 0


class PromptGenerateRequest(BaseModel):
    description: str
    agent_type: str = "claude"


class PromptImproveRequest(BaseModel):
    prompt: str
    agent_type: str = "claude"
    feedback: str | None = None


class GraphImport(BaseModel):
    name: str
    blocks: list[dict] | None = None
    nodes: list[dict] | None = None  # Backward compatibility
    edges: list[dict]
    context_items: list[dict] | None = None


class HumanReviewAction(BaseModel):
    action: str  # approve, reject
    notes: str | None = None


# --- Graph CRUD ---

@app.post("/graphs")
def create_graph(data: GraphCreate, db: Session = Depends(get_db)):
    graph = Graph(
        name=data.name,
        description=data.description,
        is_template=data.is_template,
        template_category=data.template_category,
        created_at=datetime.utcnow().isoformat()
    )
    db.add(graph)
    db.commit()
    db.refresh(graph)
    return {"id": graph.id, "name": graph.name, "created_at": graph.created_at}


@app.get("/graphs")
def list_graphs(include_templates: bool = False, db: Session = Depends(get_db)):
    query = db.query(Graph)
    if not include_templates:
        query = query.filter(Graph.is_template == False)
    graphs = query.order_by(Graph.created_at.desc()).all()
    return [{"id": g.id, "name": g.name, "created_at": g.created_at, "is_template": g.is_template} for g in graphs]


@app.get("/graphs/templates")
def list_templates(db: Session = Depends(get_db)):
    """List only template graphs."""
    graphs = db.query(Graph).filter(Graph.is_template == True).all()
    return [{
        "id": g.id,
        "name": g.name,
        "description": g.description,
        "template_category": g.template_category,
        "created_at": g.created_at
    } for g in graphs]


@app.get("/graphs/{graph_id}")
def get_graph(graph_id: int, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == graph_id).first()
    if not graph:
        raise HTTPException(404, "Graph not found")

    blocks = []
    for b in graph.blocks:
        block_data = {
            "id": b.id,
            "title": b.title,
            "description": b.description,
            "agent_type": b.agent_type or "claude",
            "prompt": b.prompt,
            "win_conditions": b.win_conditions or [],
            "pos_x": b.pos_x,
            "pos_y": b.pos_y,
            "context_count": len(b.contexts)
        }
        blocks.append(block_data)

    edges = [{"id": e.id, "parent_id": e.parent_id, "child_id": e.child_id}
             for e in graph.edges]
    context_items = [{
        "id": c.id, "name": c.name, "context_type": c.context_type,
        "config": c.config, "has_content": bool(c.processed_content)
    } for c in graph.context_items]

    return {
        "id": graph.id,
        "name": graph.name,
        "description": graph.description,
        "is_template": graph.is_template,
        "template_category": graph.template_category,
        "created_at": graph.created_at,
        "blocks": blocks,
        "nodes": blocks,  # Backward compatibility
        "edges": edges,
        "context_items": context_items
    }


@app.delete("/graphs/{graph_id}")
def delete_graph(graph_id: int, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == graph_id).first()
    if not graph:
        raise HTTPException(404, "Graph not found")
    db.delete(graph)
    db.commit()
    return {"ok": True}


# --- Blocks ---

@app.post("/graphs/{graph_id}/blocks")
def create_block(graph_id: int, data: BlockCreate, db: Session = Depends(get_db)):
    if data.agent_type not in ("claude", "codex", "gemini"):
        raise HTTPException(400, "agent_type must be claude, codex, or gemini")

    block = Block(
        graph_id=graph_id,
        title=data.title,
        description=data.description,
        agent_type=data.agent_type,
        prompt=data.prompt,
        win_conditions=data.win_conditions or [],
        pos_x=data.pos_x,
        pos_y=data.pos_y
    )
    db.add(block)
    db.commit()
    db.refresh(block)

    return {
        "id": block.id,
        "title": block.title,
        "description": block.description,
        "agent_type": block.agent_type,
        "prompt": block.prompt,
        "win_conditions": block.win_conditions,
        "pos_x": block.pos_x,
        "pos_y": block.pos_y
    }


# Backward compatibility alias
@app.post("/graphs/{graph_id}/nodes")
def create_node(graph_id: int, data: BlockCreate, db: Session = Depends(get_db)):
    return create_block(graph_id, data, db)


@app.patch("/blocks/{block_id}")
def update_block(block_id: int, data: BlockUpdate, db: Session = Depends(get_db)):
    block = db.query(Block).filter(Block.id == block_id).first()
    if not block:
        raise HTTPException(404, "Block not found")

    if data.title is not None:
        block.title = data.title
    if data.description is not None:
        block.description = data.description
    if data.agent_type is not None:
        if data.agent_type not in ("claude", "codex", "gemini"):
            raise HTTPException(400, "agent_type must be claude, codex, or gemini")
        block.agent_type = data.agent_type
    if data.prompt is not None:
        block.prompt = data.prompt
    if data.win_conditions is not None:
        block.win_conditions = data.win_conditions
    if data.pos_x is not None:
        block.pos_x = data.pos_x
    if data.pos_y is not None:
        block.pos_y = data.pos_y

    db.commit()
    return {
        "id": block.id,
        "title": block.title,
        "description": block.description,
        "agent_type": block.agent_type,
        "prompt": block.prompt,
        "win_conditions": block.win_conditions,
        "pos_x": block.pos_x,
        "pos_y": block.pos_y
    }


# Backward compatibility alias
@app.patch("/nodes/{node_id}")
def update_node(node_id: int, data: BlockUpdate, db: Session = Depends(get_db)):
    return update_block(node_id, data, db)


@app.delete("/blocks/{block_id}")
def delete_block(block_id: int, db: Session = Depends(get_db)):
    block = db.query(Block).filter(Block.id == block_id).first()
    if not block:
        raise HTTPException(404, "Block not found")
    db.delete(block)
    db.commit()
    return {"ok": True}


# Backward compatibility alias
@app.delete("/nodes/{node_id}")
def delete_node(node_id: int, db: Session = Depends(get_db)):
    return delete_block(node_id, db)


# --- Edges ---

@app.post("/graphs/{graph_id}/edges")
def create_edge(graph_id: int, data: EdgeCreate, db: Session = Depends(get_db)):
    parent = db.query(Block).filter(Block.id == data.parent_id).first()
    child = db.query(Block).filter(Block.id == data.child_id).first()

    if not parent or parent.graph_id != graph_id:
        raise HTTPException(400, "Parent block not found in this graph")
    if not child or child.graph_id != graph_id:
        raise HTTPException(400, "Child block not found in this graph")
    if data.parent_id == data.child_id:
        raise HTTPException(400, "Cannot create self-loop")

    existing = db.query(Edge).filter(
        Edge.parent_id == data.parent_id,
        Edge.child_id == data.child_id
    ).first()
    if existing:
        raise HTTPException(400, "Edge already exists")

    edge = Edge(graph_id=graph_id, parent_id=data.parent_id, child_id=data.child_id)
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return {"id": edge.id, "parent_id": edge.parent_id, "child_id": edge.child_id}


@app.delete("/edges/{edge_id}")
def delete_edge(edge_id: int, db: Session = Depends(get_db)):
    edge = db.query(Edge).filter(Edge.id == edge_id).first()
    if not edge:
        raise HTTPException(404, "Edge not found")
    db.delete(edge)
    db.commit()
    return {"ok": True}


# --- Context Items ---

@app.post("/graphs/{graph_id}/context")
async def create_context(graph_id: int, data: ContextItemCreate, db: Session = Depends(get_db)):
    valid_types = ("file", "repo", "github", "url", "image")
    if data.context_type not in valid_types:
        raise HTTPException(400, f"context_type must be one of {valid_types}")

    try:
        content = await process_context_item(data.context_type, data.config)
    except Exception as e:
        content = f"[Error processing: {e}]"

    item = ContextItem(
        graph_id=graph_id,
        name=data.name,
        context_type=data.context_type,
        config=data.config,
        processed_content=content,
        created_at=datetime.utcnow().isoformat()
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return {
        "id": item.id,
        "name": item.name,
        "context_type": item.context_type,
        "config": item.config,
        "processed_content": item.processed_content[:500] + "..." if len(item.processed_content or "") > 500 else item.processed_content,
        "created_at": item.created_at
    }


@app.get("/graphs/{graph_id}/context")
def list_context(graph_id: int, db: Session = Depends(get_db)):
    items = db.query(ContextItem).filter(ContextItem.graph_id == graph_id).all()
    return [{
        "id": c.id,
        "name": c.name,
        "context_type": c.context_type,
        "config": c.config,
        "has_content": bool(c.processed_content),
        "created_at": c.created_at
    } for c in items]


@app.patch("/context/{context_id}")
async def update_context(context_id: int, data: ContextItemUpdate, db: Session = Depends(get_db)):
    item = db.query(ContextItem).filter(ContextItem.id == context_id).first()
    if not item:
        raise HTTPException(404, "Context not found")

    if data.name is not None:
        item.name = data.name
    if data.config is not None:
        item.config = data.config
        try:
            item.processed_content = await process_context_item(item.context_type, data.config)
        except Exception as e:
            item.processed_content = f"[Error processing: {e}]"

    db.commit()
    return {"id": item.id, "name": item.name, "context_type": item.context_type, "config": item.config}


@app.delete("/context/{context_id}")
def delete_context(context_id: int, db: Session = Depends(get_db)):
    item = db.query(ContextItem).filter(ContextItem.id == context_id).first()
    if not item:
        raise HTTPException(404, "Context not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


@app.post("/context/{context_id}/refresh")
async def refresh_context(context_id: int, db: Session = Depends(get_db)):
    item = db.query(ContextItem).filter(ContextItem.id == context_id).first()
    if not item:
        raise HTTPException(404, "Context not found")

    try:
        item.processed_content = await process_context_item(item.context_type, item.config)
    except Exception as e:
        item.processed_content = f"[Error processing: {e}]"

    db.commit()
    return {"id": item.id, "processed_content": item.processed_content[:500] + "..." if len(item.processed_content or "") > 500 else item.processed_content}


# --- Block Context Attachments ---

@app.post("/blocks/{block_id}/context")
def attach_context(block_id: int, data: BlockContextCreate, db: Session = Depends(get_db)):
    block = db.query(Block).filter(Block.id == block_id).first()
    if not block:
        raise HTTPException(404, "Block not found")

    item = db.query(ContextItem).filter(ContextItem.id == data.context_item_id).first()
    if not item:
        raise HTTPException(404, "Context item not found")
    if item.graph_id != block.graph_id:
        raise HTTPException(400, "Context item must belong to the same graph")

    existing = db.query(BlockContext).filter(
        BlockContext.block_id == block_id,
        BlockContext.context_item_id == data.context_item_id
    ).first()
    if existing:
        raise HTTPException(400, "Context already attached to this block")

    bc = BlockContext(
        block_id=block_id,
        context_item_id=data.context_item_id,
        injection_mode=data.injection_mode,
        placeholder=data.placeholder,
        order=data.order
    )
    db.add(bc)
    db.commit()
    db.refresh(bc)

    return {
        "id": bc.id,
        "context_item_id": bc.context_item_id,
        "context_name": item.name,
        "injection_mode": bc.injection_mode,
        "order": bc.order
    }


# Backward compatibility alias
@app.post("/nodes/{node_id}/context")
def attach_context_node(node_id: int, data: BlockContextCreate, db: Session = Depends(get_db)):
    return attach_context(node_id, data, db)


@app.get("/blocks/{block_id}/context")
def list_block_context(block_id: int, db: Session = Depends(get_db)):
    block = db.query(Block).filter(Block.id == block_id).first()
    if not block:
        raise HTTPException(404, "Block not found")

    return [{
        "id": bc.id,
        "context_item_id": bc.context_item_id,
        "context_name": bc.context_item.name,
        "context_type": bc.context_item.context_type,
        "injection_mode": bc.injection_mode,
        "order": bc.order
    } for bc in sorted(block.contexts, key=lambda x: x.order)]


# Backward compatibility alias
@app.get("/nodes/{node_id}/context")
def list_node_context(node_id: int, db: Session = Depends(get_db)):
    return list_block_context(node_id, db)


@app.delete("/blocks/{block_id}/context/{context_item_id}")
def detach_context(block_id: int, context_item_id: int, db: Session = Depends(get_db)):
    bc = db.query(BlockContext).filter(
        BlockContext.block_id == block_id,
        BlockContext.context_item_id == context_item_id
    ).first()
    if not bc:
        raise HTTPException(404, "Context attachment not found")
    db.delete(bc)
    db.commit()
    return {"ok": True}


# Backward compatibility alias
@app.delete("/nodes/{node_id}/context/{context_item_id}")
def detach_context_node(node_id: int, context_item_id: int, db: Session = Depends(get_db)):
    return detach_context(node_id, context_item_id, db)


# --- Execution ---

@app.post("/graphs/{graph_id}/run")
async def start_run(graph_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == graph_id).first()
    if not graph:
        raise HTTPException(404, "Graph not found")

    run = Run(graph_id=graph_id, status="running", created_at=datetime.utcnow().isoformat())
    db.add(run)
    db.commit()
    db.refresh(run)

    # Create pending block_run records
    for block in graph.blocks:
        block_run = BlockRun(run_id=run.id, block_id=block.id, status="pending")
        db.add(block_run)
    db.commit()

    background_tasks.add_task(run_graph, run.id)
    return {"run_id": run.id}


@app.get("/runs/{run_id}")
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found")

    block_runs = []
    for br in run.block_runs:
        # Get deliverables
        deliverables = [{
            "id": d.id,
            "type": d.type,
            "url": d.url,
            "path": d.path
        } for d in br.deliverables]

        # Check for pending human reviews
        pending_review = db.query(HumanReview).filter(
            HumanReview.block_run_id == br.id,
            HumanReview.status == "pending"
        ).first()

        block_runs.append({
            "id": br.id,
            "block_id": br.block_id,
            "block_title": br.block.title,
            "status": br.status,
            "output": br.output,
            "tmux_session": br.tmux_session,
            "condition_results": br.condition_results or [],
            "error": br.error,
            "started_at": br.started_at,
            "finished_at": br.finished_at,
            "deliverables": deliverables,
            "pending_review": pending_review.id if pending_review else None,
            # Backward compatibility
            "node_id": br.block_id,
            "node_title": br.block.title,
            "artifacts": deliverables,
        })

    return {
        "id": run.id,
        "graph_id": run.graph_id,
        "status": run.status,
        "error": run.error,
        "created_at": run.created_at,
        "block_runs": block_runs,
        "node_runs": block_runs,  # Backward compatibility
    }


@app.get("/runs")
def list_runs(db: Session = Depends(get_db)):
    runs = db.query(Run).order_by(Run.created_at.desc()).limit(50).all()
    return [{
        "id": r.id,
        "graph_id": r.graph_id,
        "graph_name": r.graph.name,
        "status": r.status,
        "created_at": r.created_at,
    } for r in runs]


# --- Human Review ---

@app.get("/reviews")
def list_pending_reviews(db: Session = Depends(get_db)):
    """List all pending human reviews."""
    reviews = db.query(HumanReview).filter(HumanReview.status == "pending").all()
    return [{
        "id": r.id,
        "block_run_id": r.block_run_id,
        "block_title": r.block_run.block.title,
        "run_id": r.block_run.run_id,
        "prompt": r.prompt,
        "output": r.block_run.output[:2000] if r.block_run.output else None,
        "deliverables": [{
            "type": d.type,
            "url": d.url,
            "path": d.path
        } for d in r.block_run.deliverables]
    } for r in reviews]


@app.get("/reviews/{review_id}")
def get_review(review_id: int, db: Session = Depends(get_db)):
    """Get a specific review with full output."""
    review = db.query(HumanReview).filter(HumanReview.id == review_id).first()
    if not review:
        raise HTTPException(404, "Review not found")

    return {
        "id": review.id,
        "block_run_id": review.block_run_id,
        "block_title": review.block_run.block.title,
        "run_id": review.block_run.run_id,
        "prompt": review.prompt,
        "status": review.status,
        "output": review.block_run.output,
        "condition_results": review.block_run.condition_results,
        "deliverables": [{
            "id": d.id,
            "type": d.type,
            "url": d.url,
            "path": d.path
        } for d in review.block_run.deliverables]
    }


@app.post("/reviews/{review_id}")
def submit_review(review_id: int, data: HumanReviewAction, db: Session = Depends(get_db)):
    """Approve or reject a human review."""
    review = db.query(HumanReview).filter(HumanReview.id == review_id).first()
    if not review:
        raise HTTPException(404, "Review not found")
    if review.status != "pending":
        raise HTTPException(400, f"Review already {review.status}")

    if data.action not in ("approve", "reject"):
        raise HTTPException(400, "Action must be 'approve' or 'reject'")

    review.status = "approved" if data.action == "approve" else "rejected"
    review.reviewer_notes = data.notes
    review.reviewed_at = datetime.utcnow().isoformat()

    # Update block run condition results
    block_run = review.block_run
    condition_results = block_run.condition_results or []
    for cr in condition_results:
        if cr.get("type") == "human" and cr.get("pending"):
            cr["passed"] = data.action == "approve"
            cr["pending"] = False
            cr["details"] = data.notes or ("Approved" if data.action == "approve" else "Rejected")

    block_run.condition_results = condition_results

    # Recompute block status
    from services.validators import determine_block_status
    block_run.status = determine_block_status(condition_results)

    # If block is now green/red, may need to update run status
    if block_run.status in ("green", "red", "done"):
        run = block_run.run
        all_complete = all(br.status in ("green", "red", "done") for br in run.block_runs)
        if all_complete:
            all_passed = all(br.status in ("green", "done") for br in run.block_runs)
            run.status = "done" if all_passed else "error"

    db.commit()
    return {"ok": True, "status": review.status, "block_status": block_run.status}


# --- Prompt Assistance ---

@app.post("/assist/prompt")
async def assist_generate_prompt(data: PromptGenerateRequest):
    if data.agent_type not in ("claude", "codex", "gemini"):
        raise HTTPException(400, "agent_type must be claude, codex, or gemini")

    try:
        result = await generate_prompt(data.description, data.agent_type)
        return result
    except Exception as e:
        raise HTTPException(500, f"Error generating prompt: {e}")


@app.post("/assist/improve")
async def assist_improve_prompt(data: PromptImproveRequest):
    if data.agent_type not in ("claude", "codex", "gemini"):
        raise HTTPException(400, "agent_type must be claude, codex, or gemini")

    try:
        result = await improve_prompt(data.prompt, data.agent_type, data.feedback)
        return result
    except Exception as e:
        raise HTTPException(500, f"Error improving prompt: {e}")


# --- Export/Import ---

@app.get("/graphs/{graph_id}/export")
def export_graph(graph_id: int, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == graph_id).first()
    if not graph:
        raise HTTPException(404, "Graph not found")

    block_id_map = {}
    blocks = []
    for i, block in enumerate(graph.blocks):
        export_id = f"b{i+1}"
        block_id_map[block.id] = export_id
        blocks.append({
            "id": export_id,
            "title": block.title,
            "description": block.description,
            "agent_type": block.agent_type,
            "prompt": block.prompt,
            "win_conditions": block.win_conditions or [],
            "pos": [block.pos_x, block.pos_y],
        })

    edges = []
    for edge in graph.edges:
        edges.append({
            "from": block_id_map.get(edge.parent_id),
            "to": block_id_map.get(edge.child_id)
        })

    context_items = []
    for ctx in graph.context_items:
        context_items.append({
            "name": ctx.name,
            "type": ctx.context_type,
            "config": ctx.config
        })

    return {
        "name": graph.name,
        "description": graph.description,
        "is_template": graph.is_template,
        "template_category": graph.template_category,
        "blocks": blocks,
        "edges": edges,
        "context_items": context_items
    }


@app.post("/graphs/import")
def import_graph(data: GraphImport, db: Session = Depends(get_db)):
    graph = Graph(name=data.name, created_at=datetime.utcnow().isoformat())
    db.add(graph)
    db.commit()
    db.refresh(graph)

    # Use blocks if provided, otherwise fall back to nodes
    block_data_list = data.blocks or data.nodes or []
    block_id_map = {}

    for block_data in block_data_list:
        pos = block_data.get("pos", [100, 100])

        block = Block(
            graph_id=graph.id,
            title=block_data.get("title", "Untitled"),
            description=block_data.get("description"),
            agent_type=block_data.get("agent_type", "claude"),
            prompt=block_data.get("prompt"),
            win_conditions=block_data.get("win_conditions", []),
            pos_x=pos[0] if isinstance(pos, list) else 100,
            pos_y=pos[1] if isinstance(pos, list) else 100,
        )
        db.add(block)
        db.commit()
        db.refresh(block)
        block_id_map[block_data.get("id")] = block.id

    for edge_data in data.edges:
        from_id = block_id_map.get(edge_data.get("from"))
        to_id = block_id_map.get(edge_data.get("to"))
        if from_id and to_id:
            edge = Edge(graph_id=graph.id, parent_id=from_id, child_id=to_id)
            db.add(edge)

    if data.context_items:
        for ctx_data in data.context_items:
            ctx = ContextItem(
                graph_id=graph.id,
                name=ctx_data.get("name", "Untitled"),
                context_type=ctx_data.get("type", "file"),
                config=ctx_data.get("config", {}),
                created_at=datetime.utcnow().isoformat()
            )
            db.add(ctx)

    db.commit()
    return {"id": graph.id, "name": graph.name}


@app.post("/graphs/{graph_id}/clone")
def clone_graph(graph_id: int, db: Session = Depends(get_db)):
    """Clone a graph (useful for using templates)."""
    original = db.query(Graph).filter(Graph.id == graph_id).first()
    if not original:
        raise HTTPException(404, "Graph not found")

    # Create new graph
    new_graph = Graph(
        name=f"{original.name} (copy)",
        description=original.description,
        is_template=False,  # Clones are not templates
        created_at=datetime.utcnow().isoformat()
    )
    db.add(new_graph)
    db.commit()
    db.refresh(new_graph)

    # Clone blocks
    block_id_map = {}
    for block in original.blocks:
        new_block = Block(
            graph_id=new_graph.id,
            title=block.title,
            description=block.description,
            agent_type=block.agent_type,
            prompt=block.prompt,
            win_conditions=block.win_conditions,
            pos_x=block.pos_x,
            pos_y=block.pos_y,
        )
        db.add(new_block)
        db.commit()
        db.refresh(new_block)
        block_id_map[block.id] = new_block.id

    # Clone edges
    for edge in original.edges:
        new_edge = Edge(
            graph_id=new_graph.id,
            parent_id=block_id_map[edge.parent_id],
            child_id=block_id_map[edge.child_id]
        )
        db.add(new_edge)

    # Clone context items
    for ctx in original.context_items:
        new_ctx = ContextItem(
            graph_id=new_graph.id,
            name=ctx.name,
            context_type=ctx.context_type,
            config=ctx.config,
            processed_content=ctx.processed_content,
            created_at=datetime.utcnow().isoformat()
        )
        db.add(new_ctx)

    db.commit()
    return {"id": new_graph.id, "name": new_graph.name}


# --- Static files (frontend) ---

dist_path = Path(__file__).parent / "dist"


@app.on_event("startup")
def startup():
    init_db()


if dist_path.exists():
    app.mount("/assets", StaticFiles(directory=dist_path / "assets"), name="assets")

    @app.get("/")
    def serve_index():
        return FileResponse(dist_path / "index.html")
