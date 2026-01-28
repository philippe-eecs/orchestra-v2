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

    try {
      const output = await runCommand(args);
      return NextResponse.json({ status: 'done', output });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Gemini fallback for unavailable models
      if (executor === 'gemini' && /Requested entity was not found/i.test(errorMessage)) {
        const requestedModel = String(options?.model || 'gemini-3-pro-preview');
        const fallbackModel = requestedModel.includes('flash')
          ? 'gemini-2.5-flash'
          : 'gemini-2.5-pro';

        const fallbackArgs = buildCommand(
          'gemini',
          prompt,
          { ...(options || {}), model: fallbackModel }
        );
        const output = await runCommand(fallbackArgs);
        return NextResponse.json({
          status: 'done',
          output,
          model: fallbackModel,
          warning: `Requested model ${requestedModel} was unavailable; fell back to ${fallbackModel}.`,
        });
      }

      throw error;
    }
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
      const args = [
        'claude',
        '-p',
        prompt,
        '--output-format',
        'text',
        '--no-session-persistence',
        '--permission-mode',
        'dontAsk',
        '--tools',
        '',
      ];
      if (options?.model && typeof options.model === 'string') {
        args.push('--model', options.model);
      }
      if (options?.thinkingBudget && typeof options.thinkingBudget === 'number') {
        const budget = Math.floor(options.thinkingBudget);
        args.push('--append-system-prompt', `Think for at most ${budget} tokens.`);
      }
      return args;
    }

    case 'codex': {
      const args = ['codex', 'exec', '--skip-git-repo-check'];
      const reasoning = options?.reasoningEffort ?? options?.reasoningLevel;
      if (reasoning && ['low', 'medium', 'high', 'xhigh'].includes(String(reasoning))) {
        args.push('-c', `reasoning.effort=${String(reasoning)}`);
      }
      if (options?.model && typeof options.model === 'string') {
        args.push('-m', options.model);
      }
      args.push(prompt);
      return args;
    }

    case 'gemini': {
      // Validate model name - only allow alphanumeric, dashes, and dots
      const modelRaw = options?.model || 'gemini-3-pro-preview';
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
      stdio: ['ignore', 'pipe', 'pipe'],
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
