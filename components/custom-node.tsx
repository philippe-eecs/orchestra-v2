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
  ChevronDown,
  ChevronUp,
  ExternalLink,
  AlertCircle,
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

const statusConfig: Record<NodeStatus, { icon: React.ReactNode; color: string; label: string }> = {
  pending: {
    icon: <Clock className="w-4 h-4" />,
    color: 'text-muted-foreground',
    label: 'Pending',
  },
  running: {
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    color: 'text-blue-400',
    label: 'Running',
  },
  awaiting_review: {
    icon: <Eye className="w-4 h-4" />,
    color: 'text-yellow-400',
    label: 'Review',
  },
  completed: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: 'text-green-400',
    label: 'Completed',
  },
  failed: {
    icon: <XCircle className="w-4 h-4" />,
    color: 'text-red-400',
    label: 'Failed',
  },
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
  const nodeRuns = useOrchestraStore((state) => state.nodeRuns);

  // Per-node expand/collapse state
  const [isExpanded, setIsExpanded] = useState(false);

  // Get session for this node if it exists
  const session = node.sessionId ? sessions[node.sessionId] : null;

  // Count deliverables and checks
  const deliverableCount = node.deliverables.length;
  const checkCount = node.checks.length;
  const contextCount = node.context.length;
  const hasHumanApproval = node.checks.some((c) => c.type === 'human_approval');

  // Check/deliverable status from session
  const producedCount = session
    ? Object.values(session.deliverablesStatus).filter((s) => s === 'produced').length
    : 0;
  const passedChecks = session
    ? Object.values(session.checkResults).filter((s) => s === 'passed').length
    : 0;

  // Get the latest run for this node to check for output
  const latestRun = Object.values(nodeRuns)
    .filter((r) => r.nodeId === node.id)
    .sort((a, b) => (b.completedAt || b.startedAt) - (a.completedAt || a.startedAt))[0];

  const hasOutput = latestRun?.output && latestRun.status === 'completed';

  // Status config for this node
  const status = statusConfig[node.status];

  // Description or prompt preview - with text wrapping
  const displayText = node.description || node.prompt || 'No description';
  const maxDisplayLength = isExpanded ? 500 : 80;
  const truncatedText = displayText.length > maxDisplayLength
    ? displayText.slice(0, maxDisplayLength) + '...'
    : displayText;

  const handleViewOutput = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (session) {
      openTerminalModal(session.id);
    }
  }, [session, openTerminalModal]);

  const handleToggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  return (
    <div
      className={cn(
        'min-w-[260px] max-w-[320px] rounded-lg border bg-card shadow-lg transition-all',
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

      {/* Header - Title + Status + Result Badge */}
      <div className="flex items-center justify-between p-2.5 border-b border-border gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={cn('shrink-0', status.color)}>{status.icon}</span>
          <span className="font-medium text-sm truncate">
            {node.title || 'Untitled Node'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Result indicator badges */}
          {node.status === 'completed' && hasOutput && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs bg-green-500/10 hover:bg-green-500/20 text-green-400"
              onClick={handleViewOutput}
            >
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Output
            </Button>
          )}
          {node.status === 'failed' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400"
              onClick={handleViewOutput}
            >
              <AlertCircle className="w-3 h-3 mr-1" />
              Error
            </Button>
          )}
          {session?.status === 'awaiting_approval' && (
            <Badge variant="outline" className="text-xs bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
              <Eye className="w-3 h-3 mr-1" />
              Review
            </Badge>
          )}
        </div>
      </div>

      {/* Description / Prompt Preview - with text wrapping */}
      <div className="px-3 py-2">
        <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
          {truncatedText}
        </p>
        {displayText.length > 80 && (
          <button
            onClick={handleToggleExpand}
            className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                <span>Show less</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                <span>Show more</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Summary Bar - counts for context, outputs, checks */}
      {(contextCount > 0 || deliverableCount > 0 || checkCount > 0) && (
        <div className="px-3 pb-2 flex items-center gap-3 text-xs text-muted-foreground">
          {contextCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  <span>{contextCount}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {contextCount} context item{contextCount !== 1 ? 's' : ''}
              </TooltipContent>
            </Tooltip>
          )}
          {deliverableCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" />
                  <span>
                    {node.status === 'running' || node.status === 'completed'
                      ? `${producedCount}/${deliverableCount}`
                      : deliverableCount}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {node.status === 'running' || node.status === 'completed'
                  ? `${producedCount} of ${deliverableCount} outputs produced`
                  : `${deliverableCount} output${deliverableCount !== 1 ? 's' : ''} expected`}
              </TooltipContent>
            </Tooltip>
          )}
          {checkCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  'flex items-center gap-1',
                  passedChecks === checkCount && node.status === 'completed' && 'text-green-400'
                )}>
                  <CheckCircle2 className="w-3 h-3" />
                  <span>
                    {node.status === 'running' || node.status === 'completed'
                      ? `${passedChecks}/${checkCount}`
                      : checkCount}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {node.status === 'running' || node.status === 'completed'
                  ? `${passedChecks} of ${checkCount} checks passed`
                  : `${checkCount} check${checkCount !== 1 ? 's' : ''} configured`}
              </TooltipContent>
            </Tooltip>
          )}
          {hasHumanApproval && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Eye className="w-3 h-3 text-yellow-400" />
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Requires human approval
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}

      {/* Context items with preview - show in expanded mode */}
      {isExpanded && node.context.length > 0 && (
        <div className="px-3 pb-2 space-y-1 border-t border-border/50 pt-2">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
            Context
          </div>
          {node.context.map((ctx, i) => (
            <ContextItem
              key={i}
              context={ctx}
              projectLocation={session?.sandboxInfo?.worktreePath || project?.location}
              nodes={project?.nodes}
            />
          ))}
        </div>
      )}

      {/* Agent indicator - subtle footer */}
      <div className="px-3 py-2 border-t border-border/50 text-xs text-muted-foreground flex items-center justify-between">
        <div>
          via <span className={cn('font-medium', agentColors[node.agent.type].split(' ')[1])}>
            {agentLabels[node.agent.type]}
          </span>
          {'model' in node.agent && node.agent.model && (
            <span className="opacity-70"> ({node.agent.model})</span>
          )}
        </div>
      </div>

      {/* Session actions - running state */}
      {session && session.status === 'running' && (
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
