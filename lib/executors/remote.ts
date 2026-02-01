/**
 * Remote Executor
 *
 * Executes agent commands on a remote VM via SSH + Docker.
 * Ideal for always-on execution accessible from anywhere (including mobile).
 *
 * Features:
 * - SSH tunnel to remote machine
 * - Docker containers on remote host
 * - tmux for interactivity (attach from anywhere)
 * - Project files synced via rsync or mounted
 *
 * Prerequisites:
 * - SSH access to remote VM (key-based auth recommended)
 * - Docker installed on remote VM
 * - orchestra-agent image available on remote
 */

import { spawn } from 'child_process';
import type { ExecutionResult, DockerConfig, RemoteConfig, ExecuteRequest } from '../types';
import { buildCommand } from './local';
import { escapeShellArg } from './shell';

// Default Docker image for agents
const DEFAULT_IMAGE = 'orchestra-agent:full';

// SSH connection timeout
const SSH_TIMEOUT_SECONDS = 30;

/**
 * Execute an agent command on a remote VM
 */
export async function executeRemote(request: ExecuteRequest): Promise<ExecutionResult> {
  const { executor, prompt, options, executionConfig, projectPath, nodeId } = request;
  const remoteConfig = executionConfig?.remote;
  const dockerConfig = executionConfig?.docker || {};
  const interactiveConfig = executionConfig?.interactive || {};

  if (!remoteConfig?.host) {
    return {
      status: 'error',
      error: 'Remote host is required for remote execution',
    };
  }

  // Generate session name
  const sessionName = interactiveConfig.sessionName || `agent-${nodeId || Date.now()}`;
  const containerName = `orchestra-${sessionName}`;

  // Build the agent command
  const agentArgs = buildCommand(executor as 'claude' | 'codex' | 'gemini', prompt, options);
  const agentCommand = agentArgs.map(escapeShellArg).join(' ');

  try {
    // Sync project files to remote if projectPath is provided
    if (projectPath) {
      await syncProjectToRemote(projectPath, remoteConfig, sessionName);
    }

    // Build and execute the remote Docker command
    const dockerCommand = buildRemoteDockerCommand(
      dockerConfig,
      containerName,
      sessionName,
      agentCommand
    );

    await executeSSHCommand(remoteConfig, dockerCommand);

    // Build attach command
    const attachCommand = buildAttachCommand(remoteConfig, containerName);

    return {
      status: 'running',
      sessionId: containerName,
      attachCommand,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check remote session status
 */
export async function getRemoteSessionStatus(
  remoteConfig: RemoteConfig,
  sessionId: string
): Promise<'running' | 'stopped' | 'unknown'> {
  try {
    const output = await executeSSHCommand(
      remoteConfig,
      `docker inspect -f '{{.State.Running}}' ${sessionId} 2>/dev/null || echo 'not_found'`
    );

    if (output.includes('true')) return 'running';
    if (output.includes('false')) return 'stopped';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Get output from remote session
 */
export async function getRemoteSessionOutput(
  remoteConfig: RemoteConfig,
  sessionId: string
): Promise<string> {
  return executeSSHCommand(
    remoteConfig,
    `docker exec ${sessionId} tmux capture-pane -t agent -p -S -10000 2>/dev/null || docker logs ${sessionId} 2>&1`
  );
}

/**
 * Stop a remote session
 */
export async function stopRemoteSession(
  remoteConfig: RemoteConfig,
  sessionId: string
): Promise<void> {
  await executeSSHCommand(remoteConfig, `docker stop ${sessionId}`);
}

/**
 * List all Orchestra sessions on remote
 */
export async function listRemoteSessions(
  remoteConfig: RemoteConfig
): Promise<Array<{ id: string; status: string; created: string }>> {
  const output = await executeSSHCommand(
    remoteConfig,
    `docker ps -a --filter "name=orchestra-" --format "{{.Names}}|{{.Status}}|{{.CreatedAt}}"`
  );

  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, status, created] = line.split('|');
      return { id, status, created };
    });
}

// ========== INTERNAL HELPERS ==========

function buildSSHArgs(config: RemoteConfig): string[] {
  const args: string[] = [];

  // SSH key
  if (config.keyPath) {
    args.push('-i', config.keyPath);
  }

  // Port
  if (config.port) {
    args.push('-p', String(config.port));
  }

  // Connection timeout
  args.push('-o', `ConnectTimeout=${SSH_TIMEOUT_SECONDS}`);

  // Disable strict host key checking for convenience (can be made configurable)
  args.push('-o', 'StrictHostKeyChecking=accept-new');

  // User@Host
  const user = config.user || 'root';
  args.push(`${user}@${config.host}`);

  return args;
}

function executeSSHCommand(config: RemoteConfig, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sshArgs = [...buildSSHArgs(config), command];

    const proc = spawn('ssh', sshArgs, {
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
        reject(new Error(stderr || `SSH command failed with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

async function syncProjectToRemote(
  localPath: string,
  config: RemoteConfig,
  sessionName: string
): Promise<void> {
  const user = config.user || 'root';
  const remotePath = `/tmp/orchestra-projects/${sessionName}`;

  // Create remote directory
  await executeSSHCommand(config, `mkdir -p ${remotePath}`);

  // Rsync files
  return new Promise((resolve, reject) => {
    const rsyncArgs = [
      '-avz',
      '--delete',
      '-e',
      `ssh ${config.keyPath ? `-i ${config.keyPath}` : ''} ${config.port ? `-p ${config.port}` : ''}`,
      `${localPath}/`,
      `${user}@${config.host}:${remotePath}/`,
    ];

    const proc = spawn('rsync', rsyncArgs, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `Rsync failed with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

function buildRemoteDockerCommand(
  config: DockerConfig,
  containerName: string,
  sessionName: string,
  agentCommand: string
): string {
  const parts: string[] = ['docker', 'run', '-d'];

  // Container name
  parts.push('--name', containerName);

  // Resource limits
  if (config.resources?.memory) {
    parts.push('--memory', config.resources.memory);
  }
  if (config.resources?.cpus) {
    parts.push('--cpus', config.resources.cpus);
  }

  // Network
  if (config.network) {
    parts.push('--network', config.network);
  }

  // Mount project directory (using the synced path)
  parts.push('-v', `/tmp/orchestra-projects/${sessionName}:/workspace`);
  parts.push('-w', '/workspace');

  // Environment variables - these should be set on the remote host
  // or passed through SSH environment forwarding
  parts.push('-e', 'CLAUDE_CODE_OAUTH_TOKEN');
  parts.push('-e', 'ANTHROPIC_API_KEY');
  parts.push('-e', 'OPENAI_API_KEY');
  parts.push('-e', 'GOOGLE_API_KEY');

  // Image
  parts.push(config.image || DEFAULT_IMAGE);

  // Start tmux with the agent command
  parts.push('tmux', 'new-session', '-d', '-s', 'agent', agentCommand);

  return parts.join(' ');
}

function buildAttachCommand(config: RemoteConfig, containerName: string): string {
  const user = config.user || 'root';
  const keyArg = config.keyPath ? `-i ${config.keyPath}` : '';
  const portArg = config.port ? `-p ${config.port}` : '';

  return `ssh -t ${keyArg} ${portArg} ${user}@${config.host} "docker exec -it ${containerName} tmux attach -t agent"`;
}

/**
 * Check SSH connectivity to remote host
 */
export async function checkRemoteConnectivity(config: RemoteConfig): Promise<boolean> {
  try {
    await executeSSHCommand(config, 'echo "ok"');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Docker is available on remote host
 */
export async function checkRemoteDocker(config: RemoteConfig): Promise<boolean> {
  try {
    await executeSSHCommand(config, 'docker version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the agent image is available on remote host
 */
export async function checkRemoteImage(
  config: RemoteConfig,
  image: string = DEFAULT_IMAGE
): Promise<boolean> {
  try {
    await executeSSHCommand(config, `docker image inspect ${image}`);
    return true;
  } catch {
    return false;
  }
}
