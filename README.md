# Orchestra V2 - Multi-Agent Orchestration Platform

A multi-agent orchestration platform for managing software development workflows. The frontend is served directly from the hub service on a remote VM, accessed via SSH tunnel.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Your Machine                                │
│  ┌─────────────┐                                                │
│  │   Browser   │◄─── http://localhost:8000                      │
│  └──────┬──────┘                                                │
│         │ SSH Tunnel                                            │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     VM Hub (159.65.109.198)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Hub Service │  │ SQLite DB   │  │ Agent Swarm             │  │
│  │ (API + UI)  │  │ (state)     │  │ Claude/Codex/Gemini     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

**Only two things needed:**

```bash
# 1. Open SSH tunnel (keep this terminal open)
ssh -L 8000:localhost:8000 -L 8001:localhost:8001 root@159.65.109.198

# 2. Open browser
open http://localhost:8000
```

That's it. No local dev servers, no build steps, no dependencies.

## Project Structure

```
claude-command/
├── desktop/                 # Svelte frontend (deployed to VM)
│   ├── src/                 # Svelte components
│   │   ├── components/      # UI components
│   │   ├── stores/          # Svelte stores
│   │   └── lib/             # Types and API client
│   └── package.json
├── hub/                     # FastAPI hub service (runs on VM)
│   ├── app/                 # Application code
│   │   ├── main.py          # API + static file serving
│   │   ├── routers/         # API endpoints
│   │   ├── models/          # Pydantic models
│   │   └── db/              # SQLite ORM
│   └── dist/                # Built frontend (on VM)
└── docs/                    # Documentation
    └── VM_SETUP.md          # VM provisioning guide
```

## Development

### Frontend Changes

```bash
# Build locally
cd desktop && npm run build

# Deploy to VM
scp -r dist root@159.65.109.198:/root/hub/

# Restart hub
ssh root@159.65.109.198 "pkill -f 'uvicorn app.main' || true"
ssh root@159.65.109.198 "cd /root/hub && nohup venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 > /root/hub.log 2>&1 &"
```

### Hub Changes

```bash
# Copy updated files
scp hub/app/*.py root@159.65.109.198:/root/hub/app/

# Restart hub (same as above)
```

### Local Development (optional)

For faster iteration during frontend development:

```bash
# Terminal 1: SSH tunnel
ssh -L 8000:localhost:8000 -L 8001:localhost:8001 root@159.65.109.198

# Terminal 2: Local Vite dev server
cd desktop && npm run dev
# Then open http://localhost:5173 (Vite) instead of :8000
```

## Features

- **DAG Canvas**: Visual node graph with litegraph.js
- **Project Management**: Create and manage projects with tasks
- **Agent Integration**: Launch Claude, Codex, or Gemini on any node
  - Background mode: Output to log file
  - Interactive mode: tmux session for live interaction
- **Real-time Sync**: WebSocket updates from hub

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Frontend UI |
| `/health` | GET | Health check |
| `/projects` | GET/POST | List/create projects |
| `/projects/{id}/nodes` | GET/POST | List/create nodes |
| `/agent-templates` | GET | List agent templates |
| `/launch` | POST | Launch agent execution |
| `/executions` | GET | List executions |
| `/ws/subscribe/{project_id}` | WS | Real-time updates |

## Security Model

- **Ports 8000-8009**: Private (SSH tunnel only)
- **Port 22**: SSH key authentication
- No passwords, no IP whitelisting - your SSH key is the authentication

## Deployment

See [docs/VM_SETUP.md](docs/VM_SETUP.md) for full VM provisioning guide.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Svelte + Vite |
| DAG Rendering | litegraph.js |
| Hub Service | FastAPI (Python) |
| Database | SQLite |
| Deployment | Ubuntu VM (DigitalOcean) |
| Agents | Claude CLI, Codex CLI, Gemini CLI |
