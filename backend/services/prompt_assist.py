"""Prompt assistance - Claude-powered prompt generation and improvement."""

import asyncio
import subprocess
import json


async def generate_prompt(description: str, agent_type: str) -> dict:
    """Generate a structured prompt from a plain English description."""

    system_context = f"""You are a prompt engineering assistant. The user wants to create a prompt for a {agent_type} agent.

Given a description of what the user wants to accomplish, generate a clear, well-structured prompt.

Guidelines for {agent_type}:
- claude: Supports complex reasoning, coding, and multi-step tasks. Can use tools like file editing.
- codex: Specialized for code generation and refactoring. Prefers clear code-focused instructions.
- gemini: Strong at multimodal tasks, web search, and analysis. Has 1M token context.

Output format:
Return ONLY valid JSON with these fields:
{{"prompt": "the generated prompt", "explanation": "brief explanation of the prompt structure"}}"""

    user_message = f"Description: {description}"

    result = await call_claude(system_context, user_message)

    try:
        return json.loads(result)
    except:
        # Try to extract JSON from response
        import re
        match = re.search(r'\{[^{}]*"prompt"[^{}]*\}', result, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except:
                pass
        return {"prompt": result, "explanation": "Generated prompt"}


async def improve_prompt(current_prompt: str, agent_type: str, feedback: str = None) -> dict:
    """Improve an existing prompt."""

    system_context = f"""You are a prompt engineering assistant. The user has an existing prompt for a {agent_type} agent and wants to improve it.

Analyze the prompt and suggest improvements for:
- Clarity and specificity
- Structure and organization
- Agent-specific optimizations
- Edge case handling

Output format:
Return ONLY valid JSON with these fields:
{{"prompt": "the improved prompt", "explanation": "what was improved and why"}}"""

    user_message = f"Current prompt:\n{current_prompt}"
    if feedback:
        user_message += f"\n\nUser feedback: {feedback}"

    result = await call_claude(system_context, user_message)

    try:
        return json.loads(result)
    except:
        import re
        match = re.search(r'\{[^{}]*"prompt"[^{}]*\}', result, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except:
                pass
        return {"prompt": result, "explanation": "Improved prompt"}


async def call_claude(system: str, user: str) -> str:
    """Call Claude CLI for prompt assistance."""
    import tempfile
    import os

    # Create temp files for system and user messages
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(f"System: {system}\n\nUser: {user}")
        prompt_file = f.name

    try:
        cmd = f'cat "{prompt_file}" | claude -p -'

        proc = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )

        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=60)
        return stdout.decode()
    finally:
        os.unlink(prompt_file)
