import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

// Whitelist of allowed executor types
const ALLOWED_EXECUTORS = ['claude', 'codex', 'gemini'] as const;
type ExecutorType = typeof ALLOWED_EXECUTORS[number];

// Execution timeout (5 minutes)
const EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const { executor, prompt, options } = await request.json();

    // Validate executor against whitelist
    if (!ALLOWED_EXECUTORS.includes(executor)) {
      return NextResponse.json(
        { status: 'error', error: `Invalid executor type: ${executor}. Allowed: ${ALLOWED_EXECUTORS.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate prompt
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json(
        { status: 'error', error: 'Prompt is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    const args = buildCommand(executor as ExecutorType, prompt, options);

    const output = await runCommand(args);
    return NextResponse.json({ status: 'done', output });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: String(error) },
      { status: 500 }
    );
  }
}

function buildCommand(executor: ExecutorType, prompt: string, options?: Record<string, unknown>): string[] {
  // Build command as array - no shell interpolation possible
  switch (executor) {
    case 'claude': {
      const args = ['claude', '-p', prompt];
      if (options?.thinkingBudget && typeof options.thinkingBudget === 'number') {
        args.push('--thinking-budget', String(Math.floor(options.thinkingBudget)));
      }
      return args;
    }

    case 'codex': {
      const args = ['codex', 'exec', prompt];
      if (options?.reasoningLevel && ['low', 'medium', 'high'].includes(String(options.reasoningLevel))) {
        args.push('--reasoning', String(options.reasoningLevel));
      }
      return args;
    }

    case 'gemini': {
      // Validate model name - only allow alphanumeric, dashes, and dots
      const modelRaw = options?.model || 'gemini-3-pro';
      const model = String(modelRaw).replace(/[^a-zA-Z0-9.-]/g, '');
      return ['gemini', prompt, '-m', model, '-o', 'text'];
    }
  }
}

function runCommand(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const [cmd, ...rest] = args;

    // No shell: true - execute directly without shell interpolation
    const proc = spawn(cmd, rest, {
      shell: false,
      timeout: EXECUTION_TIMEOUT_MS,
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
      reject(new Error(`Execution timed out after ${EXECUTION_TIMEOUT_MS / 1000} seconds`));
    }, EXECUTION_TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Process exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}
