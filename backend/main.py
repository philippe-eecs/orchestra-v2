"""FastAPI app - 8 endpoints, nothing more."""

from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from pathlib import Path
import os

from database import get_db, init_db
from models import Graph, Node, Edge, Run, NodeRun, ContextItem, NodeContext, AgentSession
from services.runner import run_graph
from services.context_processor import process_context_item
from services.prompt_assist import generate_prompt, improve_prompt

app = FastAPI(title="Orchestra V3")

# Pydantic schemas
class GraphCreate(BaseModel):
    name: str

class NodeCreate(BaseModel):
    title: str
    prompt: str
    agent_type: str
    pos_x: float = 100
    pos_y: float = 100

class NodeUpdate(BaseModel):
    title: str | None = None
    prompt: str | None = None
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


class NodeContextCreate(BaseModel):
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
    nodes: list[dict]
    edges: list[dict]
    context_items: list[dict] | None = None


# --- Graph CRUD ---

@app.post("/graphs")
def create_graph(data: GraphCreate, db: Session = Depends(get_db)):
    graph = Graph(name=data.name, created_at=datetime.utcnow().isoformat())
    db.add(graph)
    db.commit()
    db.refresh(graph)
    return {"id": graph.id, "name": graph.name, "created_at": graph.created_at}


@app.get("/graphs")
def list_graphs(db: Session = Depends(get_db)):
    graphs = db.query(Graph).order_by(Graph.created_at.desc()).all()
    return [{"id": g.id, "name": g.name, "created_at": g.created_at} for g in graphs]


@app.get("/graphs/{graph_id}")
def get_graph(graph_id: int, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == graph_id).first()
    if not graph:
        raise HTTPException(404, "Graph not found")

    nodes = [{
        "id": n.id, "title": n.title, "prompt": n.prompt,
        "agent_type": n.agent_type, "pos_x": n.pos_x, "pos_y": n.pos_y,
        "output_as_context": n.output_as_context,
        "context_count": len(n.contexts)
    } for n in graph.nodes]
    edges = [{"id": e.id, "parent_id": e.parent_id, "child_id": e.child_id}
             for e in graph.edges]
    context_items = [{
        "id": c.id, "name": c.name, "context_type": c.context_type,
        "config": c.config, "has_content": bool(c.processed_content)
    } for c in graph.context_items]

    return {"id": graph.id, "name": graph.name, "created_at": graph.created_at,
            "nodes": nodes, "edges": edges, "context_items": context_items}


@app.delete("/graphs/{graph_id}")
def delete_graph(graph_id: int, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == graph_id).first()
    if not graph:
        raise HTTPException(404, "Graph not found")
    db.delete(graph)
    db.commit()
    return {"ok": True}


# --- Nodes & Edges ---

@app.post("/graphs/{graph_id}/nodes")
def create_node(graph_id: int, data: NodeCreate, db: Session = Depends(get_db)):
    if data.agent_type not in ("claude", "codex", "gemini"):
        raise HTTPException(400, "agent_type must be claude, codex, or gemini")

    node = Node(graph_id=graph_id, title=data.title, prompt=data.prompt,
                agent_type=data.agent_type, pos_x=data.pos_x, pos_y=data.pos_y)
    db.add(node)
    db.commit()
    db.refresh(node)
    return {"id": node.id, "title": node.title, "prompt": node.prompt,
            "agent_type": node.agent_type, "pos_x": node.pos_x, "pos_y": node.pos_y}


@app.patch("/nodes/{node_id}")
def update_node(node_id: int, data: NodeUpdate, db: Session = Depends(get_db)):
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(404, "Node not found")

    if data.title is not None:
        node.title = data.title
    if data.prompt is not None:
        node.prompt = data.prompt
    if data.pos_x is not None:
        node.pos_x = data.pos_x
    if data.pos_y is not None:
        node.pos_y = data.pos_y

    db.commit()
    return {"id": node.id, "title": node.title, "prompt": node.prompt,
            "agent_type": node.agent_type, "pos_x": node.pos_x, "pos_y": node.pos_y}


