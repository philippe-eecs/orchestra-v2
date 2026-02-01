// API client - uses Next.js API routes (no separate backend needed)

import type { ExecutionConfig, ExecutionBackend } from './types';

export interface ExecuteRequest {
  executor: 'claude' | 'codex' | 'gemini';
  prompt: string;
  options?: Record<string, unknown>;
  executionConfig?: ExecutionConfig;
  projectPath?: string;
  projectId?: string;
  nodeId?: string;
}

export interface ExecuteResponse {
  status: 'done' | 'running' | 'error';
  output?: string;
  error?: string;
  sessionId?: string;
  attachCommand?: string;
  backend?: ExecutionBackend;
  duration?: number;
  sandboxInfo?: {
    worktreePath: string;
    branchName: string;
    prUrl?: string;
  };
}

export interface SessionStatusResponse {
  status: 'running' | 'stopped' | 'unknown' | 'error';
  output?: string;
  error?: string;
  sessionId: string;
}

/**
 * Execute an agent command
 */
export async function executeAgent(request: ExecuteRequest): Promise<ExecuteResponse> {
  const response = await fetch('/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  return response.json();
}

/**
 * Check the status of an interactive session
 */
export async function getSessionStatus(
  sessionId: string,
  backend: ExecutionBackend
): Promise<SessionStatusResponse> {
  const params = new URLSearchParams({ sessionId, backend });
  const response = await fetch(`/api/execute?${params}`, {
    method: 'GET',
  });

  return response.json();
}

/**
 * Poll for session completion
 * Returns the final result when the session stops
 */
export async function waitForSession(
  sessionId: string,
  backend: ExecutionBackend,
  options?: {
    pollIntervalMs?: number;
    maxWaitMs?: number;
    onProgress?: (output: string) => void;
  }
): Promise<ExecuteResponse> {
  const pollInterval = options?.pollIntervalMs || 2000;
  const maxWait = options?.maxWaitMs || 30 * 60 * 1000; // 30 minutes default
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const status = await getSessionStatus(sessionId, backend);

    if (status.status === 'stopped' || status.status === 'error') {
      return {
        status: status.status === 'stopped' ? 'done' : 'error',
        output: status.output,
        error: status.error,
        sessionId,
        backend,
      };
    }

    // Report progress if callback provided
    if (options?.onProgress && status.output) {
      options.onProgress(status.output);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // Timeout
  return {
    status: 'error',
    error: `Session timed out after ${maxWait / 1000} seconds`,
    sessionId,
    backend,
  };
}

/**
 * Helper to determine if a backend supports interactive features
 */
export function isInteractiveBackend(backend: ExecutionBackend): boolean {
  return ['docker-interactive', 'remote'].includes(backend);
}

/**
 * Get a human-readable description of execution backend
 */
export function getBackendLabel(backend: ExecutionBackend): string {
  const labels: Record<ExecutionBackend, string> = {
    local: 'Local',
    docker: 'Docker',
    'docker-interactive': 'Docker (Interactive)',
    remote: 'Remote VM',
    modal: 'Modal (Serverless)',
  };
  return labels[backend] || backend;
}

/**
 * Get backend-specific features/capabilities
 */
export function getBackendCapabilities(backend: ExecutionBackend): {
  isolated: boolean;
  interactive: boolean;
  gpu: boolean;
  autoscale: boolean;
  surviveDisconnect: boolean;
} {
  const capabilities: Record<ExecutionBackend, ReturnType<typeof getBackendCapabilities>> = {
    local: {
      isolated: false,
      interactive: false,
      gpu: false,
      autoscale: false,
      surviveDisconnect: false,
    },
    docker: {
      isolated: true,
      interactive: false,
      gpu: false,
      autoscale: false,
      surviveDisconnect: false,
    },
    'docker-interactive': {
      isolated: true,
      interactive: true,
      gpu: false,
      autoscale: false,
      surviveDisconnect: true,
    },
    remote: {
      isolated: true,
      interactive: true,
      gpu: true, // Depends on VM
      autoscale: false,
      surviveDisconnect: true,
    },
    modal: {
      isolated: true,
      interactive: false,
      gpu: true,
      autoscale: true,
      surviveDisconnect: true,
    },
  };
  return capabilities[backend];
}
