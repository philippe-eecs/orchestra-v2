import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface InboxItem {
  id: string;
  kind: 'awaiting_input' | 'completed';
  sessionId: string;
  nodeId: string;
  nodeLabel: string;
  question: string | null;
  outputPreview: string;
  timestamp: number;
  dismissed: boolean;
}

export interface InboxState {
  items: InboxItem[];
  unreadCount: number;

  addItem: (item: Omit<InboxItem, 'id' | 'dismissed'>) => void;
  dismissItem: (id: string) => void;
  dismissBySessionKind: (sessionId: string, kind: InboxItem['kind']) => void;
  clearAll: () => void;
}

function randomId() {
  return crypto.randomUUID();
}

export const useInboxStore = create<InboxState>()(
  immer((set) => ({
    items: [],
    unreadCount: 0,

    addItem(item) {
      set((s) => {
        // Don't add duplicate items for the same session+kind
        const existingIndex = s.items.findIndex(
          (i) => i.sessionId === item.sessionId && i.kind === item.kind && !i.dismissed,
        );
        if (existingIndex !== -1) {
          // Update existing item
          s.items[existingIndex] = {
            ...s.items[existingIndex],
            ...item,
            id: s.items[existingIndex].id,
            dismissed: false,
          };
        } else {
          // Add new item
          s.items.unshift({
            ...item,
            id: randomId(),
            dismissed: false,
          });
          s.unreadCount++;
        }
      });
    },

    dismissItem(id) {
      set((s) => {
        const item = s.items.find((i) => i.id === id);
        if (item && !item.dismissed) {
          item.dismissed = true;
          s.unreadCount = Math.max(0, s.unreadCount - 1);
        }
      });
    },

    dismissBySessionKind(sessionId, kind) {
      set((s) => {
        const item = s.items.find((i) => i.sessionId === sessionId && i.kind === kind && !i.dismissed);
        if (item) {
          item.dismissed = true;
          s.unreadCount = Math.max(0, s.unreadCount - 1);
        }
      });
    },

    clearAll() {
      set((s) => {
        s.items.forEach((item) => {
          item.dismissed = true;
        });
        s.unreadCount = 0;
      });
    },
  })),
);
