/**
 * tmux Integration Tests
 *
 * Tests the command building logic for tmux sessions.
 * These tests don't require tmux to be running - they validate the command structure.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Helper to check if tmux is available
function tmuxAvailable(): boolean {
  try {
    execSync('which tmux', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Helper to generate unique session IDs
function uniqueSessionId(): string {
  return `orchestra-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Helper to cleanup tmux session
function killSession(sessionId: string): void {
  try {
    execSync(`tmux kill-session -t ${sessionId}`, { stdio: 'ignore' });
  } catch {
    // Session might not exist
  }
}

describe('tmux command building', { skip: !tmuxAvailable() }, () => {
  test('sh -c wrapper enables shell operators', async () => {
    const sessionId = uniqueSessionId();
    const tempDir = mkdtempSync(join(tmpdir(), 'orchestra-tmux-test-'));
    const outputFile = join(tempDir, 'output.txt');

    try {
      // Command with shell operators that would fail without sh -c
      const command = `echo "part1" && echo "part2" > ${outputFile}`;

      // Create session with the command (this matches our fixed tmux.rs behavior)
      execSync(`tmux new-session -d -s ${sessionId} sh -c '${command}'`);

      // Wait for command to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify the file was created (proves && worked)
      assert.ok(existsSync(outputFile), 'Output file should exist (shell operators worked)');

      const content = readFileSync(outputFile, 'utf8').trim();
      assert.equal(content, 'part2', 'File should contain "part2" from the second echo');
    } finally {
      killSession(sessionId);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('piped commands work correctly', async () => {
    const sessionId = uniqueSessionId();
    const tempDir = mkdtempSync(join(tmpdir(), 'orchestra-tmux-test-'));
    const outputFile = join(tempDir, 'piped.txt');

    try {
      // Command with pipe
      const command = `echo "hello world" | tr 'a-z' 'A-Z' > ${outputFile}`;

      execSync(`tmux new-session -d -s ${sessionId} sh -c '${command}'`);

      await new Promise(resolve => setTimeout(resolve, 500));

      assert.ok(existsSync(outputFile), 'Output file should exist');
      const content = readFileSync(outputFile, 'utf8').trim();
      assert.equal(content, 'HELLO WORLD', 'Pipe should have transformed text to uppercase');
    } finally {
      killSession(sessionId);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('semicolon-separated commands execute sequentially', async () => {
    const sessionId = uniqueSessionId();
    const tempDir = mkdtempSync(join(tmpdir(), 'orchestra-tmux-test-'));
    const file1 = join(tempDir, 'first.txt');
    const file2 = join(tempDir, 'second.txt');

    try {
      const command = `touch ${file1}; sleep 0.1; touch ${file2}`;

      execSync(`tmux new-session -d -s ${sessionId} sh -c '${command}'`);

      await new Promise(resolve => setTimeout(resolve, 600));

      assert.ok(existsSync(file1), 'First file should exist');
      assert.ok(existsSync(file2), 'Second file should exist');
    } finally {
      killSession(sessionId);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('working directory is respected', async () => {
    const sessionId = uniqueSessionId();
    const tempDir = mkdtempSync(join(tmpdir(), 'orchestra-tmux-test-'));
    const outputFile = join(tempDir, 'pwd.txt');

    try {
      const command = `pwd > pwd.txt`;

      // Use -c to set working directory
      execSync(`tmux new-session -d -s ${sessionId} -c ${tempDir} sh -c '${command}'`);

      await new Promise(resolve => setTimeout(resolve, 500));

      assert.ok(existsSync(outputFile), 'Output file should exist in temp dir');
      const content = readFileSync(outputFile, 'utf8').trim();
      assert.equal(content, tempDir, 'pwd should match the specified working directory');
    } finally {
      killSession(sessionId);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('tmux session lifecycle', { skip: !tmuxAvailable() }, () => {
  test('session can be created and detected', () => {
    const sessionId = uniqueSessionId();

    try {
      execSync(`tmux new-session -d -s ${sessionId} sh -c 'sleep 10'`);

      // Check session exists
      const result = execSync(`tmux has-session -t ${sessionId} 2>&1 || echo "not found"`, { encoding: 'utf8' });
      assert.ok(!result.includes('not found'), 'Session should exist');
    } finally {
      killSession(sessionId);
    }
  });

  test('session cleanup works', () => {
    const sessionId = uniqueSessionId();

    execSync(`tmux new-session -d -s ${sessionId} sh -c 'sleep 10'`);

    // Kill and verify
    killSession(sessionId);

    const result = execSync(`tmux has-session -t ${sessionId} 2>&1 || echo "not found"`, { encoding: 'utf8' });
    assert.ok(result.includes('not found') || result.includes("can't find"), 'Session should not exist after kill');
  });

  test('capture-pane retrieves output', async () => {
    const sessionId = uniqueSessionId();

    try {
      // Echo something and keep session alive
      execSync(`tmux new-session -d -s ${sessionId} sh -c 'echo "TEST_OUTPUT_MARKER"; sleep 5'`);

      await new Promise(resolve => setTimeout(resolve, 300));

      const output = execSync(`tmux capture-pane -t ${sessionId} -p`, { encoding: 'utf8' });
      assert.ok(output.includes('TEST_OUTPUT_MARKER'), 'Should capture the echoed output');
    } finally {
      killSession(sessionId);
    }
  });
});
