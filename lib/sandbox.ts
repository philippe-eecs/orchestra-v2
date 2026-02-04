/**
 * Git Worktree Sandbox
 *
 * Provides isolated execution environments using git worktrees.
 * Each agent runs in its own worktree, on its own branch, preventing
 * conflicts and allowing safe experimentation.
 *
 * Flow:
 * 1. createSandbox() - Creates worktree and branch before agent execution
 * 2. Agent runs in the isolated worktree directory
 * 3. finalizeSandbox() - Commits changes, pushes, creates PR
 * 4. cleanupSandbox() - Removes worktree (optional, on success)
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { SandboxConfig } from './types';
import { runGitCommand } from './git';

export interface SandboxInfo {
  worktreePath: string;
  branchName: string;
}

export interface SandboxResult {
  prUrl?: string;
  hasChanges: boolean;
  commitHash?: string;
}

/**
 * Create an isolated git worktree for agent execution
 */
export async function createSandbox(
  projectPath: string,
  nodeId: string,
  config: SandboxConfig,
  options?: { runId?: string }
): Promise<SandboxInfo> {
  const timestamp = Date.now();
  const prefix = config.branchPrefix || 'agent/';
  const runId = options?.runId ? options.runId.replace(/[^a-zA-Z0-9._-]/g, '') : undefined;
  const branchName = `${prefix}${nodeId}-${runId ? `${runId}-` : ''}${timestamp}`;

  // Worktree is created as a sibling to the project directory (hidden .orchestra folder)
  const parentDir = path.resolve(projectPath, '..', '.orchestra', 'sandboxes');
  await fs.mkdir(parentDir, { recursive: true });
  const uniqueSuffix = Math.random().toString(36).slice(2, 8);
  const worktreePath = path.join(parentDir, `${nodeId}-${timestamp}-${uniqueSuffix}`);

  // Create the worktree with a new branch
  await runGitCommand(projectPath, [
    'worktree',
    'add',
    '-b',
    branchName,
    worktreePath,
  ]);

  return {
    worktreePath,
    branchName,
  };
}

/**
 * Finalize the sandbox after agent execution
 * - Commits any changes
 * - Pushes to remote
 * - Creates a PR if configured
 */
export async function finalizeSandbox(
  worktreePath: string,
  branchName: string,
  config: SandboxConfig
): Promise<SandboxResult> {
  // Check for changes
  const status = await runGitCommand(worktreePath, ['status', '--porcelain']);
  const hasChanges = status.trim().length > 0;

  if (!hasChanges) {
    return { hasChanges: false };
  }

  const finalizeAction = config.finalizeAction || 'pr';
  if (finalizeAction === 'none') {
    return { hasChanges: true };
  }

  // Stage all changes
  await runGitCommand(worktreePath, ['add', '-A']);

  // Commit changes
  const commitMessage = `Agent changes from ${branchName}`;
  await runGitCommand(worktreePath, ['commit', '-m', commitMessage]);

  // Get commit hash
  const commitHash = await runGitCommand(worktreePath, ['rev-parse', 'HEAD']);

  if (finalizeAction === 'commit') {
    return { hasChanges: true, commitHash: commitHash.trim() };
  }

  // Push to remote if requested
  if (finalizeAction === 'push' || finalizeAction === 'pr') {
    try {
      await runGitCommand(worktreePath, ['push', '-u', 'origin', branchName]);
    } catch (error) {
      // Push might fail if no remote configured - continue anyway
      console.warn(`Failed to push branch: ${error}`);
      return { hasChanges: true, commitHash: commitHash.trim() };
    }
  }

  // Create PR if requested
  if (finalizeAction === 'pr') {
    const baseBranch = config.prBaseBranch || 'main';
    try {
      const prUrl = await createPullRequest(worktreePath, branchName, baseBranch);
      return { hasChanges: true, commitHash: commitHash.trim(), prUrl };
    } catch (error) {
      console.warn(`Failed to create PR: ${error}`);
      return { hasChanges: true, commitHash: commitHash.trim() };
    }
  }

  return { hasChanges: true, commitHash: commitHash.trim() };
}

/**
 * Clean up the sandbox worktree
 */
export async function cleanupSandbox(
  projectPath: string,
  worktreePath: string,
  branchName: string
): Promise<void> {
  // Remove the worktree
  await runGitCommand(projectPath, ['worktree', 'remove', worktreePath, '--force']);

  // Optionally delete the branch locally (remote branch remains for PR)
  try {
    await runGitCommand(projectPath, ['branch', '-D', branchName]);
  } catch {
    // Branch might not exist or be in use - ignore
  }
}

/**
 * Check if the project is a git repository
 */
export async function isGitRepo(projectPath: string): Promise<boolean> {
  try {
    await runGitCommand(projectPath, ['rev-parse', '--is-inside-work-tree']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(projectPath: string): Promise<string> {
  const output = await runGitCommand(projectPath, ['branch', '--show-current']);
  return output.trim();
}

/**
 * Check if there are uncommitted changes
 */
export async function hasUncommittedChanges(path: string): Promise<boolean> {
  const status = await runGitCommand(path, ['status', '--porcelain']);
  return status.trim().length > 0;
}

async function createPullRequest(
  worktreePath: string,
  headBranch: string,
  baseBranch: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const title = `Agent changes: ${headBranch}`;
    const body = `## Summary\nAutomated changes from Orchestra agent execution.\n\n---\nGenerated by Orchestra`;

    const proc = spawn(
      'gh',
      [
        'pr',
        'create',
        '--base',
        baseBranch,
        '--head',
        headBranch,
        '--title',
        title,
        '--body',
        body,
      ],
      {
        cwd: worktreePath,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

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
        // gh pr create outputs the PR URL
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `gh pr create failed with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}
