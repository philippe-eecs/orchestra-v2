import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

interface TestRunnerRequest {
  framework: 'npm' | 'pytest' | 'jest' | 'cargo' | 'go' | 'custom';
  command?: string;
  testPattern?: string;
  projectLocation?: string;
}

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped?: number;
}

// Framework-specific test commands
const frameworkCommands: Record<string, string> = {
  npm: 'npm test',
  pytest: 'pytest',
  jest: 'npx jest',
  cargo: 'cargo test',
  go: 'go test ./...',
};

function parseTestOutput(stdout: string, stderr: string, framework: string): TestSummary {
  const combined = stdout + stderr;
  let total = 0, passed = 0, failed = 0, skipped = 0;

  switch (framework) {
    case 'jest':
    case 'npm': {
      // Jest format: "Tests:  1 failed, 2 passed, 3 total"
      const testsMatch = combined.match(/Tests:\s*(\d+)\s*failed,\s*(\d+)\s*passed,\s*(\d+)\s*total/i);
      if (testsMatch) {
        failed = parseInt(testsMatch[1], 10);
        passed = parseInt(testsMatch[2], 10);
        total = parseInt(testsMatch[3], 10);
      } else {
        // Alternative: "X passing"
        const passingMatch = combined.match(/(\d+)\s*passing/i);
        const failingMatch = combined.match(/(\d+)\s*failing/i);
        if (passingMatch) passed = parseInt(passingMatch[1], 10);
        if (failingMatch) failed = parseInt(failingMatch[1], 10);
        total = passed + failed;
      }
      break;
    }
    case 'pytest': {
      // Pytest format: "5 passed, 1 failed, 2 skipped"
      const passedMatch = combined.match(/(\d+)\s*passed/i);
      const failedMatch = combined.match(/(\d+)\s*failed/i);
      const skippedMatch = combined.match(/(\d+)\s*skipped/i);
      if (passedMatch) passed = parseInt(passedMatch[1], 10);
      if (failedMatch) failed = parseInt(failedMatch[1], 10);
      if (skippedMatch) skipped = parseInt(skippedMatch[1], 10);
      total = passed + failed + skipped;
      break;
    }
    case 'cargo': {
      // Rust/Cargo format: "test result: ok. 5 passed; 0 failed; 0 ignored"
      const resultMatch = combined.match(/(\d+)\s*passed;\s*(\d+)\s*failed;\s*(\d+)\s*ignored/);
      if (resultMatch) {
        passed = parseInt(resultMatch[1], 10);
        failed = parseInt(resultMatch[2], 10);
        skipped = parseInt(resultMatch[3], 10);
        total = passed + failed + skipped;
      }
      break;
    }
    case 'go': {
      // Go format: "ok" or "FAIL" per package, count lines
      const okMatches = (combined.match(/^ok\s+/gm) || []).length;
      const failMatches = (combined.match(/^FAIL\s+/gm) || []).length;
      passed = okMatches;
      failed = failMatches;
      total = passed + failed;
      break;
    }
    default: {
      // Generic: try to find any numbers related to pass/fail
      const passMatch = combined.match(/(\d+)\s*(pass|passed|ok|success)/gi);
      const failMatch = combined.match(/(\d+)\s*(fail|failed|error)/gi);
      if (passMatch) passed = passMatch.reduce((sum, m) => sum + parseInt(m, 10), 0);
      if (failMatch) failed = failMatch.reduce((sum, m) => sum + parseInt(m, 10), 0);
      total = passed + failed || 1;
    }
  }

  return { total: total || 1, passed, failed, skipped: skipped || undefined };
}

export async function POST(request: Request) {
  try {
    const {
      framework,
      command,
      testPattern,
      projectLocation,
    }: TestRunnerRequest = await request.json();

    if (!framework) {
      return NextResponse.json(
        { error: 'framework is required' },
        { status: 400 }
      );
    }

    // Build the test command
    let testCommand: string;
    if (framework === 'custom') {
      if (!command) {
        return NextResponse.json(
          { error: 'command is required for custom framework' },
          { status: 400 }
        );
      }
      testCommand = command;
    } else {
      testCommand = frameworkCommands[framework];
      if (testPattern) {
        // Add test pattern to command
        switch (framework) {
          case 'jest':
            testCommand += ` --testPathPattern="${testPattern}"`;
            break;
          case 'pytest':
            testCommand += ` -k "${testPattern}"`;
            break;
          case 'cargo':
            testCommand += ` ${testPattern}`;
            break;
          case 'go':
            testCommand += ` -run "${testPattern}"`;
            break;
        }
      }
    }

    // Execute the test command
    const result = await new Promise<{
      exitCode: number;
      stdout: string;
      stderr: string;
    }>((resolve) => {
      const cwd = projectLocation || process.cwd();
      const proc = spawn('sh', ['-c', testCommand], { cwd });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });

      proc.on('error', (err) => {
        resolve({ exitCode: 1, stdout, stderr: err.message });
      });
    });

    const summary = parseTestOutput(result.stdout, result.stderr, framework);
    const passed = result.exitCode === 0;

    return NextResponse.json({
      passed,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      summary,
      command: testCommand,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { passed: false, error: message, exitCode: 1, summary: { total: 0, passed: 0, failed: 0 } },
      { status: 500 }
    );
  }
}
