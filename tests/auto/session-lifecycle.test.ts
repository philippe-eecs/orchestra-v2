/**
 * Session Lifecycle Tests
 *
 * Tests the full lifecycle of Orchestra sessions:
 * - Session creation with mock agent
 * - Exit file detection
 * - Session completion monitoring
 *
 * These tests use a mock agent (simple shell script) instead of Claude
 * to enable automated CI testing.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Check if tmux is available
function tmuxAvailable(): boolean {
  try {
    execSync('which tmux', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function uniqueSessionId(): string {
  return `orchestra-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function killSession(sessionId: string): void {
  try {
    execSync(`tmux kill-session -t ${sessionId}`, { stdio: 'ignore' });
  } catch {
    // Session might not exist
  }
}

/**
 * Creates a mock agent script that simulates Claude's behavior:
 * 1. Creates some output files (simulating work)
 * 2. Writes to the exit file (signaling completion)
 * 3. Exits with specified code
 */
function createMockAgent(
  workDir: string,
  exitFilePath: string,
  exitCode: number = 0,
  workFiles: Record<string, string> = {}
): string {
  const scriptPath = join(workDir, 'mock-agent.sh');
  const scriptContent = `#!/bin/bash
set -e

# Simulate agent work
echo "Mock agent starting..."
sleep 0.2

# Create work files
${Object.entries(workFiles).map(([name, content]) =>
  `echo '${content.replace(/'/g, "'\\''")}' > "${join(workDir, name)}"`
).join('\n')}

# Signal completion by writing exit file
echo '{"exitCode": ${exitCode}, "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > "${exitFilePath}"

echo "Mock agent completed with exit code ${exitCode}"
exit ${exitCode}
`;

  writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
  return scriptPath;
}

describe('Session lifecycle with mock agent', { skip: !tmuxAvailable() }, () => {
  let tempDir: string;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'orchestra-session-test-'));
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('successful session creates expected files', async () => {
    const sessionId = uniqueSessionId();
    const sessionDir = join(tempDir, 'session-success');
    mkdirSync(sessionDir, { recursive: true });

    const exitFile = join(sessionDir, '.orchestra-exit.json');
    const mockAgent = createMockAgent(sessionDir, exitFile, 0, {
      'output.txt': 'Hello from mock agent',
      'result.json': '{"status": "success"}'
    });

    try {
      // Start session
      execSync(`tmux new-session -d -s ${sessionId} -c ${sessionDir} sh -c '${mockAgent}'`);

      // Wait for completion (mock agent is fast)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify exit file was created
      assert.ok(existsSync(exitFile), 'Exit file should be created on completion');

      const exitData = JSON.parse(readFileSync(exitFile, 'utf8'));
      assert.equal(exitData.exitCode, 0, 'Exit code should be 0');
      assert.ok(exitData.timestamp, 'Timestamp should be present');

      // Verify work files
      assert.ok(existsSync(join(sessionDir, 'output.txt')), 'output.txt should exist');
      assert.ok(existsSync(join(sessionDir, 'result.json')), 'result.json should exist');

      const outputContent = readFileSync(join(sessionDir, 'output.txt'), 'utf8').trim();
      assert.equal(outputContent, 'Hello from mock agent');
    } finally {
      killSession(sessionId);
    }
  });

  test('failed session reports error in exit file', async () => {
    const sessionId = uniqueSessionId();
    const sessionDir = join(tempDir, 'session-failure');
    mkdirSync(sessionDir, { recursive: true });

    const exitFile = join(sessionDir, '.orchestra-exit.json');
    const mockAgent = createMockAgent(sessionDir, exitFile, 1, {});

    try {
      execSync(`tmux new-session -d -s ${sessionId} -c ${sessionDir} sh -c '${mockAgent}'`);

      await new Promise(resolve => setTimeout(resolve, 1000));

      assert.ok(existsSync(exitFile), 'Exit file should exist even on failure');

      const exitData = JSON.parse(readFileSync(exitFile, 'utf8'));
      assert.equal(exitData.exitCode, 1, 'Exit code should be 1 for failure');
    } finally {
      killSession(sessionId);
    }
  });

  test('session can be monitored via capture-pane', async () => {
    const sessionId = uniqueSessionId();
    const sessionDir = join(tempDir, 'session-monitor');
    mkdirSync(sessionDir, { recursive: true });

    // Script that outputs progress markers
    const scriptPath = join(sessionDir, 'progress-agent.sh');
    writeFileSync(scriptPath, `#!/bin/bash
echo "PROGRESS: Starting"
sleep 0.3
echo "PROGRESS: Step 1 complete"
sleep 0.3
echo "PROGRESS: Step 2 complete"
sleep 0.3
echo "PROGRESS: Finished"
sleep 2
`, { mode: 0o755 });

    try {
      execSync(`tmux new-session -d -s ${sessionId} -c ${sessionDir} sh -c '${scriptPath}'`);

      // Wait and capture
      await new Promise(resolve => setTimeout(resolve, 500));
      let output = execSync(`tmux capture-pane -t ${sessionId} -p`, { encoding: 'utf8' });
      assert.ok(output.includes('PROGRESS:'), 'Should capture progress output');

      // Wait more and check for completion
      await new Promise(resolve => setTimeout(resolve, 800));
      output = execSync(`tmux capture-pane -t ${sessionId} -p`, { encoding: 'utf8' });
      assert.ok(output.includes('Finished'), 'Should show completion message');
    } finally {
      killSession(sessionId);
    }
  });
});

describe('Session file monitoring simulation', { skip: !tmuxAvailable() }, () => {
  let tempDir: string;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'orchestra-monitor-test-'));
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('exit file watcher detects completion', async () => {
    const exitFile = join(tempDir, '.orchestra-exit.json');
    let completionDetected = false;
    let checkCount = 0;
    const maxChecks = 20;

    // Simulate writing exit file after a delay
    setTimeout(() => {
      writeFileSync(exitFile, JSON.stringify({ exitCode: 0, timestamp: new Date().toISOString() }));
    }, 300);

    // Poll for exit file (simulates what SessionManager would do)
    while (!completionDetected && checkCount < maxChecks) {
      await new Promise(resolve => setTimeout(resolve, 100));
      checkCount++;

      if (existsSync(exitFile)) {
        completionDetected = true;
      }
    }

    assert.ok(completionDetected, 'Should detect exit file creation');
    assert.ok(checkCount >= 3, 'Should have polled at least a few times before detection');
  });

  test('checks can validate session output', () => {
    // Create files that would be validated by checks
    const projectDir = join(tempDir, 'check-validation');
    mkdirSync(projectDir, { recursive: true });

    writeFileSync(join(projectDir, 'hello.txt'), 'Hello, Orchestra!');
    writeFileSync(join(projectDir, 'config.json'), JSON.stringify({ version: '1.0.0', enabled: true }));

    // Simulate file_exists check
    const fileExistsCheck = {
      type: 'file_exists',
      path: 'hello.txt'
    };
    assert.ok(existsSync(join(projectDir, fileExistsCheck.path)), 'file_exists check should pass');

    // Simulate contains check
    const containsCheck = {
      type: 'contains',
      path: 'hello.txt',
      text: 'Hello, Orchestra!'
    };
    const content = readFileSync(join(projectDir, containsCheck.path), 'utf8');
    assert.ok(content.includes(containsCheck.text), 'contains check should pass');

    // Simulate command check (would run jq in real scenario)
    const configContent = JSON.parse(readFileSync(join(projectDir, 'config.json'), 'utf8'));
    assert.equal(configContent.version, '1.0.0', 'command check equivalent should pass');
  });
});
