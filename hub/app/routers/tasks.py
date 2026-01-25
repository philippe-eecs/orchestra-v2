from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import TaskModel, ProjectModel, NodeModel
from app.models import Task, TaskCreate, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[Task])
def list_tasks(
    project_id: int | None = Query(None),
    node_id: int | None = Query(None),
    completed: bool | None = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(TaskModel)

    if project_id is not None:
        query = query.filter(TaskModel.project_id == project_id)
    if node_id is not None:
        query = query.filter(TaskModel.node_id == node_id)
    if completed is not None:
        query = query.filter(TaskModel.completed == completed)

    return query.order_by(TaskModel.priority.desc(), TaskModel.created_at.desc()).all()


@router.post("", response_model=Task, status_code=201)
def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    # Validate project exists if provided
    if task.project_id:
        project = db.query(ProjectModel).filter(ProjectModel.id == task.project_id).first()
        if not project:
            raise HTTPException(status_code=400, detail="Project not found")

    # Validate node exists if provided
    if task.node_id:
        node = db.query(NodeModel).filter(NodeModel.id == task.node_id).first()
        if not node:
            raise HTTPException(status_code=400, detail="Node not found")

    db_task = TaskModel(**task.model_dump())
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task


@router.get("/{task_id}", response_model=Task)
def get_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.patch("/{task_id}", response_model=Task)
def update_task(task_id: int, task: TaskUpdate, db: Session = Depends(get_db)):
    db_task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    update_data = task.model_dump(exclude_unset=True)

    # Validate project exists if being updated
    if "project_id" in update_data and update_data["project_id"]:
        project = db.query(ProjectModel).filter(ProjectModel.id == update_data["project_id"]).first()
        if not project:
            raise HTTPException(status_code=400, detail="Project not found")

    # Validate node exists if being updated
    if "node_id" in update_data and update_data["node_id"]:
        node = db.query(NodeModel).filter(NodeModel.id == update_data["node_id"]).first()
        if not node:
            raise HTTPException(status_code=400, detail="Node not found")

    for key, value in update_data.items():
        setattr(db_task, key, value)

    db.commit()
    db.refresh(db_task)
    return db_task


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    db.delete(task)
    db.commit()
    return None
