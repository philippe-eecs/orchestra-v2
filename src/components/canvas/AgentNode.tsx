import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { useOrchestraStore } from '@/lib/store';

type AgentFlowNode = Node<{ nodeId: string }, 'agent'>;

export default function AgentNode(props: NodeProps<AgentFlowNode>) {
  const nodeId = props.data.nodeId;
  const selectedNodeId = useOrchestraStore((s) => s.selectedNodeId);
  const projectId = useOrchestraStore((s) => s.currentProjectId);
  const node = useOrchestraStore((s) => {
    if (!projectId) return null;
    return s.projects[projectId]?.nodes.find((n) => n.id === nodeId) ?? null;
  });

  const isSelected = selectedNodeId === nodeId;

  if (!node) return null;

  const statusColor =
    node.status === 'running'
      ? 'bg-blue-500'
      : node.status === 'completed'
        ? 'bg-green-500'
        : node.status === 'failed'
          ? 'bg-red-500'
          : 'bg-muted-foreground';

  return (
    <div className={`min-w-[220px] rounded-lg border ${isSelected ? 'border-ring' : 'border-border'} bg-card p-3`}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-muted-foreground" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-muted-foreground" />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{node.title}</div>
          <div className="mt-1 text-xs text-muted-foreground">{node.agent.type}</div>
        </div>
        <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${statusColor}`} />
      </div>

      {node.prompt ? (
        <div className="mt-2 max-h-[3.75rem] overflow-hidden text-ellipsis text-xs text-muted-foreground">
          {node.prompt}
        </div>
      ) : (
        <div className="mt-2 text-xs text-muted-foreground">No prompt yet.</div>
      )}
    </div>
  );
}
