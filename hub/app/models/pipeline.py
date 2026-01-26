"""Multi-agent pipeline models for orchestrated execution with critics."""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field

from .enums import AgentType


class PipelinePhase(str, Enum):
    """Phases in the multi-agent pipeline."""
    IDEATION = "ideation"        # All agents parallel, same prompt
    SYNTHESIS = "synthesis"      # Claude merges + asks questions
    IMPLEMENTATION = "implement" # Codex executes plan
    CRITIC = "critic"           # N critics vote YES/NO


class PipelineStep(BaseModel):
    """A single step in the pipeline."""
    phase: PipelinePhase
    agents: list[AgentType]      # Which agents run (parallel if multiple)
    prompt_template: str
    wait_for_human: bool = False  # If true, pause and show red signal


class MultiAgentPipeline(BaseModel):
    """Configuration for a multi-agent pipeline execution."""
    name: str
    phases: list[PipelineStep]
    critics_per_model: int = 1   # N critics per model type (total = 3*N)
    critic_threshold: float = 0.5  # Majority needed to pass
    max_retries: int = 3         # Max implementation retries


class CriticVote(str, Enum):
    """Critic vote options."""
    YES = "YES"
    NO = "NO"


class CriticSeverity(str, Enum):
    """Severity level for NO votes."""
    MINOR = "minor"  # Code tweaks needed
    MAJOR = "major"  # Wrong approach, restart from ideation


class CriticResult(BaseModel):
    """Result from a single critic evaluation."""
    agent_type: AgentType
    vote: CriticVote
    severity: Optional[CriticSeverity] = None  # Only if NO
    reasoning: str
    feedback: Optional[str] = None  # Specific improvements if NO


class HumanFeedback(BaseModel):
    """Human response to synthesis questions."""
    answers: dict[str, str] = Field(default_factory=dict)  # question_id -> answer
    notes: Optional[str] = None  # Additional context from human
    approved: bool = True  # Whether to proceed with the plan


class IdeationResult(BaseModel):
    """Results from the ideation phase."""
    claude: Optional[str] = None
    codex: Optional[str] = None
    gemini: Optional[str] = None


class SynthesisResult(BaseModel):
    """Results from the synthesis phase."""
    agreements: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)
    final_plan: str = ""


class ImplementationResult(BaseModel):
    """Results from the implementation phase."""
    output: str
    artifacts: list[str] = Field(default_factory=list)  # File paths modified


class PipelineContext(BaseModel):
    """Full context passed through the pipeline."""
    node_id: int
    node_title: str
    node_description: Optional[str] = None
    parent_summaries: str = ""  # Context from parent nodes

    # Phase results (populated as pipeline progresses)
    ideation: Optional[IdeationResult] = None
    synthesis: Optional[SynthesisResult] = None
    human_input: Optional[HumanFeedback] = None
    implementation: Optional[ImplementationResult] = None
    critic_feedback: Optional[str] = None  # Aggregated feedback for retries

    # Execution state
    retry_count: int = 0
    current_phase: Optional[PipelinePhase] = None


class PipelineExecution(BaseModel):
    """Represents an active pipeline execution."""
    id: int
    node_id: int
    pipeline_name: str
    status: str = "pending"  # pending, running, needs_review, completed, failed
    current_phase: Optional[PipelinePhase] = None
    context: PipelineContext
    critic_results: list[CriticResult] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# Default Pipeline Definition
IDEATION_PROMPT = """## Task: {{node.title}}

{{node.description}}

## Context from dependencies:
{{parent_summaries}}

## Your Assignment:
Create a detailed plan (plan.md) for completing this task.
Include: approach, steps, potential issues, and estimated complexity.
"""

SYNTHESIS_PROMPT = """## Plans from all agents:

### Claude's Plan:
{{ideation.claude}}

### Codex's Plan:
{{ideation.codex}}

### Gemini's Plan:
{{ideation.gemini}}

## Your Task:
1. Identify AGREEMENTS between plans
2. Identify CONFLICTS or DISAGREEMENTS
3. List QUESTIONS for the human to clarify
4. Produce ONE final merged plan

Output format:
```
## Agreements
- ...

## Conflicts
- ...

## Questions for Human
1. ...
2. ...

## Final Plan
...
```
"""

IMPLEMENTATION_PROMPT = """## Final Plan (Human-Approved):
{{synthesis.final_plan}}

## Human Clarifications:
{{human_input}}

## Previous Critic Feedback (if retry):
{{critic_feedback}}

Execute this plan. Produce working code/artifacts.
"""

CRITIC_PROMPT = """## Original Task:
{{node.title}}
{{node.description}}

## Final Plan:
{{synthesis.final_plan}}

## Implementation Output:
{{implementation.output}}

## Your Role: CRITIC
Review the implementation against the original task and plan.

Respond EXACTLY in this format:
```
VOTE: YES or NO
SEVERITY: minor or major (only if NO - minor=code tweaks, major=wrong approach)
REASONING: Why you voted this way
FEEDBACK: Specific improvements if NO
```
"""


DEFAULT_PIPELINE = MultiAgentPipeline(
    name="Standard Multi-Agent Review",
    phases=[
        # Phase 1: All agents ideate in parallel
        PipelineStep(
            phase=PipelinePhase.IDEATION,
            agents=[AgentType.CLAUDE, AgentType.CODEX, AgentType.GEMINI],
            prompt_template=IDEATION_PROMPT,
        ),
        # Phase 2: Claude synthesizes
        PipelineStep(
            phase=PipelinePhase.SYNTHESIS,
            agents=[AgentType.CLAUDE],
            wait_for_human=True,  # RED SIGNAL - waits for human
            prompt_template=SYNTHESIS_PROMPT,
        ),
        # Phase 3: Codex implements
        PipelineStep(
            phase=PipelinePhase.IMPLEMENTATION,
            agents=[AgentType.CODEX],
            prompt_template=IMPLEMENTATION_PROMPT,
        ),
        # Phase 4: Critics vote (all 3 models, each x critics_per_model)
        PipelineStep(
            phase=PipelinePhase.CRITIC,
            agents=[AgentType.CLAUDE, AgentType.CODEX, AgentType.GEMINI],
            prompt_template=CRITIC_PROMPT,
        ),
    ],
    critics_per_model=1,  # 1 of each model = 3 total critics
    critic_threshold=0.5,
    max_retries=3,
)
