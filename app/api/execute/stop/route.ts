/**
 * Stop Session API
 *
 * Stops a running agent session based on its backend type.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { ExecutionBackend } from '@/lib/types';
import { stopSession } from '@/lib/executor';

interface StopRequest {
  sessionId: string;
  backend?: ExecutionBackend;
}

export async function POST(request: NextRequest) {
  try {
    const body: StopRequest = await request.json();
    const { sessionId, backend } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const effectiveBackend = backend || 'docker-interactive';

    try {
      await stopSession(sessionId, effectiveBackend);
      return NextResponse.json({ status: 'stopped', sessionId });
    } catch (error) {
      return NextResponse.json(
        {
          error: `Failed to stop session: ${error instanceof Error ? error.message : String(error)}`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
