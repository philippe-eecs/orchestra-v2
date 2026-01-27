'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Eye,
  Square,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  CheckSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  useOrchestraStore,
  selectCurrentProject,
} from '@/lib/store';
import { approveHumanCheck } from '@/lib/execution';
import TerminalModal from './terminal-modal';

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `0:${remainingSeconds.toString().padStart(2, '0')}`;
}

export default function AgentHub() {
  const project = useOrchestraStore(selectCurrentProject);
  const sessionsMap = useOrchestraStore((state) => state.sessions);
  const agentHubMinimized = useOrchestraStore((state) => state.agentHubMinimized);
  const toggleAgentHub = useOrchestraStore((state) => state.toggleAgentHub);
  const openTerminalModal = useOrchestraStore((state) => state.openTerminalModal);
  const terminalModalOpen = useOrchestraStore((state) => state.terminalModalOpen);
  const closeTerminalModal = useOrchestraStore((state) => state.closeTerminalModal);
  const terminalSessionId = useOrchestraStore((state) => state.terminalSessionId);

  // State for live duration updates - use lazy initializer
  const [now, setNow] = useState(() => Date.now());

  // Update now every second for live durations
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Convert sessions map to array and filter for current project
  const projectSessions = useMemo(() => {
    const allSessions = Object.values(sessionsMap);
    if (!project) return [];
    return allSessions.filter((session) =>
      project.nodes.some((n) => n.id === session.nodeId)
    );
  }, [sessionsMap, project]);

  // Enrich sessions with node info
  const enrichedSessions = projectSessions.map((session) => {
    const node = project?.nodes.find((n) => n.id === session.nodeId);
    const pendingApprovals = node?.checks
      .filter((c) => c.type === 'human_approval' && session.checkResults[c.id] === 'pending')
      .map((c) => c.id) || [];

    return {
      ...session,
      nodeName: node?.title || 'Unknown',
      projectName: project?.name || 'Unknown',
      pendingApprovals,
    };
  });

  // Sort by status (running first, then awaiting approval, then completed, then failed)
  const sortedSessions = enrichedSessions.sort((a, b) => {
    const statusOrder = {
      starting: 0,
      running: 1,
      awaiting_approval: 2,
      completed: 3,
      failed: 4,
    };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  const runningCount = sortedSessions.filter(
    (s) => s.status === 'running' || s.status === 'starting'
  ).length;
  const awaitingApprovalCount = sortedSessions.filter(
    (s) => s.status === 'awaiting_approval'
  ).length;

  const handleApprove = (sessionId: string, checkId: string) => {
    approveHumanCheck(sessionId, checkId);
  };

  return (
    <>
      <div
        className={cn(
          'border-t border-border bg-card transition-all',
          agentHubMinimized ? 'h-10' : 'h-[200px]'
        )}
      >
        {/* Header */}
        <div className="h-10 px-4 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Agent Hub</span>
            {runningCount > 0 && (
              <Badge variant="default" className="text-xs">
                {runningCount} running
              </Badge>
            )}
            {awaitingApprovalCount > 0 && (
              <Badge
                variant="outline"
                className="text-xs bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
              >
                {awaitingApprovalCount} awaiting approval
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleAgentHub}>
            {agentHubMinimized ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Content */}
        {!agentHubMinimized && (
          <ScrollArea className="h-[150px]">
            <div className="p-2 space-y-1">
              {sortedSessions.length === 0 ? (
                <div className="flex items-center justify-center h-[120px] text-muted-foreground text-sm">
                  No sessions yet. Run a project to see agent activity.
                </div>
              ) : (
                sortedSessions.map((session) => (
                  <div
                    key={session.id}
                    className={cn(
                      'flex items-center justify-between px-3 py-2 rounded-md',
                      'bg-muted/50 hover:bg-muted transition-colors',
                      session.status === 'awaiting_approval' && 'border border-yellow-500/30'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {/* Status Icon */}
                      {(session.status === 'running' || session.status === 'starting') && (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                      )}
                      {session.status === 'awaiting_approval' && (
                        <Clock className="w-4 h-4 text-yellow-400" />
                      )}
                      {session.status === 'completed' && (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      )}
                      {session.status === 'failed' && (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}

                      {/* Info */}
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{session.nodeName}</span>
                        <span className="text-xs text-muted-foreground">
                          {session.projectName}
                        </span>
                      </div>

                      {/* Agent Badge */}
                      <Badge variant="outline" className="text-xs">
                        {session.agentType}
                      </Badge>

                      {/* Duration */}
                      <span className="text-xs text-muted-foreground">
                        {session.completedAt
                          ? formatDuration(session.completedAt - session.startedAt)
                          : formatDuration(now - session.startedAt)}
                      </span>

                      {/* Deliverable/Check Progress */}
                      {Object.keys(session.deliverablesStatus).length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {Object.values(session.deliverablesStatus).filter((s) => s === 'produced').length}/
                          {Object.keys(session.deliverablesStatus).length} outputs
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      {session.status === 'awaiting_approval' && session.pendingApprovals.length > 0 && (
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 text-xs bg-yellow-500 hover:bg-yellow-600"
                          onClick={() => handleApprove(session.id, session.pendingApprovals[0])}
                        >
                          <CheckSquare className="w-3 h-3 mr-1" />
                          Approve
                        </Button>
                      )}
                      {(session.status === 'running' || session.status === 'awaiting_approval') && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => openTerminalModal(session.id)}
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive"
                          >
                            <Square className="w-3 h-3 mr-1" />
                            Stop
                          </Button>
                        </>
                      )}
                      {(session.status === 'completed' || session.status === 'failed') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => openTerminalModal(session.id)}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          Logs
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Terminal Modal */}
      <TerminalModal
        open={terminalModalOpen}
        onOpenChange={(open) => !open && closeTerminalModal()}
        sessionId={terminalSessionId}
      />
    </>
  );
}
