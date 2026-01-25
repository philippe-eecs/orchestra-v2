from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import AgentTemplateModel, AgentStepModel, agent_step_edges
from app.models import (
    AgentTemplate, AgentTemplateCreate, AgentTemplateUpdate, AgentTemplateWithSteps,
    AgentStep, AgentStepCreate, AgentStepUpdate, AgentStepEdge,
)

router = APIRouter(prefix="/agent-templates", tags=["agent-templates"])


def step_to_response(step: AgentStepModel) -> AgentStep:
    """Convert AgentStepModel to AgentStep response."""
    return AgentStep(
        id=step.id,
        template_id=step.template_id,
        name=step.name,
        agent_type=step.agent_type,
        prompt_template=step.prompt_template,
        output_format=step.output_format,
        position_x=step.position_x,
        position_y=step.position_y,
        metadata=step.step_metadata or {},
        model_version=step.model_version,
        thinking_budget=step.thinking_budget,
        reasoning_level=step.reasoning_level,
        parent_ids=[p.id for p in step.parents],
        child_ids=[c.id for c in step.children],
        created_at=step.created_at,
        updated_at=step.updated_at,
    )


def template_to_response(template: AgentTemplateModel) -> AgentTemplate:
    """Convert AgentTemplateModel to AgentTemplate response."""
    return AgentTemplate(
        id=template.id,
        name=template.name,
        description=template.description,
        metadata=template.template_metadata or {},
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


def template_to_response_with_steps(template: AgentTemplateModel) -> AgentTemplateWithSteps:
    """Convert AgentTemplateModel to AgentTemplateWithSteps response."""
    steps = [step_to_response(s) for s in template.steps]

    # Build edges list from step relationships
    edges = []
    for step in template.steps:
        for child in step.children:
            edges.append(AgentStepEdge(parent_id=step.id, child_id=child.id))

    return AgentTemplateWithSteps(
        id=template.id,
        name=template.name,
        description=template.description,
        metadata=template.template_metadata or {},
        created_at=template.created_at,
        updated_at=template.updated_at,
        steps=steps,
        edges=edges,
    )


@router.get("", response_model=list[AgentTemplate])
def list_templates(db: Session = Depends(get_db)):
    templates = db.query(AgentTemplateModel).order_by(AgentTemplateModel.created_at.desc()).all()
    return [template_to_response(t) for t in templates]


@router.post("", response_model=AgentTemplateWithSteps, status_code=201)
def create_template(template: AgentTemplateCreate, db: Session = Depends(get_db)):
    # Create the template
    db_template = AgentTemplateModel(
        name=template.name,
        description=template.description,
        template_metadata=template.metadata,
    )
    db.add(db_template)
    db.flush()  # Get the template ID

    # Create steps (need to map indices to IDs for edges)
    step_index_to_id = {}
    for i, step_data in enumerate(template.steps):
        db_step = AgentStepModel(
            template_id=db_template.id,
            name=step_data.name,
            agent_type=step_data.agent_type.value,
            prompt_template=step_data.prompt_template,
            output_format=step_data.output_format.value,
            position_x=step_data.position_x,
            position_y=step_data.position_y,
            step_metadata=step_data.metadata,
            model_version=step_data.model_version,
            thinking_budget=step_data.thinking_budget,
            reasoning_level=step_data.reasoning_level,
        )
        db.add(db_step)
        db.flush()
        step_index_to_id[i] = db_step.id

    # Create edges (edges reference step indices in this creation request)
    for edge in template.edges:
        if edge.parent_id not in step_index_to_id or edge.child_id not in step_index_to_id:
            raise HTTPException(
                status_code=400,
                detail="Edge references unknown step index"
            )
        parent_id = step_index_to_id[edge.parent_id]
        child_id = step_index_to_id[edge.child_id]
        db.execute(agent_step_edges.insert().values(parent_id=parent_id, child_id=child_id))

    db.commit()
    db.refresh(db_template)

    return template_to_response_with_steps(db_template)


@router.get("/{template_id}", response_model=AgentTemplateWithSteps)
def get_template(template_id: int, db: Session = Depends(get_db)):
    template = db.query(AgentTemplateModel).filter(AgentTemplateModel.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template_to_response_with_steps(template)


@router.patch("/{template_id}", response_model=AgentTemplate)
def update_template(template_id: int, template: AgentTemplateUpdate, db: Session = Depends(get_db)):
    db_template = db.query(AgentTemplateModel).filter(AgentTemplateModel.id == template_id).first()
    if not db_template:
        raise HTTPException(status_code=404, detail="Template not found")

    update_data = template.model_dump(exclude_unset=True)

    # Map metadata to template_metadata for ORM
    if "metadata" in update_data:
        update_data["template_metadata"] = update_data.pop("metadata")

    for key, value in update_data.items():
        setattr(db_template, key, value)

    db.commit()
    db.refresh(db_template)

    return template_to_response(db_template)


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: int, db: Session = Depends(get_db)):
    template = db.query(AgentTemplateModel).filter(AgentTemplateModel.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    db.delete(template)
    db.commit()


# Step endpoints

@router.post("/{template_id}/steps", response_model=AgentStep, status_code=201)
def create_step(template_id: int, step: AgentStepCreate, db: Session = Depends(get_db)):
    template = db.query(AgentTemplateModel).filter(AgentTemplateModel.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    db_step = AgentStepModel(
        template_id=template_id,
        name=step.name,
        agent_type=step.agent_type.value,
        prompt_template=step.prompt_template,
        output_format=step.output_format.value,
        position_x=step.position_x,
        position_y=step.position_y,
        step_metadata=step.metadata,
        model_version=step.model_version,
        thinking_budget=step.thinking_budget,
        reasoning_level=step.reasoning_level,
    )
    db.add(db_step)
    db.commit()
    db.refresh(db_step)

    return step_to_response(db_step)


@router.patch("/{template_id}/steps/{step_id}", response_model=AgentStep)
def update_step(template_id: int, step_id: int, step: AgentStepUpdate, db: Session = Depends(get_db)):
    db_step = db.query(AgentStepModel).filter(
        AgentStepModel.id == step_id,
        AgentStepModel.template_id == template_id
    ).first()
    if not db_step:
        raise HTTPException(status_code=404, detail="Step not found")

    update_data = step.model_dump(exclude_unset=True)

    # Map metadata to step_metadata for ORM
    if "metadata" in update_data:
        update_data["step_metadata"] = update_data.pop("metadata")

    # Convert enums to strings for database
    if "agent_type" in update_data and update_data["agent_type"]:
        update_data["agent_type"] = update_data["agent_type"].value
    if "output_format" in update_data and update_data["output_format"]:
        update_data["output_format"] = update_data["output_format"].value

    for key, value in update_data.items():
        setattr(db_step, key, value)

    db.commit()
    db.refresh(db_step)

    return step_to_response(db_step)


@router.delete("/{template_id}/steps/{step_id}", status_code=204)
def delete_step(template_id: int, step_id: int, db: Session = Depends(get_db)):
    step = db.query(AgentStepModel).filter(
        AgentStepModel.id == step_id,
        AgentStepModel.template_id == template_id
    ).first()
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")

    db.delete(step)
    db.commit()


# Edge endpoints

@router.post("/{template_id}/edges", response_model=AgentStepEdge, status_code=201)
def create_edge(template_id: int, edge: AgentStepEdge, db: Session = Depends(get_db)):
    template = db.query(AgentTemplateModel).filter(AgentTemplateModel.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Verify both steps belong to this template
    parent = db.query(AgentStepModel).filter(
        AgentStepModel.id == edge.parent_id,
        AgentStepModel.template_id == template_id
    ).first()
    child = db.query(AgentStepModel).filter(
        AgentStepModel.id == edge.child_id,
        AgentStepModel.template_id == template_id
    ).first()

    if not parent or not child:
        raise HTTPException(status_code=400, detail="Steps not found in this template")

    # Check for existing edge
    existing = db.execute(
        agent_step_edges.select().where(
            (agent_step_edges.c.parent_id == edge.parent_id) &
            (agent_step_edges.c.child_id == edge.child_id)
        )
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Edge already exists")

    db.execute(agent_step_edges.insert().values(parent_id=edge.parent_id, child_id=edge.child_id))
    db.commit()

    return edge


@router.delete("/{template_id}/edges", status_code=204)
def delete_edge(template_id: int, edge: AgentStepEdge, db: Session = Depends(get_db)):
    template = db.query(AgentTemplateModel).filter(AgentTemplateModel.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    db.execute(
        agent_step_edges.delete().where(
            (agent_step_edges.c.parent_id == edge.parent_id) &
            (agent_step_edges.c.child_id == edge.child_id)
        )
    )
    db.commit()
