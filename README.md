# Orchestra - Project Orchestration App

A lightweight desktop app for project orchestration with DAG-based task visualization and agent swarm coordination.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Desktop App (Tauri + Svelte)                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ DAG Canvas  │  │ Project     │  │ Calendar/TODO           │  │
│  │ (litegraph) │  │ Manager     │  │ Integration             │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ WebSocket + REST
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     VM Hub (159.65.109.198)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Hub Service │  │ SQLite DB   │  │ Agent Swarm             │  │
│  │ (REST+WS)   │  │ (state)     │  │ Claude/Codex/Gemini     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
claude-command/
├── desktop/                 # Tauri + Svelte desktop app
│   ├── src/                 # Svelte frontend
│   │   ├── components/      # UI components
│   │   ├── stores/          # Svelte stores
│   │   └── lib/             # Types and API client
│   ├── src-tauri/           # Rust backend
│   └── package.json
├── hub/                     # FastAPI hub service
│   ├── main.py              # API endpoints
│   ├── models.py            # Pydantic models
│   ├── database.py          # SQLite ORM
│   └── requirements.txt
└── templates/               # Project scaffolding templates
    ├── GOALS.md
    ├── TESTS.md
    └── .orchestra/
```

## Quick Start

### Hub Service

```bash
cd hub
pip install -r requirements.txt
python main.py
```

The hub runs on `http://localhost:8000`.

### Desktop App

```bash
cd desktop
npm install
npm run tauri dev
```

## Features

- **DAG Canvas**: Visual node graph with litegraph.js
- **Project Management**: Create and manage projects with GOALS.md/TESTS.md specs
- **Agent Integration**: Launch Claude, Codex, or Gemini on any node
  - Background mode: Output to log file
  - Interactive mode: tmux session for live interaction
- **Real-time Sync**: WebSocket updates from hub to desktop
- **Meta-generatable**: Agents can modify workflows and tags

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/projects` | GET | List all projects |
| `/projects` | POST | Create project |
| `/projects/{id}/graph` | GET | Get project DAG |
| `/projects/{id}/nodes` | POST | Create node |
| `/projects/{id}/nodes/{id}` | PATCH | Update node |
| `/projects/{id}/runs` | POST | Launch agent run |
| `/projects/{id}/subscribe` | WS | Realtime updates |

## Node Schema

```json
{
  "id": "uuid",
  "title": "string",
  "description": "markdown",
  "status": "pending|in_progress|completed|blocked",
  "dependencies": ["node_id"],
  "research": { "questions": [], "findings": "", "sources": [] },
  "implementation": { "files_to_modify": [], "pr_number": null, "commit_sha": null },
  "tags": ["research", "coding"],
  "artifacts": ["path/to/file"]
}
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Desktop | Tauri + Svelte |
| DAG Rendering | litegraph.js |
| Hub Service | FastAPI (Python) |
| Database | SQLite |
| Config | YAML + JSON-Schema |
