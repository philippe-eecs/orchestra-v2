import { writable, derived, get } from 'svelte/store';
import { api } from '../lib/api';
import { hubUrl } from './hub';
import { selectedProjectId } from './projects';
import type {
  Execution,
  ExecutionCreate,
  ExecutionUpdate,
  ExecutionWithStepRuns,
  StepRun,
  StepRunUpdate,
  LaunchPreview,
  LaunchRequest,
  TerminalMessage,
} from '../lib/types';

// Stores
export const executions = writable<Execution[]>([]);
export const executionsLoading = writable<boolean>(false);
export const executionsError = writable<string | null>(null);

export const selectedExecutionId = writable<number | null>(null);
export const selectedExecution = writable<ExecutionWithStepRuns | null>(null);
export const selectedExecutionLoading = writable<boolean>(false);

// Terminal output store
export const terminalOutput = writable<string>('');
export const terminalConnected = writable<boolean>(false);

// Derived stores
export const sortedExecutions = derived(executions, ($executions) => {
  return [...$executions].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
});

export const runningExecutions = derived(executions, ($executions) => {
  return $executions.filter(e => e.status === 'running' || e.status === 'pending');
});

// Execution CRUD
export async function loadExecutions(nodeId?: number, templateId?: number): Promise<void> {
  const projectId = get(selectedProjectId);
  if (projectId === null) {
    executions.set([]);
    return;
  }

  executionsLoading.set(true);
  executionsError.set(null);

  try {
    const data = await api.listExecutions(projectId, nodeId, templateId);
    executions.set(data);
  } catch (error) {
    executionsError.set(error instanceof Error ? error.message : 'Failed to load executions');
  } finally {
    executionsLoading.set(false);
  }
}

export async function loadExecution(execId: number): Promise<ExecutionWithStepRuns | null> {
  const projectId = get(selectedProjectId);
  if (projectId === null) return null;

  selectedExecutionLoading.set(true);
  executionsError.set(null);

  try {
    const data = await api.getExecution(projectId, execId);
    selectedExecution.set(data);
    selectedExecutionId.set(execId);
    return data;
  } catch (error) {
    executionsError.set(error instanceof Error ? error.message : 'Failed to load execution');
    return null;
  } finally {
    selectedExecutionLoading.set(false);
  }
}

export async function createExecution(data: ExecutionCreate): Promise<ExecutionWithStepRuns | null> {
  const projectId = get(selectedProjectId);
  if (projectId === null) return null;

  executionsError.set(null);

  try {
    const execution = await api.createExecution(projectId, data);
    executions.update(es => [execution, ...es]);
    selectedExecution.set(execution);
    selectedExecutionId.set(execution.id);
    return execution;
  } catch (error) {
    executionsError.set(error instanceof Error ? error.message : 'Failed to create execution');
    return null;
  }
}

export async function updateExecution(execId: number, data: ExecutionUpdate): Promise<Execution | null> {
  const projectId = get(selectedProjectId);
  if (projectId === null) return null;

  executionsError.set(null);

  try {
    const execution = await api.updateExecution(projectId, execId, data);
    executions.update(es => es.map(e => e.id === execId ? execution : e));

    if (get(selectedExecutionId) === execId) {
      selectedExecution.update(e => e ? { ...e, ...execution } : null);
    }

    return execution;
  } catch (error) {
    executionsError.set(error instanceof Error ? error.message : 'Failed to update execution');
    return null;
  }
}

export async function cancelExecution(execId: number): Promise<Execution | null> {
  const projectId = get(selectedProjectId);
  if (projectId === null) return null;

  executionsError.set(null);

  try {
    const execution = await api.cancelExecution(projectId, execId);
    executions.update(es => es.map(e => e.id === execId ? execution : e));

    if (get(selectedExecutionId) === execId) {
      selectedExecution.update(e => e ? { ...e, ...execution } : null);
    }

    return execution;
  } catch (error) {
    executionsError.set(error instanceof Error ? error.message : 'Failed to cancel execution');
    return null;
  }
}

export async function updateStepRun(execId: number, stepRunId: number, data: StepRunUpdate): Promise<StepRun | null> {
  const projectId = get(selectedProjectId);
  if (projectId === null) return null;

  executionsError.set(null);

  try {
    const stepRun = await api.updateStepRun(projectId, execId, stepRunId, data);

    if (get(selectedExecutionId) === execId) {
      selectedExecution.update(e => {
        if (e) {
          return {
            ...e,
            step_runs: e.step_runs.map(sr => sr.id === stepRunId ? stepRun : sr),
          };
        }
        return e;
      });
    }

    return stepRun;
  } catch (error) {
    executionsError.set(error instanceof Error ? error.message : 'Failed to update step run');
    return null;
  }
}