@app.delete("/nodes/{node_id}")
def delete_node(node_id: int, db: Session = Depends(get_db)):
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(404, "Node not found")
    db.delete(node)
    db.commit()
    return {"ok": True}


@app.post("/graphs/{graph_id}/edges")
def create_edge(graph_id: int, data: EdgeCreate, db: Session = Depends(get_db)):
    # Validate nodes exist and belong to this graph
    parent = db.query(Node).filter(Node.id == data.parent_id).first()
    child = db.query(Node).filter(Node.id == data.child_id).first()

    if not parent or parent.graph_id != graph_id:
        raise HTTPException(400, "Parent node not found in this graph")
    if not child or child.graph_id != graph_id:
        raise HTTPException(400, "Child node not found in this graph")
    if data.parent_id == data.child_id:
        raise HTTPException(400, "Cannot create self-loop")

    # Check for duplicate edge
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

    # Process context to get initial content
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
        # Re-process with new config
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


# --- Node Context Attachments ---

@app.post("/nodes/{node_id}/context")
def attach_context(node_id: int, data: NodeContextCreate, db: Session = Depends(get_db)):
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(404, "Node not found")

    item = db.query(ContextItem).filter(ContextItem.id == data.context_item_id).first()
    if not item:
        raise HTTPException(404, "Context item not found")
    if item.graph_id != node.graph_id:
        raise HTTPException(400, "Context item must belong to the same graph")

    # Check for duplicate
    existing = db.query(NodeContext).filter(
        NodeContext.node_id == node_id,
        NodeContext.context_item_id == data.context_item_id
    ).first()
    if existing:
        raise HTTPException(400, "Context already attached to this node")

    nc = NodeContext(
        node_id=node_id,
        context_item_id=data.context_item_id,
        injection_mode=data.injection_mode,
        placeholder=data.placeholder,
        order=data.order
    )
    db.add(nc)
    db.commit()
    db.refresh(nc)

    return {
        "id": nc.id,
        "context_item_id": nc.context_item_id,
        "context_name": item.name,
        "injection_mode": nc.injection_mode,
        "order": nc.order
    }


@app.get("/nodes/{node_id}/context")
def list_node_context(node_id: int, db: Session = Depends(get_db)):
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(404, "Node not found")

    return [{
        "id": nc.id,
        "context_item_id": nc.context_item_id,
        "context_name": nc.context_item.name,
        "context_type": nc.context_item.context_type,
        "injection_mode": nc.injection_mode,
        "order": nc.order
    } for nc in sorted(node.contexts, key=lambda x: x.order)]


@app.delete("/nodes/{node_id}/context/{context_item_id}")
def detach_context(node_id: int, context_item_id: int, db: Session = Depends(get_db)):
    nc = db.query(NodeContext).filter(
        NodeContext.node_id == node_id,
        NodeContext.context_item_id == context_item_id
    ).first()
    if not nc:
        raise HTTPException(404, "Context attachment not found")
    db.delete(nc)
    db.commit()
    return {"ok": True}


# --- Execution ---

@app.post("/graphs/{graph_id}/run")
async def start_run(graph_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == graph_id).first()
    if not graph:
        raise HTTPException(404, "Graph not found")

    # Create run record
    run = Run(graph_id=graph_id, status="running", created_at=datetime.utcnow().isoformat())
    db.add(run)
    db.commit()
    db.refresh(run)

    # Create pending node_run records
    for node in graph.nodes:
        node_run = NodeRun(run_id=run.id, node_id=node.id, status="pending")
        db.add(node_run)
    db.commit()

    # Run in background
    background_tasks.add_task(run_graph, run.id)

    return {"run_id": run.id}


