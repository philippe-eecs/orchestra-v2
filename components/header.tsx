'use client';

import { Play, Settings, FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useOrchestraStore,
  selectCurrentProject,
} from '@/lib/store';
import { runProject } from '@/lib/execution';
import { useState } from 'react';

export default function Header() {
  const project = useOrchestraStore(selectCurrentProject);
  const [isRunning, setIsRunning] = useState(false);

  const handleRunProject = async () => {
    if (!project) return;

    setIsRunning(true);
    try {
      await runProject(project.id);
    } catch (error) {
      console.error('Project execution failed:', error);
    } finally {
      setIsRunning(false);
    }
  };

  // Show Project header if project is selected
  if (project) {
    return (
      <header className="h-14 border-b border-border bg-card px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold tracking-tight">Orchestra</h1>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{project.name}</span>
            {project.description && (
              <span className="text-xs text-muted-foreground hidden md:inline">
                - {project.description}
              </span>
            )}
          </div>
          <Badge variant="outline" className="text-xs">
            {project.nodes.length} node{project.nodes.length !== 1 ? 's' : ''}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleRunProject}
                  disabled={isRunning || project.nodes.length === 0}
                  className="gap-2"
                >
                  <Play className="w-4 h-4" />
                  {isRunning ? 'Running...' : 'Run DAG'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Execute all nodes in DAG order with checks
              </TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-6 mx-2" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Settings className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Project Settings</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>
    );
  }

  // Default header when nothing selected
  return (
    <header className="h-14 border-b border-border bg-card px-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold tracking-tight">Orchestra</h1>
        <Separator orientation="vertical" className="h-6" />
        <span className="text-sm text-muted-foreground">
          DAG-Based Agent Orchestration
        </span>
      </div>

      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon">
                <Settings className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </header>
  );
}
