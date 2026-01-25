from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import ProjectModel
from app.services.broadcast import manager

router = APIRouter(tags=["websocket"])


@router.websocket("/projects/{project_id}/subscribe")
async def websocket_endpoint(websocket: WebSocket, project_id: int, db: Session = Depends(get_db)):
    # Verify project exists
    project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not project:
        await websocket.close(code=4004, reason="Project not found")
        return

    await manager.connect(project_id, websocket)
    try:
        while True:
            # Keep connection alive, handle any client messages
            data = await websocket.receive_text()
            # Could handle ping/pong or client commands here
    except WebSocketDisconnect:
        manager.disconnect(project_id, websocket)
