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
from models import Graph, Node, Edge, Run, NodeRun
from services.runner import run_graph

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

    nodes = [{"id": n.id, "title": n.title, "prompt": n.prompt,
              "agent_type": n.agent_type, "pos_x": n.pos_x, "pos_y": n.pos_y}
             for n in graph.nodes]
    edges = [{"id": e.id, "parent_id": e.parent_id, "child_id": e.child_id}
             for e in graph.edges]

    return {"id": graph.id, "name": graph.name, "created_at": graph.created_at,
            "nodes": nodes, "edges": edges}


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
