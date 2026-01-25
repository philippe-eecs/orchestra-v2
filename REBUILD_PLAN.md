# Orchestra Rebuild Plan (Draft)

This document proposes a clean, functional rebuild of the Orchestra desktop app with clearer UX flows, a simplified data model, and reliable node creation. It does **not** delete existing code; it’s a blueprint for a rebuild.

## 1) Goals
- Reliable node creation and graph updates every time (no silent failures).
- A clearer layout: Projects in the left sidebar, **Views in the top bar**.
- Surface **Active agents / sessions** and **global/project TODOs**.
- Support “AI plan” that can create nodes + edges from a prompt + resources.
- Simple, debuggable hub configuration (local or remote) with visible status.

## 2) Non‑Goals (initial)
- No advanced graph editor (drag/connection editing) in phase 1.
- No complex permissions/roles.
- No external auth.

## 3) UX / Layout
### Top Bar (global)
- App title + current project name.
- View tabs (DAG / Agents / TODO / Calendar).
- Primary actions:
  - **+ Node**
  - **AI Plan** (generate nodes & edges)
- Connection status + current hub URL (click to edit).

### Left Sidebar (project management)
- Projects list with create, select, delete.
- Optional filters (by status / tag).

### Main Content (views)
- DAG: node cards + simple auto-layout. Click node to open detail drawer.
- Agents: running sessions + history.
- TODO: global or project tasks (toggle).

### Right Drawer (details)
- Node details, resources, tags, status, dependencies.
- Launch agent from the node.

## 4) Node “Resources”
Each node supports resources (docs, papers, links, repos, codebases, datasets).
These are stored on the node and appended to agent prompts.

Resource schema:
```
{ kind, title, url, notes? }
```

## 5) Data Model (v2)
Core entities:
- Project { id, name, path, description }
- Node { id, project_id, title, description, status, tags, dependencies, metadata, created_at, updated_at }
- Edge { from, to } (derived from dependencies)
- AgentRun { id, node_id, project_id, agent_type, mode, status, prompt, created_at, completed_at }
- Task { id, project_id?, title, status, notes, created_at } (global or per project)

Node.metadata:
```
{
  resources: Resource[],
  ...extensible
}
```

## 6) API / Hub
### Required Endpoints
- Projects
  - GET /projects
  - POST /projects
  - DELETE /projects/{id}
- Graph
  - GET /projects/{id}/graph
- Nodes
  - POST /projects/{id}/nodes
  - PATCH /projects/{id}/nodes/{node_id}
  - DELETE /projects/{id}/nodes/{node_id}
- Runs
  - POST /projects/{id}/runs
  - GET /projects/{id}/runs

### TODOs (new)
- GET /projects/{id}/tasks (or GET /tasks?project_id=)
- POST /projects/{id}/tasks
- PATCH /tasks/{id}
- DELETE /tasks/{id}

### AI Plan (new)
- POST /projects/{id}/plan
  - input: { prompt, resources }
  - output: { nodes: [...], edges: [...] }

## 7) Hub Config
Use a single hub URL:
- `VITE_HUB_URL` for desktop.
- Show current hub URL + connection status in UI.

## 8) Implementation Strategy
### Phase 1 (stabilize)
- Fix node creation, update store immediately on success.
- Show errors inline if create fails.
- Add debug panel / hub URL indicator.

### Phase 2 (UI layout overhaul)
- Move views to top bar.
- Sidebar = Projects + filters.
- Add TODO view.

### Phase 3 (AI Plan)
- Modal: prompt + resources.
- Create nodes + edges via server response.

## 9) QA / Testing
- Create project → create node → node appears immediately.
- Add resources and verify they persist + appear in agent prompt.
- Switch hub URLs (local/remote) without rebuild if possible.
- Agents view shows recent runs.

## 10) Testing & Debugging Workflow (add to v2)
### Manual workflow checklist (fast sanity pass)
1. Launch hub (local) and desktop app.
2. Create a project, then create a node with 1–2 resources.
3. Confirm node appears in DAG immediately (no refresh).
4. Edit node description and resources, confirm persistence.
5. Launch agent run; verify prompt contains resources.
6. Add a TODO task (global + project); verify filters/toggles.
7. Switch hub URL (local → remote) and confirm status updates.

### Debug surfaces (must-have)
- A visible hub status badge + active URL (editable).
- Inline error panels for create/update failures.
- Optional “debug panel” that shows last request payload + response/error.

### Automated tests (minimal baseline)
- Backend (pytest + httpx):
  - create project
  - create node with resources
  - update node metadata/resources
  - create task (global + project)
  - AI plan endpoint returns nodes + edges shape
- Frontend (Playwright or Vitest + @testing-library/svelte):
  - Create project → create node workflow
  - Node appears in DAG
  - Error surfaced when hub is unreachable
  - TODO add + filter

## 11) Migration Notes
- Existing data: nodes already have metadata; resources fit cleanly.
- No DB migration needed if metadata is JSON.
