// ========== SYNC METADATA ==========

export interface SyncMeta {
  syncVersion: number;
  syncedAt: number | null;
  deviceId: string;
  deleted: boolean;
}

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
  agentId: string;
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

export type DeliverableInput =
  | { type: 'file'; path: string }
  | { type: 'response'; description: string }
  | { type: 'pr'; repo: string }
  | { type: 'edit'; url: string };

// ========== CHECKS ==========

export interface BaseCheck {
  id: string;
  autoRetry?: boolean;
  maxRetries?: number;
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
      threshold?: number;
      addToContext?: boolean;
    })
  | (BaseCheck & {
      type: 'test_runner';
      framework: 'npm' | 'pytest' | 'jest' | 'cargo' | 'go' | 'custom';
      command?: string;
      testPattern?: string;
    })
  | (BaseCheck & {
      type: 'eval_baseline';
      metric: 'duration' | 'memory' | 'accuracy' | 'custom';
      baseline: number;
      tolerance: number;
      command?: string;
      evaluator?: string;
    });

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
  position: { x: number; y: number };
  agent: AgentConfig;
  prompt: string;
  context: ContextRef[];
  deliverables: Deliverable[];
  checks: Check[];
  status: NodeStatus;
  sessionId: string | null;
  executionConfig?: ExecutionConfig;
}

// ========== EDGE ==========

export interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
  sourceDeliverable?: string;
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
  agentType: AgentType;
  agentPid: number | null;
  status: SessionStatus;
  deliverablesStatus: Record<string, 'pending' | 'produced'>;
  checkResults: Record<string, 'pending' | 'passed' | 'failed'>;
  retryAttempts: Record<string, number>;
  startedAt: number;
  completedAt: number | null;
  backend?: ExecutionBackend;
  attachCommand?: string;
  containerId?: string;
  sandboxInfo?: {
    worktreePath: string;
    branchName: string;
    prUrl?: string;
  };
  // NEW: For stuck detection
  lastHeartbeat?: number | null;
  executingDeviceId?: string;
}

// ========== PROJECT CONTEXT ==========

export type Resource =
  | { type: 'file'; path: string; name: string }
  | { type: 'url'; url: string; name: string }
  | { type: 'document'; content: string; name: string };

export interface ProjectContext {
  resources: Resource[];
  notes: string;
  variables: Record<string, unknown>;
}

// ========== PROJECT ==========

export interface Project {
  id: string;
  name: string;
  description: string;
  location?: string;
  context: ProjectContext;
  nodes: Node[];
  edges: Edge[];
  defaultExecutionConfig?: ExecutionConfig;
  createdAt?: number;
  updatedAt?: number;
}

// ========== NODE RUN ==========

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
  compiledContext: CompiledContext;
  prompt: string;
  agentType: AgentType;
  agentCommand: string;
  status: 'running' | 'completed' | 'failed';
  output: string | null;
  error: string | null;
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
  category?: string;
  createdAt: number;
}

export interface PrimitiveAgentTemplate extends BaseAgentTemplate {
  kind: 'primitive';
  agentType: 'claude' | 'codex' | 'gemini';
  defaultConfig: Partial<ClaudeConfig | CodexConfig | GeminiConfig>;
}

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

// ========== AGENT PRESETS ==========

export interface AgentPreset {
  id: string;
  label: string;
  description: string;
  group: 'Claude' | 'Codex' | 'Gemini' | 'Composed';
  config: AgentConfig;
}

export const AGENT_PRESETS: AgentPreset[] = [
  {
    id: 'claude-sonnet',
    label: 'Claude Sonnet',
    description: 'Balanced performance and speed',
    group: 'Claude',
    config: { type: 'claude', model: 'sonnet' },
  },
  {
    id: 'claude-opus',
    label: 'Claude Opus',
    description: 'Highest capability, complex reasoning',
    group: 'Claude',
    config: { type: 'claude', model: 'opus' },
  },
  {
    id: 'claude-haiku',
    label: 'Claude Haiku',
    description: 'Fast and lightweight',
    group: 'Claude',
    config: { type: 'claude', model: 'haiku' },
  },
  {
    id: 'codex-default',
    label: 'Codex',
    description: 'Code generation, default settings',
    group: 'Codex',
    config: { type: 'codex' },
  },
  {
    id: 'codex-high',
    label: 'Codex (High Reasoning)',
    description: 'More deliberate, better for complex code',
    group: 'Codex',
    config: { type: 'codex', reasoningEffort: 'high' },
  },
  {
    id: 'codex-xhigh',
    label: 'Codex (Max Reasoning)',
    description: 'Maximum reasoning effort',
    group: 'Codex',
    config: { type: 'codex', reasoningEffort: 'xhigh' },
  },
  {
    id: 'gemini-pro',
    label: 'Gemini Pro',
    description: 'Multimodal, web search capable',
    group: 'Gemini',
    config: { type: 'gemini', model: 'gemini-3-pro-preview' },
  },
  {
    id: 'gemini-flash',
    label: 'Gemini Flash',
    description: 'Fast multimodal processing',
    group: 'Gemini',
    config: { type: 'gemini', model: 'gemini-3-flash' },
  },
];

