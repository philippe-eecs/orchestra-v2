"""DAG runner - execute nodes via CLI agents in tmux sessions."""

import asyncio
import subprocess
import re
import json
from collections import deque
from datetime import datetime
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Node, Edge, Run, NodeRun

VM_HOST = "root@159.65.109.198"


def run_graph(run_id: int):
    """Execute a graph run. Called as background task."""
    asyncio.run(_run_graph_async(run_id))


async def _run_graph_async(run_id: int):
    db = SessionLocal()
    try:
        run = db.query(Run).filter(Run.id == run_id).first()
        if not run:
            return

        nodes = db.query(Node).filter(Node.graph_id == run.graph_id).all()
        edges = db.query(Edge).filter(Edge.graph_id == run.graph_id).all()

        # Topological sort
        try:
            order = topo_sort(nodes, edges)
        except ValueError as e:
            run.status = "error"
            run.error = str(e)
            db.commit()
            return

        # Execute in order
        for node_id in order:
            node = next(n for n in nodes if n.id == node_id)
            node_run = db.query(NodeRun).filter(
                NodeRun.run_id == run_id,
                NodeRun.node_id == node_id
            ).first()

            try:
                # Get parent outputs
                parent_ids = [e.parent_id for e in edges if e.child_id == node_id]
                context = get_parent_outputs(db, run_id, parent_ids)

                # Build full prompt
                full_prompt = build_prompt(node.prompt, context)

                # Mark running
                session_name = f"run-{run_id}-node-{node_id}"
                node_run.status = "running"
                node_run.tmux_session = session_name
                node_run.started_at = datetime.utcnow().isoformat()
                db.commit()

                # Execute agent
                output = await call_agent(node.agent_type, full_prompt, session_name)

                # Parse artifacts from output
                artifacts = extract_artifacts(output)

                node_run.output = output
                node_run.artifacts = artifacts
                node_run.status = "done"
                node_run.finished_at = datetime.utcnow().isoformat()
                db.commit()

            except Exception as e:
                node_run.status = "error"
                node_run.error = str(e)
                node_run.finished_at = datetime.utcnow().isoformat()
                run.status = "error"
                run.error = f"Node '{node.title}' failed: {e}"
                db.commit()
                return

        run.status = "done"
        db.commit()

    finally:
        db.close()


def topo_sort(nodes: list[Node], edges: list[Edge]) -> list[int]:
    """Kahn's algorithm."""
    in_degree = {n.id: 0 for n in nodes}
    children = {n.id: [] for n in nodes}

    for e in edges:
        in_degree[e.child_id] += 1
        children[e.parent_id].append(e.child_id)

    queue = deque([n.id for n in nodes if in_degree[n.id] == 0])
    order = []

    while queue:
        node_id = queue.popleft()
        order.append(node_id)
        for child_id in children[node_id]:
            in_degree[child_id] -= 1
            if in_degree[child_id] == 0:
                queue.append(child_id)

    if len(order) != len(nodes):
        raise ValueError("Graph has a cycle")

    return order


def get_parent_outputs(db: Session, run_id: int, parent_ids: list[int]) -> str:
    if not parent_ids:
        return ""

    outputs = []
    for parent_id in parent_ids:
        node_run = db.query(NodeRun).filter(
            NodeRun.run_id == run_id,
            NodeRun.node_id == parent_id
        ).first()
        if node_run and node_run.output:
            outputs.append(f"### {node_run.node.title}\n{node_run.output}")

    return "\n\n---\n\n".join(outputs)


def build_prompt(prompt: str, context: str) -> str:
    if not context:
        return prompt
    return f"## Context from previous steps:\n\n{context}\n\n---\n\n## Your task:\n\n{prompt}"


async def call_agent(agent_type: str, prompt: str, session_name: str) -> str:
    """Run agent via CLI."""
    import base64

    # Encode prompt as base64 to avoid escaping issues
    prompt_b64 = base64.b64encode(prompt.encode()).decode()

    # Build agent command
    if agent_type == "claude":
        cmd = f'echo "{prompt_b64}" | base64 -d | claude -p -'
    elif agent_type == "codex":
        cmd = f'codex exec "$(echo {prompt_b64} | base64 -d)" --full-auto'
    elif agent_type == "gemini":
        cmd = f'echo "{prompt_b64}" | base64 -d | gemini -m gemini-2.5-pro --yolo'
    else:
        raise ValueError(f"Unknown agent: {agent_type}")

    # Run directly (not in tmux for simplicity)
    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT
    )

    # Wait for completion
    stdout, _ = await proc.communicate()
    output = stdout.decode()

    return output


def extract_artifacts(output: str) -> list[dict]:
    """Extract URLs, PR links, file paths from agent output."""
    artifacts = []

    # GitHub PR URLs
    pr_pattern = r'https://github\.com/[^\s]+/pull/\d+'
    for match in re.findall(pr_pattern, output):
        artifacts.append({"type": "pr", "url": match})

    # GitHub URLs
    gh_pattern = r'https://github\.com/[^\s)>\]"]+'
    for match in re.findall(gh_pattern, output):
        if "/pull/" not in match and match not in [a.get("url") for a in artifacts]:
            artifacts.append({"type": "github", "url": match})

    # Generic URLs
    url_pattern = r'https?://[^\s)>\]"]+'
    for match in re.findall(url_pattern, output):
        if match not in [a.get("url") for a in artifacts]:
            artifacts.append({"type": "url", "url": match})

    # File paths mentioned (common patterns)
    file_pattern = r'(?:created|wrote|modified|edited|saved)\s+[`"]?([^\s`"]+\.[a-z]{1,4})[`"]?'
    for match in re.findall(file_pattern, output, re.IGNORECASE):
        artifacts.append({"type": "file", "path": match})

    return artifacts
