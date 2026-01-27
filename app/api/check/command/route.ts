import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { existsSync, statSync } from 'fs';
import { resolve, isAbsolute } from 'path';

// Command execution timeout (30 seconds for checks)
const CHECK_TIMEOUT_MS = 30 * 1000;

// Dangerous patterns that should not be allowed in check commands
// These are patterns that could be used for destructive operations
const DANGEROUS_PATTERNS = [
  /rm\s+(-[rf]+\s+)?[\/~]/, // rm with root or home paths
  />\s*\//, // redirect to absolute paths
  /curl\s+.*\|\s*bash/, // curl | bash
  /wget\s+.*\|\s*bash/, // wget | bash
  /eval\s+/, // eval commands
  /\$\(.*\)/, // command substitution (could be dangerous)
  /`.*`/, // backtick command substitution
];

export async function POST(request: NextRequest) {
  try {
    const { cmd, projectLocation } = await request.json();

    if (!cmd || typeof cmd !== 'string') {
      return NextResponse.json({ error: 'Command is required and must be a string' }, { status: 400 });
    }

    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(cmd)) {
        return NextResponse.json(
          { error: 'Command contains potentially dangerous patterns and was rejected' },
          { status: 400 }
        );
      }
    }

    // Validate project location if provided
    let cwd: string | undefined;
    if (projectLocation) {
      if (typeof projectLocation !== 'string') {
        return NextResponse.json({ error: 'projectLocation must be a string' }, { status: 400 });
      }

      // Resolve and validate the path
      const resolvedPath = isAbsolute(projectLocation)
        ? projectLocation
        : resolve(process.cwd(), projectLocation);

      if (!existsSync(resolvedPath)) {
        return NextResponse.json({ error: 'Project location does not exist' }, { status: 400 });
      }

      const stats = statSync(resolvedPath);
      if (!stats.isDirectory()) {
        return NextResponse.json({ error: 'Project location must be a directory' }, { status: 400 });
      }

      cwd = resolvedPath;
    }

    const result = await new Promise<{ exitCode: number; stdout: string; stderr: string }>(
      (resolve) => {
        const proc = spawn('bash', ['-c', cmd], {
          cwd,
          timeout: CHECK_TIMEOUT_MS,
          // Restrict environment to essentials
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            USER: process.env.USER,
            SHELL: process.env.SHELL,
            LANG: process.env.LANG || 'en_US.UTF-8',
            NODE_ENV: process.env.NODE_ENV || 'development',
          },
        });

        let stdout = '';
        let stderr = '';

        // Limit output size to prevent memory issues
        const MAX_OUTPUT = 1024 * 1024; // 1MB

        proc.stdout.on('data', (data) => {
          if (stdout.length < MAX_OUTPUT) {
            stdout += data.toString();
          }
        });

        proc.stderr.on('data', (data) => {
          if (stderr.length < MAX_OUTPUT) {
            stderr += data.toString();
          }
        });

        const timeoutId = setTimeout(() => {
          proc.kill('SIGTERM');
          resolve({
            exitCode: 124, // Standard timeout exit code
            stdout,
            stderr: stderr + '\nCommand timed out',
          });
        }, CHECK_TIMEOUT_MS);

        proc.on('close', (code) => {
          clearTimeout(timeoutId);
          resolve({
            exitCode: code ?? 1,
            stdout: stdout.slice(0, MAX_OUTPUT),
            stderr: stderr.slice(0, MAX_OUTPUT),
          });
        });

        proc.on('error', (error) => {
          clearTimeout(timeoutId);
          resolve({
            exitCode: 1,
            stdout: '',
            stderr: error.message,
          });
        });
      }
    );

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
