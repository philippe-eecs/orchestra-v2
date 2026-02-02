export type AgentType = 'claude' | 'codex' | 'gemini';

export interface AgentConfig {
  type: AgentType;
  model?: string;
}

export type ContextRef =
  | { type: 'file'; path: string }
  | { type: 'parent_output'; nodeId: string }
  | { type: 'text'; content: string };

export interface Deliverable {
  id: string;
  type: 'file' | 'response';
  description: string;
}

export type Check =
  | { id: string; type: 'file_exists'; path: string; autoRetry?: boolean; maxRetries?: number }
  | { id: string; type: 'command'; cmd: string; autoRetry?: boolean; maxRetries?: number }
  | { id: string; type: 'contains'; path: string; pattern: string; autoRetry?: boolean; maxRetries?: number }
  | { id: string; type: 'human_approval' }
  | { id: string; type: 'test_runner'; framework: 'npm' | 'pytest' | 'jest' | 'cargo'; autoRetry?: boolean; maxRetries?: number };

export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_approval' | 'awaiting_input';

export interface Node {
  id: string;
  title: string;
  position: { x: number; y: number };
  agent: AgentConfig;
  prompt: string;
  context: ContextRef[];
  deliverables: Deliverable[];
  checks: Check[];
  status: NodeStatus;
}

export interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
  sourceDeliverable?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  location?: string;
  nodes: Node[];
  edges: Edge[];
  createdAt: number;
  updatedAt: number;
}

export type SessionStatus = 'running' | 'completed' | 'failed' | 'awaiting_approval' | 'awaiting_input';

export interface Session {
  id: string;
  nodeId: string;
  status: SessionStatus;
  output: string;
  error?: string;
  exitCode?: number | null;
  startedAt: number;
  completedAt?: number;
}

export interface CheckResult {
  id: string;
  checkType: string;
  passed: boolean;
  message?: string;
}

export type AppView = 'dashboard' | 'canvas' | 'runs';

