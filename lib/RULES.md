# Orchestra: DAG-Based Agent Orchestration - Design Rules

## Core Philosophy

Orchestra orchestrates **AI agents** (claude, codex, gemini) running on VMs. Each agent runs in a **tmux session** that users can attach to and interact with. Orchestra's job is:

1. **Context Management** - What files/resources each agent can access
2. **Direction** - What prompt/instruction each agent receives
3. **Flow** - How outputs from one agent feed into the next
4. **Completion** - When deliverables are produced and checks pass

We are NOT building a general workflow engine. We're building an **agent orchestrator** with live terminal access.

---

## Key Insight: Agents Run in Tmux Sessions

When a node executes:
1. Spawn a **tmux session** on VM
2. Run the agent (claude/codex/gemini CLI) in that session
3. User can **attach via Ghostty or in-app terminal** to watch/redirect
4. Node completes when **deliverables exist AND checks pass**
5. Session terminates (or persists for debugging)

---

## Core Abstractions

### 1. Project

The top-level container. Holds shared context available to all nodes.

```typescript
Project {
  id: string
  name: string
  description: string
  location?: string           // Project directory path

  context: ProjectContext     // Shared context all nodes can access
  nodes: Node[]               // The DAG nodes
  edges: Edge[]               // Connections between nodes
}

ProjectContext {
  resources: Resource[]       // Files, URLs, documents
  notes: string               // Freeform text context
  variables: Record<string, unknown>  // Key-value pairs
}
```

### 2. Node

A unit of work assigned to an agent. Every node has an agent.

```typescript
Node {
  id: string
  title: string
  description: string
  position: { x: number, y: number }  // Visual position

  agent: AgentConfig          // { type: 'claude' | 'codex' | 'gemini', model?: string }
  prompt: string              // The instruction/task

  context: ContextRef[]       // Files/resources to work with
  deliverables: Deliverable[] // What the node must produce
  checks: Check[]             // How we verify success

  status: 'pending' | 'running' | 'completed' | 'failed'
  sessionId: string | null    // Reference to running/completed session
}
```

### 3. Context

Files/resources the agent should READ (not appended to prompt):

```typescript
ContextRef =
  | { type: 'file', path: string }           // Relative to project
  | { type: 'url', url: string }             // Web page, Google Drive, etc.
  | { type: 'parent_output', nodeId: string } // Output from a parent node
  | { type: 'markdown', content: string }    // Inline markdown content
```

### 4. Deliverable

What the node must PRODUCE:

```typescript
Deliverable =
  | { type: 'file', path: string, id: string }      // Must create this file
  | { type: 'response', description: string, id: string } // A written response
  | { type: 'pr', repo: string, id: string }        // A pull request
  | { type: 'edit', url: string, id: string }       // Edit to external doc
```

### 5. Check

How we VERIFY success:

```typescript
Check =
  | { type: 'file_exists', path: string, id: string, autoRetry?: boolean, maxRetries?: number }
  | { type: 'command', cmd: string, id: string, autoRetry?: boolean, maxRetries?: number }
  | { type: 'human_approval', id: string }
  | { type: 'contains', path: string, pattern: string, id: string, autoRetry?: boolean, maxRetries?: number }
```

**Retry behavior:**
- If `autoRetry: true` and check fails, agent is told what failed and asked to fix it
- Retries up to `maxRetries` times (default: 3)
- If still failing after retries, node fails and user must intervene

### 6. Edge

A connection between nodes indicating dependency and data flow:

```typescript
Edge {
  id: string
  sourceId: string           // Parent node
  targetId: string           // Child node
  sourceDeliverable?: string // Optional: specific deliverable to pass through
}
```

### 7. Session

Tmux session where agent runs:

```typescript
Session {
  id: string
  nodeId: string
  tmuxSessionName: string     // e.g., "orchestra-node-123"

  agentType: 'claude' | 'codex' | 'gemini'
  agentPid: number | null

  status: 'starting' | 'running' | 'awaiting_approval' | 'completed' | 'failed'

  deliverablesStatus: Record<string, 'pending' | 'produced'>
  checkResults: Record<string, 'pending' | 'passed' | 'failed'>
  retryAttempts: Record<string, number>

  startedAt: number
  completedAt: number | null
}
```

---

## Workflow Execution

### Execution Order

1. Find all nodes with no incomplete parents ("ready" nodes)
2. Execute ready nodes (can parallelize)
3. When a node completes, check if any children are now ready
4. Repeat until all nodes complete or a failure occurs

### Node Execution Steps

1. Create session
2. Compile context (resolve files, URLs, parent outputs)
3. Build full prompt (context + prompt + deliverables instruction)
4. Run agent CLI
5. Verify deliverables exist
6. Run checks (with auto-retry if configured)
7. If human_approval check, pause for approval
8. Mark session/node as completed or failed

---

## Core Rules

1. **Every node has an agent** - No pure transform nodes. If work needs doing, an agent does it.
2. **Context = files to read** - Not appended to prompt. Agent is told "read these files."
3. **Deliverables are explicit** - Each node declares what it must produce.
4. **Checks verify completion** - Node only completes when ALL checks pass.
5. **Users can intervene** - Attach to tmux session anytime via Ghostty or in-app terminal.
6. **Edges indicate data flow** - Can specify which specific deliverable flows to which child.
7. **Retry is configurable** - Each check can auto-retry or fail immediately.

---

## What We're NOT Doing (for now)

1. **Tool definitions** - Agents handle their own tools
2. **Complex edge types** - Just simple dependencies
3. **Conditional branching** - No if/else nodes
4. **Loops** - No iteration
5. **Nested workflows** - Single flat DAG per project
6. **Type schemas** - No formal input/output typing

These can be added later if needed.

---

## File Organization

```
orchestra/
  app/
    page.tsx              # Main page with demo data
    api/
      execute/route.ts    # Agent execution endpoint
      check/
        file-exists/      # File existence check
        command/          # Command execution check
        contains/         # File content check

  components/
    header.tsx            # Top navigation
    sidebar.tsx           # Project/workflow list
    workflow-canvas.tsx   # DAG visualization
    custom-node.tsx       # Node component
    node-panel.tsx        # Node editing panel
    agent-hub.tsx         # Running sessions

  lib/
    types.ts              # Type definitions
    store.ts              # Zustand state management
    execution.ts          # Execution engine
    api.ts                # API client
    utils.ts              # Utilities

    RULES.md              # This file
```
