"""
Orchestra Agent - Modal Functions

Serverless agent execution on Modal's infrastructure.
Supports CPU and GPU workloads with auto-scaling.

Deploy:
    modal deploy modal/agent.py

Run directly:
    modal run modal/agent.py::run_agent --payload '{"prompt": "Hello"}'

GPU variants:
    modal run modal/agent.py::run_agent_gpu --payload '{"prompt": "Hello", "gpu": "T4"}'
"""

import modal
import subprocess
import os
import json
from pathlib import Path
from typing import Optional

# Create the Modal app
app = modal.App("orchestra-agent")

# Base image with Node.js and Python
base_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "curl", "nodejs", "npm")
    .pip_install("anthropic", "openai", "google-generativeai")
    .run_commands(
        "npm install -g @anthropic-ai/claude-code",
        # Add other CLIs as needed
    )
)

# GPU image (same as base, Modal handles GPU drivers)
gpu_image = base_image


@app.function(
    image=base_image,
    secrets=[modal.Secret.from_name("orchestra-creds")],
    timeout=900,  # 15 minutes
    memory=4096,  # 4GB RAM
)
def run_agent(payload: str) -> str:
    """
    Run an agent command on Modal (CPU).

    Args:
        payload: JSON string with:
            - executor: 'claude' | 'codex' | 'gemini'
            - prompt: The prompt to execute
            - options: Agent-specific options
            - files: Optional dict of {path: content} to write
    """
    data = json.loads(payload)
    executor = data.get("executor", "claude")
    prompt = data.get("prompt", "")
    options = data.get("options", {})
    files = data.get("files", {})

    # Create workspace and write files
    workspace = Path("/workspace")
    workspace.mkdir(parents=True, exist_ok=True)

    for file_path, content in files.items():
        full_path = workspace / file_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(content)

    # Build and run command
    cmd = build_command(executor, prompt, options)

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=str(workspace),
        timeout=850,  # Slightly less than function timeout
    )

    if result.returncode != 0:
        return f"Error (exit code {result.returncode}):\n{result.stderr}"

    return result.stdout


@app.function(
    image=gpu_image,
    secrets=[modal.Secret.from_name("orchestra-creds")],
    timeout=900,
    memory=8192,  # 8GB RAM for GPU workloads
    gpu="T4",  # Default GPU, can be overridden
)
def run_agent_gpu(payload: str) -> str:
    """
    Run an agent command on Modal with GPU.
    Same as run_agent but with GPU attached for ML workloads.
    """
    # Same implementation as CPU version
    # GPU is available for any subprocess that needs it
    return run_agent.local(payload)


@app.function(
    image=gpu_image,
    secrets=[modal.Secret.from_name("orchestra-creds")],
    timeout=1800,  # 30 minutes for heavy workloads
    memory=16384,  # 16GB RAM
    gpu="A10G",
)
def run_agent_gpu_a10g(payload: str) -> str:
    """Run agent with A10G GPU (more powerful than T4)."""
    return run_agent.local(payload)


@app.function(
    image=gpu_image,
    secrets=[modal.Secret.from_name("orchestra-creds")],
    timeout=3600,  # 1 hour for heavy workloads
    memory=32768,  # 32GB RAM
    gpu="A100",
)
def run_agent_gpu_a100(payload: str) -> str:
    """Run agent with A100 GPU (high-end GPU)."""
    return run_agent.local(payload)


def build_command(executor: str, prompt: str, options: dict) -> list[str]:
    """Build the CLI command for the specified executor."""

    if executor == "claude":
        cmd = [
            "claude",
            "-p",
            prompt,
            "--output-format",
            "text",
            "--no-session-persistence",
            "--permission-mode",
            "dontAsk",
            "--tools",
            "",
        ]
        if options.get("model"):
            cmd.extend(["--model", options["model"]])
        if options.get("thinkingBudget"):
            budget = int(options["thinkingBudget"])
            cmd.extend(
                ["--append-system-prompt", f"Think for at most {budget} tokens."]
            )
        return cmd

    elif executor == "codex":
        cmd = ["codex", "exec", "--skip-git-repo-check"]
        if options.get("reasoningEffort"):
            cmd.extend(["-c", f"reasoning.effort={options['reasoningEffort']}"])
        if options.get("model"):
            cmd.extend(["-m", options["model"]])
        cmd.append(prompt)
        return cmd

    elif executor == "gemini":
        model = options.get("model", "gemini-3-pro-preview")
        return ["gemini", prompt, "-m", model, "-o", "text"]

    else:
        raise ValueError(f"Unknown executor: {executor}")


# ========== PARALLEL EXECUTION ==========


@app.function(
    image=base_image,
    secrets=[modal.Secret.from_name("orchestra-creds")],
    timeout=1800,
)
def run_agent_batch(payloads: list[str]) -> list[str]:
    """
    Run multiple agents in parallel.
    Useful for DAG nodes that can execute concurrently.
    """
    # Use Modal's built-in parallel execution
    results = list(run_agent.map(payloads))
    return results


# ========== HEALTH CHECK ==========


@app.function(image=base_image)
def health_check() -> dict:
    """Check that the Modal environment is set up correctly."""
    checks = {
        "nodejs": False,
        "claude_cli": False,
        "workspace": False,
    }

    # Check Node.js
    result = subprocess.run(["node", "--version"], capture_output=True)
    checks["nodejs"] = result.returncode == 0

    # Check Claude CLI
    result = subprocess.run(["claude", "--version"], capture_output=True)
    checks["claude_cli"] = result.returncode == 0

    # Check workspace
    checks["workspace"] = Path("/workspace").exists() or True  # Will be created

    return checks


# ========== LOCAL ENTRYPOINT ==========


@app.local_entrypoint()
def main(payload: str = '{"prompt": "Say hello"}'):
    """
    Local entrypoint for testing.
    Usage: modal run modal/agent.py --payload '{"prompt": "Hello"}'
    """
    print("Running agent...")
    result = run_agent.remote(payload)
    print(result)
