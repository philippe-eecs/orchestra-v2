"""
DAGExecutor - Orchestrates multi-step agent pipelines.

Executes steps in the correct order based on DAG dependencies,
running parallel steps concurrently for efficiency.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Optional, Callable, Awaitable, Any

from .step_executor import StepExecutor, StepResult

logger = logging.getLogger(__name__)


@dataclass
class DAGStep:
    """A step in the DAG to execute."""
    id: int
    name: str
    agent_type: str
    prompt: str  # Already resolved with context
    parent_ids: list[int] = field(default_factory=list)
    child_ids: list[int] = field(default_factory=list)


@dataclass
class DAGExecutionResult:
    """Result of executing the entire DAG."""
    success: bool
    step_results: dict[int, StepResult]
    error: Optional[str] = None


class DAGExecutor:
    """Orchestrates execution of multi-step agent pipelines."""

    def __init__(
        self,
        on_step_start: Optional[Callable[[int, str], Awaitable[None]]] = None,
        on_step_complete: Optional[Callable[[int, StepResult], Awaitable[None]]] = None,
        on_output: Optional[Callable[[int, str], Awaitable[None]]] = None
    ):
        """
        Args:
            on_step_start: Called when a step begins (step_id, step_name)
            on_step_complete: Called when a step finishes (step_id, result)
            on_output: Called for streaming output (step_id, output_chunk)
        """
        self.on_step_start = on_step_start
        self.on_step_complete = on_step_complete
        self.on_output = on_output

        self.step_executor = StepExecutor(on_output=on_output)

    async def execute(
        self,
        steps: list[DAGStep],
        working_dir: Optional[str] = None,
        context: Optional[dict[str, Any]] = None
    ) -> DAGExecutionResult:
        """
        Execute all steps in the DAG respecting dependencies.

        Steps without dependencies run first. As steps complete,
        their children become eligible to run. Steps with the same
        dependencies run in parallel.
        """
        if not steps:
            return DAGExecutionResult(success=True, step_results={})

        step_map = {s.id: s for s in steps}
        results: dict[int, StepResult] = {}
        completed: set[int] = set()
        failed: set[int] = set()

        # Build dependency tracking
        pending_deps: dict[int, set[int]] = {
            s.id: set(s.parent_ids) for s in steps
        }

        async def can_run(step_id: int) -> bool:
            """Check if all dependencies are satisfied."""
            return all(
                dep_id in completed
                for dep_id in pending_deps[step_id]
            )

        async def execute_step(step: DAGStep) -> StepResult:
            """Execute a single step and update tracking."""
            if self.on_step_start:
                await self.on_step_start(step.id, step.name)

            # Resolve parent step outputs in the prompt
            resolved_prompt = step.prompt
            for parent_id in step.parent_ids:
                if parent_id in results:
                    parent_step = step_map[parent_id]
                    parent_output = results[parent_id].output or ""
                    # Replace {{Parent Step Name}} with parent's output
                    placeholder = "{{" + parent_step.name + "}}"
                    resolved_prompt = resolved_prompt.replace(placeholder, parent_output)

            result = await self.step_executor.execute(
                step_id=step.id,
                agent_type=step.agent_type,
                prompt=resolved_prompt,
                working_dir=working_dir
            )

            if result.success:
                completed.add(step.id)
            else:
                failed.add(step.id)

            results[step.id] = result

            if self.on_step_complete:
                await self.on_step_complete(step.id, result)

            return result

        # Execute in waves until all done
        while len(completed) + len(failed) < len(steps):
            # Find runnable steps
            runnable = [
                step_map[sid]
                for sid in (set(step_map.keys()) - completed - failed)
                if await can_run(sid)
            ]

            if not runnable:
                # Deadlock or all remaining steps have failed dependencies
                remaining = set(step_map.keys()) - completed - failed
                logger.error(f"Cannot proceed: {len(remaining)} steps blocked")
                return DAGExecutionResult(
                    success=False,
                    step_results=results,
                    error=f"Deadlock: {len(remaining)} steps cannot run"
                )

            # Run this wave in parallel
            logger.info(f"Running wave of {len(runnable)} steps: {[s.name for s in runnable]}")

            await asyncio.gather(*[
                execute_step(step) for step in runnable
            ])

        # Check overall success
        all_success = len(failed) == 0

        return DAGExecutionResult(
            success=all_success,
            step_results=results,
            error=f"{len(failed)} steps failed" if not all_success else None
        )

    @staticmethod
    def build_dag_from_template(
        steps: list[dict],
        edges: list[dict],
        context: dict[str, Any]
    ) -> list[DAGStep]:
        """
        Build DAGStep list from template data.

        Resolves prompt templates with the provided context.
        """
        # Build child/parent relationships
        parent_map: dict[int, list[int]] = {}
        child_map: dict[int, list[int]] = {}

        for edge in edges:
            parent_id = edge["parent_id"]
            child_id = edge["child_id"]

            if child_id not in parent_map:
                parent_map[child_id] = []
            parent_map[child_id].append(parent_id)

            if parent_id not in child_map:
                child_map[parent_id] = []
            child_map[parent_id].append(child_id)

        dag_steps = []
        for step in steps:
            # Resolve prompt template with context variables
            prompt = step["prompt_template"]

            # Handle simple {{key}} format
            for key, value in context.items():
                if isinstance(value, dict):
                    # Handle nested: {{key.subkey}} and {{context.key.subkey}}
                    for subkey, subvalue in value.items():
                        prompt = prompt.replace(f"{{{{{key}.{subkey}}}}}", str(subvalue or ""))
                        prompt = prompt.replace(f"{{{{context.{key}.{subkey}}}}}", str(subvalue or ""))
                else:
                    # Handle simple: {{key}} and {{context.key}}
                    prompt = prompt.replace(f"{{{{{key}}}}}", str(value or ""))
                    prompt = prompt.replace(f"{{{{context.{key}}}}}", str(value or ""))

            dag_steps.append(DAGStep(
                id=step["id"],
                name=step["name"],
                agent_type=step["agent_type"],
                prompt=prompt,
                parent_ids=parent_map.get(step["id"], []),
                child_ids=child_map.get(step["id"], [])
            ))

        return dag_steps
