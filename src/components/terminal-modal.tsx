'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Maximize2, Minimize2, ExternalLink, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrchestraStore, selectCurrentProject } from '@/lib/store';
import { getSessionStatus, isInteractiveBackend } from '@/lib/api';

const EMPTY_LINES: string[] = [];

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
  const [polledOutputBySessionId, setPolledOutputBySessionId] = useState<Record<string, string[]>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

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

  // Debug logging - remove after investigation
  useEffect(() => {
    if (open && session) {
      console.log('[TerminalModal Debug]', {
        sessionId,
        session,
        nodeId: session.nodeId,
        allNodeRuns: Object.values(nodeRuns),
        matchingRuns: Object.values(nodeRuns).filter((r) => r.nodeId === session.nodeId),
        latestRun,
        hasOutput: !!latestRun?.output,
        outputPreview: latestRun?.output?.substring(0, 200),
        isInteractive: session.backend && isInteractiveBackend(session.backend),
        containerId: session.containerId,
      });
    }
  }, [open, session, sessionId, nodeRuns, latestRun]);

  const storedOutputLines = useMemo(() => {
    return latestRun?.output ? latestRun.output.split('\n') : EMPTY_LINES;
  }, [latestRun]);
  const isInteractiveSession = Boolean(
    open &&
      session?.backend &&
      isInteractiveBackend(session.backend) &&
      session.containerId
  );
  const displayLines = useMemo(() => {
    if (!open) return EMPTY_LINES;
    const polledOutput = sessionId ? polledOutputBySessionId[sessionId] ?? EMPTY_LINES : EMPTY_LINES;
    if (isInteractiveSession) return polledOutput.length > 0 ? polledOutput : storedOutputLines;
    return storedOutputLines;
  }, [isInteractiveSession, open, polledOutputBySessionId, sessionId, storedOutputLines]);

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setIsFullscreen(false);
      setCopied(false);
      if (sessionId) {
        setPolledOutputBySessionId((prev) => {
          if (!(sessionId in prev)) return prev;
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
      }
    }

    onOpenChange(nextOpen);
  };

  // Poll for real output from interactive sessions
  useEffect(() => {
    if (!isInteractiveSession || !sessionId || !session?.backend || !session.containerId) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const status = await getSessionStatus(session.containerId!, session.backend!);
        if (cancelled || !status.output) return;

        setPolledOutputBySessionId((prev) => ({
          ...prev,
          [sessionId]: status.output?.split('\n') ?? [],
        }));

        // Auto-scroll to bottom
        if (terminalRef.current) {
          terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
      } catch {
        // Ignore polling errors
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isInteractiveSession, sessionId, session?.backend, session?.containerId]);

  // Auto-scroll when output changes
  useEffect(() => {
    if (!open) return;
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [open, displayLines]);

  const handleOpenInTerminal = async () => {
    if (!session?.attachCommand) return;

    try {
      const response = await fetch('/api/terminal/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: session.attachCommand }),
      });

      if (!response.ok) {
        console.error('Failed to open terminal:', await response.text());
      }
    } catch (error) {
      console.error('Failed to open terminal:', error);
    }
  };

  const handleCopyCommand = async () => {
    if (!session?.attachCommand) return;

    try {
      await navigator.clipboard.writeText(session.attachCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const statusVariant = session?.status === 'running' || session?.status === 'starting'
    ? 'default'
    : session?.status === 'completed'
    ? 'secondary'
    : session?.status === 'awaiting_approval'
    ? 'outline'
    : 'destructive';

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className={cn(
          'flex flex-col',
          isFullscreen
            ? 'max-w-[95vw] w-[95vw] h-[90vh]'
            : 'max-w-4xl h-[600px]'
        )}
      >
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
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

            <div className="flex items-center gap-2">
              {/* Copy attach command */}
              {session?.attachCommand && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyCommand}
                  title="Copy attach command"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              )}

              {/* Open in external terminal */}
              {session?.attachCommand && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenInTerminal}
                  title="Open in external terminal"
                >
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Open in Terminal
                </Button>
              )}

              {/* Fullscreen toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Show attach command if available */}
          {session?.attachCommand && (
            <div className="mt-2 p-2 bg-muted rounded text-xs font-mono text-muted-foreground">
              <span className="text-primary">$</span> {session.attachCommand}
            </div>
          )}

          {/* Show sandbox info if available */}
          {session?.sandboxInfo && (
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Sandbox: {session.sandboxInfo.branchName}
              </Badge>
              {session.sandboxInfo.prUrl && (
                <a
                  href={session.sandboxInfo.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:underline"
                >
                  View PR
                </a>
              )}
            </div>
          )}
        </DialogHeader>

        <div
          ref={terminalRef}
          className="flex-1 bg-black rounded-md p-4 font-mono text-sm text-green-400 overflow-auto"
        >
          {displayLines.length === 0 ? (
            <div className="text-muted-foreground">
              {session?.status === 'running' || session?.status === 'starting'
                ? 'Waiting for output...'
                : 'No output available'}
            </div>
          ) : (
            displayLines.map((line, i) => (
              <div key={i} className="leading-relaxed whitespace-pre-wrap">
                {line || '\u00A0'}
              </div>
            ))
          )}
          {(session?.status === 'running' || session?.status === 'starting') && (
            <span className="animate-pulse">_</span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
