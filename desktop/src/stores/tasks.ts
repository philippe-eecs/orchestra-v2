import { writable, derived, get } from 'svelte/store';
import { api } from '../lib/api';
import { selectedProjectId } from './projects';
import type { Task, TaskCreate } from '../lib/types';

export const tasks = writable<Task[]>([]);
export const tasksLoading = writable<boolean>(false);
export const tasksError = writable<string | null>(null);
export const showCompletedTasks = writable<boolean>(false);
export const filterByProject = writable<boolean>(false);

export const filteredTasks = derived(
  [tasks, showCompletedTasks, filterByProject, selectedProjectId],
  ([$tasks, $showCompleted, $filterByProject, $selectedProjectId]) => {
    let filtered = $tasks;

    if (!$showCompleted) {
      filtered = filtered.filter(t => !t.completed);
    }

    if ($filterByProject && $selectedProjectId !== null) {
      filtered = filtered.filter(t => t.project_id === $selectedProjectId);
    }

    return filtered.sort((a, b) => {
      // Sort by priority (higher first), then by created date (newer first)
      if (a.priority !== b.priority) return b.priority - a.priority;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }
);

export async function loadTasks(): Promise<void> {
  tasksLoading.set(true);
  tasksError.set(null);

  try {
    const data = await api.listTasks();
    tasks.set(data);
  } catch (error) {
    tasksError.set(error instanceof Error ? error.message : 'Failed to load tasks');
  } finally {
    tasksLoading.set(false);
  }
}

export async function createTask(data: TaskCreate): Promise<Task | null> {
  tasksError.set(null);

  // If filtering by project, auto-set project_id
  if (get(filterByProject)) {
    const projectId = get(selectedProjectId);
    if (projectId !== null && !data.project_id) {
      data.project_id = projectId;
    }
  }

  try {
    const task = await api.createTask(data);
    tasks.update(ts => [task, ...ts]);
    return task;
  } catch (error) {
    tasksError.set(error instanceof Error ? error.message : 'Failed to create task');
    return null;
  }
}

export async function updateTask(id: number, data: Partial<TaskCreate>): Promise<Task | null> {
  tasksError.set(null);

  try {
    const task = await api.updateTask(id, data);
    tasks.update(ts => ts.map(t => t.id === id ? task : t));
    return task;
  } catch (error) {
    tasksError.set(error instanceof Error ? error.message : 'Failed to update task');
    return null;
  }
}

export async function toggleTaskComplete(id: number): Promise<Task | null> {
  const task = get(tasks).find(t => t.id === id);
  if (!task) return null;
  return updateTask(id, { completed: !task.completed });
}

export async function deleteTask(id: number): Promise<boolean> {
  tasksError.set(null);

  try {
    await api.deleteTask(id);
    tasks.update(ts => ts.filter(t => t.id !== id));
    return true;
  } catch (error) {
    tasksError.set(error instanceof Error ? error.message : 'Failed to delete task');
    return false;
  }
}
