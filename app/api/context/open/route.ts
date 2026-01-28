import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve, isAbsolute } from 'path';

export async function POST(request: Request) {
  try {
    const { path, projectLocation } = await request.json();

    if (!path) {
      return NextResponse.json(
        { error: 'Path is required' },
        { status: 400 }
      );
    }

    // Resolve path relative to project location if provided
    const absolutePath = isAbsolute(path)
      ? path
      : resolve(projectLocation || process.cwd(), path);

    if (!existsSync(absolutePath)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Try VS Code first, then fall back to system default
    const isVSCodeAvailable = await new Promise<boolean>((resolve) => {
      const which = spawn('which', ['code']);
      which.on('close', (code) => resolve(code === 0));
    });

    if (isVSCodeAvailable) {
      spawn('code', [absolutePath], { detached: true, stdio: 'ignore' }).unref();
    } else {
      // Fall back to system 'open' command (macOS) or 'xdg-open' (Linux)
      const openCmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
      spawn(openCmd, [absolutePath], { detached: true, stdio: 'ignore' }).unref();
    }

    return NextResponse.json({ success: true, path: absolutePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
