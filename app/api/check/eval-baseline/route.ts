import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

interface EvalBaselineRequest {
  metric: 'duration' | 'memory' | 'accuracy' | 'custom';
  baseline: number;
  tolerance: number; // Percentage (e.g., 10 means ±10%)
  command?: string;
  evaluator?: string;
  projectLocation?: string;
}

interface MeasurementResult {
  measured: number;
  baseline: number;
  deviation: number; // Percentage deviation from baseline
  withinTolerance: boolean;
}

async function measureDuration(command: string, cwd: string): Promise<number> {
  const start = performance.now();

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('sh', ['-c', command], { cwd });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command exited with code ${code}`));
    });
    proc.on('error', reject);
  });

  return performance.now() - start;
}

async function measureMemory(command: string, cwd: string): Promise<number> {
  // Use /usr/bin/time on macOS/Linux to measure memory
  const timeCmd = process.platform === 'darwin'
    ? `/usr/bin/time -l ${command} 2>&1 | grep "maximum resident set size" | awk '{print $1}'`
    : `/usr/bin/time -v ${command} 2>&1 | grep "Maximum resident set size" | awk '{print $6}'`;

  const result = await new Promise<string>((resolve, reject) => {
    const proc = spawn('sh', ['-c', timeCmd], { cwd });
    let output = '';
    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', (data) => { output += data.toString(); });
    proc.on('close', () => resolve(output));
    proc.on('error', reject);
  });

  // Parse the memory value (in KB on Linux, bytes on macOS)
  const memoryValue = parseInt(result.trim(), 10);
  if (isNaN(memoryValue)) {
    throw new Error('Failed to measure memory');
  }

  // Convert to MB
  return process.platform === 'darwin'
    ? memoryValue / (1024 * 1024) // bytes to MB
    : memoryValue / 1024; // KB to MB
}

async function runEvaluator(evaluator: string, cwd: string): Promise<number> {
  const result = await new Promise<string>((resolve, reject) => {
    const proc = spawn('sh', ['-c', evaluator], { cwd });
    let output = '';
    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`Evaluator exited with code ${code}`));
    });
    proc.on('error', reject);
  });

  // Parse the numeric output from the evaluator
  const value = parseFloat(result.trim());
  if (isNaN(value)) {
    throw new Error('Evaluator did not return a numeric value');
  }

  return value;
}

export async function POST(request: Request) {
  try {
    const {
      metric,
      baseline,
      tolerance,
      command,
      evaluator,
      projectLocation,
    }: EvalBaselineRequest = await request.json();

    if (!metric || baseline === undefined || tolerance === undefined) {
      return NextResponse.json(
        { error: 'metric, baseline, and tolerance are required' },
        { status: 400 }
      );
    }

    const cwd = projectLocation || process.cwd();
    let measured: number;

    switch (metric) {
      case 'duration':
        if (!command) {
          return NextResponse.json(
            { error: 'command is required for duration metric' },
            { status: 400 }
          );
        }
        measured = await measureDuration(command, cwd);
        break;

      case 'memory':
        if (!command) {
          return NextResponse.json(
            { error: 'command is required for memory metric' },
            { status: 400 }
          );
        }
        measured = await measureMemory(command, cwd);
        break;

      case 'accuracy':
      case 'custom':
        if (!evaluator) {
          return NextResponse.json(
            { error: 'evaluator is required for accuracy/custom metric' },
            { status: 400 }
          );
        }
        measured = await runEvaluator(evaluator, cwd);
        break;

      default:
        return NextResponse.json(
          { error: `Unknown metric: ${metric}` },
          { status: 400 }
        );
    }

    // Calculate deviation
    const deviation = ((measured - baseline) / baseline) * 100;
    const withinTolerance = Math.abs(deviation) <= tolerance;

    const result: MeasurementResult = {
      measured,
      baseline,
      deviation,
      withinTolerance,
    };

    return NextResponse.json({
      passed: withinTolerance,
      ...result,
      metric,
      tolerance,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { passed: false, error: message, measured: 0, baseline: 0, deviation: 0, withinTolerance: false },
      { status: 500 }
    );
  }
}
