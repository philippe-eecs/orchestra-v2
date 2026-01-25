import { writable, derived, get } from 'svelte/store';
import { api } from '../lib/api';
import { wsClient } from '../lib/ws';
import { selectedProjectId } from './projects';
import type { Node, NodeCreate, NodeUpdate, Edge } from '../lib/types';

export const nodes = writable<Node[]>([]);
export const edges = writable<Edge[]>([]);
export const selectedNodeId = writable<number | null>(null);
export const graphLoading = writable<boolean>(false);
export const graphError = writable<string | null>(null);

export const selectedNode = derived(
  [nodes, selectedNodeId],
  ([$nodes, $selectedNodeId]) => {
    if ($selectedNodeId === null) return null;
    return $nodes.find(n => n.id === $selectedNodeId) || null;
  }
);

let wsUnsubscribe: (() => void) | null = null;

export async function loadGraph(): Promise<void> {
  const projectId = get(selectedProjectId);
  if (projectId === null) {
    nodes.set([]);
    edges.set([]);
    return;
  }

  graphLoading.set(true);
  graphError.set(null);

  try {
    const graph = await api.getGraph(projectId);
    nodes.set(graph.nodes);
    edges.set(graph.edges);

    // Connect WebSocket for real-time updates
    setupWebSocket(projectId);
  } catch (error) {
    graphError.set(error instanceof Error ? error.message : 'Failed to load graph');
  } finally {
    graphLoading.set(false);
  }
}

function setupWebSocket(projectId: number): void {
  if (wsUnsubscribe) {
    wsUnsubscribe();
  }

  wsClient.connect(projectId);
  wsUnsubscribe = wsClient.onMessage((event, data) => {
    const nodeData = data as Node | { id: number };

    switch (event) {
      case 'node.created':
        // Avoid duplicates from optimistic update
        nodes.update(ns => {
          if (ns.some(n => n.id === (nodeData as Node).id)) return ns;
          return [...ns, nodeData as Node];
        });
        break;
      case 'node.updated': {
        const updatedNode = nodeData as Node;
        nodes.update(ns => ns.map(n => n.id === updatedNode.id ? updatedNode : n));
        // Rebuild edges for this node based on parent_ids
        edges.update(es => {
          const otherEdges = es.filter(e => e.target_id !== updatedNode.id);
          const newEdges = updatedNode.parent_ids.map(parentId => ({
            source_id: parentId,
            target_id: updatedNode.id,
          }));
          return [...otherEdges, ...newEdges];
        });
        break;
      }
      case 'node.deleted':
        nodes.update(ns => ns.filter(n => n.id !== nodeData.id));
        edges.update(es => es.filter(e => e.source_id !== nodeData.id && e.target_id !== nodeData.id));
        selectedNodeId.update(id => id === nodeData.id ? null : id);
        break;
    }
  });
}

export async function createNode(data: NodeCreate): Promise<Node | null> {
  const projectId = get(selectedProjectId);
  if (projectId === null) return null;

  graphError.set(null);

  try {
    const node = await api.createNode(projectId, data);
    // Node will be added via WebSocket, but add immediately for responsiveness
    nodes.update(ns => {
      if (ns.some(n => n.id === node.id)) return ns;
      return [...ns, node];
    });
    // Add edges for parent relationships
    if (data.parent_ids) {
      edges.update(es => [
        ...es,
        ...data.parent_ids!.map(parentId => ({ source_id: parentId, target_id: node.id }))
      ]);
    }
    return node;
  } catch (error) {
    graphError.set(error instanceof Error ? error.message : 'Failed to create node');
    return null;
  }
}

export async function updateNode(nodeId: number, data: NodeUpdate): Promise<Node | null> {
  const projectId = get(selectedProjectId);
  if (projectId === null) return null;

  graphError.set(null);

  try {
    const node = await api.updateNode(projectId, nodeId, data);
    nodes.update(ns => ns.map(n => n.id === nodeId ? node : n));
    // Update edges locally based on latest parent_ids
    edges.update(es => {
      const otherEdges = es.filter(e => e.target_id !== node.id);
      const newEdges = node.parent_ids.map(parentId => ({
        source_id: parentId,
        target_id: node.id,
      }));
      return [...otherEdges, ...newEdges];
    });
    return node;
  } catch (error) {
    graphError.set(error instanceof Error ? error.message : 'Failed to update node');
    return null;
  }
}

export async function deleteNode(nodeId: number): Promise<boolean> {
  const projectId = get(selectedProjectId);
  if (projectId === null) return false;

  graphError.set(null);

  try {
    await api.deleteNode(projectId, nodeId);
    nodes.update(ns => ns.filter(n => n.id !== nodeId));
    edges.update(es => es.filter(e => e.source_id !== nodeId && e.target_id !== nodeId));
    selectedNodeId.update(id => id === nodeId ? null : id);
    return true;
  } catch (error) {
    graphError.set(error instanceof Error ? error.message : 'Failed to delete node');
    return false;
  }
}

export function selectNode(id: number | null): void {
  selectedNodeId.set(id);
}

// Subscribe to project changes to reload graph
selectedProjectId.subscribe(projectId => {
  if (projectId !== null) {
    loadGraph();
  } else {
    nodes.set([]);
    edges.set([]);
    wsClient.disconnect();
  }
});
