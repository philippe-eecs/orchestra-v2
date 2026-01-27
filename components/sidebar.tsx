'use client';

import { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  FolderKanban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useOrchestraStore } from '@/lib/store';

export default function Sidebar() {
  const projects = useOrchestraStore((state) => state.projects);
  const selectedProjectId = useOrchestraStore((state) => state.selectedProjectId);
  const selectProject = useOrchestraStore((state) => state.selectProject);
  const createProject = useOrchestraStore((state) => state.createProject);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['projects'])
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const handleCreate = () => {
    if (newName.trim()) {
      const id = createProject(newName.trim(), newDescription.trim());
      selectProject(id);
      setNewName('');
      setNewDescription('');
      setDialogOpen(false);
    }
  };

  const handleSelectProject = (projectId: string) => {
    selectProject(projectId);
  };

  const projectList = Object.values(projects);

  return (
    <div className="w-[220px] border-r border-border bg-card flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <span className="font-semibold text-sm">Orchestra</span>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Plus className="w-4 h-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <Input
                placeholder="Project name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) handleCreate();
                }}
              />
              <Textarea
                placeholder="Description (optional)"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="min-h-[60px] resize-none"
              />
              <Button onClick={handleCreate} className="w-full">
                Create Project
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* Projects Section */}
          <div>
            <button
              className="flex items-center gap-1 w-full px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => toggleSection('projects')}
            >
              {expandedSections.has('projects') ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <FolderKanban className="w-4 h-4 mr-1" />
              Projects
            </button>

            {expandedSections.has('projects') && (
              <div className="ml-4 mt-1 space-y-0.5">
                {projectList.length === 0 ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    No projects yet
                  </div>
                ) : (
                  projectList.map((project) => (
                    <button
                      key={project.id}
                      className={cn(
                        'flex flex-col items-start w-full px-2 py-1.5 text-sm rounded-md transition-colors text-left',
                        selectedProjectId === project.id
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-muted'
                      )}
                      onClick={() => handleSelectProject(project.id)}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <FolderKanban className="w-4 h-4 shrink-0" />
                        <span className="truncate">{project.name}</span>
                      </div>
                      {project.description && (
                        <span className="text-xs text-muted-foreground ml-6 line-clamp-1">
                          {project.description}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-2 border-t border-border">
        <div className="text-xs text-muted-foreground text-center">
          {projectList.length} project{projectList.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}