@app.get("/runs/{run_id}")
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found")

    node_runs = []
    for nr in run.node_runs:
        node_runs.append({
            "id": nr.id,
            "node_id": nr.node_id,
            "node_title": nr.node.title,
            "agent_type": nr.node.agent_type,
            "status": nr.status,
            "output": nr.output,
            "error": nr.error,
            "started_at": nr.started_at,
            "finished_at": nr.finished_at,
            "tmux_session": nr.tmux_session,
            "artifacts": nr.artifacts or [],
        })

    return {
        "id": run.id,
        "graph_id": run.graph_id,
        "status": run.status,
        "error": run.error,
        "created_at": run.created_at,
        "node_runs": node_runs,
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


# --- Agent Sessions ---

@app.get("/agents")
def list_agents(db: Session = Depends(get_db)):
    sessions = db.query(AgentSession).order_by(AgentSession.started_at.desc()).limit(50).all()
    return [{
        "id": s.id,
        "run_id": s.run_id,
        "node_run_id": s.node_run_id,
        "tmux_session": s.tmux_session,
        "agent_type": s.agent_type,
        "title": s.title,
        "status": s.status,
        "started_at": s.started_at,
        "finished_at": s.finished_at,
    } for s in sessions]


@app.get("/agents/active")
def list_active_agents(db: Session = Depends(get_db)):
    sessions = db.query(AgentSession).filter(AgentSession.status == "running").all()
    return [{
        "id": s.id,
        "run_id": s.run_id,
        "node_run_id": s.node_run_id,
        "tmux_session": s.tmux_session,
        "agent_type": s.agent_type,
        "title": s.title,
        "status": s.status,
        "started_at": s.started_at,
    } for s in sessions]


@app.delete("/agents/{agent_id}")
async def kill_agent(agent_id: int, db: Session = Depends(get_db)):
    session = db.query(AgentSession).filter(AgentSession.id == agent_id).first()
    if not session:
        raise HTTPException(404, "Agent session not found")

    # Kill tmux session
    import subprocess
    try:
        subprocess.run(["tmux", "kill-session", "-t", session.tmux_session], check=False)
    except:
        pass

    session.status = "killed"
    session.finished_at = datetime.utcnow().isoformat()
    db.commit()
    return {"ok": True}


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

    # Build node id mapping for export
    node_id_map = {}
    nodes = []
    for i, node in enumerate(graph.nodes):
        export_id = f"n{i+1}"
        node_id_map[node.id] = export_id
        nodes.append({
            "id": export_id,
            "title": node.title,
            "prompt": node.prompt,
            "agent_type": node.agent_type,
            "pos": [node.pos_x, node.pos_y],
            "output_as_context": node.output_as_context
        })

    edges = []
    for edge in graph.edges:
        edges.append({
            "from": node_id_map.get(edge.parent_id),
            "to": node_id_map.get(edge.child_id)
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
        "nodes": nodes,
        "edges": edges,
        "context_items": context_items
    }


@app.post("/graphs/import")
def import_graph(data: GraphImport, db: Session = Depends(get_db)):
    # Create graph
    graph = Graph(name=data.name, created_at=datetime.utcnow().isoformat())
    db.add(graph)
    db.commit()
    db.refresh(graph)

    # Create nodes and build id mapping
    node_id_map = {}
    for node_data in data.nodes:
        pos = node_data.get("pos", [100, 100])
        node = Node(
            graph_id=graph.id,
            title=node_data.get("title", "Untitled"),
            prompt=node_data.get("prompt", ""),
            agent_type=node_data.get("agent_type", "claude"),
            pos_x=pos[0] if isinstance(pos, list) else 100,
            pos_y=pos[1] if isinstance(pos, list) else 100,
            output_as_context=node_data.get("output_as_context", True)
        )
        db.add(node)
        db.commit()
        db.refresh(node)
        node_id_map[node_data.get("id")] = node.id

    # Create edges
    for edge_data in data.edges:
        from_id = node_id_map.get(edge_data.get("from"))
        to_id = node_id_map.get(edge_data.get("to"))
        if from_id and to_id:
            edge = Edge(graph_id=graph.id, parent_id=from_id, child_id=to_id)
            db.add(edge)

    # Create context items if provided
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