// ========== EXECUTION BACKENDS ==========

export type ExecutionBackend =
  | 'local'
  | 'docker'
  | 'docker-interactive'
  | 'remote'
  | 'modal';

export interface DockerMount {
  hostPath: string;
  containerPath: string;
  readonly?: boolean;
}

export interface DockerConfig {
  image?: string;
  mounts?: DockerMount[];
  env?: Record<string, string>;
  resources?: {
    memory?: string;
    cpus?: string;
  };
  network?: string;
}

export interface RemoteConfig {
  host: string;
  user?: string;
  keyPath?: string;
  port?: number;
}

export interface ModalConfig {
  functionName?: string;
  gpu?: 'T4' | 'A10G' | 'A100' | 'H100';
  timeout?: number;
  memory?: number;
}

export interface InteractiveConfig {
  sessionName?: string;
  timeout?: number;
}

export interface SandboxConfig {
  enabled: boolean;
  type: 'git-worktree';
  branchPrefix?: string;
  createPR?: boolean;
  prBaseBranch?: string;
  cleanupOnSuccess?: boolean;
  keepOnFailure?: boolean;
}

export interface ExecutionConfig {
  backend: ExecutionBackend;
  docker?: DockerConfig;
  remote?: RemoteConfig;
  modal?: ModalConfig;
  interactive?: InteractiveConfig;
  sandbox?: SandboxConfig;
}

export interface ExecutionResult {
  status: 'done' | 'running' | 'error';
  output?: string;
  error?: string;
  sessionId?: string;
  attachCommand?: string;
  backend?: ExecutionBackend;
  duration?: number;
}

export interface ExecuteRequest {
  executor: 'claude' | 'codex' | 'gemini';
  prompt: string;
  options?: Record<string, unknown>;
  executionConfig?: ExecutionConfig;
  projectPath?: string;
  projectId?: string;
  nodeId?: string;
}

// ========== NEW: DEVICE ==========

export interface Device {
  id: string;
  name: string;
  platform: 'macos' | 'ios';
  pushToken: string | null;
  capabilities: ExecutionBackend[];
}

// ========== NEW: CODE TODO ==========

export interface CodeTodo {
  id: string;
  projectId: string;
  filePath: string;
  lineNumber: number;
  content: string;
  type: 'TODO' | 'FIXME' | 'HACK';
  tracked: boolean;
  linkedNodeId?: string;
}

// ========== NEW: NOTIFICATION EVENT ==========

export interface NotificationEvent {
  id: string;
  type: 'human_input_needed' | 'agent_stuck' | 'retry_exhausted' | 'execution_failed';
  projectId: string;
  nodeId?: string;
  message: string;
  priority: 'normal' | 'high' | 'urgent';
  acknowledged: boolean;
}

// ========== NAVIGATION ==========

export type AppView = 'dashboard' | 'canvas' | 'agents' | 'runs' | 'settings';

// ========== SYSTEM STATUS ==========

export interface SystemStatus {
  dockerAvailable: boolean;
  claudeCliDetected: boolean;
  codexCliDetected: boolean;
  geminiCliDetected: boolean;
  lastChecked: number | null;
}

// ========== RUN HISTORY ==========

export interface RunHistoryEntry {
  id: string;
  projectId: string;
  projectName: string;
  startedAt: number;
  completedAt: number | null;
  status: 'running' | 'completed' | 'failed';
  nodesTotal: number;
  nodesCompleted: number;
  nodesFailed: number;
  duration: number | null;
}
