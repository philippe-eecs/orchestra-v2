# Orchestra - Claude Code Instructions

## Project Overview

Orchestra is a DAG runner for AI agent workflows. Each **Block** is a single unit of work (one agent, one task). Parallelism comes from DAG topology - blocks without edges between them run in parallel.

## Design Philosophy

**Simple blocks, composable DAGs:**
- Block = one agent, one prompt, one task
- Parallelism = multiple blocks at the same DAG level (no edges between them)
- Complex patterns = build as sub-DAGs that can be imported/reused later
- Win conditions = success criteria that determine when a block is "green"

## Key Directories

```
claude-command/
├── backend/
│   ├── main.py           # API endpoints
│   ├── models.py         # SQLAlchemy models (Block, BlockRun, etc.)
│   ├── database.py       # DB setup
│   ├── services/
│   │   ├── runner.py     # DAG execution
│   │   └── validators.py # Win condition validators
│   ├── dist/             # Built frontend (for production)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.svelte
│   │   ├── GraphList.svelte
│   │   ├── GraphEditor.svelte
│   │   ├── BlockEditor.svelte    # Block config + win conditions
│   │   ├── RunResults.svelte     # Block status + conditions
│   │   ├── ReviewQueue.svelte    # Human review flow
│   │   ├── ContextPool.svelte
│   │   └── AgentHub.svelte
│   └── package.json
└── scripts/
    └── deploy.sh
```

## Data Model

### Graph
```python
class Graph:
    id, name, description, created_at
    is_template = Boolean  # Can be saved as reusable template
    template_category = String  # e.g., "code-review", "research"
```

### Block
```python
class Block:
    id, graph_id, title, description
    agent_type = "claude" | "codex" | "gemini"
    prompt = Text
    win_conditions = JSON  # [{type, config}]
    pos_x, pos_y
```

### Win Condition Types
```python
win_conditions = [
    {"type": "test", "command": "pytest tests/"},
    {"type": "human", "prompt": "Does this look good?"},
    {"type": "llm_judge", "prompt": "Is code clean?", "agent": "claude"},
    {"type": "metric", "command": "coverage", "threshold": 80},
]
```

### BlockRun
```python
class BlockRun:
    status = "pending" | "blocked" | "running" | "validating" | "green" | "red" | "done"
    output = Text
    tmux_session = String
    condition_results = JSON  # [{type, passed, details}]
```

## API Endpoints

```
# Graphs
POST   /graphs                   Create graph
GET    /graphs                   List graphs
GET    /graphs/templates         List template graphs
GET    /graphs/{id}              Get graph with blocks + edges
DELETE /graphs/{id}              Delete graph
POST   /graphs/{id}/clone        Clone graph (from template)

# Blocks
POST   /graphs/{id}/blocks       Create block
PATCH  /blocks/{id}              Update block
DELETE /blocks/{id}              Delete block

# Edges
POST   /graphs/{id}/edges        Create edge
DELETE /edges/{id}               Delete edge

# Execution
POST   /graphs/{id}/run          Run DAG
GET    /runs/{id}                Get run status
GET    /runs                     List runs

# Human Review
GET    /reviews                  List pending reviews
GET    /reviews/{id}             Get review details
POST   /reviews/{id}             Submit review (approve/reject)

# Export/Import
GET    /graphs/{id}/export       Export graph as JSON
POST   /graphs/import            Import graph from JSON
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

## Block Execution Flow

1. Check parent blocks are done/green
2. Run the agent with prompt
3. Extract deliverables (PRs, files, URLs)
4. Validate win conditions (if any)
5. Set block status (green/red/done)

## Agent Types

- `claude` - Claude CLI (`claude -p "prompt"`)
- `codex` - Codex CLI (`codex exec "prompt" --full-auto`)
- `gemini` - Gemini CLI (`gemini "prompt" -m gemini-2.5-pro --yolo`)

## Win Condition Validators

- `test` - Run command, check exit code = 0
- `human` - Create review request, await approval
- `llm_judge` - Ask LLM to evaluate output
- `metric` - Run command, extract number, compare threshold

## Parallelism via DAG

Instead of multi-agent blocks, use DAG topology:

```
┌─────────┐     ┌─────────┐
│ claude  │     │ codex   │   <- Two blocks, no edge = parallel
└────┬────┘     └────┬────┘
     │               │
     └───────┬───────┘
             ▼
      ┌──────────────┐
      │  Synthesize  │   <- This block receives both outputs
      └──────────────┘
```

## Future: Sub-graph Templates

Graphs can be marked as templates and cloned for reuse:

1. Create a graph with a useful pattern (e.g., claude+codex+synthesize)
2. Mark it as a template: `is_template=True`
3. Clone it when needed: `POST /graphs/{id}/clone`

This enables building reusable agent pipelines as composable DAGs.
