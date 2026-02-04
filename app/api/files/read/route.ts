import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { resolve, isAbsolute, relative } from 'path';

function isInside(baseDir: string, target: string): boolean {
  const rel = relative(baseDir, target);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('../') && !rel.startsWith('..\\'));
}

export async function POST(request: NextRequest) {
  try {
    const { path, projectLocation } = await request.json();

    if (!path || typeof path !== 'string') {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }
    if (!projectLocation || typeof projectLocation !== 'string') {
      return NextResponse.json({ error: 'projectLocation is required' }, { status: 400 });
    }

    const absolutePath = isAbsolute(path) ? path : resolve(projectLocation, path);
    const base = resolve(projectLocation);
    const target = resolve(absolutePath);

    if (!isInside(base, target)) {
      return NextResponse.json({ error: 'path must be inside projectLocation' }, { status: 403 });
    }

    if (!existsSync(target)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const st = statSync(target);
    if (!st.isFile()) {
      return NextResponse.json({ error: 'Not a file' }, { status: 400 });
    }

    const content = await readFile(target, 'utf-8');
    return NextResponse.json({ content, path: target });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
