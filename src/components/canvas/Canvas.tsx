import { useCallback, useMemo } from 'react';
import { Background, Controls, type Connection, type Edge as FlowEdge, type Node as FlowNode, type NodeChange, ReactFlow } from '@xyflow/react';
import AgentNode from './AgentNode';
import { useOrchestraStore } from '@/lib/store';

const nodeTypes = { agent: AgentNode };

export default function Canvas() {
  const projectId = useOrchestraStore((s) => s.currentProjectId);
  const project = useOrchestraStore((s) => (projectId ? s.projects[projectId] : null));
  const setSelectedNodeId = useOrchestraStore((s) => s.setSelectedNodeId);
  const updateNodePosition = useOrchestraStore((s) => s.updateNodePosition);
  const upsertEdge = useOrchestraStore((s) => s.upsertEdge);

  const nodes = useMemo<FlowNode[]>(() => {
    if (!project) return [];
    return project.nodes.map((n) => ({
      id: n.id,
      type: 'agent',
      position: n.position,
      data: { nodeId: n.id },
    }));
  }, [project]);

  const edges = useMemo<FlowEdge[]>(() => {
    if (!project) return [];
    return project.edges.map((e) => ({
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
    }));
  }, [project]);

  const onNodeClick = useCallback(
    (_: unknown, node: FlowNode) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === 'position' && change.position && !change.dragging) {
          void updateNodePosition(change.id, change.position);
        }
      }
    },
    [updateNodePosition],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      void upsertEdge({ sourceId: connection.source, targetId: connection.target });
    },
    [upsertEdge],
  );

  if (!project) return <div className="h-full w-full bg-background" />;

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onPaneClick={() => setSelectedNodeId(null)}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
