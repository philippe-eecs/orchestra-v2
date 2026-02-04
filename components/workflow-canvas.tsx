'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  type ReactFlowInstance,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  Node,
  Edge,
  NodeTypes,
  EdgeTypes,
  BackgroundVariant,
  Panel,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  EdgeProps,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, Package, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useOrchestraStore,
  selectCurrentProject,
} from '@/lib/store';
import CustomNode from './custom-node';
import { CreateComposedAgentDialog } from './create-composed-agent-dialog';
import { autoLayoutDag } from '@/lib/dag-layout';
import type { AgentConfig, ExecutionConfig } from '@/lib/types';

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

// Custom edge component that shows deliverable labels
function DeliverableEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const deliverableLabel = data?.deliverableLabel as string | undefined;

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {deliverableLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="px-2 py-0.5 text-xs rounded bg-muted border border-border text-muted-foreground"
          >
            {deliverableLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes: EdgeTypes = {
  deliverable: DeliverableEdge,
};

const defaultAgent: AgentConfig = { type: 'claude' };
function getDefaultExecutionConfig(): ExecutionConfig {
  return {
    backend: 'local',
    sandbox: {
      enabled: true,
      type: 'git-worktree',
      finalizeAction: 'pr',
      requireApproval: true,
      cleanupOnFinalize: false,
      keepOnFailure: true,
    },
  };
}

// ========== Project Canvas Component ==========

export default function ProjectCanvas() {
  const project = useOrchestraStore(selectCurrentProject);
  const addNode = useOrchestraStore((state) => state.addNode);
  const updateNode = useOrchestraStore((state) => state.updateNode);
  const addEdge = useOrchestraStore((state) => state.addEdge);
  const deleteEdge = useOrchestraStore((state) => state.deleteEdge);
  const deleteNode = useOrchestraStore((state) => state.deleteNode);
  const selectNode = useOrchestraStore((state) => state.selectNode);

  const [createAgentDialogOpen, setCreateAgentDialogOpen] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  // Convert project nodes to React Flow format
  const rfNodes: Node[] = useMemo(() => {
    if (!project) return [];

    return project.nodes.map((node) => ({
      id: node.id,
      type: 'custom',
      position: node.position,
      data: { node, projectId: project.id },
    }));
  }, [project]);

  // Convert project edges to React Flow format
  const rfEdges: Edge[] = useMemo(() => {
    if (!project) return [];

    return project.edges.map((edge) => {
      // Find the deliverable label if sourceDeliverable is specified
      let deliverableLabel: string | undefined;
      if (edge.sourceDeliverable) {
        const sourceNode = project.nodes.find((n) => n.id === edge.sourceId);
        const deliverable = sourceNode?.deliverables.find((d) => d.id === edge.sourceDeliverable);
        if (deliverable) {
          deliverableLabel =
            deliverable.type === 'file'
              ? deliverable.path
              : deliverable.type === 'response'
              ? deliverable.description
              : deliverable.type === 'pr'
              ? deliverable.repo
              : deliverable.type === 'edit'
              ? deliverable.url
              : undefined;
        }
      }

      return {
        id: edge.id,
        source: edge.sourceId,
        target: edge.targetId,
        type: edge.sourceDeliverable ? 'deliverable' : 'smoothstep',
        animated: false,
        style: { stroke: 'hsl(var(--muted-foreground))', strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: 'hsl(var(--muted-foreground))',
          width: 20,
          height: 20,
        },
        data: { deliverableLabel },
      };
    });
  }, [project]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setNodes(rfNodes);
  }, [rfNodes, setNodes]);

  useEffect(() => {
    setEdges(rfEdges);
  }, [rfEdges, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!project || !connection.source || !connection.target) return;

      addEdge(project.id, {
        sourceId: connection.source,
        targetId: connection.target,
      });
    },
    [project, addEdge]
  );

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (!project) return;
      updateNode(project.id, node.id, { position: node.position });
    },
    [project, updateNode]
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      if (!project) return;
      deletedEdges.forEach((edge) => {
        deleteEdge(project.id, edge.id);
      });
    },
    [project, deleteEdge]
  );

  const onNodesDelete = useCallback(
    (deletedNodes: Node[]) => {
      if (!project) return;
      deletedNodes.forEach((node) => {
        deleteNode(project.id, node.id);
      });
    },
    [project, deleteNode]
  );

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const handleAddNode = useCallback(() => {
    if (!project) return;

    const existingNodes = project.nodes;
    let x = 100;
    let y = 100;

    if (existingNodes.length > 0) {
      const lastNode = existingNodes[existingNodes.length - 1];
      x = lastNode.position.x + 300;
      y = lastNode.position.y;
    }

    const nodeId = addNode(project.id, {
      title: `Node ${existingNodes.length + 1}`,
      description: '',
      position: { x, y },
      prompt: '',
      agent: defaultAgent,
      context: [],
      deliverables: [],
      checks: [],
      executionConfig: getDefaultExecutionConfig(),
    });

    selectNode(nodeId);
  }, [project, addNode, selectNode]);

  const onDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!project) return;

      // Convert screen coords to flow coords (accounts for zoom/pan)
      let x = 0;
      let y = 0;
      if (reactFlowInstance?.screenToFlowPosition) {
        const pos = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        x = pos.x;
        y = pos.y;
      } else {
        // Fallback: approximate based on container bounds
        const bounds = (event.target as HTMLElement)
          .closest('.react-flow')
          ?.getBoundingClientRect();
        if (!bounds) return;
        x = event.clientX - bounds.left;
        y = event.clientY - bounds.top;
      }

      const nodeId = addNode(project.id, {
        title: `Node ${project.nodes.length + 1}`,
        description: '',
        position: { x, y },
        prompt: '',
        agent: defaultAgent,
        context: [],
        deliverables: [],
        checks: [],
        executionConfig: getDefaultExecutionConfig(),
      });

      selectNode(nodeId);
    },
    [project, addNode, selectNode, reactFlowInstance]
  );

  const handleAutoLayout = useCallback(() => {
    if (!project || project.nodes.length === 0) return;

    const layoutedNodes = autoLayoutDag(project.nodes, project.edges, {
      horizontalSpacing: 350,
      verticalSpacing: 180,
      direction: 'horizontal',
    });

    // Update all node positions
    layoutedNodes.forEach((node) => {
      updateNode(project.id, node.id, { position: node.position });
    });
  }, [project, updateNode]);

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">No project selected</p>
          <p className="text-sm">Create or select a project to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onInit={setReactFlowInstance}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onEdgesDelete={onEdgesDelete}
        onNodesDelete={onNodesDelete}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDoubleClick={onDoubleClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        deleteKeyCode={['Backspace', 'Delete']}
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls className="!bg-card !border-border !shadow-lg" />
        <MiniMap
          className="!bg-card !border-border"
          nodeColor="hsl(var(--muted-foreground))"
          maskColor="hsl(var(--background) / 0.8)"
        />
        <Panel position="top-left" className="flex gap-2">
          <Button onClick={handleAddNode} size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            Add Node
          </Button>
          {project.nodes.length > 1 && (
            <Button
              onClick={handleAutoLayout}
              size="sm"
              variant="outline"
              className="gap-2"
            >
              <LayoutGrid className="w-4 h-4" />
              Auto Layout
            </Button>
          )}
          {project.nodes.length > 0 && (
            <Button
              onClick={() => setCreateAgentDialogOpen(true)}
              size="sm"
              variant="outline"
              className="gap-2"
            >
              <Package className="w-4 h-4" />
              Save as Agent
            </Button>
          )}
        </Panel>
      </ReactFlow>

      <CreateComposedAgentDialog
        open={createAgentDialogOpen}
        onOpenChange={setCreateAgentDialogOpen}
      />
    </div>
  );
}
