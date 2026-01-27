import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const { path, projectLocation } = await request.json();

    if (!path) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    // Resolve path relative to project location if provided
    const fullPath = projectLocation ? join(projectLocation, path) : path;

    const exists = existsSync(fullPath);

    return NextResponse.json({ exists, path: fullPath });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
