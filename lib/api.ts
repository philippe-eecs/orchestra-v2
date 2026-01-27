// API client - uses Next.js API routes (no separate backend needed)

export interface ExecuteRequest {
  executor: string;
  prompt: string;
  options?: Record<string, unknown>;
}

export interface ExecuteResponse {
  status: 'done' | 'error';
  output?: string;
  error?: string;
}

export async function executeAgent(request: ExecuteRequest): Promise<ExecuteResponse> {
  const response = await fetch('/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  return response.json();
}
