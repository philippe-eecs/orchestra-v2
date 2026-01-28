'use client';

import { memo, useState, useCallback } from 'react';
import { Handle, Position, type Node } from '@xyflow/react';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  Terminal,
  Clock,
  Eye,
  Link,
  GitBranch,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useOrchestraStore } from '@/lib/store';
import type {
  Node as ProjectNode,
  NodeStatus,
  ContextRef,
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
  composed: 'Composed',
};

const agentColors: Record<string, string> = {
  claude: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  codex: 'bg-green-500/20 text-green-400 border-green-500/30',
  gemini: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  composed: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

const statusIcons: Record<NodeStatus, React.ReactNode> = {
  pending: <Clock className="w-4 h-4 text-muted-foreground" />,
  running: <Loader2 className="w-4 h-4 animate-spin text-blue-400" />,
  completed: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  failed: <XCircle className="w-4 h-4 text-red-400" />,
};

// ========== Context Item Component ==========

interface ContextItemProps {
  context: ContextRef;
  projectLocation?: string;
  nodes?: ProjectNode[];
}

function ContextItem({ context, projectLocation, nodes }: ContextItemProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPreview = useCallback(async () => {
    if (context.type !== 'file' || preview !== null) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/context/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: context.path, projectLocation }),
      });
      const data = await response.json();
      setPreview(data.content || 'Unable to preview file');
    } catch {
      setPreview('Error loading preview');
    } finally {
      setIsLoading(false);
    }
  }, [context, projectLocation, preview]);

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (context.type === 'file') {
      await fetch('/api/context/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: context.path, projectLocation }),
      });
    } else if (context.type === 'url') {
      window.open(context.url, '_blank');
    }
  }, [context, projectLocation]);

  // Get display info based on context type
  let icon: React.ReactNode;
  let label: string;

  switch (context.type) {
    case 'file':
      icon = <FileText className="w-3 h-3 shrink-0" />;
      label = context.path.split('/').pop() || context.path;
      break;
    case 'url':
      icon = <Link className="w-3 h-3 shrink-0" />;
      try {
        label = new URL(context.url).hostname;
      } catch {
        label = context.url;
      }
      break;
    case 'parent_output':
      icon = <GitBranch className="w-3 h-3 shrink-0" />;
      const parentNode = nodes?.find(n => n.id === context.nodeId);
      label = parentNode ? `from ${parentNode.title}` : `from ${context.nodeId}`;
      break;
    case 'markdown':
      icon = <FileText className="w-3 h-3 shrink-0" />;
      label = context.content.slice(0, 20) + (context.content.length > 20 ? '...' : '');
      break;
  }

  const content = (
    <div
      className={cn(
        'flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors',
        context.type === 'file' && 'hover:underline'
      )}
      onClick={handleClick}
    >
      {icon}
      <span className="truncate max-w-[140px]">{label}</span>
    </div>
  );

  // Only show tooltip for files (with preview)
  if (context.type === 'file') {
    return (
      <Tooltip>
        <TooltipTrigger asChild onMouseEnter={fetchPreview}>
          {content}
        </TooltipTrigger>
        <TooltipContent
          side="right"
          className="max-w-[400px] max-h-[300px] overflow-auto bg-popover text-popover-foreground border"
        >
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading preview...
            </div>
          ) : (
            <pre className="text-xs font-mono whitespace-pre-wrap">{preview}</pre>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

// ========== Custom Node Component ==========

function CustomNode({ data, selected }: CustomNodeProps) {
  const { node, projectId } = data;
  const selectNode = useOrchestraStore((state) => state.selectNode);
  const sessions = useOrchestraStore((state) => state.sessions);
  const openTerminalModal = useOrchestraStore((state) => state.openTerminalModal);
  const project = useOrchestraStore((state) => state.projects[projectId]);

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

      {/* Header - status only (right-aligned) */}
      <div className="flex items-center justify-end p-2 border-b border-border gap-2">
        {statusIcons[node.status]}
        {session?.status === 'awaiting_approval' && (
          <Badge variant="outline" className="text-xs bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
            <Eye className="w-3 h-3 mr-1" />
            Review
          </Badge>
        )}
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

      {/* Context items with preview */}
      {node.context.length > 0 && (
        <div className="px-3 pb-2 space-y-1">
          {node.context.slice(0, 3).map((ctx, i) => (
            <ContextItem
              key={i}
              context={ctx}
              projectLocation={project?.location}
              nodes={project?.nodes}
            />
          ))}
          {node.context.length > 3 && (
            <span className="text-xs text-muted-foreground">
              +{node.context.length - 3} more
            </span>
          )}
        </div>
      )}

      {/* Agent indicator - subtle footer */}
      <div className="px-3 pb-2 text-xs text-muted-foreground">
        via <span className={cn('font-medium', agentColors[node.agent.type].split(' ')[1])}>{agentLabels[node.agent.type]}</span>
        {'model' in node.agent && node.agent.model && <span className="opacity-70"> ({node.agent.model})</span>}
      </div>

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
