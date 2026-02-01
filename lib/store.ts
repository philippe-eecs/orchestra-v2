import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { AppView, Edge, Node, Project, Session } from './types';
import * as api from './api';

function now() {
  return Date.now();
}

function randomId() {
  return crypto.randomUUID();
}

function defaultNode(partial?: Partial<Node>): Node {
  return {
    id: randomId(),
    title: 'New Node',
    position: { x: 100, y: 100 },
    agent: { type: 'claude' },
    prompt: '',
    context: [],
    deliverables: [],
    checks: [],
    status: 'pending',
    ...partial,
  };
}

function defaultEdge(partial: Pick<Edge, 'sourceId' | 'targetId'> & Partial<Edge>): Edge {
  return {
    id: randomId(),
    sourceId: partial.sourceId,
    targetId: partial.targetId,
    sourceDeliverable: partial.sourceDeliverable,
  };
}

export type OrchestraState = {
  view: AppView;
  projects: Record<string, Project>;
  currentProjectId: string | null;
  selectedNodeId: string | null;
  sessions: Record<string, Session>;
  latestSessionIdByNodeId: Record<string, string>;

  loadProjects: () => Promise<void>;
  createProject: (input: { name: string; description?: string }) => Promise<Project>;
  openProject: (id: string) => Promise<void>;
  saveCurrentProject: () => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  setView: (view: AppView) => void;
  setSelectedNodeId: (nodeId: string | null) => void;

  addNode: (partial?: Partial<Node>) => Promise<string>;
  updateNode: (nodeId: string, patch: Partial<Node>) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  upsertEdge: (edge: Pick<Edge, 'sourceId' | 'targetId'> & Partial<Edge>) => Promise<void>;
  deleteEdge: (edgeId: string) => Promise<void>;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => Promise<void>;

  startSession: (nodeId: string, sessionId: string) => void;
  appendSessionOutput: (sessionId: string, chunk: string) => void;
  finishSession: (sessionId: string, success: boolean, exitCode: number | null) => void;
  failSession: (sessionId: string, message: string) => void;

  runNode: (nodeId: string) => Promise<void>;
};

