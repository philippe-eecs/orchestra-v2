import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, isAbsolute } from 'path';

export async function POST(request: Request) {
  try {
    const { path, projectLocation, maxLines = 20 } = await request.json();

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
        { error: 'File not found', content: null, truncated: false },
        { status: 404 }
      );
    }

    const content = await readFile(absolutePath, 'utf-8');
    const lines = content.split('\n');
    const truncated = lines.length > maxLines;
    const previewContent = truncated
      ? lines.slice(0, maxLines).join('\n') + '\n...'
      : content;

    return NextResponse.json({
      content: previewContent,
      truncated,
      totalLines: lines.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message, content: null, truncated: false },
      { status: 500 }
    );
  }
}
