# Orchestra V2 - Claude Code Instructions

## Project Overview

Orchestra is a multi-agent orchestration platform for managing software development workflows. It consists of:

- **Desktop App** (Tauri + Svelte): Thin client for visualizing DAG-based workflows
- **Hub Service** (FastAPI): Central coordination server running on a remote VM
- **Agent Swarm**: Claude, Codex, and Gemini CLI tools executing tasks

## Architecture

```
Desktop App (local) ──WebSocket/REST──> Hub Service (VM) ──> Agent CLIs (VM)
```

The frontend is a thin client. All state, agent executions, and heavy processing happen on the VM.

## Key Directories

```
claude-command/
├── desktop/              # Tauri + Svelte desktop app
│   ├── src/              # Svelte frontend components
│   │   ├── components/   # UI components (modals, panels, canvas)
│   │   ├── stores/       # Svelte stores (hub.ts, projects.ts)
│   │   └── lib/          # Types and API client
│   └── src-tauri/        # Rust backend (minimal)
├── hub/                  # FastAPI hub service
│   ├── app/              # Main application
│   │   ├── main.py       # FastAPI app entry
│   │   ├── config.py     # Settings (env vars: ORCHESTRA_*)
│   │   ├── routers/      # API endpoints
│   │   ├── models/       # Pydantic models
│   │   ├── db/           # SQLAlchemy models and database
│   │   └── services/     # Business logic
│   └── tests/            # Pytest tests
└── docs/                 # Documentation
    └── VM_SETUP.md       # VM provisioning guide
```

## Development Workflow

### Local Development
```bash
# Terminal 1: Hub (on VM via SSH or locally)
cd hub && source venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0

# Terminal 2: Desktop app
cd desktop && npm run tauri dev
```

### Hub Configuration

Environment variables (prefix: `ORCHESTRA_`):
- `ORCHESTRA_DATABASE_URL`: SQLite path (default: `sqlite:///./orchestra.db`)
- `ORCHESTRA_CORS_ORIGINS`: Allowed origins (default includes localhost and tauri)
- `ORCHESTRA_DEBUG`: Enable debug mode

### Frontend Hub Connection

The desktop app stores the hub URL in localStorage. Presets available:
- Remote: `http://159.65.109.198:8000`
- Local: `http://localhost:8000`

## VM Deployment

See [docs/VM_SETUP.md](docs/VM_SETUP.md) for full provisioning guide.

### Security Model
- **Ports 8000-8009**: Private (SSH tunnel only)
- **Ports 80/443**: Public (for websites)
- **Port 22**: SSH key authentication

### Quick Access
```bash
# Open tunnel to hub (required for desktop app)
ssh -L 8000:localhost:8000 -L 8001:localhost:8001 root@159.65.109.198

# Then connect desktop app to http://localhost:8000
```

### VM Admin
```bash
ssh root@159.65.109.198
cd /root/hub
source venv/bin/activate
# Restart: kill the uvicorn process and relaunch
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
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
