/**
 * Modal Executor
 *
 * Executes agent commands on Modal's serverless infrastructure.
 * Ideal for GPU workloads, parallel burst processing, and auto-scaling.
 *
 * Features:
 * - Serverless execution (pay-per-second)
 * - GPU support (T4, A10G, A100, H100)
 * - Auto-scaling for parallel workloads
 * - No infrastructure to manage
 *
 * Prerequisites:
 * - Modal CLI installed: pip install modal
 * - Modal account configured: modal token new
 * - Modal functions deployed: modal deploy modal/agent.py
 *
 * Note: Modal execution is non-interactive - you cannot attach mid-execution.
 * Use docker-interactive or remote backends for interactive sessions.
 */

import { spawn } from 'child_process';
import type { ExecutionResult, ModalConfig, ExecuteRequest } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

// Default Modal function name
const DEFAULT_FUNCTION = 'run_agent';

// Modal execution timeout (15 minutes)
const EXECUTION_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Execute an agent command on Modal
 */
export async function executeModal(request: ExecuteRequest): Promise<ExecutionResult> {
  const { executor, prompt, options, executionConfig, projectPath } = request;
  const modalConfig = executionConfig?.modal || {};

  // Determine which Modal function to call
  const functionName = modalConfig.functionName || DEFAULT_FUNCTION;
  const gpuFunction = modalConfig.gpu ? `${functionName}_gpu` : functionName;

  try {
    // Collect project files if path is provided
    const files = projectPath ? await collectProjectFiles(projectPath) : {};

    // Build the execution payload
    const payload = {
      executor,
      prompt,
      options: options || {},
      files,
      gpu: modalConfig.gpu,
      timeout: modalConfig.timeout,
      memory: modalConfig.memory,
    };

    // Execute via Modal CLI
    const output = await runModalFunction(gpuFunction, payload, modalConfig);

    return { status: 'done', output };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run a Modal function with the given payload
 */
async function runModalFunction(
  functionName: string,
  payload: Record<string, unknown>,
  config: ModalConfig
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Write payload to temp file (Modal CLI reads from stdin or file)
    const payloadJson = JSON.stringify(payload);

    const args = [
      'run',
      'modal/agent.py::' + functionName,
      '--payload',
      payloadJson,
    ];

    // Add GPU flag if specified
    if (config.gpu) {
      args.push('--gpu', config.gpu);
    }

    const proc = spawn('modal', args, {
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

    // Timeout handling
    const timeoutMs = (config.timeout || 900) * 1000; // Default 15 minutes
    const timeoutId = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Modal execution timed out after ${timeoutMs / 1000} seconds`));
    }, Math.min(timeoutMs, EXECUTION_TIMEOUT_MS));

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Modal process exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Collect project files for sending to Modal
 * Returns a map of relative paths to file contents
 */
async function collectProjectFiles(
  projectPath: string,
  maxFiles: number = 100,
  maxSizeBytes: number = 10 * 1024 * 1024 // 10MB total
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  let totalSize = 0;
  let fileCount = 0;

  // Extensions to include
  const includeExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.json', '.py', '.go', '.rs',
    '.md', '.txt', '.yaml', '.yml', '.toml', '.env.example',
    '.html', '.css', '.scss', '.sql',
  ]);

  // Directories to skip
  const skipDirs = new Set([
    'node_modules', '.git', 'dist', 'build', '__pycache__',
    '.next', '.cache', 'coverage', '.venv', 'venv',
  ]);

  async function walkDir(dir: string, relativePath: string = ''): Promise<void> {
    if (fileCount >= maxFiles || totalSize >= maxSizeBytes) return;

    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (fileCount >= maxFiles || totalSize >= maxSizeBytes) break;

      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) {
          await walkDir(fullPath, relPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (includeExtensions.has(ext)) {
          try {
            const stat = await fs.stat(fullPath);
            if (stat.size < 100 * 1024) { // Skip files > 100KB
              const content = await fs.readFile(fullPath, 'utf-8');
              files[relPath] = content;
              totalSize += content.length;
              fileCount++;
            }
          } catch {
            // Skip files that can't be read
          }
        }
      }
    }
  }

  await walkDir(projectPath);
  return files;
}

/**
 * Check if Modal CLI is installed and configured
 */
export async function isModalAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('modal', ['--version'], { shell: false });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

/**
 * Check if Modal is authenticated
 */
export async function isModalAuthenticated(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('modal', ['profile', 'current'], { shell: false });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

/**
 * List deployed Modal functions
 */
export async function listModalFunctions(): Promise<string[]> {
  return new Promise((resolve) => {
    const proc = spawn('modal', ['app', 'list'], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const functions = stdout
          .split('\n')
          .filter((line) => line.includes('orchestra-agent'))
          .map((line) => line.trim());
        resolve(functions);
      } else {
        resolve([]);
      }
    });

    proc.on('error', () => resolve([]));
  });
}

/**
 * Deploy Modal functions
 */
export async function deployModalFunctions(): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('modal', ['deploy', 'modal/agent.py'], {
      shell: false,
      stdio: ['inherit', 'inherit', 'inherit'],
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Modal deploy failed with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Get Modal pricing information for a GPU type
 */
export function getModalPricing(gpu?: ModalConfig['gpu']): string {
  const pricing: Record<string, string> = {
    cpu: '~$0.10/hr',
    T4: '~$0.60/hr',
    A10G: '~$1.10/hr',
    A100: '~$3.50/hr',
    H100: '~$4.50/hr',
  };

  return pricing[gpu || 'cpu'] || 'Unknown';
}
