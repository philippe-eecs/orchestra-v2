"""Pipeline executor service for multi-agent orchestration with critics."""

import asyncio
import logging
import re
from typing import Optional
from datetime import datetime

from sqlalchemy.orm import Session

from app.db.models import NodeModel, ExecutionModel
from app.models.enums import NodeStatus, AgentType
from app.models.pipeline import (
    MultiAgentPipeline,
    PipelinePhase,
    PipelineStep,
    PipelineContext,
    IdeationResult,
    SynthesisResult,
    ImplementationResult,
    CriticResult,
    CriticVote,
    CriticSeverity,
    DEFAULT_PIPELINE,
)
from app.services.broadcast import manager

logger = logging.getLogger(__name__)


class PipelineExecutor:
    """Executes multi-agent pipelines with ideation, synthesis, implementation, and critic phases."""

    def __init__(self, db: Session, project_id: int):
        self.db = db
        self.project_id = project_id

    async def execute_node(
        self,
        node_id: int,
        pipeline: Optional[MultiAgentPipeline] = None
    ) -> PipelineContext:
        """Execute the full pipeline for a node."""
        if pipeline is None:
            pipeline = DEFAULT_PIPELINE

        node = self.db.query(NodeModel).filter(NodeModel.id == node_id).first()
        if not node:
            raise ValueError(f"Node {node_id} not found")

        # Build initial context
        context = await self._build_context(node)

        # Create execution record
        execution = self._create_execution(node_id, pipeline.name, context)

        try:
            # Phase 1: IDEATION (parallel)
            ideation_step = self._find_phase(pipeline, PipelinePhase.IDEATION)
            if ideation_step:
                context.current_phase = PipelinePhase.IDEATION
                await self._update_execution_context(execution, context)
                ideation_results = await self._run_ideation_phase(
                    ideation_step, context
                )
                context.ideation = ideation_results
                await self._update_execution_context(execution, context)

            # Phase 2: SYNTHESIS (Claude)
            synthesis_step = self._find_phase(pipeline, PipelinePhase.SYNTHESIS)
            if synthesis_step:
                context.current_phase = PipelinePhase.SYNTHESIS
                await self._update_execution_context(execution, context)
                synthesis_result = await self._run_synthesis_phase(
                    synthesis_step, context
                )
                context.synthesis = synthesis_result
                await self._update_execution_context(execution, context)

                # Wait for human if required
                if synthesis_step.wait_for_human:
                    await self._set_node_status(node_id, NodeStatus.NEEDS_REVIEW)
                    logger.info(f"Node {node_id} waiting for human review")
                    return context  # Execution will resume after human feedback

            # Phase 3 & 4: Implementation and Critics loop
            context = await self._run_implementation_critic_loop(
                node_id, pipeline, context, execution
            )

            # Mark node as completed
            await self._set_node_status(node_id, NodeStatus.COMPLETED)
            execution.status = "completed"
            execution.finished_at = datetime.utcnow()
            self.db.commit()

        except Exception as e:
            logger.error(f"Pipeline execution failed for node {node_id}: {e}")
            await self._set_node_status(node_id, NodeStatus.FAILED)
            execution.status = "failed"
            execution.finished_at = datetime.utcnow()
            self.db.commit()
            raise

        return context

    async def resume_after_human_input(
        self,
        node_id: int,
        pipeline: Optional[MultiAgentPipeline] = None
    ) -> PipelineContext:
        """Resume execution after human provides feedback."""
        if pipeline is None:
            pipeline = DEFAULT_PIPELINE

        # Get latest execution for node
        execution = self.db.query(ExecutionModel).filter(
            ExecutionModel.node_id == node_id,
            ExecutionModel.project_id == self.project_id,
        ).order_by(ExecutionModel.created_at.desc()).first()

        if not execution:
            raise ValueError(f"No execution found for node {node_id}")

        # Reconstruct context from execution metadata
        context_data = execution.execution_metadata.get("pipeline_context", {})
        context = PipelineContext(**context_data)

        # Continue with implementation and critic loop
        context = await self._run_implementation_critic_loop(
            node_id, pipeline, context, execution
        )

        # Mark node as completed
        await self._set_node_status(node_id, NodeStatus.COMPLETED)
        execution.status = "completed"
        execution.finished_at = datetime.utcnow()
        self.db.commit()

        return context

    async def _build_context(self, node: NodeModel) -> PipelineContext:
        """Build initial context from node and its parents."""
        # Get parent node summaries
        parent_summaries = []
        for parent in node.parents:
            # Get the latest completed execution output for parent
            summary = f"## {parent.title}\n"
            if parent.description:
                summary += f"{parent.description}\n"
            parent_summaries.append(summary)

        return PipelineContext(
            node_id=node.id,
            node_title=node.title,
            node_description=node.description,
            parent_summaries="\n\n".join(parent_summaries) if parent_summaries else "No dependencies",
        )

    def _create_execution(
        self,
        node_id: int,
        pipeline_name: str,
        context: PipelineContext
    ) -> ExecutionModel:
        """Create a new execution record."""
        execution = ExecutionModel(
            project_id=self.project_id,
            node_id=node_id,
            status="running",
            execution_metadata={
                "pipeline_name": pipeline_name,
                "pipeline_context": context.model_dump(),
            },
            started_at=datetime.utcnow(),
        )
        self.db.add(execution)
        self.db.commit()
        self.db.refresh(execution)
        return execution

    async def _update_execution_context(
        self,
        execution: ExecutionModel,
        context: PipelineContext
    ):
        """Update execution metadata with current context."""
        execution.execution_metadata = {
            **execution.execution_metadata,
            "pipeline_context": context.model_dump(),
        }
        execution.updated_at = datetime.utcnow()
        self.db.commit()

    def _find_phase(
        self,
        pipeline: MultiAgentPipeline,
        phase: PipelinePhase
    ) -> Optional[PipelineStep]:
        """Find a step by phase."""
        for step in pipeline.phases:
            if step.phase == phase:
                return step
        return None

    async def _run_ideation_phase(
        self,
        step: PipelineStep,
        context: PipelineContext
    ) -> IdeationResult:
        """Run ideation phase with all agents in parallel."""
        prompt = self._resolve_template(step.prompt_template, context)

        # Run all agents in parallel
        tasks = []
        for agent_type in step.agents:
            tasks.append(self._invoke_agent(agent_type, prompt))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Map results to agent types
        ideation = IdeationResult()
        for agent_type, result in zip(step.agents, results):
            if isinstance(result, Exception):
                logger.error(f"Agent {agent_type} failed in ideation: {result}")
                result = f"Error: {result}"

            if agent_type == AgentType.CLAUDE:
                ideation.claude = result
            elif agent_type == AgentType.CODEX:
                ideation.codex = result
            elif agent_type == AgentType.GEMINI:
                ideation.gemini = result

        return ideation

    async def _run_synthesis_phase(
        self,
        step: PipelineStep,
        context: PipelineContext
    ) -> SynthesisResult:
        """Run synthesis phase (Claude merges plans)."""
        prompt = self._resolve_template(step.prompt_template, context)

        # Use Claude for synthesis
        output = await self._invoke_agent(AgentType.CLAUDE, prompt)

        # Parse the synthesis output
        return self._parse_synthesis_output(output)

    async def _run_implementation_critic_loop(
        self,
        node_id: int,
        pipeline: MultiAgentPipeline,
        context: PipelineContext,
        execution: ExecutionModel
    ) -> PipelineContext:
        """Run implementation and critic phases in a loop until approval."""
        impl_step = self._find_phase(pipeline, PipelinePhase.IMPLEMENTATION)
        critic_step = self._find_phase(pipeline, PipelinePhase.CRITIC)

        while context.retry_count < pipeline.max_retries:
            # Phase 3: IMPLEMENTATION (Codex)
            if impl_step:
                context.current_phase = PipelinePhase.IMPLEMENTATION
                await self._update_execution_context(execution, context)
                await self._set_node_status(node_id, NodeStatus.IN_PROGRESS)

                implementation = await self._run_implementation_phase(
                    impl_step, context
                )
                context.implementation = implementation
                await self._update_execution_context(execution, context)

            # Phase 4: CRITICS (parallel)
            if critic_step:
                context.current_phase = PipelinePhase.CRITIC
                await self._update_execution_context(execution, context)

                critic_results = await self._run_critic_phase(
                    critic_step, context, pipeline.critics_per_model
                )

                # Vote
                yes_votes = sum(1 for c in critic_results if c.vote == CriticVote.YES)
                total_votes = len(critic_results)
                pass_threshold = yes_votes / total_votes >= pipeline.critic_threshold

                if pass_threshold:
                    logger.info(f"Node {node_id} passed critic review ({yes_votes}/{total_votes})")
                    return context

                # Failed - check severity
                no_votes = [c for c in critic_results if c.vote == CriticVote.NO]
                has_major = any(c.severity == CriticSeverity.MAJOR for c in no_votes)

                # Aggregate feedback
                context.critic_feedback = self._merge_critic_feedback(critic_results)

                if has_major:
                    # Major issues: need to restart from ideation
                    logger.info(f"Node {node_id} has major issues, needs re-ideation")
                    # For now, just fail - full restart would need separate handling
                    raise Exception("Major issues detected, manual intervention required")

                # Minor issues: retry implementation
                context.retry_count += 1
                logger.info(f"Node {node_id} retry {context.retry_count}/{pipeline.max_retries}")

        # Max retries exceeded
        raise Exception(f"Max retries ({pipeline.max_retries}) exceeded")

    async def _run_implementation_phase(
        self,
        step: PipelineStep,
        context: PipelineContext
    ) -> ImplementationResult:
        """Run implementation phase (Codex executes plan)."""
        prompt = self._resolve_template(step.prompt_template, context)

        # Use Codex for implementation
        output = await self._invoke_agent(AgentType.CODEX, prompt)

        return ImplementationResult(
            output=output,
            artifacts=[],  # Could parse file paths from output
        )

    async def _run_critic_phase(
        self,
        step: PipelineStep,
        context: PipelineContext,
        critics_per_model: int
    ) -> list[CriticResult]:
        """Run critic phase with multiple critics in parallel."""
        prompt = self._resolve_template(step.prompt_template, context)

        # Create tasks for all critics
        tasks = []
        agent_types = []
        for agent_type in step.agents:
            for _ in range(critics_per_model):
                tasks.append(self._invoke_agent(agent_type, prompt))
                agent_types.append(agent_type)

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Parse critic responses
        critic_results = []
        for agent_type, result in zip(agent_types, results):
            if isinstance(result, Exception):
                logger.error(f"Critic {agent_type} failed: {result}")
                continue

            parsed = self._parse_critic_output(result, agent_type)
            critic_results.append(parsed)

        return critic_results

    async def _invoke_agent(self, agent_type: AgentType, prompt: str) -> str:
        """Invoke an AI agent with the given prompt."""
        # This is a placeholder - actual implementation would call the CLI tools
        # For now, we'll simulate the agent response

        logger.info(f"Invoking {agent_type} agent...")

        # In production, this would call:
        # - claude -p "prompt" for Claude
        # - codex exec "prompt" for Codex
        # - gemini "prompt" for Gemini

        # Placeholder response
        return f"[{agent_type}] Agent response for prompt (length={len(prompt)})"

    def _resolve_template(self, template: str, context: PipelineContext) -> str:
        """Resolve template variables."""
        def replace_var(match):
            var_path = match.group(1)
            parts = var_path.split('.')

            # Handle context fields
            obj = context
            for part in parts:
                if hasattr(obj, part):
                    obj = getattr(obj, part)
                elif isinstance(obj, dict) and part in obj:
                    obj = obj[part]
                else:
                    return match.group(0)  # Keep original if not found

            return str(obj) if obj is not None else ""

        return re.sub(r'\{\{([^}]+)\}\}', replace_var, template)

    def _parse_synthesis_output(self, output: str) -> SynthesisResult:
        """Parse the synthesis output into structured result."""
        result = SynthesisResult()

        # Extract sections using regex
        agreements_match = re.search(r'## Agreements\n(.*?)(?=##|\Z)', output, re.DOTALL)
        conflicts_match = re.search(r'## Conflicts\n(.*?)(?=##|\Z)', output, re.DOTALL)
        questions_match = re.search(r'## Questions for Human\n(.*?)(?=##|\Z)', output, re.DOTALL)
        plan_match = re.search(r'## Final Plan\n(.*?)(?=##|\Z)', output, re.DOTALL)

        if agreements_match:
            result.agreements = self._parse_list(agreements_match.group(1))
        if conflicts_match:
            result.conflicts = self._parse_list(conflicts_match.group(1))
        if questions_match:
            result.questions = self._parse_list(questions_match.group(1))
        if plan_match:
            result.final_plan = plan_match.group(1).strip()

        return result

    def _parse_list(self, text: str) -> list[str]:
        """Parse a markdown list into items."""
        items = []
        for line in text.strip().split('\n'):
            line = line.strip()
            if line.startswith('- '):
                items.append(line[2:])
            elif re.match(r'\d+\.\s', line):
                items.append(re.sub(r'^\d+\.\s*', '', line))
        return items

    def _parse_critic_output(self, output: str, agent_type: AgentType) -> CriticResult:
        """Parse critic output into structured result."""
        vote = CriticVote.NO
        severity = None
        reasoning = ""
        feedback = None

        # Extract VOTE
        vote_match = re.search(r'VOTE:\s*(YES|NO)', output, re.IGNORECASE)
        if vote_match:
            vote = CriticVote.YES if vote_match.group(1).upper() == "YES" else CriticVote.NO

        # Extract SEVERITY (only if NO)
        if vote == CriticVote.NO:
            severity_match = re.search(r'SEVERITY:\s*(minor|major)', output, re.IGNORECASE)
            if severity_match:
                severity = CriticSeverity.MINOR if severity_match.group(1).lower() == "minor" else CriticSeverity.MAJOR

        # Extract REASONING
        reasoning_match = re.search(r'REASONING:\s*(.+?)(?=FEEDBACK:|$)', output, re.DOTALL | re.IGNORECASE)
        if reasoning_match:
            reasoning = reasoning_match.group(1).strip()

        # Extract FEEDBACK
        feedback_match = re.search(r'FEEDBACK:\s*(.+?)$', output, re.DOTALL | re.IGNORECASE)
        if feedback_match:
            feedback = feedback_match.group(1).strip()

        return CriticResult(
            agent_type=agent_type,
            vote=vote,
            severity=severity,
            reasoning=reasoning,
            feedback=feedback,
        )

    def _merge_critic_feedback(self, results: list[CriticResult]) -> str:
        """Merge feedback from all critics into a single string."""
        feedback_parts = []
        for i, result in enumerate(results, 1):
            if result.vote == CriticVote.NO and result.feedback:
                feedback_parts.append(f"Critic {i} ({result.agent_type}): {result.feedback}")
        return "\n\n".join(feedback_parts)

    async def _set_node_status(self, node_id: int, status: NodeStatus):
        """Update node status and broadcast."""
        node = self.db.query(NodeModel).filter(NodeModel.id == node_id).first()
        if node:
            node.status = status.value
            node.updated_at = datetime.utcnow()
            self.db.commit()

            await manager.broadcast(self.project_id, "node.updated", {
                "id": node_id,
                "status": status.value,
            })


# Helper to execute DAG in parallel
async def execute_dag(db: Session, project_id: int):
    """Execute all nodes in a project DAG respecting dependencies."""
    from app.db.models import NodeModel

    executor = PipelineExecutor(db, project_id)

    # Get all nodes ordered by dependencies
    nodes = db.query(NodeModel).filter(
        NodeModel.project_id == project_id,
        NodeModel.status == NodeStatus.PENDING.value,
    ).all()

    def all_parents_complete(node: NodeModel) -> bool:
        return all(p.status == NodeStatus.COMPLETED.value for p in node.parents)

    while nodes:
        # Find all nodes with satisfied dependencies
        ready = [n for n in nodes if all_parents_complete(n)]

        if not ready:
            # No nodes ready but some remain - possible cycle or blocked
            logger.warning(f"No ready nodes but {len(nodes)} remain")
            break

        # Execute all ready nodes in parallel
        tasks = [executor.execute_node(n.id) for n in ready]
        await asyncio.gather(*tasks, return_exceptions=True)

        # Remove executed nodes and refresh status
        executed_ids = {n.id for n in ready}
        nodes = [n for n in nodes if n.id not in executed_ids]

        # Refresh remaining nodes
        db.refresh(nodes)
