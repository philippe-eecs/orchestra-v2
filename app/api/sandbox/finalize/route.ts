import { NextRequest, NextResponse } from 'next/server';
import { existsSync, statSync } from 'fs';
import type { GitFinalizeAction, SandboxConfig } from '@/lib/types';
import { finalizeSandbox, isGitRepo } from '@/lib/sandbox';

interface FinalizeRequestBody {
  worktreePath: string;
  branchName: string;
  baseBranch?: string;
  finalizeAction?: GitFinalizeAction;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FinalizeRequestBody;
    const { worktreePath, branchName, baseBranch, finalizeAction } = body;

    if (!worktreePath || typeof worktreePath !== 'string') {
      return NextResponse.json({ error: 'worktreePath is required' }, { status: 400 });
    }
    if (!branchName || typeof branchName !== 'string') {
      return NextResponse.json({ error: 'branchName is required' }, { status: 400 });
    }

    if (!existsSync(worktreePath)) {
      return NextResponse.json({ error: 'worktreePath does not exist' }, { status: 404 });
    }
    const stats = statSync(worktreePath);
    if (!stats.isDirectory()) {
      return NextResponse.json({ error: 'worktreePath must be a directory' }, { status: 400 });
    }

    const repoOk = await isGitRepo(worktreePath);
    if (!repoOk) {
      return NextResponse.json({ error: 'worktreePath is not a git repository' }, { status: 400 });
    }

    const sandboxConfig: SandboxConfig = {
      enabled: true,
      type: 'git-worktree',
      finalizeAction: finalizeAction || 'pr',
      prBaseBranch: baseBranch || 'main',
      keepOnFailure: true,
    };

    const result = await finalizeSandbox(worktreePath, branchName, sandboxConfig);

    return NextResponse.json({
      hasChanges: result.hasChanges,
      commitHash: result.commitHash,
      prUrl: result.prUrl,
      finalizeAction: sandboxConfig.finalizeAction,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

