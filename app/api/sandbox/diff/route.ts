import { NextRequest, NextResponse } from 'next/server';
import { existsSync, statSync } from 'fs';
import { runGitCommand } from '@/lib/git';

function clampOutput(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return { text, truncated: false };
  return { text: buf.subarray(0, maxBytes).toString('utf8'), truncated: true };
}

function parsePorcelainFiles(porcelain: string): string[] {
  const files = new Set<string>();
  for (const line of porcelain.split('\n')) {
    if (!line.trim()) continue;
    // Format: XY <path> (or for renames: XY <from> -> <to>)
    const rest = line.slice(3);
    const renameArrow = rest.indexOf(' -> ');
    if (renameArrow !== -1) {
      files.add(rest.slice(renameArrow + 4));
      continue;
    }
    files.add(rest);
  }
  return Array.from(files);
}

export async function POST(request: NextRequest) {
  try {
    const { worktreePath } = await request.json();

    if (!worktreePath || typeof worktreePath !== 'string') {
      return NextResponse.json({ error: 'worktreePath is required' }, { status: 400 });
    }

    if (!existsSync(worktreePath)) {
      return NextResponse.json({ error: 'worktreePath does not exist' }, { status: 404 });
    }

    const stats = statSync(worktreePath);
    if (!stats.isDirectory()) {
      return NextResponse.json({ error: 'worktreePath must be a directory' }, { status: 400 });
    }

    // Ensure it's a git repo
    try {
      await runGitCommand(worktreePath, ['rev-parse', '--is-inside-work-tree']);
    } catch {
      return NextResponse.json({ error: 'worktreePath is not a git repository' }, { status: 400 });
    }

    const statusPorcelain = await runGitCommand(worktreePath, ['status', '--porcelain']);
    const changedFiles = parsePorcelainFiles(statusPorcelain);

    const diffPatchRaw = await runGitCommand(worktreePath, ['diff', '--patch', '--no-color']);
    const diffStatRaw = await runGitCommand(worktreePath, ['diff', '--stat', '--no-color']);

    const diffPatch = clampOutput(diffPatchRaw, 2 * 1024 * 1024);
    const diffStat = clampOutput(diffStatRaw, 256 * 1024);

    return NextResponse.json({
      statusPorcelain,
      changedFiles,
      diffPatch: diffPatch.text,
      diffPatchTruncated: diffPatch.truncated,
      diffStat: diffStat.text,
      diffStatTruncated: diffStat.truncated,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