export const useOrchestraStore = create<OrchestraState>()(
  immer((set, get) => ({
    view: 'canvas',
    projects: {},
    currentProjectId: null,
    selectedNodeId: null,
    sessions: {},
    latestSessionIdByNodeId: {},

    async loadProjects() {
      const projects = await api.listProjects();
      set((s) => {
        s.projects = Object.fromEntries(projects.map((p) => [p.id, p]));
        if (!s.currentProjectId && projects.length) s.currentProjectId = projects[0]!.id;
      });
    },

    async createProject(input) {
      const project = await api.createProject(input);
      set((s) => {
        s.projects[project.id] = project;
        s.currentProjectId = project.id;
        s.selectedNodeId = null;
      });
      return project;
    },

    async openProject(id) {
      const project = await api.getProject(id);
      if (!project) return;
      set((s) => {
        s.projects[project.id] = project;
        s.currentProjectId = project.id;
        s.selectedNodeId = null;
      });
    },

    async saveCurrentProject() {
      const { currentProjectId, projects } = get();
      if (!currentProjectId) return;
      const project = projects[currentProjectId];
      if (!project) return;
      const saved = await api.saveProject({ ...project, updatedAt: now() });
      set((s) => {
        s.projects[saved.id] = saved;
      });
    },

    async deleteProject(id) {
      await api.deleteProject(id);
      set((s) => {
        delete s.projects[id];
        if (s.currentProjectId === id) {
          s.currentProjectId = Object.keys(s.projects)[0] ?? null;
          s.selectedNodeId = null;
        }
      });
    },

    setView(view) {
      set((s) => {
        s.view = view;
      });
    },

    setSelectedNodeId(nodeId) {
      set((s) => {
        s.selectedNodeId = nodeId;
      });
    },

    async addNode(partial) {
      const { currentProjectId } = get();
      if (!currentProjectId) throw new Error('No project selected');

      const node = defaultNode(partial);
      set((s) => {
        const project = s.projects[currentProjectId];
        if (!project) return;
        project.nodes.push(node);
        project.updatedAt = now();
        s.selectedNodeId = node.id;
      });
      await get().saveCurrentProject();
      return node.id;
    },

    async updateNode(nodeId, patch) {
      const { currentProjectId } = get();
      if (!currentProjectId) return;
      set((s) => {
        const project = s.projects[currentProjectId];
        if (!project) return;
        const node = project.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        Object.assign(node, patch);
        project.updatedAt = now();
      });
      await get().saveCurrentProject();
    },

    async deleteNode(nodeId) {
      const { currentProjectId } = get();
      if (!currentProjectId) return;
      set((s) => {
        const project = s.projects[currentProjectId];
        if (!project) return;
        project.nodes = project.nodes.filter((n) => n.id !== nodeId);
        project.edges = project.edges.filter((e) => e.sourceId !== nodeId && e.targetId !== nodeId);
        project.updatedAt = now();
        if (s.selectedNodeId === nodeId) s.selectedNodeId = null;
      });
      await get().saveCurrentProject();
    },

    async upsertEdge(edgeInput) {
      const { currentProjectId } = get();
      if (!currentProjectId) return;
      const edge = defaultEdge(edgeInput);
      set((s) => {
        const project = s.projects[currentProjectId];
        if (!project) return;
        const existing = project.edges.find((e) => e.sourceId === edge.sourceId && e.targetId === edge.targetId);
        if (existing) return;
        project.edges.push(edge);
        project.updatedAt = now();
      });
      await get().saveCurrentProject();
    },

    async deleteEdge(edgeId) {
      const { currentProjectId } = get();
      if (!currentProjectId) return;
      set((s) => {
        const project = s.projects[currentProjectId];
        if (!project) return;
        project.edges = project.edges.filter((e) => e.id !== edgeId);
        project.updatedAt = now();
      });
      await get().saveCurrentProject();
    },

    async updateNodePosition(nodeId, position) {
      await get().updateNode(nodeId, { position });
    },

    startSession(nodeId, sessionId) {
      set((s) => {
        s.sessions[sessionId] = {
          id: sessionId,
          nodeId,
          status: 'running',
          output: '',
          startedAt: now(),
        };
        s.latestSessionIdByNodeId[nodeId] = sessionId;
      });
    },

    appendSessionOutput(sessionId, chunk) {
      set((s) => {
        const session = s.sessions[sessionId];
        if (!session) return;
        session.output += chunk;
      });
    },

    finishSession(sessionId, success, exitCode) {
      set((s) => {
        const session = s.sessions[sessionId];
        if (!session) return;
        session.status = success ? 'completed' : 'failed';
        session.exitCode = exitCode;
        session.completedAt = now();

        const projectId = s.currentProjectId;
        if (!projectId) return;
        const project = s.projects[projectId];
        if (!project) return;
        const node = project.nodes.find((n) => n.id === session.nodeId);
        if (!node) return;
        node.status = success ? 'completed' : 'failed';
      });
    },

    failSession(sessionId, message) {
      set((s) => {
        const session = s.sessions[sessionId];
        if (!session) return;
        session.status = 'failed';
        session.error = message;
        session.completedAt = now();
      });
    },

    async runNode(nodeId) {
      const { currentProjectId, projects } = get();
      if (!currentProjectId) return;
      const project = projects[currentProjectId];
      if (!project) return;
      const node = project.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const sessionId = randomId();
      get().startSession(nodeId, sessionId);

      set((s) => {
        const p = s.projects[currentProjectId];
        if (!p) return;
        const n = p.nodes.find((x) => x.id === nodeId);
        if (!n) return;
        n.status = 'running';
      });
      await get().saveCurrentProject();

      try {
        await api.executeNode({
          sessionId,
          nodeId: node.id,
          agent: node.agent.type,
          model: node.agent.model,
          prompt: node.prompt,
          cwd: project.location,
        });
      } catch (e) {
        get().failSession(sessionId, e instanceof Error ? e.message : String(e));
      }
    },
  })),
);
