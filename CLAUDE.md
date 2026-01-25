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

## Development Workflow

### Frontend Changes
```bash
# Build
cd desktop && npm run build

# Deploy
scp -r dist root@159.65.109.198:/root/hub/

# Restart hub
ssh root@159.65.109.198 "pkill -f 'uvicorn app.main' || true"
ssh root@159.65.109.198 "cd /root/hub && nohup venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 > /root/hub.log 2>&1 &"
```

### Hub Changes
```bash
# Copy updated files
scp hub/app/*.py root@159.65.109.198:/root/hub/app/

# Restart (same command as above)
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
cd /root/hub
source venv/bin/activate

# View logs
tail -f /root/hub.log

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
| `/agent-templates` | GET | List agent templates |
| `/launch` | POST | Launch agent execution |
| `/executions` | GET | List executions |
| `/ws/subscribe/{project_id}` | WS | Real-time updates |

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
