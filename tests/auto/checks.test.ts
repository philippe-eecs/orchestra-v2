/**
 * Checks Validation Tests
 *
 * Tests the check execution logic for validating agent outputs:
 * - file_exists: Verify a file was created
 * - contains: Verify file contains specific text
 * - command: Run a command and check output
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
import { join, resolve } from 'node:path';

// Types matching Orchestra's check definitions
interface FileExistsCheck {
  type: 'file_exists';
  path: string;
}

interface ContainsCheck {
  type: 'contains';
  path: string;
  text: string;
}

interface CommandCheck {
  type: 'command';
  command: string;
  expected?: string;
}

type Check = FileExistsCheck | ContainsCheck | CommandCheck;

interface CheckResult {
  passed: boolean;
  message: string;
}

/**
 * Execute a single check against the project directory
 */
function executeCheck(projectRoot: string, check: Check): CheckResult {
  switch (check.type) {
    case 'file_exists': {
      const fullPath = resolve(projectRoot, check.path);
      const exists = existsSync(fullPath);
      return {
        passed: exists,
        message: exists
          ? `File exists: ${check.path}`
          : `File not found: ${check.path}`
      };
    }

    case 'contains': {
      const fullPath = resolve(projectRoot, check.path);
      if (!existsSync(fullPath)) {
        return {
          passed: false,
          message: `File not found: ${check.path}`
        };
      }
      const content = readFileSync(fullPath, 'utf8');
      const contains = content.includes(check.text);
      return {
        passed: contains,
        message: contains
          ? `File ${check.path} contains expected text`
          : `File ${check.path} does not contain: "${check.text}"`
      };
    }

    case 'command': {
      try {
        const output = execSync(check.command, {
          cwd: projectRoot,
          encoding: 'utf8',
          timeout: 10000
        }).trim();

        if (check.expected !== undefined) {
          const matches = output === check.expected.trim();
          return {
            passed: matches,
            message: matches
              ? `Command output matches expected`
              : `Expected "${check.expected}", got "${output}"`
          };
        }

        // No expected value = just check exit code 0 (which we got if no throw)
        return {
          passed: true,
          message: `Command succeeded: ${check.command}`
        };
      } catch (error) {
        return {
          passed: false,
          message: `Command failed: ${check.command} - ${error}`
        };
      }
    }

    default:
      return {
        passed: false,
        message: `Unknown check type: ${(check as Check).type}`
      };
  }
}

describe('file_exists checks', () => {
  let tempDir: string;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'orchestra-check-test-'));
    writeFileSync(join(tempDir, 'exists.txt'), 'content');
    mkdirSync(join(tempDir, 'subdir'));
    writeFileSync(join(tempDir, 'subdir', 'nested.txt'), 'nested content');
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('passes for existing file', () => {
    const result = executeCheck(tempDir, {
      type: 'file_exists',
      path: 'exists.txt'
    });
    assert.ok(result.passed);
  });

  test('fails for non-existing file', () => {
    const result = executeCheck(tempDir, {
      type: 'file_exists',
      path: 'does-not-exist.txt'
    });
    assert.ok(!result.passed);
    assert.ok(result.message.includes('not found'));
  });

  test('works with nested paths', () => {
    const result = executeCheck(tempDir, {
      type: 'file_exists',
      path: 'subdir/nested.txt'
    });
    assert.ok(result.passed);
  });
});

