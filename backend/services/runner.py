"""DAG runner - execute nodes via CLI agents in tmux sessions."""

import asyncio
import subprocess
import re
import json
from collections import deque
from datetime import datetime
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Node, Edge, Run, NodeRun, NodeContext, AgentSession

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
                parent_context = get_parent_outputs(db, run_id, parent_ids)

                # Get attached context items
                node_contexts = db.query(NodeContext).filter(NodeContext.node_id == node_id).all()

                # Build full prompt
                full_prompt = build_prompt(node.prompt, parent_context, node_contexts)

                # Mark running
                session_name = f"run-{run_id}-node-{node_id}"
                node_run.status = "running"
                node_run.tmux_session = session_name
                node_run.started_at = datetime.utcnow().isoformat()
                db.commit()

                # Execute agent
                output = await call_agent(
                    node.agent_type, full_prompt, session_name,
                    db=db, run_id=run_id, node_run_id=node_run.id, title=node.title
                )

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


def build_prompt(prompt: str, parent_context: str, node_contexts: list = None) -> str:
    """Build the full prompt with context injection."""
    parts = []

    # Add attached context items (prepend mode)
    prepend_contexts = []
    append_contexts = []

    if node_contexts:
        for nc in sorted(node_contexts, key=lambda x: x.order):
            content = nc.context_item.processed_content
            if not content:
                continue

            if nc.injection_mode == "prepend":
                prepend_contexts.append(content)
            elif nc.injection_mode == "append":
                append_contexts.append(content)
            elif nc.injection_mode == "replace_placeholder" and nc.placeholder:
                prompt = prompt.replace(nc.placeholder, content)

    # Build final prompt
    if prepend_contexts:
        parts.append("## Attached Context:\n\n" + "\n\n---\n\n".join(prepend_contexts))

    if parent_context:
        parts.append(f"## Context from previous steps:\n\n{parent_context}")

    parts.append(f"## Your task:\n\n{prompt}")

    if append_contexts:
        parts.append("## Additional Context:\n\n" + "\n\n---\n\n".join(append_contexts))

    return "\n\n---\n\n".join(parts)


async def call_agent(agent_type: str, prompt: str, session_name: str, db=None, run_id: int = None, node_run_id: int = None, title: str = None) -> str:
    """Run agent via CLI in a tmux session."""
    import base64
    import tempfile
    import os

    # Write prompt to a temp file to avoid shell escaping issues
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(prompt)
        prompt_file = f.name

    # Build agent command
    if agent_type == "claude":
        agent_cmd = f'cat "{prompt_file}" | claude -p - ; rm "{prompt_file}"'
    elif agent_type == "codex":
        agent_cmd = f'codex exec "$(cat {prompt_file})" --full-auto ; rm "{prompt_file}"'
    elif agent_type == "gemini":
        agent_cmd = f'cat "{prompt_file}" | gemini -m gemini-2.5-pro --yolo ; rm "{prompt_file}"'
    else:
        os.unlink(prompt_file)
        raise ValueError(f"Unknown agent: {agent_type}")

    # Output file for capturing results
    output_file = f"/tmp/{session_name}.out"

    # Create tmux session and run command
    # Kill any existing session with this name
    await asyncio.create_subprocess_shell(f"tmux kill-session -t {session_name} 2>/dev/null")

    # Create new session and run command, capturing output
    tmux_cmd = f'tmux new-session -d -s {session_name} "({agent_cmd}) 2>&1 | tee {output_file}"'

    proc = await asyncio.create_subprocess_shell(
        tmux_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT
    )
    await proc.communicate()

    # Create AgentSession record if db provided
    agent_session = None
    if db and run_id and node_run_id:
        agent_session = AgentSession(
            run_id=run_id,
            node_run_id=node_run_id,
            tmux_session=session_name,
            agent_type=agent_type,
            title=title,
            status="running",
            started_at=datetime.utcnow().isoformat()
        )
        db.add(agent_session)
        db.commit()
        db.refresh(agent_session)

    # Wait for tmux session to finish
    while True:
        # Check if session still exists
        check = await asyncio.create_subprocess_shell(
            f"tmux has-session -t {session_name} 2>/dev/null",
            stdout=asyncio.subprocess.PIPE
        )
        await check.communicate()

        if check.returncode != 0:
            # Session ended
            break

        await asyncio.sleep(2)

    # Read output
    output = ""
    try:
        with open(output_file, 'r') as f:
            output = f.read()
        os.unlink(output_file)
    except:
        pass

    # Update AgentSession status
    if agent_session and db:
        agent_session.status = "done"
        agent_session.finished_at = datetime.utcnow().isoformat()
        db.commit()

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
