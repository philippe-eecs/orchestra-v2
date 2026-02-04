import { NextRequest, NextResponse } from 'next/server';
import { existsSync, statSync } from 'fs';
import { cleanupSandbox } from '@/lib/sandbox';

interface CleanupRequestBody {
  repoPath: string;
  worktreePath: string;
  branchName: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CleanupRequestBody;
    const { repoPath, worktreePath, branchName } = body;

    if (!repoPath || typeof repoPath !== 'string') {
      return NextResponse.json({ error: 'repoPath is required' }, { status: 400 });
    }
    if (!worktreePath || typeof worktreePath !== 'string') {
      return NextResponse.json({ error: 'worktreePath is required' }, { status: 400 });
    }
    if (!branchName || typeof branchName !== 'string') {
      return NextResponse.json({ error: 'branchName is required' }, { status: 400 });
    }

    if (!existsSync(repoPath)) {
      return NextResponse.json({ error: 'repoPath does not exist' }, { status: 404 });
    }
    const repoStats = statSync(repoPath);
    if (!repoStats.isDirectory()) {
      return NextResponse.json({ error: 'repoPath must be a directory' }, { status: 400 });
    }

    if (!existsSync(worktreePath)) {
      // If it's already gone, treat as success.
      return NextResponse.json({ status: 'ok', alreadyRemoved: true });
    }

    await cleanupSandbox(repoPath, worktreePath, branchName);

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

