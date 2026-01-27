'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useOrchestraStore, selectCurrentProject } from '@/lib/store';

interface TerminalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string | null;
}

export default function TerminalModal({
  open,
  onOpenChange,
  sessionId,
}: TerminalModalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [output, setOutput] = useState<string[]>([]);

  const sessions = useOrchestraStore((state) => state.sessions);
  const project = useOrchestraStore(selectCurrentProject);
  const nodeRuns = useOrchestraStore((state) => state.nodeRuns);

  const session = sessionId ? sessions[sessionId] : null;
  const node = session && project
    ? project.nodes.find((n) => n.id === session.nodeId)
    : null;

  // Find the most recent run for this node
  const latestRun = session
    ? Object.values(nodeRuns)
        .filter((r) => r.nodeId === session.nodeId)
        .sort((a, b) => b.startedAt - a.startedAt)[0]
    : null;

  useEffect(() => {
    if (!open || !sessionId) {
      setOutput([]);
      return;
    }

    // Simulate terminal output for demo
    // In real implementation, this would connect to tmux session via WebSocket
    const demoOutput = [
      `$ Starting execution for node: ${node?.title || 'Unknown'}`,
      `Agent: ${session?.agentType || 'unknown'}`,
      `Session: ${session?.tmuxSessionName || 'unknown'}`,
      '',
      'Initializing agent...',
      'Loading context from previous nodes...',
      '',
      latestRun?.agentCommand
        ? `> ${latestRun.agentCommand.slice(0, 100)}...`
        : '> Running agent...',
      '',
      'Thinking...',
      '',
      latestRun?.output
        ? latestRun.output.split('\n').slice(0, 20).join('\n')
        : [
            '## Analysis',
            '',
            'Based on the provided context, here are my findings:',
            '',
            '1. Processing input...',
            '2. Analyzing context...',
            '3. Generating output...',
          ].join('\n'),
      '',
      '---',
      '',
      session?.status === 'completed'
        ? 'Execution complete.'
        : session?.status === 'failed'
        ? `Execution failed: ${latestRun?.error || 'Unknown error'}`
        : session?.status === 'awaiting_approval'
        ? 'Waiting for human approval...'
        : 'Running...',
    ];

    let index = 0;
    const flatOutput = demoOutput.flatMap(line => line.split('\n'));

    const interval = setInterval(() => {
      if (index < flatOutput.length) {
        setOutput((prev) => [...prev, flatOutput[index]]);
        index++;

        // Auto-scroll to bottom
        if (terminalRef.current) {
          terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
      } else {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [open, sessionId, node?.title, session?.agentType, session?.tmuxSessionName, session?.status, latestRun?.agentCommand, latestRun?.output, latestRun?.error]);

  const statusVariant = session?.status === 'running' || session?.status === 'starting'
    ? 'default'
    : session?.status === 'completed'
    ? 'secondary'
    : session?.status === 'awaiting_approval'
    ? 'outline'
    : 'destructive';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Terminal Output
            {session && (
              <Badge variant={statusVariant}>
                {session.status}
              </Badge>
            )}
            {node && (
              <span className="text-sm text-muted-foreground ml-2">
                {node.title}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div
          ref={terminalRef}
          className="flex-1 bg-black rounded-md p-4 font-mono text-sm text-green-400 overflow-auto"
        >
          {output.map((line, i) => (
            <div key={i} className="leading-relaxed">
              {line || '\u00A0'}
            </div>
          ))}
          {(session?.status === 'running' || session?.status === 'starting') && (
            <span className="animate-pulse">_</span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
