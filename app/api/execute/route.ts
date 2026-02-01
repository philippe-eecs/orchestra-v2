import { NextRequest, NextResponse } from 'next/server';
import { execute, type ExecuteRequest } from '@/lib/executor';
import type { ExecutionConfig } from '@/lib/types';
import {
  createSandbox,
  finalizeSandbox,
  cleanupSandbox,
  isGitRepo,
  type SandboxInfo,
} from '@/lib/sandbox';

// Whitelist of allowed executor types
const ALLOWED_EXECUTORS = ['claude', 'codex', 'gemini'] as const;

export async function POST(request: NextRequest) {
  let sandboxInfo: SandboxInfo | null = null;
  let originalProjectPath: string | undefined;

  try {
    const body = await request.json();
    const { executor, prompt, options, executionConfig, projectPath, projectId, nodeId } = body;

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

    const config = executionConfig as ExecutionConfig | undefined;
    const sandboxConfig = config?.sandbox;
    originalProjectPath = projectPath;

    // Setup sandbox if enabled
    let effectiveProjectPath = projectPath;
    if (sandboxConfig?.enabled && projectPath && nodeId) {
      try {
        const isRepo = await isGitRepo(projectPath);
        if (isRepo) {
          sandboxInfo = await createSandbox(projectPath, nodeId, sandboxConfig);
          effectiveProjectPath = sandboxInfo.worktreePath;
        }
      } catch (error) {
        console.warn('Failed to create sandbox:', error);
        // Continue without sandbox
      }
    }

    // Build execute request
    const executeRequest: ExecuteRequest = {
      executor,
      prompt,
      options,
      executionConfig: config,
      projectPath: effectiveProjectPath,
      projectId,
      nodeId,
    };

    // Execute using the unified executor
    const result = await execute(executeRequest);

    // Return appropriate response based on result status
    if (result.status === 'error') {
      // Keep sandbox on failure for debugging
      return NextResponse.json(
        {
          status: 'error',
          error: result.error,
          backend: result.backend,
          duration: result.duration,
          sandboxInfo: sandboxInfo ? {
            worktreePath: sandboxInfo.worktreePath,
            branchName: sandboxInfo.branchName,
          } : undefined,
        },
        { status: 500 }
      );
    }

    // Finalize sandbox if it was created
    let sandboxResult: { prUrl?: string; hasChanges: boolean } | null = null;
    if (sandboxInfo && sandboxConfig) {
      try {
        sandboxResult = await finalizeSandbox(
          sandboxInfo.worktreePath,
          sandboxInfo.branchName,
          sandboxConfig
        );

        // Cleanup sandbox on success if configured
        if (sandboxConfig.cleanupOnSuccess !== false && originalProjectPath) {
          await cleanupSandbox(
            originalProjectPath,
            sandboxInfo.worktreePath,
            sandboxInfo.branchName
          );
        }
      } catch (error) {
        console.warn('Failed to finalize sandbox:', error);
      }
    }

    return NextResponse.json({
      status: result.status,
      output: result.output,
      sessionId: result.sessionId,
      attachCommand: result.attachCommand,
      backend: result.backend,
      duration: result.duration,
      sandboxInfo: sandboxInfo ? {
        worktreePath: sandboxInfo.worktreePath,
        branchName: sandboxInfo.branchName,
        prUrl: sandboxResult?.prUrl,
      } : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: String(error) },
      { status: 500 }
    );
  }
}

// GET endpoint to check session status (for interactive backends)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sessionId = searchParams.get('sessionId');
  const backend = searchParams.get('backend');

  if (!sessionId) {
    return NextResponse.json(
      { status: 'error', error: 'sessionId is required' },
      { status: 400 }
    );
  }

  try {
    // Import dynamically to avoid issues if docker isn't available
    if (backend === 'docker-interactive') {
      const { isSessionRunning, getSessionOutput } = await import('@/lib/executors/docker-interactive');
      const running = await isSessionRunning(sessionId);
      const output = running ? await getSessionOutput(sessionId) : '';

      return NextResponse.json({
        status: running ? 'running' : 'stopped',
        output,
        sessionId,
      });
    }

    if (backend === 'remote') {
      // Would need remote config to check status
      return NextResponse.json({
        status: 'unknown',
        error: 'Remote session status check requires config',
        sessionId,
      });
    }

    return NextResponse.json({
      status: 'error',
      error: `Backend ${backend} does not support session status check`,
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: String(error) },
      { status: 500 }
    );
  }
}
