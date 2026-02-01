import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AgentType, Project } from './types';

export type ExecutionChunkEvent = {
  sessionId: string;
  stream: 'stdout' | 'stderr';
  chunk: string;
};

export type ExecutionDoneEvent = {
  sessionId: string;
  success: boolean;
  exitCode: number | null;
};

export type ExecutionErrorEvent = {
  sessionId: string;
  message: string;
};

const LS_KEY = 'orchestra.projects.v1';

function readLocalProjects(): Record<string, Project> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, Project>;
  } catch {
    return {};
  }
}

function writeLocalProjects(projects: Record<string, Project>) {
  localStorage.setItem(LS_KEY, JSON.stringify(projects));
}

function now() {
  return Date.now();
}

function randomId() {
  return crypto.randomUUID();
}

export async function listProjects(): Promise<Project[]> {
  if (isTauri()) return invoke<Project[]>('list_projects');
  return Object.values(readLocalProjects()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | null> {
  if (isTauri()) return invoke<Project | null>('get_project', { id });
  return readLocalProjects()[id] ?? null;
}

export async function createProject(input: { name: string; description?: string }): Promise<Project> {
  if (isTauri()) return invoke<Project>('create_project', { name: input.name, description: input.description ?? '' });
  const projects = readLocalProjects();
  const id = randomId();
  const project: Project = {
    id,
    name: input.name,
    description: input.description ?? '',
    nodes: [],
    edges: [],
    createdAt: now(),
    updatedAt: now(),
  };
  projects[id] = project;
  writeLocalProjects(projects);
  return project;
}

export async function saveProject(project: Project): Promise<Project> {
  if (isTauri()) return invoke<Project>('save_project', { project });
  const projects = readLocalProjects();
  projects[project.id] = { ...project, updatedAt: now() };
  writeLocalProjects(projects);
  return projects[project.id]!;
}

export async function deleteProject(id: string): Promise<void> {
  if (isTauri()) return invoke<void>('delete_project', { id });
  const projects = readLocalProjects();
  delete projects[id];
  writeLocalProjects(projects);
}

const BROWSER_BUS = new EventTarget();

export async function executeNode(input: {
  sessionId?: string;
  nodeId: string;
  agent: AgentType;
  model?: string;
  prompt: string;
  cwd?: string;
}): Promise<{ sessionId: string }> {
  if (isTauri()) return invoke<{ sessionId: string }>('execute_node', { input });

  const sessionId = input.sessionId ?? randomId();
  const header = `> (${input.agent}) executing node ${input.nodeId}\n\n`;
  BROWSER_BUS.dispatchEvent(
    new CustomEvent<ExecutionChunkEvent>('execution://chunk', {
      detail: { sessionId, stream: 'stdout', chunk: header },
    }),
  );

  const lines = [
    `This is a browser fallback executor.\n`,
    `Prompt:\n${input.prompt}\n\n`,
    `Tip: run via Tauri to execute real CLIs.\n`,
  ];

  let idx = 0;
  const timer = setInterval(() => {
    if (idx >= lines.length) {
      clearInterval(timer);
      BROWSER_BUS.dispatchEvent(
        new CustomEvent<ExecutionDoneEvent>('execution://done', {
          detail: { sessionId, success: true, exitCode: 0 },
        }),
      );
      return;
    }
    BROWSER_BUS.dispatchEvent(
      new CustomEvent<ExecutionChunkEvent>('execution://chunk', {
        detail: { sessionId, stream: 'stdout', chunk: lines[idx++]! },
      }),
    );
  }, 250);

  return { sessionId };
}

export async function stopExecution(sessionId: string): Promise<void> {
  if (isTauri()) return invoke<void>('stop_execution', { sessionId });
  BROWSER_BUS.dispatchEvent(
    new CustomEvent<ExecutionErrorEvent>('execution://error', {
      detail: { sessionId, message: 'stopExecution not supported in browser fallback.' },
    }),
  );
}

export async function listenExecutionEvents(handlers: {
  onChunk: (e: ExecutionChunkEvent) => void;
  onDone: (e: ExecutionDoneEvent) => void;
  onError: (e: ExecutionErrorEvent) => void;
}): Promise<UnlistenFn> {
  if (isTauri()) {
    const unChunk = await listen<ExecutionChunkEvent>('execution://chunk', (event) => handlers.onChunk(event.payload));
    const unDone = await listen<ExecutionDoneEvent>('execution://done', (event) => handlers.onDone(event.payload));
    const unErr = await listen<ExecutionErrorEvent>('execution://error', (event) => handlers.onError(event.payload));
    return () => {
      unChunk();
      unDone();
      unErr();
    };
  }

  const chunkListener = (event: Event) => handlers.onChunk((event as CustomEvent<ExecutionChunkEvent>).detail);
  const doneListener = (event: Event) => handlers.onDone((event as CustomEvent<ExecutionDoneEvent>).detail);
  const errListener = (event: Event) => handlers.onError((event as CustomEvent<ExecutionErrorEvent>).detail);

  BROWSER_BUS.addEventListener('execution://chunk', chunkListener);
  BROWSER_BUS.addEventListener('execution://done', doneListener);
  BROWSER_BUS.addEventListener('execution://error', errListener);

  return () => {
    BROWSER_BUS.removeEventListener('execution://chunk', chunkListener);
    BROWSER_BUS.removeEventListener('execution://done', doneListener);
    BROWSER_BUS.removeEventListener('execution://error', errListener);
  };
}
