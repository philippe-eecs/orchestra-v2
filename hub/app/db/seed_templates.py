"""Default agent templates that ship with the application."""

from sqlalchemy.orm import Session
from app.db.models import AgentTemplateModel, AgentStepModel, agent_step_edges


DEFAULT_TEMPLATES = [
    # 1. Multi-Agent Code Review
    {
        "name": "Multi-Agent Code Review",
        "description": "Parallel security, bug, and architecture review synthesized into a prioritized report",
        "metadata": {"icon": "review", "is_default": True, "category": "review"},
        "steps": [
            {
                "name": "Security Review",
                "agent_type": "gemini",
                "prompt_template": """Analyze this code for security vulnerabilities:

{{code}}

Focus on:
- SQL injection
- XSS vulnerabilities
- Authentication/authorization issues
- Sensitive data exposure
- Input validation gaps

List each vulnerability with severity (critical/high/medium/low) and recommended fix.""",
                "output_format": "markdown",
                "position_x": 100,
                "position_y": 100,
            },
            {
                "name": "Bug Detection",
                "agent_type": "codex",
                "prompt_template": """Review this code for bugs and logic errors:

{{code}}

Look for:
- Off-by-one errors
- Null/undefined handling
- Race conditions
- Resource leaks
- Edge cases

For each bug found, explain the issue and provide a fix.""",
                "output_format": "markdown",
                "position_x": 100,
                "position_y": 250,
                "reasoning_level": "xhigh",
            },
            {
                "name": "Architecture Review",
                "agent_type": "claude",
                "prompt_template": """Review this code for architectural quality:

{{code}}

Evaluate:
- SOLID principles adherence
- Separation of concerns
- Code organization
- Naming conventions
- Error handling patterns
- Testability

Provide specific recommendations for improvement.""",
                "output_format": "markdown",
                "position_x": 100,
                "position_y": 400,
                "thinking_budget": 16000,
            },
            {
                "name": "Review Synthesis",
                "agent_type": "claude",
                "prompt_template": """Synthesize these code reviews into a prioritized action report:

**Security Review:**
{{Security Review}}

**Bug Detection:**
{{Bug Detection}}

**Architecture Review:**
{{Architecture Review}}

Create a unified report with:
1. Critical issues requiring immediate attention
2. High priority improvements
3. Medium priority suggestions
4. Low priority nice-to-haves

For each item, include the source review and specific action to take.""",
                "output_format": "markdown",
                "position_x": 400,
                "position_y": 250,
                "thinking_budget": 16000,
            },
        ],
        "edges": [
            {"parent_idx": 0, "child_idx": 3},  # Security -> Synthesis
            {"parent_idx": 1, "child_idx": 3},  # Bugs -> Synthesis
            {"parent_idx": 2, "child_idx": 3},  # Architecture -> Synthesis
        ],
    },
    # 2. Bug Investigation
    {
        "name": "Bug Investigation",
        "description": "Sequential investigation from visual symptoms to root cause and fix",
        "metadata": {"icon": "bug", "is_default": True, "category": "debug"},
        "steps": [
            {
                "name": "Screenshot Analysis",
                "agent_type": "gemini",
                "prompt_template": """Analyze this screenshot of a bug:

{{screenshot}}

Describe:
1. What is the expected behavior?
2. What is the actual behavior shown?
3. Any visible error messages or indicators
4. UI elements involved
5. Potential component or area of code affected""",
                "output_format": "markdown",
                "position_x": 100,
                "position_y": 150,
            },
            {
                "name": "Code Trace",
                "agent_type": "codex",
                "prompt_template": """Based on this bug analysis, trace through the code:

**Bug Description:**
{{Screenshot Analysis}}

**Codebase context:**
{{codebase_context}}

Trace the execution path that could lead to this bug:
1. Entry point (event handler, API call, etc.)
2. Intermediate function calls
3. Data transformations
4. Potential failure points

Identify the most likely location of the bug.""",
                "output_format": "markdown",
                "position_x": 300,
                "position_y": 150,
                "reasoning_level": "xhigh",
            },
            {
                "name": "Root Cause Analysis",
                "agent_type": "claude",
                "prompt_template": """Determine the root cause and provide a fix:

**Bug Analysis:**
{{Screenshot Analysis}}

**Code Trace:**
{{Code Trace}}

Provide:
1. Root cause explanation
2. Why the bug occurs
3. Recommended fix (with code)
4. How to test the fix
5. Potential regression risks""",
                "output_format": "markdown",
                "position_x": 500,
                "position_y": 150,
                "thinking_budget": 16000,
            },
        ],
        "edges": [
            {"parent_idx": 0, "child_idx": 1},  # Screenshot -> Trace
            {"parent_idx": 1, "child_idx": 2},  # Trace -> Root Cause
        ],
    },
    # 3. Feature Implementation
    {
        "name": "Feature Implementation",
        "description": "Structured feature development from spec to code and tests",
        "metadata": {"icon": "feature", "is_default": True, "category": "build"},
        "steps": [
            {
                "name": "Spec Analysis",
                "agent_type": "gemini",
                "prompt_template": """Analyze this feature specification:

{{spec}}

Extract and organize:
1. Core requirements (must-have)
2. Optional requirements (nice-to-have)
3. Acceptance criteria
4. Edge cases to handle
5. Dependencies on existing code
6. UI/UX requirements (if applicable)""",
                "output_format": "markdown",
                "position_x": 100,
                "position_y": 150,
            },
            {
                "name": "Implementation Plan",
                "agent_type": "claude",
                "prompt_template": """Create an implementation plan based on:

**Requirements:**
{{Spec Analysis}}

**Existing codebase:**
{{codebase_context}}

Provide:
1. Files to create/modify
2. Data models needed
3. API endpoints (if any)
4. Component structure
5. State management approach
6. Step-by-step implementation order""",
                "output_format": "markdown",
                "position_x": 300,
                "position_y": 150,
                "thinking_budget": 16000,
            },
            {
                "name": "Generate Code",
                "agent_type": "codex",
                "prompt_template": """Implement the feature based on this plan:

**Requirements:**
{{Spec Analysis}}

**Implementation Plan:**
{{Implementation Plan}}

Generate clean, production-ready code following the plan. Include:
- Type annotations
- Error handling
- Comments for complex logic""",
                "output_format": "code",
                "position_x": 500,
                "position_y": 100,
                "reasoning_level": "xhigh",
            },
            {
                "name": "Generate Tests",
                "agent_type": "codex",
                "prompt_template": """Write tests for this feature:

**Requirements:**
{{Spec Analysis}}

**Implementation:**
{{Generate Code}}

Create comprehensive tests including:
- Unit tests for each function
- Integration tests for the feature
- Edge case tests
- Error scenario tests""",
                "output_format": "code",
                "position_x": 500,
                "position_y": 250,
                "reasoning_level": "high",
            },
        ],
        "edges": [
            {"parent_idx": 0, "child_idx": 1},  # Spec -> Plan
            {"parent_idx": 1, "child_idx": 2},  # Plan -> Code
            {"parent_idx": 1, "child_idx": 3},  # Plan -> Tests
        ],
    },
    # 4. Documentation Generator
    {
        "name": "Documentation Generator",
        "description": "Generate comprehensive documentation from code analysis",
        "metadata": {"icon": "docs", "is_default": True, "category": "docs"},
        "steps": [
            {
                "name": "Code Analysis",
                "agent_type": "codex",
                "prompt_template": """Analyze this codebase:

{{code}}

Extract:
1. Module/package structure
2. Public interfaces (classes, functions, types)
3. Dependencies and imports
4. Configuration options
5. Entry points""",
                "output_format": "json",
                "position_x": 100,
                "position_y": 150,
                "reasoning_level": "high",
            },
            {
                "name": "API Documentation",
                "agent_type": "claude",
                "prompt_template": """Generate API documentation from this analysis:

{{Code Analysis}}

Create documentation for each public interface:
- Function/method signature
- Parameter descriptions
- Return value description
- Exceptions/errors
- Example usage""",
                "output_format": "markdown",
                "position_x": 300,
                "position_y": 100,
                "thinking_budget": 8000,
            },
            {
                "name": "Usage Examples",
                "agent_type": "claude",
                "prompt_template": """Create usage examples based on:

{{Code Analysis}}

Write practical examples showing:
- Basic usage
- Common patterns
- Advanced use cases
- Integration scenarios

Each example should be complete and runnable.""",
                "output_format": "markdown",
                "position_x": 300,
                "position_y": 250,
                "thinking_budget": 8000,
            },
            {
                "name": "Final Documentation",
                "agent_type": "claude",
                "prompt_template": """Compile final documentation:

**API Reference:**
{{API Documentation}}

**Examples:**
{{Usage Examples}}

Create a polished documentation page with:
1. Overview and introduction
2. Quick start guide
3. API reference (organized)
4. Examples section
5. FAQ/Troubleshooting""",
                "output_format": "markdown",
                "position_x": 500,
                "position_y": 150,
                "thinking_budget": 16000,
            },
        ],
        "edges": [
            {"parent_idx": 0, "child_idx": 1},  # Analysis -> API Docs
            {"parent_idx": 0, "child_idx": 2},  # Analysis -> Examples
            {"parent_idx": 1, "child_idx": 3},  # API Docs -> Final
            {"parent_idx": 2, "child_idx": 3},  # Examples -> Final
        ],
    },
    # 5. Test Suite Generator
    {
        "name": "Test Suite Generator",
        "description": "Generate comprehensive test suites from code analysis",
        "metadata": {"icon": "test", "is_default": True, "category": "test"},
        "steps": [
            {
                "name": "Code Analysis",
                "agent_type": "codex",
                "prompt_template": """Analyze this code for testing:

{{code}}

Identify:
1. Functions/methods to test
2. Input types and ranges
3. Expected outputs
4. Side effects
5. Dependencies to mock
6. Edge cases and boundary conditions""",
                "output_format": "json",
                "position_x": 100,
                "position_y": 200,
                "reasoning_level": "high",
            },
            {
                "name": "Unit Tests",
                "agent_type": "codex",
                "prompt_template": """Generate unit tests based on:

{{Code Analysis}}

Create unit tests for each function covering:
- Normal inputs
- Boundary values
- Type variations
- Return value verification""",
                "output_format": "code",
                "position_x": 300,
                "position_y": 100,
                "reasoning_level": "xhigh",
            },
            {
                "name": "Integration Tests",
                "agent_type": "codex",
                "prompt_template": """Generate integration tests based on:

{{Code Analysis}}

Create integration tests covering:
- Component interactions
- Data flow through the system
- External dependencies (mocked)
- End-to-end scenarios""",
                "output_format": "code",
                "position_x": 300,
                "position_y": 200,
                "reasoning_level": "xhigh",
            },
            {
                "name": "Edge Case Tests",
                "agent_type": "claude",
                "prompt_template": """Generate edge case and error tests based on:

{{Code Analysis}}

Create tests for:
- Invalid inputs
- Null/undefined handling
- Error conditions
- Timeout scenarios
- Concurrent access
- Resource exhaustion""",
                "output_format": "code",
                "position_x": 300,
                "position_y": 300,
                "thinking_budget": 16000,
            },
            {
                "name": "Test Summary",
                "agent_type": "claude",
                "prompt_template": """Create a test summary report:

**Unit Tests:**
{{Unit Tests}}

**Integration Tests:**
{{Integration Tests}}

**Edge Case Tests:**
{{Edge Case Tests}}

Provide:
1. Coverage summary
2. Test organization recommendations
3. Missing test scenarios
4. CI/CD integration suggestions""",
                "output_format": "markdown",
                "position_x": 500,
                "position_y": 200,
                "thinking_budget": 8000,
            },
        ],
        "edges": [
            {"parent_idx": 0, "child_idx": 1},  # Analysis -> Unit
            {"parent_idx": 0, "child_idx": 2},  # Analysis -> Integration
            {"parent_idx": 0, "child_idx": 3},  # Analysis -> Edge Cases
            {"parent_idx": 1, "child_idx": 4},  # Unit -> Summary
            {"parent_idx": 2, "child_idx": 4},  # Integration -> Summary
            {"parent_idx": 3, "child_idx": 4},  # Edge Cases -> Summary
        ],
    },
]


