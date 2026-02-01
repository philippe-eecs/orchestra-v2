import { NextResponse } from 'next/server';
import type { AgentType } from '@/lib/types';

interface LLMCriticRequest {
  nodeOutput: string;
  criticAgent: AgentType;
  criteria: string;
  threshold?: number;
}

interface CriticResponse {
  score: number;
  critique: string;
  suggestions: string[];
}

export async function POST(request: Request) {
  try {
    const {
      nodeOutput,
      criticAgent,
      criteria,
      threshold = 70,
    }: LLMCriticRequest = await request.json();

    if (!nodeOutput || !criteria) {
      return NextResponse.json(
        { error: 'nodeOutput and criteria are required' },
        { status: 400 }
      );
    }

    // Build the critique prompt
    const critiquePrompt = `You are a quality critic evaluating the output of an AI agent.

## Evaluation Criteria
${criteria}

## Output to Evaluate
${nodeOutput}

## Instructions
Evaluate the output against the criteria above. Provide your assessment in the following JSON format only, with no additional text:

{
  "score": <number from 0-100>,
  "critique": "<detailed explanation of strengths and weaknesses>",
  "suggestions": ["<improvement suggestion 1>", "<improvement suggestion 2>"]
}

Be strict but fair. Score based on how well the output meets the specified criteria.`;

    // Call the agent via the execute API
    const executeResponse = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/execute`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executor: criticAgent,
          prompt: critiquePrompt,
          options: criticAgent === 'claude' ? { model: 'haiku' } : undefined,
        }),
      }
    );

    const executeResult = await executeResponse.json();

    if (executeResult.status === 'error') {
      return NextResponse.json(
        { passed: false, error: executeResult.error, score: 0 },
        { status: 500 }
      );
    }

    // Parse the JSON response from the critic
    let criticResponse: CriticResponse;
    try {
      // Try to extract JSON from the response
      const jsonMatch = executeResult.output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in critic response');
      }
      criticResponse = JSON.parse(jsonMatch[0]);
    } catch {
      // If parsing fails, create a default response
      criticResponse = {
        score: 50,
        critique: executeResult.output,
        suggestions: ['Unable to parse structured response from critic'],
      };
    }

    const passed = criticResponse.score >= threshold;

    return NextResponse.json({
      passed,
      score: criticResponse.score,
      threshold,
      critique: criticResponse.critique,
      suggestions: criticResponse.suggestions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { passed: false, error: message, score: 0 },
      { status: 500 }
    );
  }
}
