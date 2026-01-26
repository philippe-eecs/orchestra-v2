"""Multi-agent pipeline models for orchestrated execution with critics."""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field

from .enums import AgentType


class PipelinePhase(str, Enum):
    """Phases in the multi-agent pipeline."""
    RESEARCH = "research"        # NEW: Gemini web search for prior art
    IDEATION = "ideation"        # All agents parallel, same prompt
    SYNTHESIS = "synthesis"      # Claude merges + asks questions
    TOY_TESTS = "toy_tests"      # NEW: Quick experiments to validate approach
    IMPLEMENTATION = "implement" # Codex executes plan
    CRITIC = "critic"            # N critics vote YES/NO
    VALIDATION = "validation"    # NEW: Hook validation of deliverables


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


class ResearchResult(BaseModel):
    """Results from the research phase."""
    search_queries: list[str] = Field(default_factory=list)
    sources: list[dict] = Field(default_factory=list)  # [{title, url, insights}]
    summary: str = ""
    raw_output: str = ""  # Full Gemini output


class ToyTestResult(BaseModel):
    """Results from the toy tests phase."""
    tests_run: list[str] = Field(default_factory=list)
    results: list[dict] = Field(default_factory=list)  # [{test, passed, output}]
    all_passed: bool = True
    summary: str = ""
    raw_output: str = ""


class PipelineContext(BaseModel):
    """Full context passed through the pipeline."""
    node_id: int
    node_title: str
    node_description: Optional[str] = None
    parent_summaries: str = ""  # Context from parent nodes
    parent_deliverables: dict[str, str] = Field(default_factory=dict)  # name -> content

    # Phase results (populated as pipeline progresses)
    research: Optional[ResearchResult] = None
    ideation: Optional[IdeationResult] = None
    synthesis: Optional[SynthesisResult] = None
    human_input: Optional[HumanFeedback] = None
    toy_tests: Optional[ToyTestResult] = None
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

RESEARCH_PROMPT = """## Task: {{node.title}}

{{node.description}}

## Context from dependencies:
{{parent_summaries}}

## Your Assignment - RESEARCH:
Search the web and gather relevant sources for this task.

1. Identify 3-5 search queries that would find relevant prior art, papers, docs, or tutorials
2. For each source found, extract key insights relevant to the task
3. Summarize how these sources inform the approach

Output format (sources.md):
```markdown
## Search Queries
1. [query 1]
2. [query 2]
...

## Sources
### [Title](URL)
- Key insight 1
- Key insight 2

### [Title](URL)
- Key insight 1
- Key insight 2

## Summary
Brief synthesis of how these sources inform the approach...
```

IMPORTANT: Include actual URLs from your web search. This is the research phase - gather real information.
"""

IDEATION_PROMPT = """## Task: {{node.title}}

{{node.description}}

## Context from dependencies:
{{parent_summaries}}

## Research Findings:
{{research.summary}}

## Sources:
{{research.raw_output}}

## Your Assignment:
Create a detailed plan (plan.md) for completing this task.
Use the research findings to inform your approach.
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

TOY_TESTS_PROMPT = """## Final Plan (Human-Approved):
{{synthesis.final_plan}}

## Human Clarifications:
{{human_input}}

## Your Assignment - TOY TESTS:
Before full implementation, run quick experiments to validate key assumptions.

1. Identify 2-3 assumptions that could be validated with small tests
2. Write and run minimal code snippets to test these assumptions
3. Report results for each test

Output format (test_results.md):
```markdown
## Assumptions to Test
1. [assumption 1]
2. [assumption 2]

## Test Results

### Test 1: [assumption being tested]
```code
[minimal code snippet]
```
**Result:** PASS/FAIL
**Output:** [actual output]
**Implications:** [what this means for the plan]

### Test 2: ...

## Summary
- Tests passed: X/Y
- Adjustments needed: [any changes to the plan based on results]
```

If a test fails, explain what needs to change in the implementation approach.
"""

IMPLEMENTATION_PROMPT = """## Final Plan (Human-Approved):
{{synthesis.final_plan}}

## Human Clarifications:
{{human_input}}

## Toy Test Results:
{{toy_tests.summary}}

## Previous Critic Feedback (if retry):
{{critic_feedback}}

Execute this plan. Use the toy test results to guide implementation.
Produce working code/artifacts.
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
    name="Research-Driven Multi-Agent Pipeline",
    phases=[
        # Phase 1: RESEARCH - Gemini searches the web for prior art
        PipelineStep(
            phase=PipelinePhase.RESEARCH,
            agents=[AgentType.GEMINI],
            prompt_template=RESEARCH_PROMPT,
        ),
        # Phase 2: IDEATION - All agents create plans with research context
        PipelineStep(
            phase=PipelinePhase.IDEATION,
            agents=[AgentType.CLAUDE, AgentType.CODEX, AgentType.GEMINI],
            prompt_template=IDEATION_PROMPT,
        ),
        # Phase 3: SYNTHESIS - Claude merges plans, identifies conflicts
        PipelineStep(
            phase=PipelinePhase.SYNTHESIS,
            agents=[AgentType.CLAUDE],
            wait_for_human=True,  # RED SIGNAL - waits for human
            prompt_template=SYNTHESIS_PROMPT,
        ),
        # Phase 4: TOY TESTS - Codex runs quick experiments
        PipelineStep(
            phase=PipelinePhase.TOY_TESTS,
            agents=[AgentType.CODEX],
            wait_for_human=False,  # Auto-proceed unless tests fail
            prompt_template=TOY_TESTS_PROMPT,
        ),
        # Phase 5: IMPLEMENTATION - Codex executes the plan
        PipelineStep(
            phase=PipelinePhase.IMPLEMENTATION,
            agents=[AgentType.CODEX],
            prompt_template=IMPLEMENTATION_PROMPT,
        ),
        # Phase 6: CRITICS - All agents vote on the implementation
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
