import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';
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
} from './types';

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

  // ========== PROJECT ACTIONS ==========
  createProject: (name: string, description?: string, location?: string) => string;
  deleteProject: (id: string) => void;
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
    info: NonNullable<Session['sandboxInfo']>
  ) => void;

  // ========== NODE RUN ACTIONS ==========
  createNodeRun: (run: Omit<NodeRun, 'id'>) => string;
  updateNodeRun: (runId: string, updates: Partial<NodeRun>) => void;
  completeNodeRun: (runId: string, status: 'completed' | 'failed', output?: string, error?: string) => void;
  appendNodeOutput: (projectId: string, nodeId: string, chunk: string) => void;

  // Track active node runs for live output streaming
  activeNodeRuns: Record<string, string>; // nodeId -> runId

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
}

// ========== UTILITIES ==========

const generateId = () => Math.random().toString(36).substring(2, 15);

// ========== STORE ==========

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

export const useOrchestraStore = create<OrchestraState>()(
  persist(
    immer((set) => ({
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

    // ========== PROJECT ACTIONS ==========

    createProject: (name, description = '', location) => {
      const id = generateId();
      set((state) => {
        state.projects[id] = {
          id,
          name,
          description,
          location,
          context: {
            resources: [],
            notes: '',
            variables: {},
          },
          nodes: [],
          edges: [],
        };
      });
      return id;
    },

    deleteProject: (id) => {
      set((state) => {
        // Clean up sessions associated with project nodes
        const project = state.projects[id];
        if (project) {
          const nodeIds = new Set(project.nodes.map((n) => n.id));
          // Remove sessions for project nodes
          for (const sessionId of Object.keys(state.sessions)) {
            if (nodeIds.has(state.sessions[sessionId].nodeId)) {
              delete state.sessions[sessionId];
            }
          }
          // Remove node runs for project
          for (const runId of Object.keys(state.nodeRuns)) {
            if (state.nodeRuns[runId].projectId === id) {
              delete state.nodeRuns[runId];
            }
          }
        }
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
    },

    addProjectResource: (projectId, resource) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          project.context.resources.push(resource);
        }
      });
    },

    removeProjectResource: (projectId, resourceIndex) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          project.context.resources.splice(resourceIndex, 1);
        }
      });
    },

    setProjectNotes: (projectId, notes) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          project.context.notes = notes;
        }
      });
    },

    setProjectVariable: (projectId, key, value) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          project.context.variables[key] = value;
        }
      });
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
    },

    deleteNode: (projectId, nodeId) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          // Remove node
          project.nodes = project.nodes.filter((n) => n.id !== nodeId);
          // Remove edges connected to this node
          project.edges = project.edges.filter(
            (e) => e.sourceId !== nodeId && e.targetId !== nodeId
          );
          // Clean up parent_output references in other nodes
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
          // Also clear edge references to this deliverable
          for (const edge of project.edges) {
            if (edge.sourceDeliverable === deliverableId) {
              edge.sourceDeliverable = undefined;
            }
          }
        }
      });
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
    },

    // ========== EDGE ACTIONS ==========

    addEdge: (projectId, edge) => {
      const id = generateId();
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          // Check if edge already exists
          const exists = project.edges.some(
            (e) => e.sourceId === edge.sourceId && e.targetId === edge.targetId
          );
          if (!exists) {
            project.edges.push({ ...edge, id });
          }
        }
      });
      return id;
    },

    deleteEdge: (projectId, edgeId) => {
      set((state) => {
        const project = state.projects[projectId];
        if (project) {
          project.edges = project.edges.filter((e) => e.id !== edgeId);
        }
      });
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
        state.nodeRuns[id] = {
          ...run,
          id,
        };
        // Track active run for live output streaming
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
          // Clear from active runs when completed
          const nodeId = state.nodeRuns[runId].nodeId;
          if (state.activeNodeRuns[nodeId] === runId) {
            delete state.activeNodeRuns[nodeId];
          }
        }
      });
    },

    appendNodeOutput: (projectId, nodeId, chunk) => {
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

    // ========== AGENT LIBRARY ACTIONS ==========

    createComposedAgentFromProject: (projectId, name, options) => {
      const id = generateId();
      set((state) => {
        const project = state.projects[projectId];
        if (!project) return;

        // Convert project nodes to composed nodes (strip position, status, sessionId)
        const composedNodes = project.nodes.map((node) => ({
          id: node.id,
          title: node.title,
          prompt: node.prompt,
          agent: node.agent,
          context: node.context,
          deliverables: node.deliverables,
          checks: node.checks,
        }));

        // Auto-detect inputs: non-parent_output contexts from root nodes
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

        // Auto-detect outputs: deliverables from terminal nodes
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
        // Don't allow deleting default primitives
        if (!id.endsWith('-default')) {
          delete state.agentLibrary[id];
        }
      });
    },
  })),
    {
      name: 'orchestra-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist essential data, not runtime state
      partialize: (state) => ({
        projects: state.projects,
        agentLibrary: state.agentLibrary,
        selectedProjectId: state.selectedProjectId,
        agentHubMinimized: state.agentHubMinimized,
      }),
      // Merge persisted state with defaults on hydration
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<OrchestraState>;
        return {
          ...currentState,
          projects: persisted.projects ?? currentState.projects,
          agentLibrary: {
            ...defaultAgentLibrary,
            ...(persisted.agentLibrary ?? {}),
          },
          selectedProjectId: persisted.selectedProjectId ?? null,
          agentHubMinimized: persisted.agentHubMinimized ?? false,
        };
      },
    }
  )
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
    (s) =>
      s.status === 'running' ||
      s.status === 'starting' ||
      s.status === 'awaiting_approval' ||
      s.status === 'awaiting_review'
  );

export const selectAllSessions = (state: OrchestraState) =>
  Object.values(state.sessions);

export const selectSessionByNodeId = (state: OrchestraState, nodeId: string) =>
  Object.values(state.sessions).find((s) => s.nodeId === nodeId);
