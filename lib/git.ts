import { spawn } from 'child_process';

export async function runGitCommand(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

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
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Git command failed with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

