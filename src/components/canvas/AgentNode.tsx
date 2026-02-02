import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { useOrchestraStore } from '@/lib/store';
import type { NodeStatus } from '@/lib/types';

type AgentFlowNode = Node<{ nodeId: string }, 'agent'>;

// Status configuration for visual indicators
const STATUS_CONFIG: Record<NodeStatus, { bg: string; border: string; pulse?: boolean; label: string }> = {
  pending: { bg: 'bg-muted-foreground', border: 'border-border', label: 'Ready' },
  running: { bg: 'bg-blue-500', border: 'border-blue-500/50', pulse: true, label: 'Running' },
  completed: { bg: 'bg-green-500', border: 'border-green-500/50', label: 'Done' },
  failed: { bg: 'bg-red-500', border: 'border-red-500/50', label: 'Failed' },
  awaiting_approval: { bg: 'bg-yellow-500', border: 'border-yellow-500/50', pulse: true, label: 'Needs Review' },
};

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

  const statusConfig = STATUS_CONFIG[node.status] ?? STATUS_CONFIG.pending;
  const borderClass = isSelected ? 'border-ring' : statusConfig.border;

  return (
    <div className={`min-w-[220px] rounded-lg border ${borderClass} bg-card p-3 transition-colors`}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-muted-foreground" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-muted-foreground" />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{node.title}</div>
          <div className="mt-1 text-xs text-muted-foreground">{node.agent.type}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className={`h-2 w-2 shrink-0 rounded-full ${statusConfig.bg} ${statusConfig.pulse ? 'animate-pulse' : ''}`}
            title={statusConfig.label}
          />
        </div>
      </div>

      {node.prompt ? (
        <div className="mt-2 max-h-[3.75rem] overflow-hidden text-xs text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {node.prompt}
        </div>
      ) : (
        <div className="mt-2 text-xs text-muted-foreground">No prompt yet.</div>
      )}
    </div>
  );
}
