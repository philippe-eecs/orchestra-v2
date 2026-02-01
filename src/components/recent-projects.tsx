'use client';

import { useMemo } from 'react';
import { FolderKanban, ArrowRight, Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useOrchestraStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export default function RecentProjects() {
  const projects = useOrchestraStore((s) => s.projects);
  const selectedProjectId = useOrchestraStore((s) => s.selectedProjectId);
  const selectProject = useOrchestraStore((s) => s.selectProject);
  const setView = useOrchestraStore((s) => s.setView);

  const projectList = useMemo(() => {
    // Sort by updatedAt or createdAt, most recent first
    return Object.values(projects)
      .sort((a, b) => {
        const aTime = a.updatedAt || a.createdAt || 0;
        const bTime = b.updatedAt || b.createdAt || 0;
        return bTime - aTime;
      })
      .slice(0, 5);
  }, [projects]);

  const handleSelectProject = (projectId: string) => {
    selectProject(projectId);
    setView('canvas');
  };

  if (projectList.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FolderKanban className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No projects yet</p>
        <p className="text-sm">Create a new project to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {projectList.map((project) => (
        <button
          key={project.id}
          onClick={() => handleSelectProject(project.id)}
          className={cn(
            'w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left',
            'hover:bg-muted/50',
            selectedProjectId === project.id && 'bg-accent'
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <FolderKanban className="w-5 h-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="font-medium truncate">{project.name}</p>
              {project.description && (
                <p className="text-xs text-muted-foreground truncate">
                  {project.description}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="text-xs">
              <Workflow className="w-3 h-3 mr-1" />
              {project.nodes.length}
            </Badge>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </button>
      ))}
    </div>
  );
}
