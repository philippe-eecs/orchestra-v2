import { useEffect, useState } from 'react';
import CanvasView from './views/CanvasView';
import { useOrchestraStore } from '@/lib/store';
import { useInboxStore } from '@/lib/inbox-store';
import { Button } from '@/components/ui/button';
import Inbox from '@/components/panels/Inbox';
import * as api from '@/lib/api';
import type { NodeStatus } from '@/lib/types';

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
      />
    </svg>
  );
}

export default function App() {
  const view = useOrchestraStore((s) => s.view);
  const setView = useOrchestraStore((s) => s.setView);
  const loadProjects = useOrchestraStore((s) => s.loadProjects);
  const unreadCount = useInboxStore((s) => s.unreadCount);
  const addItem = useInboxStore((s) => s.addItem);
  const removeBySession = useInboxStore((s) => s.removeBySession);
  const markAwaitingInput = useOrchestraStore((s) => s.markAwaitingInput);
  const markNodeStatus = useOrchestraStore((s) => s.markNodeStatus);
  const markInputResolved = useOrchestraStore((s) => s.markInputResolved);

  const [showInbox, setShowInbox] = useState(false);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  // Listen for awaiting input events
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    api.listenSessionAwaitingInput((event) => {
      // Add to inbox
      addItem({
        sessionId: event.sessionId,
        nodeId: event.nodeId,
        nodeLabel: event.nodeLabel,
        question: event.detectedQuestion,
        outputPreview: event.outputPreview,
        timestamp: event.timestamp,
      });
      // Update node status
      markAwaitingInput(event.nodeId);
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [addItem, markAwaitingInput]);

  // Listen for session completion to remove items
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    api.listenSessionCompleted((event) => {
      removeBySession(event.sessionId);

      let status: NodeStatus = event.success ? 'completed' : 'failed';
      const hasAwaitingApproval = event.checkResults?.some((r) => r.checkType === 'human_approval' && !r.passed);
      if (hasAwaitingApproval && event.exitCode === 0) status = 'awaiting_approval';
      markNodeStatus(event.nodeId, status);
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [markNodeStatus, removeBySession]);

  // Clear inbox items when sessions resume producing output
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    api.listenSessionAwaitingInputCleared((event) => {
      removeBySession(event.sessionId);
      markInputResolved(event.nodeId);
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [markInputResolved, removeBySession]);

  return (
    <div className="h-full w-full">
      <div className="flex h-12 items-center gap-2 border-b border-border bg-card px-3">
        <div className="font-semibold">Orchestra</div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant={view === 'canvas' ? 'default' : 'secondary'} onClick={() => setView('canvas')}>
            Canvas
          </Button>
          <Button size="sm" variant={view === 'runs' ? 'default' : 'secondary'} onClick={() => setView('runs')}>
            Runs
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button
            size="sm"
            variant="ghost"
            className="relative"
            onClick={() => setShowInbox(!showInbox)}
          >
            <InboxIcon className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-medium min-w-[1rem] h-4 flex items-center justify-center rounded-full px-1">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      <div className="h-[calc(100%-3rem)] flex">
        <div className="flex-1">
          {view === 'canvas' ? <CanvasView /> : <div className="p-4 text-muted-foreground">Runs view (Phase 3).</div>}
        </div>
        {showInbox && (
          <div className="w-80 border-l border-border shrink-0">
            <Inbox onClose={() => setShowInbox(false)} />
          </div>
        )}
      </div>
    </div>
  );
}
