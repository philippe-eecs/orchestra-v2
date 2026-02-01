/**
 * Unified Executor Interface
 *
 * Routes execution requests to the appropriate backend based on ExecutionConfig.
 * Supports multiple backends: local, docker, docker-interactive, remote, modal.
 */

import type {
  ExecutionConfig,
  ExecutionResult,
  ExecutionBackend,
  ExecuteRequest,
  Node,
  Project,
} from './types';

// Import backend implementations
import { executeLocal } from './executors/local';
import { executeDocker } from './executors/docker';
import { executeDockerInteractive, getSessionOutput } from './executors/docker-interactive';
import { executeRemote } from './executors/remote';
import { executeModal } from './executors/modal';

// Re-export ExecuteRequest for API consumers
export type { ExecuteRequest } from './types';

// ========== MAIN EXECUTOR ==========

/**
 * Execute an agent command using the appropriate backend
 */
export async function execute(request: ExecuteRequest): Promise<ExecutionResult> {
  const backend = request.executionConfig?.backend || 'local';
  const startTime = Date.now();

  try {
    let result: ExecutionResult;

    switch (backend) {
      case 'local':
        result = await executeLocal(request);
        break;

      case 'docker':
        result = await executeDocker(request);
        break;

      case 'docker-interactive':
        result = await executeDockerInteractive(request);
        break;

      case 'remote':
        result = await executeRemote(request);
        break;

      case 'modal':
        result = await executeModal(request);
        break;

      default:
        throw new Error(`Unknown execution backend: ${backend}`);
    }

    return {
      ...result,
      backend,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      backend,
      duration: Date.now() - startTime,
    };
  }
}

// ========== BACKEND RESOLUTION ==========

/**
 * Resolve the execution config for a node, considering project defaults
 */
export function resolveExecutionConfig(
  node: Node,
  project: Project
): ExecutionConfig {
  // Node-level config takes precedence over project default
  if (node.executionConfig) {
    return node.executionConfig;
  }

  // Fall back to project default
  if (project.defaultExecutionConfig) {
    return project.defaultExecutionConfig;
  }

  // Default to local execution
  return { backend: 'local' };
}

/**
 * Get a human-readable description of the execution backend
 */
export function getBackendDescription(backend: ExecutionBackend): string {
  switch (backend) {
    case 'local':
      return 'Local (direct spawn)';
    case 'docker':
      return 'Docker (isolated container)';
    case 'docker-interactive':
      return 'Docker + tmux (interactive)';
    case 'remote':
      return 'Remote VM (SSH + Docker)';
    case 'modal':
      return 'Modal (serverless/GPU)';
    default:
      return 'Unknown';
  }
}

/**
 * Check if a backend supports interactive features
 */
export function isInteractiveBackend(backend: ExecutionBackend): boolean {
  return ['docker-interactive', 'remote'].includes(backend);
}

// ========== SESSION MANAGEMENT ==========

/**
 * Attach to a running interactive session
 * Returns the command to run in a terminal
 */
export async function getAttachCommand(
  sessionId: string,
  backend: ExecutionBackend,
  config?: ExecutionConfig
): Promise<string> {
  switch (backend) {
    case 'docker-interactive':
      return `docker exec -it ${sessionId} tmux attach -t agent`;

    case 'remote': {
      const remote = config?.remote;
      if (!remote) throw new Error('Remote config required');
      const user = remote.user || 'root';
      const port = remote.port ? `-p ${remote.port}` : '';
      const key = remote.keyPath ? `-i ${remote.keyPath}` : '';
      return `ssh -t ${key} ${port} ${user}@${remote.host} "docker exec -it ${sessionId} tmux attach -t agent"`;
    }

    default:
      throw new Error(`Backend ${backend} does not support attach`);
  }
}

/**
 * Get the current output from an interactive session
 */
export async function getInteractiveOutput(
  sessionId: string,
  backend: ExecutionBackend
): Promise<string> {
  switch (backend) {
    case 'docker-interactive':
      return getSessionOutput(sessionId);

    case 'remote':
      // Would need to SSH and capture tmux pane - simplified for now
      throw new Error('Remote output capture not yet implemented');

    default:
      throw new Error(`Backend ${backend} does not support output capture`);
  }
}

/**
 * Stop a running interactive session
 */
export async function stopSession(
  sessionId: string,
  backend: ExecutionBackend,
  config?: ExecutionConfig
): Promise<void> {
  const { spawn } = await import('child_process');

  switch (backend) {
    case 'docker-interactive':
      return new Promise((resolve, reject) => {
        const proc = spawn('docker', ['stop', sessionId], { shell: false });
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Failed to stop container: exit code ${code}`));
        });
        proc.on('error', reject);
      });

    case 'remote': {
      const remote = config?.remote;
      if (!remote) throw new Error('Remote config required');
      const user = remote.user || 'root';
      const sshArgs = [
        ...(remote.keyPath ? ['-i', remote.keyPath] : []),
        ...(remote.port ? ['-p', String(remote.port)] : []),
        `${user}@${remote.host}`,
        `docker stop ${sessionId}`,
      ];
      return new Promise((resolve, reject) => {
        const proc = spawn('ssh', sshArgs, { shell: false });
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Failed to stop remote container: exit code ${code}`));
        });
        proc.on('error', reject);
      });
    }

    default:
      throw new Error(`Backend ${backend} does not support session stop`);
  }
}

// Re-export for convenience
export { attachToSession } from './executors/docker-interactive';
