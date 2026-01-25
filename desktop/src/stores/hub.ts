import { writable } from 'svelte/store';

const DEFAULT_HUB_URL = import.meta.env.VITE_HUB_URL || 'http://localhost:8000';

export const hubUrl = writable<string>(DEFAULT_HUB_URL);
export const hubConnected = writable<boolean>(false);

export function setHubUrl(url: string): void {
  // Normalize URL (remove trailing slash)
  const normalizedUrl = url.replace(/\/$/, '');
  hubUrl.set(normalizedUrl);
  // Reset connection status when URL changes
  hubConnected.set(false);
}
