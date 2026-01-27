"""Context processor - fetch and format context from various sources."""

import os
import subprocess
import asyncio
from pathlib import Path


async def process_context_item(context_type: str, config: dict) -> str:
    """Process a context item and return formatted content."""

    if context_type == "file":
        return await process_file(config)
    elif context_type == "repo":
        return await process_repo(config)
    elif context_type == "github":
        return await process_github(config)
    elif context_type == "url":
        return await process_url(config)
    elif context_type == "image":
        return await process_image(config)
    else:
        raise ValueError(f"Unknown context type: {context_type}")


async def process_file(config: dict) -> str:
    """Read file content."""
    path = config.get("path", "")
    if not path or not os.path.exists(path):
        return f"[File not found: {path}]"

    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()

        # Truncate very large files
        max_chars = config.get("max_chars", 50000)
        if len(content) > max_chars:
            content = content[:max_chars] + f"\n\n[...truncated, {len(content)} total chars...]"

        filename = os.path.basename(path)
        return f"### File: {filename}\n```\n{content}\n```"
    except Exception as e:
        return f"[Error reading file: {e}]"


async def process_repo(config: dict) -> str:
    """Generate tree + key files from a repository."""
    path = config.get("path", "")
    if not path or not os.path.isdir(path):
        return f"[Directory not found: {path}]"

    try:
        # Get tree structure (max 3 levels, ignore common noise)
        ignore = [".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build"]
        tree_lines = ["### Repository Structure"]

        def add_tree(p: Path, prefix: str = "", depth: int = 0):
            if depth > 3:
                return

            items = sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
            for i, item in enumerate(items):
                if item.name in ignore or item.name.startswith("."):
                    continue

                is_last = i == len(items) - 1
                connector = "\u2514\u2500\u2500 " if is_last else "\u251c\u2500\u2500 "
                tree_lines.append(f"{prefix}{connector}{item.name}")

                if item.is_dir():
                    extension = "    " if is_last else "\u2502   "
                    add_tree(item, prefix + extension, depth + 1)

        add_tree(Path(path))

        # Include key files if specified
        key_files = config.get("key_files", [])
        content_parts = ["\n".join(tree_lines)]

        for kf in key_files[:5]:  # Max 5 key files
            full_path = os.path.join(path, kf)
            if os.path.exists(full_path) and os.path.isfile(full_path):
                try:
                    with open(full_path, "r", encoding="utf-8") as f:
                        file_content = f.read()[:10000]  # Max 10k chars per file
                    content_parts.append(f"\n### {kf}\n```\n{file_content}\n```")
                except:
                    pass

        return "\n".join(content_parts)
    except Exception as e:
        return f"[Error processing repo: {e}]"


async def process_github(config: dict) -> str:
    """Fetch GitHub content using gh CLI."""
    url = config.get("url", "")
    if not url:
        return "[No GitHub URL provided]"

    try:
        # Parse GitHub URL to determine type
        if "/pull/" in url:
            # PR - get PR details
            parts = url.split("/")
            owner_repo = f"{parts[3]}/{parts[4]}"
            pr_num = parts[6].split("?")[0].split("#")[0]

            cmd = f"gh pr view {pr_num} --repo {owner_repo} --json title,body,files,commits"
            result = await run_command(cmd)
            return f"### GitHub PR: {url}\n```json\n{result}\n```"

        elif "/issues/" in url:
            # Issue
            parts = url.split("/")
            owner_repo = f"{parts[3]}/{parts[4]}"
            issue_num = parts[6].split("?")[0].split("#")[0]

            cmd = f"gh issue view {issue_num} --repo {owner_repo} --json title,body,comments"
            result = await run_command(cmd)
            return f"### GitHub Issue: {url}\n```json\n{result}\n```"

        elif "/blob/" in url:
            # File content
            parts = url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/")
            cmd = f"curl -sL {parts}"
            result = await run_command(cmd)
            return f"### GitHub File: {url}\n```\n{result[:20000]}\n```"

        else:
            # Generic - try API
            api_url = url.replace("github.com", "api.github.com/repos")
            cmd = f"gh api {api_url}"
            result = await run_command(cmd)
            return f"### GitHub: {url}\n```json\n{result[:20000]}\n```"

    except Exception as e:
        return f"[Error fetching GitHub content: {e}]"


async def process_url(config: dict) -> str:
    """Fetch URL content and extract text."""
    url = config.get("url", "")
    if not url:
        return "[No URL provided]"

    try:
        # Use curl to fetch content
        cmd = f"curl -sL --max-time 30 '{url}'"
        result = await run_command(cmd)

        # Basic HTML stripping if needed
        if "<html" in result.lower() or "<!doctype" in result.lower():
            # Very basic extraction - just get text between tags
            import re
            result = re.sub(r'<script[^>]*>.*?</script>', '', result, flags=re.DOTALL | re.IGNORECASE)
            result = re.sub(r'<style[^>]*>.*?</style>', '', result, flags=re.DOTALL | re.IGNORECASE)
            result = re.sub(r'<[^>]+>', ' ', result)
            result = re.sub(r'\s+', ' ', result).strip()

        return f"### URL: {url}\n{result[:20000]}"
    except Exception as e:
        return f"[Error fetching URL: {e}]"


async def process_image(config: dict) -> str:
    """Use Gemini to describe an image."""
    path = config.get("path", "")
    if not path or not os.path.exists(path):
        return f"[Image not found: {path}]"

    try:
        cmd = f'gemini "Describe this image in detail, focusing on any text, diagrams, or technical content." -m gemini-2.5-pro -o text --image "{path}"'
        result = await run_command(cmd, timeout=60)
        return f"### Image Description: {os.path.basename(path)}\n{result}"
    except Exception as e:
        return f"[Error processing image: {e}]"


async def run_command(cmd: str, timeout: int = 30) -> str:
    """Run a shell command and return output."""
    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT
    )

    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return stdout.decode()
    except asyncio.TimeoutError:
        proc.kill()
        return "[Command timed out]"
