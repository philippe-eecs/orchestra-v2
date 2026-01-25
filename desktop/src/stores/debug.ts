import { writable, derived } from 'svelte/store';

export interface DebugEntry {
  type: 'request' | 'response' | 'error';
  method?: string;
  url: string;
  body?: unknown;
  data?: unknown;
  status?: number;
  error?: string;
  timestamp: string;
}

const MAX_ENTRIES = 50;

export const debugEntries = writable<DebugEntry[]>([]);
export const debugPanelOpen = writable<boolean>(false);

export function addDebugEntry(entry: DebugEntry): void {
  debugEntries.update(entries => {
    const newEntries = [entry, ...entries];
    return newEntries.slice(0, MAX_ENTRIES);
  });
}

export function clearDebugEntries(): void {
  debugEntries.set([]);
}

export const lastRequest = derived(debugEntries, ($entries) => {
  return $entries.find(e => e.type === 'request');
});

export const lastResponse = derived(debugEntries, ($entries) => {
  return $entries.find(e => e.type === 'response' || e.type === 'error');
});
