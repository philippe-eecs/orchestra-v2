/**
 * API utilities for Orchestra
 *
 * This file provides utility functions for execution backends.
 * The actual API calls are made via tauri-api.ts using Tauri IPC.
 */

import type { ExecutionConfig, ExecutionBackend } from './types';
import * as tauriApi from './tauri-api';

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
 * Execute an agent command via Tauri IPC
 */
export async function executeAgent(request: ExecuteRequest): Promise<ExecuteResponse> {
  if (!request.projectId || !request.nodeId) {
    return {
      status: 'error',
      error: 'projectId and nodeId are required',
    };
  }

  try {
    const response = await tauriApi.executeNode({
      projectId: request.projectId,
      nodeId: request.nodeId,
      executor: request.executor,
      prompt: request.prompt,
      options: request.options,
      projectPath: request.projectPath,
      executionConfig: request.executionConfig,
    });

    return {
      status: 'running',
      sessionId: response.sessionId,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check the status of an interactive session
 */
export async function getSessionStatus(
  sessionId: string,
  _backend: ExecutionBackend
): Promise<SessionStatusResponse> {
  try {
    const session = await tauriApi.getSession(sessionId);

    if (!session) {
      return {
        status: 'unknown',
        sessionId,
      };
    }

    const output = await tauriApi.getSessionOutput(sessionId);

    return {
      status: session.status === 'running' ? 'running' :
             session.status === 'completed' || session.status === 'failed' ? 'stopped' :
             'unknown',
      output: output || undefined,
      sessionId,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      sessionId,
    };
  }
}

/**
 * Poll for session completion
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
  const maxWait = options?.maxWaitMs || 30 * 60 * 1000;
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

    if (options?.onProgress && status.output) {
      options.onProgress(status.output);
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return {
    status: 'error',
    error: `Session timed out after ${maxWait / 1000} seconds`,
    sessionId,
    backend,
  };
}

/**
 * Stop an execution
 */
export async function stopExecution(sessionId: string): Promise<void> {
  await tauriApi.stopExecution(sessionId);
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
      gpu: true,
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
