/**
 * Docker Interactive Executor
 *
 * Executes agent commands inside Docker containers with tmux for interactivity.
 * Allows attaching/detaching from running sessions at any time.
 *
 * Features:
 * - tmux session inside container for attach/detach
 * - Survives terminal disconnection
 * - Can intervene mid-execution by typing in the terminal
 * - Output capture from tmux pane
 *
 * Usage:
 * 1. Start: executeDockerInteractive() returns sessionId and attachCommand
 * 2. Attach: Run the attachCommand in a terminal to interact
 * 3. Detach: Ctrl+B, D to detach without stopping
 * 4. Monitor: getSessionOutput() to capture current output
 * 5. Stop: stopDockerInteractive() to terminate
 */

import { spawn } from 'child_process';
import type { ExecutionResult, DockerConfig, ExecuteRequest } from '../types';
import { buildCommand } from './local';
import { escapeShellArg } from './shell';

// Default Docker image for agents
const DEFAULT_IMAGE = 'orchestra-agent:full';

// Default interactive session timeout (30 minutes)
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Execute an agent command inside a Docker container with tmux
 */
export async function executeDockerInteractive(request: ExecuteRequest): Promise<ExecutionResult> {
  const { executor, prompt, options, executionConfig, projectPath, nodeId } = request;
  const dockerConfig = executionConfig?.docker || {};
  const interactiveConfig = executionConfig?.interactive || {};

  // Generate session name
  const sessionName = interactiveConfig.sessionName || `agent-${nodeId || Date.now()}`;
  const containerName = `orchestra-${sessionName}`;

  // Build the agent command that will run inside tmux
  const agentArgs = buildCommand(executor as 'claude' | 'codex' | 'gemini', prompt, options);
  const agentCommand = agentArgs.map(escapeShellArg).join(' ');

  // Build Docker run arguments for detached mode with tmux
  const dockerArgs = buildDockerInteractiveArgs(
    dockerConfig,
    projectPath,
    containerName,
    agentCommand
  );

  try {
    // Start the container in detached mode
    await runDockerCommand(dockerArgs);

    // Set up timeout if configured
    const timeout = interactiveConfig.timeout || DEFAULT_TIMEOUT_MS;
    if (timeout > 0) {
      scheduleTimeout(containerName, timeout);
    }

    return {
      status: 'running',
      sessionId: containerName,
      attachCommand: `docker exec -it ${containerName} tmux attach -t agent`,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Attach to a running tmux session inside a Docker container
 * This spawns a process with inherited stdio for interactive use
 */
export function attachToSession(sessionId: string): void {
  spawn('docker', ['exec', '-it', sessionId, 'tmux', 'attach', '-t', 'agent'], {
    stdio: 'inherit',
    shell: false,
  });
}

/**
 * Get current output from the tmux pane
 */
export async function getSessionOutput(sessionId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', [
      'exec',
      sessionId,
      'tmux',
      'capture-pane',
      '-t',
      'agent',
      '-p',
      '-S',
      '-10000', // Capture last 10000 lines
    ], {
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

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Failed to capture output: exit code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Check if a session is still running
 */
export async function isSessionRunning(sessionId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('docker', ['inspect', '-f', '{{.State.Running}}', sessionId], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.on('close', (code) => {
      resolve(code === 0 && stdout.trim() === 'true');
    });

    proc.on('error', () => resolve(false));
  });
}

/**
 * Send a command to the tmux session (for automation)
 */
export async function sendToSession(sessionId: string, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', [
      'exec',
      sessionId,
      'tmux',
      'send-keys',
      '-t',
      'agent',
      text,
      'Enter',
    ], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Failed to send to session: exit code ${code}`));
    });

    proc.on('error', reject);
  });
}

/**
 * Wait for the agent process to complete and return final output
 */
export async function waitForCompletion(
  sessionId: string,
  pollIntervalMs: number = 2000,
  maxWaitMs: number = DEFAULT_TIMEOUT_MS
): Promise<ExecutionResult> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const running = await isSessionRunning(sessionId);

    if (!running) {
      // Container stopped - get final output
      try {
        // Try to get logs from stopped container
        const output = await getContainerLogs(sessionId);
        return { status: 'done', output, sessionId };
      } catch {
        return { status: 'done', output: '', sessionId };
      }
    }

    // Check if tmux session still exists (agent might have finished)
    const tmuxRunning = await isTmuxSessionRunning(sessionId);
    if (!tmuxRunning) {
      // Agent finished, capture output and stop container
      const output = await getSessionOutput(sessionId);
      await stopContainer(sessionId);
      return { status: 'done', output, sessionId };
    }

    await sleep(pollIntervalMs);
  }

  // Timeout
  return {
    status: 'error',
    error: `Session timed out after ${maxWaitMs / 1000} seconds`,
    sessionId,
  };
}

// ========== INTERNAL HELPERS ==========

function buildDockerInteractiveArgs(
  config: DockerConfig,
  projectPath?: string,
  containerName?: string,
  command?: string
): string[] {
  const args: string[] = ['run', '-d']; // Detached mode

  // Container name for later reference
  if (containerName) {
    args.push('--name', containerName);
  }

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
  const envVars: Record<string, string> = {
    ...config.env,
  };

  // Pass through essential credentials
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    envVars.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  }
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

  // Start tmux with the agent command
  if (command) {
    args.push('tmux', 'new-session', '-d', '-s', 'agent', command);
  } else {
    args.push('tmux', 'new-session', '-d', '-s', 'agent');
  }

  return args;
}

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

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `Docker process exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

function scheduleTimeout(containerName: string, timeoutMs: number): void {
  setTimeout(async () => {
    const running = await isSessionRunning(containerName);
    if (running) {
      console.log(`Session ${containerName} timed out after ${timeoutMs / 1000}s, stopping...`);
      await stopContainer(containerName);
    }
  }, timeoutMs);
}

async function stopContainer(sessionId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', ['stop', sessionId], { shell: false });
    proc.on('close', () => resolve());
    proc.on('error', reject);
  });
}

async function getContainerLogs(sessionId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', ['logs', sessionId], {
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

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout + stderr);
      } else {
        reject(new Error(`Failed to get logs: exit code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

async function isTmuxSessionRunning(containerId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('docker', [
      'exec',
      containerId,
      'tmux',
      'has-session',
      '-t',
      'agent',
    ], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
