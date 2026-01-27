"""DAG runner for Orchestra - Simple blocks, DAG-based parallelism."""

import asyncio
import subprocess
import re
import tempfile
import os
from collections import deque
from datetime import datetime
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Block, Edge, Run, BlockRun, BlockContext, Deliverable

from services.validators import validate_conditions, determine_block_status


def run_graph(run_id: int):
    """Execute a graph run. Called as background task."""
    asyncio.run(_run_graph_async(run_id))


async def _run_graph_async(run_id: int):
    db = SessionLocal()
    try:
        run = db.query(Run).filter(Run.id == run_id).first()
        if not run:
            return

        blocks = db.query(Block).filter(Block.graph_id == run.graph_id).all()
        edges = db.query(Edge).filter(Edge.graph_id == run.graph_id).all()

        # Topological sort
        try:
            order = topo_sort(blocks, edges)
        except ValueError as e:
            run.status = "error"
            run.error = str(e)
            db.commit()
            return

        # Execute blocks in order (blocks at same level run in parallel)
        for block_id in order:
            block = next(b for b in blocks if b.id == block_id)
            block_run = db.query(BlockRun).filter(
                BlockRun.run_id == run_id,
                BlockRun.block_id == block_id
            ).first()

            try:
                await execute_block(block, block_run, run_id, edges, db)
            except Exception as e:
                block_run.status = "red"
                block_run.error = str(e)
                block_run.finished_at = datetime.utcnow().isoformat()
                run.status = "error"
                run.error = f"Block '{block.title}' failed: {e}"
                db.commit()
                return

        # Check if all blocks are done (green or done without conditions)
        all_done = all(
            br.status in ("green", "done")
            for br in db.query(BlockRun).filter(BlockRun.run_id == run_id).all()
        )
        any_pending = any(
            br.status == "validating"
            for br in db.query(BlockRun).filter(BlockRun.run_id == run_id).all()
        )

        if any_pending:
            run.status = "validating"
        elif all_done:
            run.status = "done"
        else:
            run.status = "error"
        db.commit()

    finally:
        db.close()


async def execute_block(block: Block, block_run: BlockRun, run_id: int, edges: list, db: Session):
    """Execute a single block - one agent, one task."""

    # Check parent blocks are done
    parent_ids = [e.parent_id for e in edges if e.child_id == block.id]
    for parent_id in parent_ids:
        parent_run = db.query(BlockRun).filter(
            BlockRun.run_id == run_id,
            BlockRun.block_id == parent_id
        ).first()
        if parent_run and parent_run.status not in ("green", "done"):
            block_run.status = "blocked"
            db.commit()
            return

    # Mark as running
    block_run.status = "running"
    block_run.started_at = datetime.utcnow().isoformat()
    db.commit()

    # Get parent outputs for context
    parent_context = get_parent_outputs(db, run_id, parent_ids)

    # Get attached context items
    block_contexts = db.query(BlockContext).filter(BlockContext.block_id == block.id).all()

    # Check if block has a prompt
    if not block.prompt:
        # No prompt configured, mark as done
        block_run.status = "done"
        block_run.output = "(No prompt configured)"
        block_run.finished_at = datetime.utcnow().isoformat()
        db.commit()
        return

    # Build full prompt with context
    full_prompt = build_prompt(block.prompt, parent_context, block_contexts)

    # Create session name
    session_name = f"run-{run_id}-block-{block.id}"

    # Run the agent
    output = await call_agent(
        agent_type=block.agent_type or "claude",
        prompt=full_prompt,
        session_name=session_name
    )

    block_run.output = output
    block_run.tmux_session = session_name

    # Extract deliverables from output
    deliverables = extract_artifacts(output)
    for d in deliverables:
        deliv = Deliverable(
            block_run_id=block_run.id,
            type=d.get("type"),
            url=d.get("url"),
            path=d.get("path"),
            extra=d
        )
        db.add(deliv)
    db.commit()

    # Validate win conditions (if any)
    win_conditions = block.win_conditions or []
    if win_conditions:
        block_run.status = "validating"
        db.commit()

        condition_results = await validate_conditions(block, block_run, db, run_id)
        block_run.condition_results = condition_results

        # Determine final status
        block_run.status = determine_block_status(condition_results)
    else:
        # No win conditions = done
        block_run.status = "done"

    block_run.finished_at = datetime.utcnow().isoformat()
    db.commit()


def topo_sort(blocks: list[Block], edges: list[Edge]) -> list[int]:
    """Kahn's algorithm for topological sort."""
    in_degree = {b.id: 0 for b in blocks}
    children = {b.id: [] for b in blocks}

    for e in edges:
        in_degree[e.child_id] += 1
        children[e.parent_id].append(e.child_id)

    queue = deque([b.id for b in blocks if in_degree[b.id] == 0])
    order = []

    while queue:
        block_id = queue.popleft()
        order.append(block_id)
        for child_id in children[block_id]:
            in_degree[child_id] -= 1
            if in_degree[child_id] == 0:
                queue.append(child_id)

    if len(order) != len(blocks):
        raise ValueError("Graph has a cycle")

    return order


def get_parent_outputs(db: Session, run_id: int, parent_ids: list[int]) -> str:
    """Get outputs from parent blocks."""
    if not parent_ids:
        return ""

    outputs = []
    for parent_id in parent_ids:
        block_run = db.query(BlockRun).filter(
            BlockRun.run_id == run_id,
            BlockRun.block_id == parent_id
        ).first()
        if block_run and block_run.output:
            outputs.append(f"### {block_run.block.title}\n{block_run.output}")

    return "\n\n---\n\n".join(outputs)


def build_prompt(prompt: str, parent_context: str, block_contexts: list = None) -> str:
    """Build the full prompt with context injection."""
    parts = []

    # Add attached context items (prepend mode)
    prepend_contexts = []
    append_contexts = []

    if block_contexts:
        for bc in sorted(block_contexts, key=lambda x: x.order):
            content = bc.context_item.processed_content
            if not content:
                continue

            if bc.injection_mode == "prepend":
                prepend_contexts.append(content)
            elif bc.injection_mode == "append":
                append_contexts.append(content)
            elif bc.injection_mode == "replace_placeholder" and bc.placeholder:
                prompt = prompt.replace(bc.placeholder, content)

    # Build final prompt
    if prepend_contexts:
        parts.append("## Attached Context:\n\n" + "\n\n---\n\n".join(prepend_contexts))

    if parent_context:
        parts.append(f"## Context from previous steps:\n\n{parent_context}")

    parts.append(f"## Your task:\n\n{prompt}")

    if append_contexts:
        parts.append("## Additional Context:\n\n" + "\n\n---\n\n".join(append_contexts))

    return "\n\n---\n\n".join(parts)


async def call_agent(agent_type: str, prompt: str, session_name: str) -> str:
    """Run agent via CLI in a tmux session."""

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

    # Wait for tmux session to finish
    while True:
        check = await asyncio.create_subprocess_shell(
            f"tmux has-session -t {session_name} 2>/dev/null",
            stdout=asyncio.subprocess.PIPE
        )
        await check.communicate()

        if check.returncode != 0:
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