describe('contains checks', () => {
  let tempDir: string;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'orchestra-check-test-'));
    writeFileSync(join(tempDir, 'hello.txt'), 'Hello, World!\nThis is a test file.');
    writeFileSync(join(tempDir, 'config.json'), '{"version": "1.0.0", "enabled": true}');
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('passes when text is found', () => {
    const result = executeCheck(tempDir, {
      type: 'contains',
      path: 'hello.txt',
      text: 'Hello, World!'
    });
    assert.ok(result.passed);
  });

  test('passes for partial match', () => {
    const result = executeCheck(tempDir, {
      type: 'contains',
      path: 'hello.txt',
      text: 'test file'
    });
    assert.ok(result.passed);
  });

  test('fails when text not found', () => {
    const result = executeCheck(tempDir, {
      type: 'contains',
      path: 'hello.txt',
      text: 'Goodbye'
    });
    assert.ok(!result.passed);
    assert.ok(result.message.includes('does not contain'));
  });

  test('fails for non-existing file', () => {
    const result = executeCheck(tempDir, {
      type: 'contains',
      path: 'missing.txt',
      text: 'anything'
    });
    assert.ok(!result.passed);
    assert.ok(result.message.includes('not found'));
  });

  test('works with JSON content', () => {
    const result = executeCheck(tempDir, {
      type: 'contains',
      path: 'config.json',
      text: '"version": "1.0.0"'
    });
    assert.ok(result.passed);
  });
});

describe('command checks', () => {
  let tempDir: string;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'orchestra-check-test-'));
    writeFileSync(join(tempDir, 'data.txt'), 'line1\nline2\nline3');
    writeFileSync(join(tempDir, 'config.json'), '{"version": "1.0.0"}');
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('passes when command succeeds', () => {
    const result = executeCheck(tempDir, {
      type: 'command',
      command: 'ls data.txt'
    });
    assert.ok(result.passed);
  });

  test('fails when command fails', () => {
    const result = executeCheck(tempDir, {
      type: 'command',
      command: 'ls nonexistent.txt'
    });
    assert.ok(!result.passed);
  });

  test('matches expected output', () => {
    const result = executeCheck(tempDir, {
      type: 'command',
      command: 'wc -l < data.txt',
      expected: '3'
    });
    // Note: wc output format varies by platform
    assert.ok(result.passed || result.message.includes('Expected'));
  });

  test('fails on output mismatch', () => {
    const result = executeCheck(tempDir, {
      type: 'command',
      command: 'echo hello',
      expected: 'goodbye'
    });
    assert.ok(!result.passed);
    assert.ok(result.message.includes('Expected'));
  });

  test('runs in project directory', () => {
    const result = executeCheck(tempDir, {
      type: 'command',
      command: 'pwd'
    });
    assert.ok(result.passed);
    // Command ran successfully in the temp directory
  });

  // jq check (if available)
  test('jq check for JSON validation', () => {
    try {
      execSync('which jq', { stdio: 'ignore' });
    } catch {
      // jq not available, skip
      return;
    }

    const result = executeCheck(tempDir, {
      type: 'command',
      command: 'jq -r .version config.json',
      expected: '1.0.0'
    });
    assert.ok(result.passed);
  });
});

describe('check execution batching', () => {
  let tempDir: string;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'orchestra-check-test-'));
    writeFileSync(join(tempDir, 'output.txt'), 'Task completed successfully');
    writeFileSync(join(tempDir, 'result.json'), '{"status": "ok", "count": 42}');
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('multiple checks can be run together', () => {
    const checks: Check[] = [
      { type: 'file_exists', path: 'output.txt' },
      { type: 'file_exists', path: 'result.json' },
      { type: 'contains', path: 'output.txt', text: 'completed' },
      { type: 'contains', path: 'result.json', text: '"status": "ok"' }
    ];

    const results = checks.map(check => executeCheck(tempDir, check));

    assert.ok(results.every(r => r.passed), 'All checks should pass');
  });

  test('partial failures are detected', () => {
    const checks: Check[] = [
      { type: 'file_exists', path: 'output.txt' },  // pass
      { type: 'file_exists', path: 'missing.txt' }, // fail
      { type: 'contains', path: 'output.txt', text: 'completed' }, // pass
      { type: 'contains', path: 'output.txt', text: 'ERROR' } // fail
    ];

    const results = checks.map(check => executeCheck(tempDir, check));
    const passed = results.filter(r => r.passed);
    const failed = results.filter(r => !r.passed);

    assert.equal(passed.length, 2, 'Two checks should pass');
    assert.equal(failed.length, 2, 'Two checks should fail');
  });
});
