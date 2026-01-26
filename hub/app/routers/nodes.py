from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import ProjectModel, NodeModel
from app.models import Node, NodeCreate, NodeUpdate, Graph, Edge, NodeMetadata
from app.models.deliverables import DeliverableSchema
from app.services.broadcast import manager

router = APIRouter(prefix="/projects/{project_id}", tags=["nodes"])


def node_to_response(node: NodeModel) -> Node:
    """Convert NodeModel to Node response with parent_ids."""
    import json
    # Parse expected_deliverables from JSON
    expected_deliverables = []
    if node.expected_deliverables:
        # Handle both string and list formats
        deliverables_data = node.expected_deliverables
        if isinstance(deliverables_data, str):
            deliverables_data = json.loads(deliverables_data)
        for d in deliverables_data:
            if isinstance(d, dict):
                expected_deliverables.append(DeliverableSchema(**d))
            else:
                expected_deliverables.append(d)

    return Node(
        id=node.id,
        project_id=node.project_id,
        title=node.title,
        description=node.description,
        status=node.status,
        node_type=node.node_type or "task",
        agent_type=node.agent_type,
        prompt=node.prompt,
        context=node.context,
        metadata=NodeMetadata(**node.node_metadata) if node.node_metadata else NodeMetadata(),
        expected_deliverables=expected_deliverables,
        position_x=node.position_x,
        position_y=node.position_y,
        parent_ids=[p.id for p in node.parents],
        created_at=node.created_at,
        updated_at=node.updated_at,
    )


@router.get("/graph", response_model=Graph)
def get_graph(project_id: int, db: Session = Depends(get_db)):
    project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    nodes = db.query(NodeModel).filter(NodeModel.project_id == project_id).all()

    edges = []
    for node in nodes:
        for parent in node.parents:
            edges.append(Edge(source_id=parent.id, target_id=node.id))

    return Graph(
        nodes=[node_to_response(n) for n in nodes],
        edges=edges
    )


@router.post("/nodes", response_model=Node, status_code=201)
async def create_node(project_id: int, node: NodeCreate, db: Session = Depends(get_db)):
    project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    node_data = node.model_dump(mode="json", exclude={"parent_ids"})
    if "metadata" in node_data and node_data["metadata"]:
        node_data["node_metadata"] = node_data.pop("metadata")
        if hasattr(node_data["node_metadata"], "model_dump"):
            node_data["node_metadata"] = node_data["node_metadata"].model_dump()

    # Convert expected_deliverables to JSON-serializable format
    if "expected_deliverables" in node_data and node_data["expected_deliverables"]:
        node_data["expected_deliverables"] = [
            d.model_dump() if hasattr(d, "model_dump") else d
            for d in node_data["expected_deliverables"]
        ]

    db_node = NodeModel(project_id=project_id, **node_data)

    # Handle parent relationships
    if node.parent_ids:
        parents = db.query(NodeModel).filter(
            NodeModel.id.in_(node.parent_ids),
            NodeModel.project_id == project_id
        ).all()
        if len(parents) != len(node.parent_ids):
            raise HTTPException(status_code=400, detail="One or more parent nodes not found")
        db_node.parents = parents

    db.add(db_node)
    db.commit()
    db.refresh(db_node)

    response = node_to_response(db_node)
    await manager.broadcast(project_id, "node.created", response.model_dump(mode="json"))
    return response


@router.get("/nodes/{node_id}", response_model=Node)
def get_node(project_id: int, node_id: int, db: Session = Depends(get_db)):
    node = db.query(NodeModel).filter(
        NodeModel.id == node_id,
        NodeModel.project_id == project_id
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node_to_response(node)


@router.patch("/nodes/{node_id}", response_model=Node)
async def update_node(project_id: int, node_id: int, node: NodeUpdate, db: Session = Depends(get_db)):
    db_node = db.query(NodeModel).filter(
        NodeModel.id == node_id,
        NodeModel.project_id == project_id
    ).first()
    if not db_node:
        raise HTTPException(status_code=404, detail="Node not found")

    update_data = node.model_dump(mode="json", exclude_unset=True)

    # Handle parent_ids separately
    if "parent_ids" in update_data:
        parent_ids = update_data.pop("parent_ids")
        if parent_ids is not None:
            parents = db.query(NodeModel).filter(
                NodeModel.id.in_(parent_ids),
                NodeModel.project_id == project_id
            ).all()
            if len(parents) != len(parent_ids):
                raise HTTPException(status_code=400, detail="One or more parent nodes not found")
            db_node.parents = parents

    # Handle metadata
    if "metadata" in update_data and update_data["metadata"]:
        update_data["node_metadata"] = update_data.pop("metadata")
        if hasattr(update_data["node_metadata"], "model_dump"):
            update_data["node_metadata"] = update_data["node_metadata"].model_dump()

    # Handle expected_deliverables
    if "expected_deliverables" in update_data and update_data["expected_deliverables"]:
        update_data["expected_deliverables"] = [
            d.model_dump() if hasattr(d, "model_dump") else d
            for d in update_data["expected_deliverables"]
        ]

    for key, value in update_data.items():
        setattr(db_node, key, value)

    db.commit()
    db.refresh(db_node)

    response = node_to_response(db_node)
    await manager.broadcast(project_id, "node.updated", response.model_dump(mode="json"))
    return response


@router.delete("/nodes/{node_id}", status_code=204)
async def delete_node(project_id: int, node_id: int, db: Session = Depends(get_db)):
    node = db.query(NodeModel).filter(
        NodeModel.id == node_id,
        NodeModel.project_id == project_id
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    db.delete(node)
    db.commit()

    await manager.broadcast(project_id, "node.deleted", {"id": node_id})
    return None
