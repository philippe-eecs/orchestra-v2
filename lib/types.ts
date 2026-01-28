// ========== AGENT CONFIG ==========

export type AgentType = 'claude' | 'codex' | 'gemini' | 'composed';

export type ClaudeConfig = {
  type: 'claude';
  model?: string;
  thinkingBudget?: number;
};

export type CodexConfig = {
  type: 'codex';
  model?: string;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
};

export type GeminiConfig = {
  type: 'gemini';
  model?: string;
};

export type ComposedAgentConfig = {
  type: 'composed';
  agentId: string; // References agent library
};

export type AgentConfig = ClaudeConfig | CodexConfig | GeminiConfig | ComposedAgentConfig;

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
  | (BaseCheck & { type: 'contains'; path: string; pattern: string })
  | (BaseCheck & {
      type: 'llm_critic';
      criticAgent: AgentType;
      criteria: string;
      threshold?: number; // 0-100, default 70
      addToContext?: boolean; // Add critique to context on retry
    })
  | (BaseCheck & {
      type: 'test_runner';
      framework: 'npm' | 'pytest' | 'jest' | 'cargo' | 'go' | 'custom';
      command?: string; // Required for 'custom'
      testPattern?: string;
    })
  | (BaseCheck & {
      type: 'eval_baseline';
      metric: 'duration' | 'memory' | 'accuracy' | 'custom';
      baseline: number;
      tolerance: number; // Percentage
      command?: string;
      evaluator?: string;
    });

// Helper type for creating checks (without id)
export type CheckInput =
  | { type: 'file_exists'; path: string; autoRetry?: boolean; maxRetries?: number }
  | { type: 'command'; cmd: string; autoRetry?: boolean; maxRetries?: number }
  | { type: 'human_approval' }
  | { type: 'contains'; path: string; pattern: string; autoRetry?: boolean; maxRetries?: number }
  | {
      type: 'llm_critic';
      criticAgent: AgentType;
      criteria: string;
      threshold?: number;
      addToContext?: boolean;
      autoRetry?: boolean;
      maxRetries?: number;
    }
  | {
      type: 'test_runner';
      framework: 'npm' | 'pytest' | 'jest' | 'cargo' | 'go' | 'custom';
      command?: string;
      testPattern?: string;
      autoRetry?: boolean;
      maxRetries?: number;
    }
  | {
      type: 'eval_baseline';
      metric: 'duration' | 'memory' | 'accuracy' | 'custom';
      baseline: number;
      tolerance: number;
      command?: string;
      evaluator?: string;
      autoRetry?: boolean;
      maxRetries?: number;
    };

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

// ========== AGENT LIBRARY ==========

export interface BaseAgentTemplate {
  id: string;
  name: string;
  description: string;
  category?: string; // 'research', 'code', 'analysis', etc.
  createdAt: number;
}

export interface PrimitiveAgentTemplate extends BaseAgentTemplate {
  kind: 'primitive';
  agentType: 'claude' | 'codex' | 'gemini';
  defaultConfig: Partial<ClaudeConfig | CodexConfig | GeminiConfig>;
}

// ComposedNode = Node without position/status/sessionId (the pure logic)
export interface ComposedNode {
  id: string;
  title: string;
  prompt: string;
  agent: AgentConfig;
  context: ContextRef[];
  deliverables: Deliverable[];
  checks: Check[];
}

export interface ComposedAgentInput {
  id: string;
  name: string;
  description?: string;
  mappedTo: { nodeId: string; contextType: ContextRef['type'] }[];
}

export interface ComposedAgentOutput {
  id: string;
  name: string;
  sourceNodeId: string;
  sourceDeliverableId?: string;
}

export interface ComposedAgentTemplate extends BaseAgentTemplate {
  kind: 'composed';
  nodes: ComposedNode[];
  edges: Edge[];
  inputs: ComposedAgentInput[];
  outputs: ComposedAgentOutput[];
}

export type AgentTemplate = PrimitiveAgentTemplate | ComposedAgentTemplate;
