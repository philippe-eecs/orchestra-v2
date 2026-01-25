#!/usr/bin/env python3
"""Seed a demo project with nodes, tasks, executions, and runs.

Run from repo root:
  python hub/scripts/seed_demo_project.py
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path


def main() -> None:
    hub_dir = Path(__file__).resolve().parents[1]
    db_path = hub_dir / "orchestra.db"

    # Ensure a stable DB location regardless of cwd.
    os.environ.setdefault("ORCHESTRA_DATABASE_URL", f"sqlite:///{db_path}")
    sys.path.insert(0, str(hub_dir))

    from app.db.database import Base, SessionLocal, engine
    from app.db.seed_templates import seed_default_templates
    from app.db.models import (
        ProjectModel,
        NodeModel,
        TaskModel,
        ExecutionModel,
        StepRunModel,
        RunModel,
        AgentTemplateModel,
    )

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        seed_default_templates(db)

        project_name = "Orchestra Demo Project"
        existing = db.query(ProjectModel).filter(ProjectModel.name == project_name).first()
        if existing:
            print(f"Demo project already exists (id={existing.id}). Skipping.")
            return

        project = ProjectModel(
            name=project_name,
            description="A guided demo project showcasing nodes, tasks, and agent executions.",
        )
        db.add(project)
        db.flush()

        node_specs = [
            {
                "key": "goals",
                "title": "Define Product Goals",
                "description": "Establish the product vision, success metrics, and constraints.",
                "status": "completed",
                "agent_type": "claude",
                "prompt": "Draft a crisp product goal statement and measurable success criteria.",
                "context": "Target: mid-market teams adopting AI workflows.",
                "node_metadata": {
                    "resources": [
                        {
                            "kind": "url",
                            "title": "Vision doc",
                            "url": "https://example.com/vision",
                            "notes": "North-star narrative and KPI targets.",
                        }
                    ],
                    "extra": {"owner": "Product"},
                },
                "position_x": 120,
                "position_y": 120,
            },
            {
                "key": "research",
                "title": "Market Research",
                "description": "Summarize user pain points, competitors, and pricing anchors.",
                "status": "completed",
                "agent_type": "gemini",
                "prompt": "Summarize competitor feature gaps and pricing strategies.",
                "context": "Focus on workflow orchestration and agent tooling.",
                "node_metadata": {
                    "resources": [
                        {
                            "kind": "url",
                            "title": "Research notes",
                            "url": "https://example.com/research",
                        }
                    ],
                    "extra": {"owner": "Research"},
                },
                "position_x": 120,
                "position_y": 320,
            },
            {
                "key": "requirements",
                "title": "Scope & Requirements",
                "description": "Translate goals into a prioritized scope and delivery phases.",
                "status": "in_progress",
                "agent_type": "codex",
                "prompt": "Convert goals + research into a phased requirements list.",
                "context": "Phase 1 must ship in 6 weeks.",
                "node_metadata": {
                    "resources": [
                        {
                            "kind": "note",
                            "title": "Constraints",
                            "notes": "No new backend services; reuse hub infrastructure.",
                        }
                    ],
                    "extra": {"owner": "PM"},
                },
                "position_x": 420,
                "position_y": 220,
            },
            {
                "key": "architecture",
                "title": "Architecture & Milestones",
                "description": "Define the system layout, integration points, and milestones.",
                "status": "pending",
                "agent_type": "claude",
                "prompt": "Propose architecture milestones with risks and dependencies.",
                "context": "Focus on desktop + hub capabilities.",
                "node_metadata": {
                    "resources": [],
                    "extra": {"owner": "Engineering"},
                },
                "position_x": 720,
                "position_y": 220,
            },
            {
                "key": "implementation",
                "title": "Implementation Plan",
                "description": "Break the work into epics, stories, and test checkpoints.",
                "status": "pending",
                "agent_type": "codex",
                "prompt": "Draft an implementation plan with story breakdown and tests.",
                "context": "Use existing executor + templates where possible.",
                "node_metadata": {
                    "resources": [],
                    "extra": {"owner": "Engineering"},
                },
                "position_x": 1020,
                "position_y": 220,
            },
            {
                "key": "launch",
                "title": "QA & Launch Checklist",
                "description": "Define QA gates, rollout steps, and monitoring plan.",
                "status": "pending",
                "agent_type": "gemini",
                "prompt": "Generate QA checklist and phased rollout plan.",
                "context": "Aim for 2-week beta then GA.",
                "node_metadata": {
                    "resources": [],
                    "extra": {"owner": "Operations"},
                },
                "position_x": 1320,
                "position_y": 220,
            },
        ]

        nodes: dict[str, NodeModel] = {}
        for spec in node_specs:
            node = NodeModel(
                project_id=project.id,
                title=spec["title"],
                description=spec["description"],
                status=spec["status"],
                agent_type=spec["agent_type"],
                prompt=spec["prompt"],
                context=spec["context"],
                node_metadata=spec["node_metadata"],
                position_x=spec["position_x"],
                position_y=spec["position_y"],
            )
            db.add(node)
            db.flush()
            nodes[spec["key"]] = node

        # Dependencies (parents)
        nodes["requirements"].parents = [nodes["goals"], nodes["research"]]
        nodes["architecture"].parents = [nodes["requirements"]]
        nodes["implementation"].parents = [nodes["architecture"]]
        nodes["launch"].parents = [nodes["implementation"]]

        # Tasks
        tasks = [
            TaskModel(
                project_id=project.id,
                title="Draft PRD v1",
                description="Summarize problem statement, scope, and constraints.",
                priority=2,
            ),
            TaskModel(
                project_id=project.id,
                title="Schedule kickoff",
                description="Invite stakeholders and align on milestones.",
                priority=1,
            ),
            TaskModel(
                project_id=project.id,
                title="Compile competitive matrix",
                description="Map competitor features and pricing.",
                priority=0,
            ),
        ]
        for task in tasks:
            db.add(task)

        # Create demo executions using seeded templates.
        now = datetime.utcnow()
        template_review = db.query(AgentTemplateModel).filter(
            AgentTemplateModel.name == "Multi-Agent Code Review"
        ).first()
        template_bug = db.query(AgentTemplateModel).filter(
            AgentTemplateModel.name == "Bug Investigation"
        ).first()

        if template_review:
            exec_completed = ExecutionModel(
                project_id=project.id,
                node_id=nodes["implementation"].id,
                template_id=template_review.id,
                status="completed",
                tmux_session="exec-demo-1",
                execution_metadata={
                    "context": {
                        "code": "def demo():\n    return 'hello'",
                        "node": {"title": nodes["implementation"].title},
                    },
                    "_create_worktree": False,
                },
                started_at=now - timedelta(hours=4),
                finished_at=now - timedelta(hours=3, minutes=30),
            )
            db.add(exec_completed)
            db.flush()

            for step in template_review.steps:
                db.add(StepRunModel(
                    execution_id=exec_completed.id,
                    step_id=step.id,
                    agent_type=step.agent_type,
                    prompt=f"Demo prompt for {step.name}",
                    status="completed",
                    output=f"Demo output for {step.name} (summary only).",
                    started_at=now - timedelta(hours=4),
                    finished_at=now - timedelta(hours=3, minutes=45),
                ))

        if template_bug:
            exec_running = ExecutionModel(
                project_id=project.id,
                node_id=nodes["launch"].id,
                template_id=template_bug.id,
                status="running",
                tmux_session="exec-demo-2",
                execution_metadata={
                    "context": {
                        "screenshot": "Demo screenshot placeholder",
                        "node": {"title": nodes["launch"].title},
                    },
                    "_create_worktree": False,
                },
                started_at=now - timedelta(minutes=20),
            )
            db.add(exec_running)
            db.flush()

            for idx, step in enumerate(template_bug.steps):
                status = "running" if idx == 0 else "pending"
                db.add(StepRunModel(
                    execution_id=exec_running.id,
                    step_id=step.id,
                    agent_type=step.agent_type,
                    prompt=f"Demo prompt for {step.name}",
                    status=status,
                    output=None,
                ))

        # Legacy run entry for quick run history
        db.add(RunModel(
            project_id=project.id,
            node_id=nodes["research"].id,
            agent_type="gemini",
            prompt="Summarize market signals for orchestration tools.",
            status="completed",
            output="Demo summary output.",
            started_at=now - timedelta(hours=2),
            finished_at=now - timedelta(hours=1, minutes=50),
        ))

        db.commit()
        print(f"Seeded demo project '{project_name}' (id={project.id}).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
