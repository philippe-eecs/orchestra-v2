# Orchestra

DAG-based AI agent orchestration system. Define workflows as directed acyclic graphs where each node is an AI agent (Claude, Codex, Gemini) that can execute tasks, pass outputs to downstream nodes, and verify completion via checks.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Orchestra UI (Next.js)                                         │
│  - Visual DAG editor for workflows                              │
│  - Agent library & composition                                  │
│  - Real-time execution monitoring                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Execution Engine                                               │
│  - Topological sort for dependency resolution                   │
│  - Parallel execution of independent nodes                      │
│  - Check-driven completion (retry until checks pass)            │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │  Claude  │   │  Codex   │   │  Gemini  │
        │  Agent   │   │  Agent   │   │  Agent   │
        └──────────┘   └──────────┘   └──────────┘
```

## Quick Start (Local Development)

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

**Prerequisites:** Claude Code, Codex, and Gemini CLIs installed and authenticated locally.

---

## Docker-Based Agent Execution

For production/server deployments, agents run in isolated Docker containers. This provides:
- **Isolation**: Each agent gets its own environment
- **Reproducibility**: Consistent execution across machines
- **Scalability**: Spin up multiple agents in parallel

### Resource Requirements

Since AI processing happens via API calls (not local compute), the orchestration server needs:

| Resource | Requirement | Notes |
|----------|-------------|-------|
| **CPU** | Minimal (1 vCPU) | Only orchestrates API calls |
| **RAM** | Minimal (1-2 GB) | Container overhead only |
| **Storage** | Moderate (20-50 GB) | Docker images, git repos, logs |
| **Network** | Good bandwidth | API calls to AI providers |

A **$5-10/month VM** (e.g., DigitalOcean, Hetzner) is sufficient!

### Setup: Authentication for Docker Containers

Docker containers can't access your local macOS Keychain. Instead, use OAuth tokens via environment variables.

#### Step 1: Generate a Claude OAuth Token

```bash
# Run setup-token (requires Claude Max/Pro subscription)
claude setup-token

# Complete browser authentication
# Save the token it displays (starts with sk-ant-oat01-...)
```

#### Step 2: Store Credentials

```bash
# Copy the example env file
cp .env.example .env

# Edit .env and add your tokens
```

Your `.env` file should contain:
```bash
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-your-token-here
OPENAI_API_KEY=sk-...          # Optional, for Codex
GOOGLE_API_KEY=...             # Optional, for Gemini
```

#### Step 3: Run Agents in Docker

```bash
# Test Claude in Docker
docker run --rm \
  -e CLAUDE_CODE_OAUTH_TOKEN="${CLAUDE_CODE_OAUTH_TOKEN}" \
  node:20-slim \
  bash -c 'npm install -g @anthropic-ai/claude-code 2>/dev/null && claude -p "hello" --output-format text --max-turns 1'
```

### Authentication Methods Summary

| Method | Use Case | Cost |
|--------|----------|------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Docker/CI with Max subscription | Subscription |
| `ANTHROPIC_API_KEY` | API access without subscription | Pay-per-token |
| Local Keychain | macOS local development | Subscription |

### TODO: Additional Provider Authentication

#### Codex (OpenAI)
- [ ] Investigate if Codex supports OAuth tokens similar to Claude
- [ ] Document `OPENAI_API_KEY` setup for Docker
- [ ] Test Codex execution in containerized environment

#### Gemini (Google)
- [ ] Investigate Gemini CLI headless authentication
- [ ] Document `GOOGLE_API_KEY` or OAuth setup for Docker
- [ ] Test Gemini execution in containerized environment
- [ ] Check if `~/.gemini/oauth_creds.json` can be mounted from Linux host

---

## Production Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Lightweight VM ($5-10/mo)                                      │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Orchestra Server (Next.js)                               │  │
│  │  - Always running                                         │  │
│  │  - Accepts tasks via API                                  │  │
│  │  - Manages execution state                                │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Docker Daemon                                            │  │
│  │                                                           │  │
│  │   ┌─────────┐  ┌─────────┐  ┌─────────┐                   │  │
│  │   │ Agent 1 │  │ Agent 2 │  │ Agent 3 │  (ephemeral)      │  │
│  │   └─────────┘  └─────────┘  └─────────┘                   │  │
│  │                                                           │  │
│  │   - Spin up per task                                      │  │
│  │   - Git clone workspace                                   │  │
│  │   - Execute, commit, terminate                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Credentials: /etc/orchestra/.env (mounted to containers)       │
└─────────────────────────────────────────────────────────────────┘
```

### Agent Container Lifecycle

```
1. Task assigned to agent
2. Docker container spawns (2-5 seconds)
3. Git clone --depth 1 (agent's workspace)
4. Agent executes task
5. Git commit + push to feature branch
6. Container terminates
7. Results returned to Orchestra
```

---

## Project Structure

```
orchestra/
├── app/                    # Next.js app router
│   ├── api/               # Backend API routes
│   │   ├── execute/       # Agent execution
│   │   └── check/         # Validation checks
│   └── page.tsx           # Main UI
├── lib/
│   ├── types.ts           # TypeScript definitions
│   ├── store.ts           # Zustand state management
│   └── execution.ts       # DAG execution engine
├── components/            # React components
├── .env                   # Local secrets (gitignored)
└── .env.example           # Template for secrets
```

---

## Key Concepts

### Nodes
AI agents in the workflow. Each node has:
- **Agent type**: Claude, Codex, or Gemini
- **Prompt**: Instructions for the agent
- **Context**: Files, URLs, or upstream outputs
- **Checks**: Validation rules that must pass

### Edges
Dependencies between nodes. An edge from A → B means B waits for A to complete and can access A's output.

### Checks
Validation rules that determine if a node completed successfully:
- **File exists**: Verify output files were created
- **Command**: Run a shell command (exit 0 = pass)
- **LLM Critic**: Have another AI evaluate the output
- **Test runner**: Run test suites (Jest, pytest, etc.)

### Composed Agents
Save entire DAG workflows as reusable agents. A composed agent is a sub-workflow that executes as a single node.

---

## Development

```bash
# Run locally (uses local CLI auth)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## License

MIT
