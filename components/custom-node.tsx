'use client';

import { memo } from 'react';
import { Handle, Position, type Node } from '@xyflow/react';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  Terminal,
  Clock,
  Eye,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useOrchestraStore } from '@/lib/store';
import type {
  Node as ProjectNode,
  NodeStatus,
} from '@/lib/types';

// ========== Types ==========

interface ProjectNodeData extends Record<string, unknown> {
  node: ProjectNode;
  projectId: string;
}

export type CustomNodeType = Node<ProjectNodeData>;

interface CustomNodeProps {
  data: ProjectNodeData;
  selected?: boolean;
}

// ========== Constants ==========

const agentLabels: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
};

const agentColors: Record<string, string> = {
  claude: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  codex: 'bg-green-500/20 text-green-400 border-green-500/30',
  gemini: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const statusIcons: Record<NodeStatus, React.ReactNode> = {
  pending: <Clock className="w-4 h-4 text-muted-foreground" />,
  running: <Loader2 className="w-4 h-4 animate-spin text-blue-400" />,
  completed: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  failed: <XCircle className="w-4 h-4 text-red-400" />,
};

// ========== Custom Node Component ==========

function CustomNode({ data, selected }: CustomNodeProps) {
  const { node } = data;
  const selectNode = useOrchestraStore((state) => state.selectNode);
  const sessions = useOrchestraStore((state) => state.sessions);
  const openTerminalModal = useOrchestraStore((state) => state.openTerminalModal);

  // Get session for this node if it exists
  const session = node.sessionId ? sessions[node.sessionId] : null;

  // Count deliverables and checks
  const deliverableCount = node.deliverables.length;
  const checkCount = node.checks.length;
  const hasHumanApproval = node.checks.some((c) => c.type === 'human_approval');

  // Check/deliverable status from session
  const producedCount = session
    ? Object.values(session.deliverablesStatus).filter((s) => s === 'produced').length
    : 0;
  const passedChecks = session
    ? Object.values(session.checkResults).filter((s) => s === 'passed').length
    : 0;

  return (
    <div
      className={cn(
        'min-w-[260px] rounded-lg border bg-card shadow-lg transition-all',
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-border',
        node.status === 'running' && 'border-blue-500/50',
        node.status === 'failed' && 'border-red-500/50',
        node.status === 'completed' && 'border-green-500/30'
      )}
      onClick={() => selectNode(node.id)}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
      />

      {/* Header with agent badge and status */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <Badge
          variant="outline"
          className={cn('text-xs font-medium', agentColors[node.agent.type])}
        >
          {agentLabels[node.agent.type]}
          {node.agent.model && (
            <span className="ml-1 opacity-70">({node.agent.model})</span>
          )}
        </Badge>
        <div className="flex items-center gap-2">
          {statusIcons[node.status]}
          {session?.status === 'awaiting_approval' && (
            <Badge variant="outline" className="text-xs bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
              <Eye className="w-3 h-3 mr-1" />
              Review
            </Badge>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="px-3 py-2 font-medium text-sm">
        {node.title || 'Untitled Node'}
      </div>

      {/* Description / Prompt Preview */}
      <div className="px-3 pb-2 text-xs text-muted-foreground line-clamp-2">
        {node.description || node.prompt || 'No description'}
      </div>

      {/* Deliverables & Checks Summary */}
      {(deliverableCount > 0 || checkCount > 0) && (
        <div className="px-3 pb-2 flex flex-wrap gap-2">
          {deliverableCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              <FileText className="w-3 h-3 mr-1" />
              {node.status === 'running' || node.status === 'completed'
                ? `${producedCount}/${deliverableCount}`
                : deliverableCount}{' '}
              outputs
            </Badge>
          )}
          {checkCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              {node.status === 'running' || node.status === 'completed'
                ? `${passedChecks}/${checkCount}`
                : checkCount}{' '}
              checks
            </Badge>
          )}
          {hasHumanApproval && (
            <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
              <Eye className="w-3 h-3 mr-1" />
              approval
            </Badge>
          )}
        </div>
      )}

      {/* Context indicators */}
      {node.context.length > 0 && (
        <div className="px-3 pb-2 text-xs text-muted-foreground">
          {node.context.length} context source{node.context.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Session actions */}
      {session && (session.status === 'running' || session.status === 'awaiting_approval') && (
        <div className="border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 text-xs rounded-none rounded-b-lg"
            onClick={(e) => {
              e.stopPropagation();
              openTerminalModal(session.id);
            }}
          >
            <Terminal className="w-3 h-3 mr-1" />
            View Session
          </Button>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
      />
    </div>
  );
}

export default memo(CustomNode);
