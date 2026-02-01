/**
 * Docker Executor
 *
 * Executes agent commands inside Docker containers.
 * Provides isolation but waits for completion (non-interactive).
 *
 * Features:
 * - Isolated environment with controlled dependencies
 * - Volume mounts for project files
 * - Environment variable injection for credentials
 * - Resource limits (memory, CPU)
 */

import { spawn } from 'child_process';
import type { ExecutionResult, DockerConfig, ExecuteRequest } from '../types';
import { buildCommand } from './local';
import { escapeShellArg } from './shell';

// Default Docker image for agents
const DEFAULT_IMAGE = 'orchestra-agent:full';

// Execution timeout (10 minutes for Docker - extra time for container startup)
const EXECUTION_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Execute an agent command inside a Docker container
 */
export async function executeDocker(request: ExecuteRequest): Promise<ExecutionResult> {
  const { executor, prompt, options, executionConfig, projectPath } = request;
  const dockerConfig = executionConfig?.docker || {};

  // Build the agent command that will run inside the container
  const agentArgs = buildCommand(executor as 'claude' | 'codex' | 'gemini', prompt, options);
  const agentCommand = agentArgs.map(escapeShellArg).join(' ');

  // Build Docker run arguments
  const dockerArgs = buildDockerArgs(dockerConfig, projectPath, agentCommand);

  try {
    const output = await runDockerCommand(dockerArgs);
    return { status: 'done', output };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Build Docker run command arguments
 */
function buildDockerArgs(
  config: DockerConfig,
  projectPath?: string,
  command?: string
): string[] {
  const args: string[] = ['run', '--rm'];

  // Resource limits
  if (config.resources?.memory) {
    args.push('--memory', config.resources.memory);
  }
  if (config.resources?.cpus) {
    args.push('--cpus', config.resources.cpus);
  }

  // Network
  if (config.network) {
    args.push('--network', config.network);
  }

  // Mount project directory
  if (projectPath) {
    args.push('-v', `${projectPath}:/workspace`);
    args.push('-w', '/workspace');
  }

  // Additional mounts
  if (config.mounts) {
    for (const mount of config.mounts) {
      const mountArg = mount.readonly
        ? `${mount.hostPath}:${mount.containerPath}:ro`
        : `${mount.hostPath}:${mount.containerPath}`;
      args.push('-v', mountArg);
    }
  }

  // Environment variables
  // Always pass through essential credentials
  const envVars: Record<string, string> = {
    ...config.env,
  };

  // Pass through OAuth token for Claude if available
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    envVars.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  }

  // Pass through API keys
  if (process.env.ANTHROPIC_API_KEY) {
    envVars.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.OPENAI_API_KEY) {
    envVars.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  }
  if (process.env.GOOGLE_API_KEY) {
    envVars.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  }

  for (const [key, value] of Object.entries(envVars)) {
    args.push('-e', `${key}=${value}`);
  }

  // Image
  args.push(config.image || DEFAULT_IMAGE);

  // Command to run
  if (command) {
    args.push('sh', '-c', command);
  }

  return args;
}

/**
 * Run Docker command and capture output
 */
function runDockerCommand(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Set up timeout handling
    const timeoutId = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Docker execution timed out after ${EXECUTION_TIMEOUT_MS / 1000} seconds`));
    }, EXECUTION_TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Docker process exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

/**
 * Check if Docker is available
 */
export async function isDockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('docker', ['version'], { shell: false });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

/**
 * Check if the agent image exists locally
 */
export async function isImageAvailable(image: string = DEFAULT_IMAGE): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('docker', ['image', 'inspect', image], { shell: false });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}
