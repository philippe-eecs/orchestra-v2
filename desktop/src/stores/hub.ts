import { writable, get } from 'svelte/store';

const STORAGE_KEY = 'orchestra_hub_url';
const DEFAULT_HUB_URL = import.meta.env.VITE_HUB_URL || 'http://localhost:8000';

// Preset hub URLs for quick selection
export const HUB_PRESETS = [
  { name: 'Remote (SSH)', url: 'http://159.65.109.198:8000' },
  { name: 'Local', url: 'http://localhost:8000' },
];

function getInitialUrl(): string {
  // Priority: localStorage > env variable > default
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
  }
  return DEFAULT_HUB_URL;
}

export const hubUrl = writable<string>(getInitialUrl());
export const hubConnected = writable<boolean>(false);
export const lastSyncTime = writable<Date | null>(null);

export function setHubUrl(url: string): void {
  // Normalize URL (remove trailing slash)
  const normalizedUrl = url.replace(/\/$/, '');
  hubUrl.set(normalizedUrl);

  // Persist to localStorage
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, normalizedUrl);
  }

  // Reset connection status when URL changes
  hubConnected.set(false);
  lastSyncTime.set(null);
}

export function markSynced(): void {
  lastSyncTime.set(new Date());
}
