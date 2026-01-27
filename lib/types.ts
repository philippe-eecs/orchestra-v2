// ========== AGENT CONFIG ==========

export type AgentType = 'claude' | 'codex' | 'gemini';

export interface AgentConfig {
  type: AgentType;
  model?: string; // Optional model override
}

// ========== CONTEXT ==========

export type ContextRef =
  | { type: 'file'; path: string }
  | { type: 'url'; url: string }
  | { type: 'parent_output'; nodeId: string }
  | { type: 'markdown'; content: string };

// ========== DELIVERABLES ==========

export type Deliverable =
  | { type: 'file'; path: string; id: string }
  | { type: 'response'; description: string; id: string }
  | { type: 'pr'; repo: string; id: string }
  | { type: 'edit'; url: string; id: string };

// Helper type for creating deliverables (without id)
export type DeliverableInput =
  | { type: 'file'; path: string }
  | { type: 'response'; description: string }
  | { type: 'pr'; repo: string }
  | { type: 'edit'; url: string };

// ========== CHECKS ==========

export interface BaseCheck {
  id: string;
  autoRetry?: boolean; // If true, tell agent to fix and retry (default: false)
  maxRetries?: number; // Max retry attempts (default: 3)
}

export type Check =
  | (BaseCheck & { type: 'file_exists'; path: string })
  | (BaseCheck & { type: 'command'; cmd: string })
  | (BaseCheck & { type: 'human_approval' })
  | (BaseCheck & { type: 'contains'; path: string; pattern: string });

// Helper type for creating checks (without id)
export type CheckInput =
  | { type: 'file_exists'; path: string; autoRetry?: boolean; maxRetries?: number }
  | { type: 'command'; cmd: string; autoRetry?: boolean; maxRetries?: number }
  | { type: 'human_approval' }
  | { type: 'contains'; path: string; pattern: string; autoRetry?: boolean; maxRetries?: number };

// ========== NODE ==========

export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Node {
  id: string;
  title: string;
  description: string;

  // Visual position
  position: { x: number; y: number };

  // Agent assignment
  agent: AgentConfig;

  // What to tell the agent
  prompt: string;

  // What files/resources the agent should work with
  context: ContextRef[];

  // What the node must produce
  deliverables: Deliverable[];

  // How we verify success
  checks: Check[];

  // Status tracking
  status: NodeStatus;

  // Reference to the running/completed session
  sessionId: string | null;
}

// ========== EDGE ==========

export interface Edge {
  id: string;
  sourceId: string;
  targetId: string;

  // Optional: specify WHICH deliverable flows through this edge
  sourceDeliverable?: string; // deliverable id - if omitted, all deliverables available
}

// ========== SESSION ==========

export type SessionStatus =
  | 'starting'
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'failed';

export interface Session {
  id: string;
  nodeId: string;
  tmuxSessionName: string;

  // Agent running in this session
  agentType: AgentType;
  agentPid: number | null;

  // Status
  status: SessionStatus;

  // Deliverable tracking
  deliverablesStatus: Record<string, 'pending' | 'produced'>;

  // Check results
  checkResults: Record<string, 'pending' | 'passed' | 'failed'>;

  // Retry tracking
  retryAttempts: Record<string, number>;

  // Timing
  startedAt: number;
  completedAt: number | null;
}

// ========== PROJECT CONTEXT ==========

export type Resource =
  | { type: 'file'; path: string; name: string }
  | { type: 'url'; url: string; name: string }
  | { type: 'document'; content: string; name: string };

export interface ProjectContext {
  // User-provided background info, preferences, files, etc.
  resources: Resource[];
  notes: string; // Freeform text context
  variables: Record<string, unknown>; // Key-value pairs
}

// ========== PROJECT ==========

export interface Project {
  id: string;
  name: string;
  description: string;
  location?: string; // Project directory path

  // Shared context all nodes can access
  context: ProjectContext;

  // The DAG
  nodes: Node[];
  edges: Edge[];
}

// ========== NODE RUN (Execution Record) ==========

export interface CompiledContext {
  files: string[];
  urls: string[];
  parentOutputs: { nodeId: string; content: string }[];
  markdownContent: string[];
}

export interface NodeRun {
  id: string;
  nodeId: string;
  projectId: string;

  // What was sent to the agent
  compiledContext: CompiledContext;
  prompt: string;

  // Agent details
  agentType: AgentType;
  agentCommand: string; // The actual CLI command used

  // Result
  status: 'running' | 'completed' | 'failed';
  output: string | null;
  error: string | null;

  // Timing
  startedAt: number;
  completedAt: number | null;
}

// ========== UI STATE ==========

export interface UIState {
  selectedProjectId: string | null;
  selectedNodeId: string | null;
  agentHubMinimized: boolean;
  terminalModalOpen: boolean;
  terminalSessionId: string | null;
}
