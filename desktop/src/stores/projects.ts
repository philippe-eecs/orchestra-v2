import { writable, derived } from 'svelte/store';
import { api } from '../lib/api';
import type { Project, ProjectCreate } from '../lib/types';

export const projects = writable<Project[]>([]);
export const selectedProjectId = writable<number | null>(null);
export const projectsLoading = writable<boolean>(false);
export const projectsError = writable<string | null>(null);

export const selectedProject = derived(
  [projects, selectedProjectId],
  ([$projects, $selectedProjectId]) => {
    if ($selectedProjectId === null) return null;
    return $projects.find(p => p.id === $selectedProjectId) || null;
  }
);

export async function loadProjects(): Promise<void> {
  projectsLoading.set(true);
  projectsError.set(null);

  try {
    const data = await api.listProjects();
    projects.set(data);
  } catch (error) {
    projectsError.set(error instanceof Error ? error.message : 'Failed to load projects');
  } finally {
    projectsLoading.set(false);
  }
}

export async function createProject(data: ProjectCreate): Promise<Project | null> {
  projectsError.set(null);

  try {
    const project = await api.createProject(data);
    projects.update(ps => [project, ...ps]);
    return project;
  } catch (error) {
    projectsError.set(error instanceof Error ? error.message : 'Failed to create project');
    return null;
  }
}

export async function deleteProject(id: number): Promise<boolean> {
  projectsError.set(null);

  try {
    await api.deleteProject(id);
    projects.update(ps => ps.filter(p => p.id !== id));
    selectedProjectId.update(current => current === id ? null : current);
    return true;
  } catch (error) {
    projectsError.set(error instanceof Error ? error.message : 'Failed to delete project');
    return false;
  }
}

export function selectProject(id: number | null): void {
  selectedProjectId.set(id);
}
