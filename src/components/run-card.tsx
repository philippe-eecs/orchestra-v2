'use client';

import {
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  RotateCcw,
  ChevronRight,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { RunHistoryEntry } from '@/lib/types';

interface RunCardProps {
  run: RunHistoryEntry;
  onViewProject?: () => void;
  onRerun?: () => void;
}

export default function RunCard({ run, onViewProject, onRerun }: RunCardProps) {
  const formatDuration = (ms: number | null) => {
    if (!ms) return '-';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getStatusIcon = () => {
    switch (run.status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'running':
        return <Zap className="w-5 h-5 text-yellow-500 animate-pulse" />;
      default:
        return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = () => {
    switch (run.status) {
      case 'completed':
        return <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'running':
        return <Badge className="bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20">Running</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  return (
    <Card className="p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-4">
        {/* Status Icon */}
        <div className="shrink-0">{getStatusIcon()}</div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium truncate">{run.projectName}</h3>
            {getStatusBadge()}
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(run.startedAt)}
            </span>
            {run.duration && (
              <span className="flex items-center gap-1">
                <Timer className="w-3 h-3" />
                {formatDuration(run.duration)}
              </span>
            )}
            <span>
              {run.nodesCompleted}/{run.nodesTotal} nodes
              {run.nodesFailed > 0 && (
                <span className="text-red-500 ml-1">({run.nodesFailed} failed)</span>
              )}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {run.status === 'failed' && onRerun && (
            <Button variant="outline" size="sm" onClick={onRerun} className="gap-1">
              <RotateCcw className="w-3 h-3" />
              Rerun
            </Button>
          )}
          {onViewProject && (
            <Button variant="ghost" size="sm" onClick={onViewProject} className="gap-1">
              View
              <ChevronRight className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
