import type { Node, Edge } from './types';

interface LayoutOptions {
  horizontalSpacing?: number;
  verticalSpacing?: number;
  direction?: 'horizontal' | 'vertical';
}

/**
 * Auto-layout DAG nodes using Kahn's topological sort
 * Assigns layers based on dependency depth and spaces nodes evenly
 */
export function autoLayoutDag(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node[] {
  const {
    horizontalSpacing = 300,
    verticalSpacing = 150,
    direction = 'horizontal',
  } = options;

  if (nodes.length === 0) return [];

  // Build adjacency lists and in-degree map
  const inDegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};
  const reverseAdjacency: Record<string, string[]> = {};

  nodes.forEach((node) => {
    inDegree[node.id] = 0;
    adjacency[node.id] = [];
    reverseAdjacency[node.id] = [];
  });

  edges.forEach((edge) => {
    if (adjacency[edge.sourceId] && inDegree[edge.targetId] !== undefined) {
      adjacency[edge.sourceId].push(edge.targetId);
      reverseAdjacency[edge.targetId].push(edge.sourceId);
      inDegree[edge.targetId]++;
    }
  });

  // Assign layers using BFS (Kahn's algorithm with layer tracking)
  const layers: string[][] = [];
  const nodeLayer: Record<string, number> = {};
  const queue: string[] = [];

  // Find all root nodes (in-degree 0)
  Object.entries(inDegree).forEach(([nodeId, degree]) => {
    if (degree === 0) {
      queue.push(nodeId);
      nodeLayer[nodeId] = 0;
    }
  });

  // Process nodes layer by layer
  while (queue.length > 0) {
    const currentLayer = queue.map((id) => nodeLayer[id]).filter((l) => l !== undefined);
    const maxCurrentLayer = Math.max(...currentLayer, 0);

    const currentLayerNodes = queue.filter((id) => nodeLayer[id] === maxCurrentLayer);
    const nextQueue: string[] = queue.filter((id) => nodeLayer[id] !== maxCurrentLayer);

    // Add current layer nodes to layers array
    if (!layers[maxCurrentLayer]) {
      layers[maxCurrentLayer] = [];
    }
    layers[maxCurrentLayer].push(...currentLayerNodes);

    // Process each node in current layer
    for (const nodeId of currentLayerNodes) {
      for (const neighbor of adjacency[nodeId]) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) {
          // Assign layer based on maximum parent layer + 1
          const parentLayers = reverseAdjacency[neighbor].map((p) => nodeLayer[p] ?? 0);
          nodeLayer[neighbor] = Math.max(...parentLayers) + 1;
          nextQueue.push(neighbor);
        }
      }
    }

    queue.length = 0;
    queue.push(...nextQueue);
  }

  // Handle any remaining nodes (disconnected or cycles)
  nodes.forEach((node) => {
    if (nodeLayer[node.id] === undefined) {
      const lastLayer = layers.length;
      nodeLayer[node.id] = lastLayer;
      if (!layers[lastLayer]) {
        layers[lastLayer] = [];
      }
      layers[lastLayer].push(node.id);
    }
  });

  // Calculate positions
  const nodePositions: Record<string, { x: number; y: number }> = {};

  layers.forEach((layerNodes, layerIndex) => {
    const layerCount = layerNodes.length;

    layerNodes.forEach((nodeId, indexInLayer) => {
      // Center nodes within their layer
      const offset = (layerCount - 1) / 2;
      const normalizedIndex = indexInLayer - offset;

      if (direction === 'horizontal') {
        nodePositions[nodeId] = {
          x: layerIndex * horizontalSpacing + 50,
          y: normalizedIndex * verticalSpacing + 200,
        };
      } else {
        nodePositions[nodeId] = {
          x: normalizedIndex * horizontalSpacing + 200,
          y: layerIndex * verticalSpacing + 50,
        };
      }
    });
  });

  // Return updated nodes with new positions
  return nodes.map((node) => ({
    ...node,
    position: nodePositions[node.id] || node.position,
  }));
}

/**
 * Calculate the bounding box of all nodes
 */
export function getNodesBoundingBox(nodes: Node[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  const nodeWidth = 260; // Approximate node width
  const nodeHeight = 150; // Approximate node height

  const minX = Math.min(...nodes.map((n) => n.position.x));
  const minY = Math.min(...nodes.map((n) => n.position.y));
  const maxX = Math.max(...nodes.map((n) => n.position.x + nodeWidth));
  const maxY = Math.max(...nodes.map((n) => n.position.y + nodeHeight));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
