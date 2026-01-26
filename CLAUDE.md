# Orchestra V2 - Claude Code Instructions

## Project Overview

Orchestra is a multi-agent orchestration platform for managing software development workflows. It consists of:

- **Frontend** (Svelte): Web UI served from the hub
- **Hub Service** (FastAPI): Central coordination server running on a remote VM
- **Agent Swarm**: Claude, Codex, and Gemini CLI tools executing tasks

## Architecture

```
Browser ──SSH Tunnel──> Hub Service (VM) ──> Agent CLIs (VM)
                        └── serves UI + API
```

Everything runs on the VM. Local machine only needs SSH and a browser.

## Key Directories

```
claude-command/
├── desktop/              # Svelte frontend source
│   ├── src/              # Svelte components
│   │   ├── components/   # UI components (modals, panels, canvas)
│   │   ├── stores/       # Svelte stores (hub.ts, projects.ts)
│   │   └── lib/          # Types and API client
│   └── dist/             # Built output (scp to VM)
├── hub/                  # FastAPI hub service
│   ├── app/              # Main application
│   │   ├── main.py       # FastAPI app + static file serving
│   │   ├── config.py     # Settings (env vars: ORCHESTRA_*)
│   │   ├── routers/      # API endpoints
│   │   ├── models/       # Pydantic models
│   │   ├── db/           # SQLAlchemy models and database
│   │   └── services/     # Business logic
│   ├── dist/             # Frontend files (on VM only)
│   └── tests/            # Pytest tests
└── docs/                 # Documentation
    └── VM_SETUP.md       # VM provisioning guide
```

## Usage

```bash
# Start SSH tunnel (only thing needed locally)
ssh -L 8000:localhost:8000 -L 8001:localhost:8001 root@159.65.109.198

# Open browser to http://localhost:8000
```

## Deployment

The VM runs from a git clone at `/root/orchestra-repo`. Use the deploy script for automated deployment:

```bash
# One-command deployment (builds, commits, pushes, pulls on VM, restarts)
./scripts/deploy.sh
```

### Manual Deployment Steps
```bash
# 1. Build frontend
cd desktop && npm run build

# 2. Commit and push changes
git add -A && git commit -m "Your changes" && git push origin main

# 3. Pull on VM
ssh root@159.65.109.198 "cd /root/orchestra-repo && git pull origin main"

# 4. Copy built frontend (dist/ is gitignored)
scp -r desktop/dist root@159.65.109.198:/root/orchestra-repo/hub/

# 5. Restart hub
ssh root@159.65.109.198 "pkill -f uvicorn; cd /root/orchestra-repo/hub && nohup venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 > /root/hub.log 2>&1 &"
```

### Local Vite Dev (optional)
For faster frontend iteration:
```bash
# Terminal 1: SSH tunnel (for API access)
ssh -L 8000:localhost:8000 -L 8001:localhost:8001 root@159.65.109.198

# Terminal 2: Local Vite
cd desktop && npm run dev
# Open http://localhost:5173
```

### Hub Configuration

Environment variables (prefix: `ORCHESTRA_`):
- `ORCHESTRA_DATABASE_URL`: SQLite path (default: `sqlite:///./orchestra.db`)
- `ORCHESTRA_CORS_ORIGINS`: Allowed origins
- `ORCHESTRA_DEBUG`: Enable debug mode

## VM Access

### Security Model
- **Ports 8000-8009**: Private (SSH tunnel only)
- **Ports 80/443**: Public (for websites)
- **Port 22**: SSH key authentication

### VM Admin
```bash
ssh root@159.65.109.198
cd /root/orchestra-repo/hub
source venv/bin/activate

# View logs
tail -f /root/hub.log

# Pull latest changes
git pull origin main

# Restart hub
pkill -f 'uvicorn app.main'
nohup venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 > /root/hub.log 2>&1 &
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Frontend UI |
| `/health` | GET | Health check |
| `/projects` | GET/POST | List/create projects |
| `/projects/{id}/nodes` | GET/POST | List/create nodes |
| `/projects/{id}/nodes/{id}/launch-pipeline` | POST | Launch multi-agent pipeline |
| `/projects/{id}/nodes/{id}/synthesis` | GET | Get synthesis questions for review |
| `/projects/{id}/nodes/{id}/feedback` | POST | Submit human feedback |
| `/projects/{id}/nodes/needs-review` | GET | List nodes needing review |
| `/agent-templates` | GET | List agent templates |
| `/executions` | GET | List executions |
| `/ws/subscribe/{project_id}` | WS | Real-time updates |

## Multi-Agent Pipeline

The pipeline orchestrates multiple AI agents for complex tasks:

1. **Ideation**: Claude, Codex, and Gemini create plans in parallel
2. **Synthesis**: Claude merges plans and identifies conflicts
3. **Human Review**: Node turns RED, awaiting your feedback
4. **Implementation**: Codex executes the approved plan
5. **Critics**: All agents vote YES/NO on the implementation
6. **Retry**: If critics reject, loop back with feedback

Node statuses:
- `pending` (gray) - Not started
- `in_progress` (yellow) - Currently executing
- `needs_review` (RED) - Human attention required
- `completed` (green) - Successfully finished
- `failed` (red) - Execution failed

## Testing

```bash
cd hub
source venv/bin/activate
pytest tests/ -v
```

## Common Tasks

### Adding a new API endpoint
1. Create router in `hub/app/routers/`
2. Add Pydantic models in `hub/app/models/`
3. Register router in `hub/app/main.py`
4. Add tests in `hub/tests/`

### Adding a frontend component
1. Create component in `desktop/src/components/`
2. Add types to `desktop/src/lib/types.ts`
3. Update stores if needed in `desktop/src/stores/`
4. Build and deploy to VM
