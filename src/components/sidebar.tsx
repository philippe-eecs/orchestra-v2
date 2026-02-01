'use client';

import { useState, useRef, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  FolderKanban,
  Download,
  Upload,
  Trash2,
  MoreHorizontal,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useOrchestraStore } from '@/lib/store';
import type { Project } from '@/lib/types';

export default function Sidebar() {
  const projects = useOrchestraStore((state) => state.projects);
  const selectedProjectId = useOrchestraStore((state) => state.selectedProjectId);
  const selectProject = useOrchestraStore((state) => state.selectProject);
  const createProject = useOrchestraStore((state) => state.createProject);
  const deleteProject = useOrchestraStore((state) => state.deleteProject);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['projects'])
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  // File input ref for import
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleCreate = async () => {
    if (newName.trim()) {
      const id = await createProject(newName.trim(), newDescription.trim());
      selectProject(id);
      setNewName('');
      setNewDescription('');
      setDialogOpen(false);
    }
  };

  const handleSelectProject = (projectId: string) => {
    selectProject(projectId);
  };

  // Export project as JSON file
  const handleExport = useCallback((project: Project) => {
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      project: {
        ...project,
        // Reset runtime state for clean export
        nodes: project.nodes.map((node) => ({
          ...node,
          status: 'pending',
          sessionId: null,
        })),
      },
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-orchestra.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Import project from JSON file
  const handleImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        // Validate import data
        if (!data.project || !data.project.name) {
          alert('Invalid project file: missing project data');
          return;
        }

        const importedProject = data.project;

        // Create new project with imported data
        const newId = await createProject(
          importedProject.name + ' (imported)',
          importedProject.description || ''
        );

        // Get the store to update the project with full data
        const store = useOrchestraStore.getState();

        // Update with location if present
        if (importedProject.location) {
          store.updateProject(newId, { location: importedProject.location });
        }

        // Update context
        if (importedProject.context) {
          store.setProjectNotes(newId, importedProject.context.notes || '');
          for (const resource of importedProject.context.resources || []) {
            store.addProjectResource(newId, resource);
          }
          for (const [key, value] of Object.entries(importedProject.context.variables || {})) {
            store.setProjectVariable(newId, key, value);
          }
        }

        // Add nodes
        const nodeIdMap: Record<string, string> = {};
        for (const node of importedProject.nodes || []) {
          const newNodeId = store.addNode(newId, {
            title: node.title,
            description: node.description,
            position: node.position,
            agent: node.agent,
            prompt: node.prompt,
            context: [], // Add context separately after mapping node IDs
            deliverables: node.deliverables,
            checks: node.checks,
            executionConfig: node.executionConfig,
          });
          nodeIdMap[node.id] = newNodeId;
        }

        // Add context refs (with updated node IDs for parent_output)
        for (const node of importedProject.nodes || []) {
          const newNodeId = nodeIdMap[node.id];
          for (const ctx of node.context || []) {
            if (ctx.type === 'parent_output') {
              const mappedNodeId = nodeIdMap[ctx.nodeId];
              if (mappedNodeId) {
                store.addNodeContext(newId, newNodeId, {
                  type: 'parent_output',
                  nodeId: mappedNodeId,
                });
              }
            } else {
              store.addNodeContext(newId, newNodeId, ctx);
            }
          }
        }

        // Add edges (with updated node IDs)
        for (const edge of importedProject.edges || []) {
          const sourceId = nodeIdMap[edge.sourceId];
          const targetId = nodeIdMap[edge.targetId];
          if (sourceId && targetId) {
            store.addEdge(newId, {
              sourceId,
              targetId,
              sourceDeliverable: edge.sourceDeliverable,
            });
          }
        }

        // Select the imported project
        selectProject(newId);

        alert(`Project "${importedProject.name}" imported successfully!`);
      } catch (err) {
        console.error('Import error:', err);
        alert('Failed to import project: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
    };
    reader.readAsText(file);

    // Reset file input so same file can be imported again
    event.target.value = '';
  }, [createProject, selectProject]);

  const handleDelete = useCallback((projectId: string, projectName: string) => {
    if (confirm(`Delete project "${projectName}"? This cannot be undone.`)) {
      deleteProject(projectId);
    }
  }, [deleteProject]);

  const projectList = Object.values(projects);

  return (
    <div className="w-[220px] border-r border-border bg-card flex flex-col">
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImport}
        className="hidden"
      />

      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <span className="font-semibold text-sm">Orchestra</span>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import project from file</TooltipContent>
          </Tooltip>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <Plus className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent>Create new project</TooltipContent>
            </Tooltip>
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
                    <div
                      key={project.id}
                      className={cn(
                        'group flex items-center justify-between w-full rounded-md transition-colors',
                        selectedProjectId === project.id
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-muted'
                      )}
                    >
                      <button
                        className="flex flex-col items-start flex-1 px-2 py-1.5 text-sm text-left min-w-0"
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

                      {/* Project actions dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 mr-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleExport(project)}>
                            <Download className="w-4 h-4 mr-2" />
                            Export to file
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(project.id, project.name)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete project
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
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
