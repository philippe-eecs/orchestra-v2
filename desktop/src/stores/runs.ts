import { writable, get } from 'svelte/store';
import { api } from '../lib/api';
import { selectedProjectId } from './projects';
import type { Run, RunCreate } from '../lib/types';

export const runs = writable<Run[]>([]);
export const runsLoading = writable<boolean>(false);
export const runsError = writable<string | null>(null);

export async function loadRuns(nodeId?: number): Promise<void> {
  const projectId = get(selectedProjectId);
  if (projectId === null) {
    runs.set([]);
    return;
  }

  runsLoading.set(true);
  runsError.set(null);

  try {
    const data = await api.listRuns(projectId, nodeId);
    runs.set(data);
  } catch (error) {
    runsError.set(error instanceof Error ? error.message : 'Failed to load runs');
  } finally {
    runsLoading.set(false);
  }
}

export async function createRun(data: RunCreate): Promise<Run | null> {
  const projectId = get(selectedProjectId);
  if (projectId === null) return null;

  runsError.set(null);

  try {
    const run = await api.createRun(projectId, data);
    runs.update(rs => [run, ...rs]);
    return run;
  } catch (error) {
    runsError.set(error instanceof Error ? error.message : 'Failed to create run');
    return null;
  }
}

export async function updateRun(runId: number, data: Partial<Run>): Promise<Run | null> {
  const projectId = get(selectedProjectId);
  if (projectId === null) return null;

  runsError.set(null);

  try {
    const run = await api.updateRun(projectId, runId, data);
    runs.update(rs => rs.map(r => r.id === runId ? run : r));
    return run;
  } catch (error) {
    runsError.set(error instanceof Error ? error.message : 'Failed to update run');
    return null;
  }
}

export function getRunsForNode(nodeId: number): Run[] {
  return get(runs).filter(r => r.node_id === nodeId);
}
