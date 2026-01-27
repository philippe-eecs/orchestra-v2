"""Win condition validators for Orchestra V4."""

import asyncio
import subprocess
import re
from datetime import datetime
from sqlalchemy.orm import Session

from models import Block, BlockRun, HumanReview


async def validate_conditions(block: Block, block_run: BlockRun, db: Session, run_id: int) -> list:
    """Validate all win conditions for a block. Returns list of results."""
    results = []
    win_conditions = block.win_conditions or []

    for cond in win_conditions:
        cond_type = cond.get("type")

        if cond_type == "dependency":
            result = await validate_dependency(cond, block_run, db, run_id)
        elif cond_type == "test":
            result = await validate_test(cond)
        elif cond_type == "human":
            result = await validate_human(cond, block_run, db)
        elif cond_type == "llm_judge":
            result = await validate_llm_judge(cond, block_run)
        elif cond_type == "metric":
            result = await validate_metric(cond)
        else:
            result = {"type": cond_type, "passed": False, "details": f"Unknown condition type: {cond_type}"}

        results.append(result)

    return results


async def validate_dependency(cond: dict, block_run: BlockRun, db: Session, run_id: int) -> dict:
    """Check if dependent block is green."""
    from models import BlockRun as BR

    dep_block_id = cond.get("block_id")
    if not dep_block_id:
        return {"type": "dependency", "passed": False, "details": "No block_id specified"}

    dep_run = db.query(BR).filter(
        BR.run_id == run_id,
        BR.block_id == dep_block_id
    ).first()

    if not dep_run:
        return {"type": "dependency", "passed": False, "details": f"Block {dep_block_id} not found in run"}

    passed = dep_run.status == "green"
    return {
        "type": "dependency",
        "passed": passed,
        "details": f"Block {dep_block_id} is {dep_run.status}",
        "block_id": dep_block_id
    }


async def validate_test(cond: dict) -> dict:
    """Run test command and check exit code."""
    command = cond.get("command", "")
    if not command:
        return {"type": "test", "passed": False, "details": "No command specified"}

    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=cond.get("cwd")
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=300)
        output = stdout.decode() if stdout else ""

        passed = proc.returncode == 0
        return {
            "type": "test",
            "passed": passed,
            "details": output[-2000:] if len(output) > 2000 else output,
            "command": command,
            "exit_code": proc.returncode
        }
    except asyncio.TimeoutError:
        return {"type": "test", "passed": False, "details": "Test timed out after 5 minutes", "command": command}
    except Exception as e:
        return {"type": "test", "passed": False, "details": str(e), "command": command}


async def validate_human(cond: dict, block_run: BlockRun, db: Session) -> dict:
    """Create a human review request and mark as pending."""
    prompt = cond.get("prompt", "Please review and approve this block's output.")

    # Check if there's already a review for this block_run
    existing = db.query(HumanReview).filter(HumanReview.block_run_id == block_run.id).first()

    if existing:
        if existing.status == "approved":
            return {"type": "human", "passed": True, "details": existing.reviewer_notes or "Approved"}
        elif existing.status == "rejected":
            return {"type": "human", "passed": False, "details": existing.reviewer_notes or "Rejected"}
        else:
            return {"type": "human", "passed": None, "pending": True, "details": "Awaiting human review"}

    # Create new review request
    review = HumanReview(
        block_run_id=block_run.id,
        prompt=prompt,
        status="pending"
    )
    db.add(review)
    db.commit()

    return {"type": "human", "passed": None, "pending": True, "details": "Awaiting human review"}


async def validate_llm_judge(cond: dict, block_run: BlockRun) -> dict:
    """Use an LLM to evaluate the output."""
    judge_prompt = cond.get("prompt", "Is this output satisfactory?")
    agent = cond.get("agent", "claude")
    output = block_run.output or ""

    if not output:
        return {"type": "llm_judge", "passed": False, "details": "No output to evaluate"}

    # Build the evaluation prompt
    full_prompt = f"""You are evaluating the output of an AI agent.

## Evaluation Criteria
{judge_prompt}

## Output to Evaluate
{output[:10000]}

## Instructions
Respond with PASS if the output meets the criteria, or FAIL if it doesn't.
Then explain your reasoning in 1-2 sentences.

Format: PASS/FAIL: <reasoning>"""

    try:
        # Call the judge agent
        if agent == "claude":
            cmd = f'echo {repr(full_prompt)} | claude -p -'
        elif agent == "gemini":
            cmd = f'echo {repr(full_prompt)} | gemini -m gemini-2.5-pro -o text'
        else:
            cmd = f'echo {repr(full_prompt)} | claude -p -'

        proc = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=120)
        judgment = stdout.decode() if stdout else ""

        # Parse the judgment
        passed = "pass" in judgment.lower()[:50]
        return {
            "type": "llm_judge",
            "passed": passed,
            "details": judgment[:1000],
            "prompt": judge_prompt,
            "agent": agent
        }
    except asyncio.TimeoutError:
        return {"type": "llm_judge", "passed": False, "details": "Judge timed out"}
    except Exception as e:
        return {"type": "llm_judge", "passed": False, "details": str(e)}


async def validate_metric(cond: dict) -> dict:
    """Run a command and compare the output against a threshold."""
    command = cond.get("command", "")
    threshold = cond.get("threshold", 0)
    comparison = cond.get("comparison", ">=")  # >=, >, <=, <, ==

    if not command:
        return {"type": "metric", "passed": False, "details": "No command specified"}

    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=cond.get("cwd")
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=120)
        output = stdout.decode().strip() if stdout else ""

        # Try to extract a number from the output
        numbers = re.findall(r'[-+]?\d*\.?\d+', output)
        if not numbers:
            return {"type": "metric", "passed": False, "details": f"Could not extract number from: {output[:200]}"}

        value = float(numbers[-1])  # Use the last number found

        # Compare against threshold
        if comparison == ">=":
            passed = value >= threshold
        elif comparison == ">":
            passed = value > threshold
        elif comparison == "<=":
            passed = value <= threshold
        elif comparison == "<":
            passed = value < threshold
        elif comparison == "==":
            passed = value == threshold
        else:
            passed = value >= threshold

        return {
            "type": "metric",
            "passed": passed,
            "details": f"Value: {value} {comparison} {threshold}",
            "value": value,
            "threshold": threshold,
            "command": command
        }
    except asyncio.TimeoutError:
        return {"type": "metric", "passed": False, "details": "Metric command timed out"}
    except Exception as e:
        return {"type": "metric", "passed": False, "details": str(e)}


def all_conditions_passed(results: list) -> bool:
    """Check if all conditions passed (ignoring pending human reviews)."""
    for r in results:
        if r.get("pending"):
            return False
        if not r.get("passed"):
            return False
    return True


def has_pending_reviews(results: list) -> bool:
    """Check if there are any pending human reviews."""
    return any(r.get("pending") for r in results)


def determine_block_status(results: list) -> str:
    """Determine block status from condition results."""
    if not results:
        return "green"  # No conditions = auto-pass

    if has_pending_reviews(results):
        return "validating"  # Waiting for human review

    if all_conditions_passed(results):
        return "green"

    return "red"
