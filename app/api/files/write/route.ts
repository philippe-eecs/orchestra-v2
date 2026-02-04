import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { resolve, dirname, isAbsolute, relative } from 'path';

function isInside(baseDir: string, target: string): boolean {
  const rel = relative(baseDir, target);
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith('../') && !rel.startsWith('..\\');
}

export async function POST(request: NextRequest) {
  try {
    const { path, projectLocation, content } = await request.json();

    if (!path || typeof path !== 'string') {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }
    if (!projectLocation || typeof projectLocation !== 'string') {
      return NextResponse.json({ error: 'projectLocation is required' }, { status: 400 });
    }
    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'content must be a string' }, { status: 400 });
    }

    const absolutePath = isAbsolute(path) ? path : resolve(projectLocation, path);
    const base = resolve(projectLocation);
    const target = resolve(absolutePath);

    if (!isInside(base, target) && target !== base) {
      return NextResponse.json({ error: 'path must be inside projectLocation' }, { status: 403 });
    }

    // Ensure parent directory exists
    await mkdir(dirname(target), { recursive: true });

    // If exists and is not a file, reject
    if (existsSync(target)) {
      const st = statSync(target);
      if (!st.isFile()) {
        return NextResponse.json({ error: 'Target exists and is not a file' }, { status: 400 });
      }
    }

    await writeFile(target, content, 'utf-8');

    return NextResponse.json({ status: 'ok', path: target });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

