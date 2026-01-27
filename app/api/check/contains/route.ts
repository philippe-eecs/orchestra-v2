import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const { path, pattern, projectLocation } = await request.json();

    if (!path) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    if (!pattern) {
      return NextResponse.json({ error: 'Pattern is required' }, { status: 400 });
    }

    // Resolve path relative to project location if provided
    const fullPath = projectLocation ? join(projectLocation, path) : path;

    if (!existsSync(fullPath)) {
      return NextResponse.json({ contains: false, error: 'File not found' });
    }

    const content = readFileSync(fullPath, 'utf-8');
    const contains = content.includes(pattern);

    return NextResponse.json({ contains, path: fullPath });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
