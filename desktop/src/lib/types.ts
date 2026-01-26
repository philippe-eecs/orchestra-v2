export type NodeStatus = 'pending' | 'in_progress' | 'needs_review' | 'completed' | 'blocked' | 'failed';
export type AgentType = 'claude' | 'codex' | 'gemini' | 'custom';
export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Resource {
  kind: string;
  title: string;
  url?: string;
  notes?: string;
}

export interface NodeMetadata {
  resources: Resource[];
  deliverables?: string;
  extra: Record<string, unknown>;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectCreate {
  name: string;
  description?: string;
}

export interface Node {
  id: number;
  project_id: number;
  title: string;
  description?: string;
  status: NodeStatus;
  agent_type?: AgentType;
  prompt?: string;
  context?: string;
  metadata: NodeMetadata;
  position_x: number;
  position_y: number;
  parent_ids: number[];
  created_at: string;
  updated_at: string;
}

export interface NodeCreate {
  title: string;
  description?: string;
  status?: NodeStatus;
  agent_type?: AgentType;
  prompt?: string;
  context?: string;
  metadata?: NodeMetadata;
  position_x?: number;
  position_y?: number;
  parent_ids?: number[];
}

export interface NodeUpdate {
  title?: string;
  description?: string;
  status?: NodeStatus;
  agent_type?: AgentType;
  prompt?: string;
  context?: string;
  metadata?: NodeMetadata;
  position_x?: number;
  position_y?: number;
  parent_ids?: number[];
}

export interface Edge {
  source_id: number;
  target_id: number;
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
}

export interface Task {
  id: number;
  project_id?: number;
  node_id?: number;
  title: string;
  description?: string;
  completed: boolean;
  priority: number;
  due_date?: string;
  created_at: string;
  updated_at: string;
}

export interface TaskCreate {
  title: string;
  description?: string;
  completed?: boolean;
  priority?: number;
  due_date?: string;
  project_id?: number;
  node_id?: number;
}

export interface Run {
  id: number;
  project_id: number;
  node_id: number;
  agent_type: AgentType;
  prompt: string;
  status: RunStatus;
  output?: string;
  error?: string;
  metadata: Record<string, unknown>;
  started_at?: string;
  finished_at?: string;
  created_at: string;
  updated_at: string;
}

export interface RunCreate {
  node_id: number;
  agent_type: AgentType;
  prompt: string;
}

export interface PlanRequest {
  prompt: string;
  resources?: Resource[];
}

export interface PlanResponse {
  nodes: Partial<NodeCreate>[];
  edges: { source_index: number; target_index: number }[];
}

export interface WSMessage {
  event: string;
  data: unknown;
}

// Agent Templates
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type OutputFormat = 'text' | 'json' | 'code' | 'markdown';

export interface AgentStepEdge {
  parent_id: number;
  child_id: number;
}

export interface AgentStep {
  id: number;
  template_id: number;
  name: string;
  agent_type: AgentType;
  prompt_template: string;
  output_format: OutputFormat;
  position_x: number;
  position_y: number;
  metadata: Record<string, unknown>;
  parent_ids: number[];
  child_ids: number[];
  created_at: string;
  updated_at: string;
}

export interface AgentStepCreate {
  name: string;
  agent_type: AgentType;
  prompt_template: string;
  output_format?: OutputFormat;
  position_x?: number;
  position_y?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentStepUpdate {
  name?: string;
  agent_type?: AgentType;
  prompt_template?: string;
  output_format?: OutputFormat;
  position_x?: number;
  position_y?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentTemplate {
  id: number;
  name: string;
  description?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentTemplateCreate {
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
  steps?: AgentStepCreate[];
  edges?: AgentStepEdge[];
}

export interface AgentTemplateUpdate {
  name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentTemplateWithSteps extends AgentTemplate {
  steps: AgentStep[];
  edges: AgentStepEdge[];
}

// Executions
export interface StepRun {
  id: number;
  execution_id: number;
  step_id?: number;
  agent_type: AgentType;
  prompt: string;
  status: StepStatus;
  output?: string;
  error?: string;
  metadata: Record<string, unknown>;
  started_at?: string;
  finished_at?: string;
  created_at: string;
  updated_at: string;
}

export interface StepRunUpdate {
  status?: StepStatus;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface Execution {
  id: number;
  project_id: number;
  node_id?: number;
  template_id?: number;
  status: ExecutionStatus;
  tmux_session?: string;
  worktree_path?: string;
  worktree_branch?: string;
  metadata: Record<string, unknown>;
  started_at?: string;
  finished_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ExecutionCreate {
  node_id?: number;
  template_id?: number;
  create_worktree?: boolean;
  context?: Record<string, unknown>;
}

export interface ExecutionUpdate {
  status?: ExecutionStatus;
  tmux_session?: string;
  worktree_path?: string;
  worktree_branch?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionWithStepRuns extends Execution {
  step_runs: StepRun[];
}

export interface LaunchPreview {
  template_id: number;
  context: Record<string, unknown>;
  resolved_prompts: {
    step_id: number;
    step_name: string;
    agent_type: AgentType;
    prompt_template: string;
    resolved_prompt: string;
  }[];
}

export interface LaunchRequest {
  template_id: number;
  context?: Record<string, unknown>;
  create_worktree?: boolean;
}

// Terminal WebSocket messages
export interface TerminalMessage {
  type: 'connected' | 'info' | 'output' | 'step_start' | 'step_complete' | 'status';
  execution_id?: number;
  data?: string;
  step_id?: number;
  step_name?: string;
  output?: string;
  status?: ExecutionStatus;
  tmux_session?: string;
  timestamp?: string;
  message?: string;  // For info messages
}

// Pipeline Types
export type PipelinePhase = 'ideation' | 'synthesis' | 'implement' | 'critic';

export interface SynthesisQuestions {
  node_id: number;
  node_title: string;
  execution_id?: number;
  status: string;
  agreements: string[];
  conflicts: string[];
  questions: string[];
  final_plan: string;
}

export interface FeedbackSubmission {
  answers: Record<string, string>;
  notes?: string;
  approved: boolean;
}

export interface FeedbackResponse {
  status: string;
  message: string;
  node_id: number;
  execution_id?: number;
}

export interface CriticResult {
  agent_type: AgentType;
  vote: 'YES' | 'NO';
  severity?: 'minor' | 'major';
  reasoning: string;
  feedback?: string;
}

export interface PipelineLaunchRequest {
  use_default_pipeline?: boolean;
  custom_pipeline_id?: number;
}

export interface PipelineLaunchResponse {
  execution_id: number;
  node_id: number;
  status: string;
  message: string;
}