def seed_default_templates(db: Session) -> None:
    """Seed default templates if they don't exist."""
    for template_data in DEFAULT_TEMPLATES:
        # Check if template already exists
        existing = db.query(AgentTemplateModel).filter_by(
            name=template_data["name"]
        ).first()

        if existing:
            continue

        # Create template
        db_template = AgentTemplateModel(
            name=template_data["name"],
            description=template_data["description"],
            template_metadata=template_data["metadata"],
        )
        db.add(db_template)
        db.flush()  # Get template ID

        # Create steps and build index-to-id mapping
        step_index_to_id = {}
        for i, step_data in enumerate(template_data["steps"]):
            db_step = AgentStepModel(
                template_id=db_template.id,
                name=step_data["name"],
                agent_type=step_data["agent_type"],
                prompt_template=step_data["prompt_template"],
                output_format=step_data["output_format"],
                position_x=step_data["position_x"],
                position_y=step_data["position_y"],
                step_metadata={},
                model_version=step_data.get("model_version"),
                thinking_budget=step_data.get("thinking_budget"),
                reasoning_level=step_data.get("reasoning_level"),
            )
            db.add(db_step)
            db.flush()
            step_index_to_id[i] = db_step.id

        # Create edges
        for edge_data in template_data["edges"]:
            parent_id = step_index_to_id[edge_data["parent_idx"]]
            child_id = step_index_to_id[edge_data["child_idx"]]
            db.execute(
                agent_step_edges.insert().values(
                    parent_id=parent_id, child_id=child_id
                )
            )

    db.commit()
