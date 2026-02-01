# Orchestra Agent - Full Image
#
# This image contains all the tools needed for Orchestra agent execution:
# - Node.js runtime
# - Claude Code CLI
# - Codex CLI (OpenAI)
# - Gemini CLI
# - tmux for interactive sessions
# - Git and common development tools
#
# Build: docker build -t orchestra-agent:full -f Dockerfile .
# Run:   docker run --rm -v $(pwd):/workspace orchestra-agent:full claude -p "Hello"

FROM node:22-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    tmux \
    python3 \
    python3-pip \
    python3-venv \
    openssh-client \
    rsync \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Create agent user (non-root for security)
RUN useradd -m -s /bin/bash agent

# Switch to agent user for CLI installations
USER agent
WORKDIR /home/agent

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Install Codex CLI (OpenAI) - using pip in user space
RUN python3 -m venv /home/agent/.venv && \
    /home/agent/.venv/bin/pip install openai-codex

# Add venv to PATH
ENV PATH="/home/agent/.venv/bin:$PATH"

# Install Gemini CLI
# Note: This assumes there's a gemini CLI package; adjust as needed
# For now, we'll create a wrapper script
RUN mkdir -p /home/agent/bin
COPY --chown=agent:agent gemini-wrapper.sh /home/agent/bin/gemini
RUN chmod +x /home/agent/bin/gemini
ENV PATH="/home/agent/bin:$PATH"

# tmux configuration for better defaults
RUN echo 'set -g mouse on' >> /home/agent/.tmux.conf && \
    echo 'set -g history-limit 50000' >> /home/agent/.tmux.conf && \
    echo 'set -g default-terminal "screen-256color"' >> /home/agent/.tmux.conf

# Set working directory for projects
WORKDIR /workspace

# Default command
CMD ["bash"]

# Labels
LABEL org.opencontainers.image.title="Orchestra Agent"
LABEL org.opencontainers.image.description="Agent execution environment for Orchestra with Claude, Codex, and Gemini CLIs"
LABEL org.opencontainers.image.vendor="Orchestra"