export function selectExecution(id: number | null): void {
  selectedExecutionId.set(id);
  if (id === null) {
    selectedExecution.set(null);
    terminalOutput.set('');
  } else {
    loadExecution(id);
  }
}

export function getExecutionsForNode(nodeId: number): Execution[] {
  return get(executions).filter(e => e.node_id === nodeId);
}

// Launch functions
export async function previewLaunch(nodeId: number, request: LaunchRequest): Promise<LaunchPreview | null> {
  const projectId = get(selectedProjectId);
  if (projectId === null) return null;

  executionsError.set(null);

  try {
    return await api.previewLaunch(projectId, nodeId, request);
  } catch (error) {
    executionsError.set(error instanceof Error ? error.message : 'Failed to preview launch');
    return null;
  }
}

export async function launch(nodeId: number, request: LaunchRequest): Promise<ExecutionWithStepRuns | null> {
  const projectId = get(selectedProjectId);
  if (projectId === null) return null;

  executionsError.set(null);

  try {
    const execution = await api.launch(projectId, nodeId, request);
    executions.update(es => [execution, ...es]);
    selectedExecution.set(execution);
    selectedExecutionId.set(execution.id);
    return execution;
  } catch (error) {
    executionsError.set(error instanceof Error ? error.message : 'Failed to launch execution');
    return null;
  }
}

// Terminal WebSocket
let terminalWs: WebSocket | null = null;

export function connectTerminal(execId: number): void {
  const projectId = get(selectedProjectId);
  if (projectId === null) return;

  // Close existing connection
  disconnectTerminal();

  const baseUrl = get(hubUrl);
  const wsUrl = baseUrl.replace(/^http/, 'ws');

  terminalWs = new WebSocket(`${wsUrl}/projects/${projectId}/executions/${execId}/terminal`);

  terminalWs.onopen = () => {
    terminalConnected.set(true);
    terminalOutput.set(''); // Clear previous output
  };

  terminalWs.onmessage = (event) => {
    try {
      const message: TerminalMessage = JSON.parse(event.data);
      handleTerminalMessage(message);
    } catch {
      // If not JSON, treat as plain text output
      terminalOutput.update(o => o + event.data);
    }
  };

  terminalWs.onclose = () => {
    terminalConnected.set(false);
  };

  terminalWs.onerror = () => {
    terminalConnected.set(false);
    executionsError.set('Terminal connection error');
  };
}

export function disconnectTerminal(): void {
  if (terminalWs) {
    terminalWs.close();
    terminalWs = null;
  }
  terminalConnected.set(false);
}

function handleTerminalMessage(message: TerminalMessage): void {
  switch (message.type) {
    case 'connected':
      terminalOutput.update(o => o + `Connected to session: ${message.tmux_session || 'unknown'}\n`);
      break;

    case 'info':
      if (message.message) {
        terminalOutput.update(o => o + `[INFO] ${message.message}\n`);
      }
      break;

    case 'output':
      if (message.data) {
        terminalOutput.update(o => o + message.data);
      }
      break;

    case 'step_start':
      terminalOutput.update(o => o + `\n--- Starting: ${message.step_name} ---\n`);
      break;

    case 'step_complete':
      terminalOutput.update(o => o + `\n--- Completed: ${message.step_name} ---\n`);
      if (message.output) {
        terminalOutput.update(o => o + message.output + '\n');
      }
      break;

    case 'status':
      if (message.status) {
        terminalOutput.update(o => o + `\n=== Execution ${message.status} ===\n`);

        // Update execution status in store
        const execId = get(selectedExecutionId);
        if (execId) {
          executions.update(es => es.map(e =>
            e.id === execId ? { ...e, status: message.status! } : e
          ));
          selectedExecution.update(e =>
            e && e.id === execId ? { ...e, status: message.status! } : e
          );
        }
      }
      break;
  }
}

// Get attach command from server (or fallback to local)
export async function getAttachCommand(execId: number): Promise<string | null> {
  const projectId = get(selectedProjectId);
  if (projectId === null) return null;

  try {
    const result = await api.getAttachCommand(projectId, execId);
    if (result.success) {
      return result.command;
    }
  } catch (error) {
    // Fallback to local command
    const execution = get(selectedExecution);
    if (execution) {
      return `tmux attach -t ${execution.tmux_session || `exec-${execution.id}`}`;
    }
  }

  return null;
}

// Generate SSH command for external terminal (deprecated - use getAttachCommand)
export function getTmuxAttachCommand(execution: Execution): string {
  const session = execution.tmux_session || `exec-${execution.id}`;
  return `tmux attach -t ${session}`;
}
