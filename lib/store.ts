/**
 * Orchestra Store - Zustand with Tauri IPC
 *
 * This store manages all application state and syncs with the Rust backend
 * via Tauri IPC commands. It maintains a local cache for fast UI updates
 * while persisting changes to SQLite via the backend.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  Project,
  Node,
  Edge,
  Session,
  NodeRun,
  ContextRef,
  Deliverable,
  DeliverableInput,
  Check,
  CheckInput,
  AgentConfig,
  Resource,
  NodeStatus,
  SessionStatus,
  AgentTemplate,
  ComposedAgentTemplate,
  ExecutionBackend,
  AppView,
  SystemStatus,
  RunHistoryEntry,
} from './types';
import * as api from './tauri-api';

// ========== STATE INTERFACE ==========

interface OrchestraState {
  // Core data model
  projects: Record<string, Project>;
  sessions: Record<string, Session>;
  agentLibrary: Record<string, AgentTemplate>;
  nodeRuns: Record<string, NodeRun>;

  // UI State
  selectedProjectId: string | null;
  selectedNodeId: string | null;
  agentHubMinimized: boolean;
  terminalModalOpen: boolean;
  terminalSessionId: string | null;

  // Navigation
  currentView: AppView;
  setView: (view: AppView) => void;

  // System Status
  systemStatus: SystemStatus;
  checkSystemStatus: () => Promise<void>;

  // Run History
  runHistory: RunHistoryEntry[];
  addRunHistoryEntry: (entry: Omit<RunHistoryEntry, 'id'>) => string;
  updateRunHistoryEntry: (id: string, updates: Partial<RunHistoryEntry>) => void;

  // Loading states
  isLoading: boolean;
  isInitialized: boolean;

  // ========== INITIALIZATION ==========
  initialize: () => Promise<void>;

  // ========== PROJECT ACTIONS ==========
  createProject: (name: string, description?: string, location?: string) => Promise<string>;
  deleteProject: (id: string) => Promise<void>;
  updateProject: (id: string, updates: Partial<Omit<Project, 'id' | 'nodes' | 'edges'>>) => void;
  addProjectResource: (projectId: string, resource: Resource) => void;
  removeProjectResource: (projectId: string, resourceIndex: number) => void;
  setProjectNotes: (projectId: string, notes: string) => void;
  setProjectVariable: (projectId: string, key: string, value: unknown) => void;

  // ========== NODE ACTIONS ==========
  addNode: (projectId: string, node: Omit<Node, 'id' | 'status' | 'sessionId'>) => string;
  updateNode: (projectId: string, nodeId: string, updates: Partial<Node>) => void;
  deleteNode: (projectId: string, nodeId: string) => void;
  setNodeStatus: (projectId: string, nodeId: string, status: NodeStatus) => void;
  addNodeContext: (projectId: string, nodeId: string, context: ContextRef) => void;
  removeNodeContext: (projectId: string, nodeId: string, contextIndex: number) => void;
  addNodeDeliverable: (projectId: string, nodeId: string, deliverable: DeliverableInput) => string;
  removeNodeDeliverable: (projectId: string, nodeId: string, deliverableId: string) => void;
  addNodeCheck: (projectId: string, nodeId: string, check: CheckInput) => string;
  removeNodeCheck: (projectId: string, nodeId: string, checkId: string) => void;
  updateNodeCheck: (projectId: string, nodeId: string, checkId: string, updates: Partial<Check>) => void;

  // ========== EDGE ACTIONS ==========
  addEdge: (projectId: string, edge: Omit<Edge, 'id'>) => string;
  deleteEdge: (projectId: string, edgeId: string) => void;
  setEdgeDeliverable: (projectId: string, edgeId: string, deliverableId: string | undefined) => void;

  // ========== SESSION ACTIONS ==========
  createSession: (nodeId: string, agentType: AgentConfig['type']) => string;
  updateSession: (sessionId: string, updates: Partial<Session>) => void;
  setSessionStatus: (sessionId: string, status: SessionStatus) => void;
  setDeliverableStatus: (sessionId: string, deliverableId: string, status: 'pending' | 'produced') => void;
  setCheckResult: (sessionId: string, checkId: string, result: 'pending' | 'passed' | 'failed') => void;
  incrementRetryAttempt: (sessionId: string, checkId: string) => number;
  setSessionAttachInfo: (
    sessionId: string,
    info: { backend: ExecutionBackend; attachCommand?: string; containerId?: string }
  ) => void;
  setSessionSandboxInfo: (
    sessionId: string,
    info: { worktreePath: string; branchName: string; prUrl?: string }
  ) => void;

  // ========== NODE RUN ACTIONS ==========
  createNodeRun: (run: Omit<NodeRun, 'id'>) => string;
  updateNodeRun: (runId: string, updates: Partial<NodeRun>) => void;
  completeNodeRun: (runId: string, status: 'completed' | 'failed', output?: string, error?: string) => void;
  appendNodeOutput: (projectId: string, nodeId: string, chunk: string) => void;
  activeNodeRuns: Record<string, string>;

  // ========== UI ACTIONS ==========
  selectProject: (id: string | null) => void;
  selectNode: (id: string | null) => void;
  toggleAgentHub: () => void;
  openTerminalModal: (sessionId: string) => void;
  closeTerminalModal: () => void;

  // ========== AGENT LIBRARY ACTIONS ==========
  createComposedAgentFromProject: (
    projectId: string,
    name: string,
    options: { description?: string; category?: string }
  ) => string;
  updateAgentTemplate: (id: string, updates: Partial<AgentTemplate>) => void;
  deleteAgentTemplate: (id: string) => void;

  // ========== SYNC ==========
  syncProject: (projectId: string) => Promise<void>;
}

// ========== UTILITIES ==========

const generateId = () => Math.random().toString(36).substring(2, 15);

// Default primitive agent templates
const defaultAgentLibrary: Record<string, AgentTemplate> = {
  'claude-default': {
    id: 'claude-default',
    kind: 'primitive',
    name: 'Claude',
    description: 'Complex reasoning, planning, and multi-step analysis',
    category: 'general',
    agentType: 'claude',
    defaultConfig: { type: 'claude' },
    createdAt: 0,
  },
  'codex-default': {
    id: 'codex-default',
    kind: 'primitive',
    name: 'Codex',
    description: 'Code generation, refactoring, and architectural work',
    category: 'code',
    agentType: 'codex',
    defaultConfig: { type: 'codex', reasoningEffort: 'high' },
    createdAt: 0,
  },
  'gemini-default': {
    id: 'gemini-default',
    kind: 'primitive',
    name: 'Gemini',
    description: 'Multimodal analysis, web search, and document understanding',
    category: 'research',
    agentType: 'gemini',
    defaultConfig: { type: 'gemini', model: 'gemini-3-pro-preview' },
    createdAt: 0,
  },
};

// ========== STORE ==========

export const useOrchestraStore = create<OrchestraState>()(
  immer((set, get) => ({
    // Initial State
    projects: {},
    sessions: {},
    nodeRuns: {},
    agentLibrary: defaultAgentLibrary,
    selectedProjectId: null,
    selectedNodeId: null,
    agentHubMinimized: false,
    terminalModalOpen: false,
    terminalSessionId: null,
    activeNodeRuns: {},
    isLoading: false,
    isInitialized: false,

    // Navigation
    currentView: 'dashboard',

    // System Status
    systemStatus: {
      dockerAvailable: false,
      claudeCliDetected: false,
      codexCliDetected: false,
      geminiCliDetected: false,
      lastChecked: null,
    },

    // Run History
    runHistory: [],

    // ========== INITIALIZATION ==========

    initialize: async () => {
      if (get().isInitialized) return;

      set((state) => {
        state.isLoading = true;
      });

      if (!api.isTauri()) {
        set((state) => {
          state.isLoading = false;
          state.isInitialized = true;
        });
        return;
      }

      try {
        // Load projects from backend
        const projects = await api.listProjects();
        const projectsMap: Record<string, Project> = {};
        for (const project of projects) {
          projectsMap[project.id] = project;
        }

        // Load sessions
        const sessions = await api.listSessions();
        const sessionsMap: Record<string, Session> = {};
        for (const session of sessions) {
          sessionsMap[session.id] = session as Session;
        }

        set((state) => {
          state.projects = projectsMap;
          state.sessions = sessionsMap;
          state.isLoading = false;
          state.isInitialized = true;
        });

        // Set up event listeners for execution output
        api.onExecutionOutput((event) => {
          get().appendNodeOutput('', event.nodeId, event.chunk);
        });

        api.onExecutionComplete((event) => {
          set((state) => {
            if (state.sessions[event.sessionId]) {
              state.sessions[event.sessionId].status = event.status as SessionStatus;
              if (event.status === 'completed' || event.status === 'failed') {
                state.sessions[event.sessionId].completedAt = Date.now();
              }
            }
          });
        });
      } catch (error) {
        console.error('Failed to initialize store:', error);
        set((state) => {
          state.isLoading = false;
          state.isInitialized = true;
        });
      }
    },

    // ========== PROJECT ACTIONS ==========

    createProject: async (name, description = '', location) => {
      const project = await api.createProject(name, description, location);
      set((state) => {
        state.projects[project.id] = project;
      });
      return project.id;
    },

    deleteProject: async (id) => {
      await api.deleteProject(id);
      set((state) => {
        delete state.projects[id];
        if (state.selectedProjectId === id) {
          state.selectedProjectId = null;
          state.selectedNodeId = null;
        }
      });
    },

    updateProject: (id, updates) => {
      set((state) => {
        if (state.projects[id]) {
          Object.assign(state.projects[id], updates);
        }
      });
      // Sync to backend
      const project = get().projects[id];
      if (project) {
        api.updateProject(project).catch(console.error);
      }
    },

    addProjectResource: (projectId, resource) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          project.context.resources.push(resource);
        }
      });
      get().syncProject(projectId);
    },

    removeProjectResource: (projectId, resourceIndex) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          project.context.resources.splice(resourceIndex, 1);
        }
      });
      get().syncProject(projectId);
    },

    setProjectNotes: (projectId, notes) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          project.context.notes = notes;
        }
      });
      get().syncProject(projectId);
    },

    setProjectVariable: (projectId, key, value) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          project.context.variables[key] = value;
        }
      });
      get().syncProject(projectId);
    },

    // ========== NODE ACTIONS ==========

    addNode: (projectId, node) => {
      const id = generateId();
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          project.nodes.push({
            ...node,
            id,
            status: 'pending',
            sessionId: null,
          });
        }
      });
      get().syncProject(projectId);
      return id;
    },

    updateNode: (projectId, nodeId, updates) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          const nodeIndex = project.nodes.findIndex((n) => n.id === nodeId);
          if (nodeIndex !== -1) {
            Object.assign(project.nodes[nodeIndex], updates);
          }
        }
      });
      get().syncProject(projectId);
    },

    deleteNode: (projectId, nodeId) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          project.nodes = project.nodes.filter((n) => n.id !== nodeId);
          project.edges = project.edges.filter(
            (e) => e.sourceId !== nodeId && e.targetId !== nodeId
          );
          for (const node of project.nodes) {
            node.context = node.context.filter(
              (ctx) => !(ctx.type === 'parent_output' && ctx.nodeId === nodeId)
            );
          }
          if (state.selectedNodeId === nodeId) {
            state.selectedNodeId = null;
          }
        }
      });
      get().syncProject(projectId);
    },

    setNodeStatus: (projectId, nodeId, status) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          const node = project.nodes.find((n) => n.id === nodeId);
          if (node) {
            node.status = status;
          }
        }
      });
    },

    addNodeContext: (projectId, nodeId, context) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          const node = project.nodes.find((n) => n.id === nodeId);
          if (node) {
            node.context.push(context);
          }
        }
      });
      get().syncProject(projectId);
    },

    removeNodeContext: (projectId, nodeId, contextIndex) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          const node = project.nodes.find((n) => n.id === nodeId);
          if (node) {
            node.context.splice(contextIndex, 1);
          }
        }
      });
      get().syncProject(projectId);
    },

    addNodeDeliverable: (projectId, nodeId, deliverable) => {
      const id = generateId();
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          const node = project.nodes.find((n) => n.id === nodeId);
          if (node) {
            node.deliverables.push({ ...deliverable, id } as Deliverable);
          }
        }
      });
      get().syncProject(projectId);
      return id;
    },

    removeNodeDeliverable: (projectId, nodeId, deliverableId) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          const node = project.nodes.find((n) => n.id === nodeId);
          if (node) {
            node.deliverables = node.deliverables.filter((d) => d.id !== deliverableId);
          }
          for (const edge of project.edges) {
            if (edge.sourceDeliverable === deliverableId) {
              edge.sourceDeliverable = undefined;
            }
          }
        }
      });
      get().syncProject(projectId);
    },

    addNodeCheck: (projectId, nodeId, check) => {
      const id = generateId();
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          const node = project.nodes.find((n) => n.id === nodeId);
          if (node) {
            node.checks.push({ ...check, id } as Check);
          }
        }
      });
      get().syncProject(projectId);
      return id;
    },

    removeNodeCheck: (projectId, nodeId, checkId) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          const node = project.nodes.find((n) => n.id === nodeId);
          if (node) {
            node.checks = node.checks.filter((c) => c.id !== checkId);
          }
        }
      });
      get().syncProject(projectId);
    },

    updateNodeCheck: (projectId, nodeId, checkId, updates) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          const node = project.nodes.find((n) => n.id === nodeId);
          if (node) {
            const checkIndex = node.checks.findIndex((c) => c.id === checkId);
            if (checkIndex !== -1) {
              Object.assign(node.checks[checkIndex], updates);
            }
          }
        }
      });
      get().syncProject(projectId);
    },

    // ========== EDGE ACTIONS ==========

    addEdge: (projectId, edge) => {
      const id = generateId();
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          const exists = project.edges.some(
            (e) => e.sourceId === edge.sourceId && e.targetId === edge.targetId
          );
          if (!exists) {
            project.edges.push({ ...edge, id });
          }
        }
      });
      get().syncProject(projectId);
      return id;
    },

    deleteEdge: (projectId, edgeId) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          project.edges = project.edges.filter((e) => e.id !== edgeId);
        }
      });
      get().syncProject(projectId);
    },

    setEdgeDeliverable: (projectId, edgeId, deliverableId) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          const edge = project.edges.find((e) => e.id === edgeId);
          if (edge) {
            edge.sourceDeliverable = deliverableId;
          }
        }
      });
      get().syncProject(projectId);
    },

    // ========== SESSION ACTIONS ==========

    createSession: (nodeId, agentType) => {
      const id = generateId();
      const tmuxSessionName = `orchestra-node-${nodeId}-${id}`;

      set((state) => {
        state.sessions[id] = {
          id,
          nodeId,
          tmuxSessionName,
          agentType,
          agentPid: null,
          status: 'starting',
          deliverablesStatus: {},
          checkResults: {},
          retryAttempts: {},
          startedAt: Date.now(),
          completedAt: null,
        };
      });
      return id;
    },

    updateSession: (sessionId, updates) => {
      set((state) => {
        if (state.sessions[sessionId]) {
          Object.assign(state.sessions[sessionId], updates);
        }
      });
    },

    setSessionStatus: (sessionId, status) => {
      set((state) => {
        if (state.sessions[sessionId]) {
          state.sessions[sessionId].status = status;
          if (status === 'completed' || status === 'failed') {
            state.sessions[sessionId].completedAt = Date.now();
          }
        }
      });
    },

    setDeliverableStatus: (sessionId, deliverableId, status) => {
      set((state) => {
        if (state.sessions[sessionId]) {
          state.sessions[sessionId].deliverablesStatus[deliverableId] = status;
        }
      });
    },

    setCheckResult: (sessionId, checkId, result) => {
      set((state) => {
        if (state.sessions[sessionId]) {
          state.sessions[sessionId].checkResults[checkId] = result;
        }
      });
    },

    incrementRetryAttempt: (sessionId, checkId) => {
      let newCount = 0;
      set((state) => {
        if (state.sessions[sessionId]) {
          const current = state.sessions[sessionId].retryAttempts[checkId] || 0;
          newCount = current + 1;
          state.sessions[sessionId].retryAttempts[checkId] = newCount;
        }
      });
      return newCount;
    },

    setSessionAttachInfo: (sessionId, info) => {
      set((state) => {
        if (state.sessions[sessionId]) {
          state.sessions[sessionId].backend = info.backend;
          if (info.attachCommand) {
            state.sessions[sessionId].attachCommand = info.attachCommand;
          }
          if (info.containerId) {
            state.sessions[sessionId].containerId = info.containerId;
          }
        }
      });
    },

    setSessionSandboxInfo: (sessionId, info) => {
      set((state) => {
        if (state.sessions[sessionId]) {
          state.sessions[sessionId].sandboxInfo = info;
        }
      });
    },

    // ========== NODE RUN ACTIONS ==========

    createNodeRun: (run) => {
      const id = generateId();
      set((state) => {
        state.nodeRuns[id] = { ...run, id };
        state.activeNodeRuns[run.nodeId] = id;
      });
      return id;
    },

    updateNodeRun: (runId, updates) => {
      set((state) => {
        if (state.nodeRuns[runId]) {
          Object.assign(state.nodeRuns[runId], updates);
        }
      });
    },

    completeNodeRun: (runId, status, output, error) => {
      set((state) => {
        if (state.nodeRuns[runId]) {
          state.nodeRuns[runId].status = status;
          state.nodeRuns[runId].completedAt = Date.now();
          if (output !== undefined) {
            state.nodeRuns[runId].output = output;
          }
          if (error !== undefined) {
            state.nodeRuns[runId].error = error;
          }
          const nodeId = state.nodeRuns[runId].nodeId;
          if (state.activeNodeRuns[nodeId] === runId) {
            delete state.activeNodeRuns[nodeId];
          }
        }
      });
    },

    appendNodeOutput: (_projectId, nodeId, chunk) => {
      set((state) => {
        const runId = state.activeNodeRuns[nodeId];
        if (!runId || !state.nodeRuns[runId]) return;
        const currentOutput = state.nodeRuns[runId].output || '';
        state.nodeRuns[runId].output = currentOutput + chunk;
      });
    },

    // ========== UI ACTIONS ==========

    selectProject: (id) => {
      set((state) => {
        state.selectedProjectId = id;
        state.selectedNodeId = null;
      });
    },

    selectNode: (id) => {
      set((state) => {
        state.selectedNodeId = id;
      });
    },

    toggleAgentHub: () => {
      set((state) => {
        state.agentHubMinimized = !state.agentHubMinimized;
      });
    },

    openTerminalModal: (sessionId) => {
      set((state) => {
        state.terminalModalOpen = true;
        state.terminalSessionId = sessionId;
      });
    },

    closeTerminalModal: () => {
      set((state) => {
        state.terminalModalOpen = false;
        state.terminalSessionId = null;
      });
    },

    // ========== NAVIGATION ACTIONS ==========

    setView: (view) => {
      set((state) => {
        state.currentView = view;
      });
    },

    // ========== SYSTEM STATUS ACTIONS ==========

    checkSystemStatus: async () => {
      try {
        // Dynamic import to avoid issues in non-Tauri environments
        const { checkSystemStatus } = await import('./system-check');
        const status = await checkSystemStatus();
        set((state) => {
          state.systemStatus = status;
        });
      } catch (error) {
        console.error('Failed to check system status:', error);
      }
    },

    // ========== RUN HISTORY ACTIONS ==========

    addRunHistoryEntry: (entry) => {
      const id = generateId();
      set((state) => {
        state.runHistory.unshift({ ...entry, id });
        // Keep only last 100 entries
        if (state.runHistory.length > 100) {
          state.runHistory = state.runHistory.slice(0, 100);
        }
      });
      return id;
    },

    updateRunHistoryEntry: (id, updates) => {
      set((state) => {
        const index = state.runHistory.findIndex((e) => e.id === id);
        if (index !== -1) {
          Object.assign(state.runHistory[index], updates);
        }
      });
    },

    // ========== AGENT LIBRARY ACTIONS ==========

    createComposedAgentFromProject: (projectId, name, options) => {
      const id = generateId();
      set((state) => {
        const project = state.projects[projectId];
        if (!project) return;

        const composedNodes = project.nodes.map((node) => ({
          id: node.id,
          title: node.title,
          prompt: node.prompt,
          agent: node.agent,
          context: node.context,
          deliverables: node.deliverables,
          checks: node.checks,
        }));

        const rootNodeIds = new Set(
          project.nodes
            .filter((n) => !project.edges.some((e) => e.targetId === n.id))
            .map((n) => n.id)
        );
        const inputs = project.nodes
          .filter((n) => rootNodeIds.has(n.id))
          .flatMap((n) =>
            n.context
              .filter((c) => c.type !== 'parent_output')
              .map((c, i) => ({
                id: `input-${n.id}-${i}`,
                name: c.type === 'file' ? c.path : c.type === 'url' ? c.url : `Input ${i + 1}`,
                mappedTo: [{ nodeId: n.id, contextType: c.type }],
              }))
          );

        const terminalNodeIds = new Set(
          project.nodes
            .filter((n) => !project.edges.some((e) => e.sourceId === n.id))
            .map((n) => n.id)
        );
        const outputs = project.nodes
          .filter((n) => terminalNodeIds.has(n.id))
          .flatMap((n) =>
            n.deliverables.map((d) => ({
              id: `output-${n.id}-${d.id}`,
              name:
                d.type === 'file'
                  ? d.path
                  : d.type === 'response'
                  ? d.description
                  : d.type === 'pr'
                  ? d.repo
                  : d.url,
              sourceNodeId: n.id,
              sourceDeliverableId: d.id,
            }))
          );

        state.agentLibrary[id] = {
          id,
          kind: 'composed',
          name,
          description: options.description || `Composed agent from ${project.name}`,
          category: options.category,
          createdAt: Date.now(),
          nodes: composedNodes,
          edges: project.edges,
          inputs,
          outputs,
        } as ComposedAgentTemplate;
      });
      return id;
    },

    updateAgentTemplate: (id, updates) => {
      set((state) => {
        if (state.agentLibrary[id]) {
          Object.assign(state.agentLibrary[id], updates);
        }
      });
    },

    deleteAgentTemplate: (id) => {
      set((state) => {
        if (!id.endsWith('-default')) {
          delete state.agentLibrary[id];
        }
      });
    },

    // ========== SYNC ==========

    syncProject: async (projectId) => {
      const project = get().projects[projectId];
      if (project) {
        try {
          await api.updateProject(project);
        } catch (error) {
          console.error('Failed to sync project:', error);
        }
      }
    },
  }))
);

// ========== SELECTORS ==========

export const selectCurrentProject = (state: OrchestraState) =>
  state.selectedProjectId ? state.projects[state.selectedProjectId] : null;

export const selectCurrentProjectNode = (state: OrchestraState) => {
  if (!state.selectedProjectId || !state.selectedNodeId) return null;
  const project = state.projects[state.selectedProjectId];
  return project?.nodes.find((n) => n.id === state.selectedNodeId) ?? null;
};

export const selectProjectSessions = (state: OrchestraState) => {
  if (!state.selectedProjectId) return [];
  const project = state.projects[state.selectedProjectId];
  if (!project) return [];

  const nodeIds = new Set(project.nodes.map((n) => n.id));
  return Object.values(state.sessions).filter((s) => nodeIds.has(s.nodeId));
};

export const selectRunningSessions = (state: OrchestraState) =>
  Object.values(state.sessions).filter(
    (s) => s.status === 'running' || s.status === 'starting' || s.status === 'awaiting_approval'
  );

export const selectAllSessions = (state: OrchestraState) =>
  Object.values(state.sessions);

export const selectSessionByNodeId = (state: OrchestraState, nodeId: string) =>
  Object.values(state.sessions).find((s) => s.nodeId === nodeId);
