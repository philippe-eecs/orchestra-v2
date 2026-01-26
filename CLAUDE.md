# Orchestra V3 - Claude Code Instructions

## Project Overview

Orchestra is a minimal multi-agent DAG runner. Create graphs of AI agents (Claude, Codex, Gemini), connect them, run the DAG.

## Architecture

```
Browser ──SSH Tunnel──> Backend (VM:8000) ──> CLI Agents (tmux sessions)
                        └── serves UI + API
```

Everything runs on the VM. Local machine only needs SSH and a browser.

## Key Directories

```
claude-command/
├── backend/              # FastAPI backend
│   ├── main.py           # API endpoints (~120 lines)
│   ├── models.py         # SQLAlchemy models (~80 lines)
│   ├── database.py       # DB setup (~25 lines)
│   ├── services/
│   │   └── runner.py     # DAG execution (~220 lines)
│   ├── dist/             # Built frontend (for production)
│   └── requirements.txt
├── frontend/             # Svelte frontend
│   ├── src/
│   │   ├── App.svelte
│   │   ├── GraphList.svelte
│   │   ├── GraphEditor.svelte
│   │   └── RunResults.svelte
│   └── package.json
└── scripts/
    └── deploy.sh
```

## Data Model (5 tables)

- `graph` - DAG container (name, created_at)
- `node` - Agent task (title, prompt, agent_type, position)
- `edge` - Connection (parent_id → child_id)
- `run` - Execution instance (status, error)
- `node_run` - Node output (output, artifacts, tmux_session)

## API Endpoints (8 routes)

```
POST   /graphs                 Create graph
GET    /graphs                 List graphs
GET    /graphs/{id}            Get graph with nodes + edges
DELETE /graphs/{id}            Delete graph
POST   /graphs/{id}/nodes      Create node
DELETE /nodes/{id}             Delete node
POST   /graphs/{id}/edges      Create edge
POST   /graphs/{id}/run        Run DAG → returns run_id
GET    /runs/{id}              Get run status + outputs
```

## Usage

```bash
# SSH tunnel (only thing needed locally)
ssh -L 8000:localhost:8000 root@159.65.109.198

# Open browser to http://localhost:8000
```

## Deployment

```bash
# One-command deploy
./scripts/deploy.sh
```

### Manual Steps
```bash
# 1. Build frontend
cd frontend && npm run build

# 2. Copy to backend
cp -r dist ../backend/

# 3. Commit and push
git add -A && git commit -m "Deploy" && git push

# 4. On VM: pull and restart
ssh root@159.65.109.198 "cd /root/orchestra && git pull && pkill -f uvicorn; cd backend && source venv/bin/activate && nohup uvicorn main:app --host 0.0.0.0 --port 8000 > /root/hub.log 2>&1 &"
```

## Local Dev

```bash
# Terminal 1: SSH tunnel
ssh -L 8000:localhost:8000 root@159.65.109.198

# Terminal 2: Local Vite (optional, for faster frontend iteration)
cd frontend && npm run dev
# Opens http://localhost:5173 with API proxy to VM
```

## VM Setup

```bash
ssh root@159.65.109.198

# Clone repo
git clone https://github.com/philippe-eecs/claude-command.git /root/orchestra

# Setup backend
cd /root/orchestra/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start
nohup uvicorn main:app --host 0.0.0.0 --port 8000 > /root/hub.log 2>&1 &
```

## Clickable Links

When an agent runs, you can attach to its tmux session:
```bash
ssh -t root@159.65.109.198 "tmux attach -t run-{run_id}-node-{node_id}"
```

Artifacts (PRs, URLs, files) are extracted from agent output and shown as clickable links in the UI.

## Agent Types

- `claude` - Claude CLI (`claude -p "prompt"`)
- `codex` - Codex CLI (`codex exec "prompt"`)
- `gemini` - Gemini CLI (`gemini "prompt" -m gemini-2.5-pro -o text`)
