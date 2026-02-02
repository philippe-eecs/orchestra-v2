import { useInboxStore, type InboxItem } from '@/lib/inbox-store';
import { useOrchestraStore } from '@/lib/store';
import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

interface InboxItemRowProps {
  item: InboxItem;
  onOpen: () => void;
  onOpenTerminal: () => void;
  onDismiss: () => void;
}

function InboxItemRow({ item, onOpen, onOpenTerminal, onDismiss }: InboxItemRowProps) {
  const dotClass =
    item.kind === 'completed' ? 'bg-green-500' : 'bg-orange-500 animate-pulse';
  const tag =
    item.kind === 'completed' ? (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-600 border border-green-500/20">
        completed
      </span>
    ) : (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-600 border border-orange-500/20">
        awaiting input
      </span>
    );

  return (
    <div className="border-b border-border p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        <span className="font-medium truncate">{item.nodeLabel}</span>
        {tag}
        <span className="ml-auto text-xs text-muted-foreground shrink-0">
          {formatRelativeTime(item.timestamp)}
        </span>
      </div>

      {item.question && item.kind === 'awaiting_input' && (
        <div className="text-sm bg-muted/50 rounded px-2 py-1.5 mb-3 whitespace-pre-wrap break-words">
          {item.question}
        </div>
      )}

      {(!item.question || item.kind === 'completed') && item.outputPreview && (
        <div className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1.5 mb-3 max-h-20 overflow-hidden font-mono whitespace-pre-wrap break-words">
          {item.outputPreview}
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={onOpen} className="gap-1.5">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 9l4-4 4 4m0 6l-4 4-4-4"
            />
          </svg>
          Open Session
        </Button>
        <Button size="sm" variant="secondary" onClick={onOpenTerminal}>
          Open Terminal
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

interface InboxProps {
  onClose?: () => void;
}

export default function Inbox({ onClose }: InboxProps) {
  const { items, unreadCount, dismissItem, clearAll } = useInboxStore();
  const setSelectedNodeId = useOrchestraStore((s) => s.setSelectedNodeId);

  // Filter to show only non-dismissed items
  const visibleItems = items.filter((item) => !item.dismissed);

  const handleOpen = (item: InboxItem) => {
    setSelectedNodeId(item.nodeId);
    onClose?.();
  };

  const handleOpenTerminal = async (item: InboxItem) => {
    try {
      await api.attachSession(item.sessionId);
    } catch (e) {
      console.error('Failed to open terminal:', e);
    }
  };

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Inbox</h2>
          {unreadCount > 0 && (
            <span className="bg-orange-500 text-white text-xs font-medium px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {visibleItems.length > 0 && (
            <Button size="sm" variant="ghost" onClick={clearAll}>
              Clear All
            </Button>
          )}
          {onClose && (
            <Button size="sm" variant="ghost" onClick={onClose}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {visibleItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
            <svg className="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <p className="text-sm">No pending items</p>
            <p className="text-xs mt-1">Items appear when agents need your input</p>
          </div>
        ) : (
          visibleItems.map((item) => (
            <InboxItemRow
              key={item.id}
              item={item}
              onOpen={() => handleOpen(item)}
              onOpenTerminal={() => handleOpenTerminal(item)}
              onDismiss={() => dismissItem(item.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
