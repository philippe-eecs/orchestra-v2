'use client';

import { useState, useRef, useCallback } from 'react';
import {
  ChevronDown,
  FolderKanban,
  Plus,
  Upload,
  Download,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useOrchestraStore, selectCurrentProject } from '@/lib/store';
import type { Project } from '@/lib/types';

export default function ProjectSelector() {
  const projects = useOrchestraStore((state) => state.projects);
  const currentProject = useOrchestraStore(selectCurrentProject);
  const selectProject = useOrchestraStore((state) => state.selectProject);
  const createProject = useOrchestraStore((state) => state.createProject);
  const setView = useOrchestraStore((state) => state.setView);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const projectList = Object.values(projects);

  const handleCreate = async () => {
    if (newName.trim()) {
      const id = await createProject(newName.trim(), newDescription.trim());
      selectProject(id);
      setView('canvas');
      setNewName('');
      setNewDescription('');
      setDialogOpen(false);
    }
  };

  const handleSelectProject = (projectId: string) => {
    selectProject(projectId);
    setView('canvas');
  };

  const handleExport = useCallback((project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      project: {
        ...project,
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

  const handleImport = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content);

          if (!data.project || !data.project.name) {
            alert('Invalid project file: missing project data');
            return;
          }

          const importedProject = data.project;
          const newId = await createProject(
            importedProject.name + ' (imported)',
            importedProject.description || ''
          );

          const store = useOrchestraStore.getState();

          if (importedProject.location) {
            store.updateProject(newId, { location: importedProject.location });
          }

          if (importedProject.context) {
            store.setProjectNotes(newId, importedProject.context.notes || '');
            for (const resource of importedProject.context.resources || []) {
              store.addProjectResource(newId, resource);
            }
            for (const [key, value] of Object.entries(
              importedProject.context.variables || {}
            )) {
              store.setProjectVariable(newId, key, value);
            }
          }

          const nodeIdMap: Record<string, string> = {};
          for (const node of importedProject.nodes || []) {
            const newNodeId = store.addNode(newId, {
              title: node.title,
              description: node.description,
              position: node.position,
              agent: node.agent,
              prompt: node.prompt,
              context: [],
              deliverables: node.deliverables,
              checks: node.checks,
              executionConfig: node.executionConfig,
            });
            nodeIdMap[node.id] = newNodeId;
          }

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

          selectProject(newId);
          setView('canvas');
          alert(`Project "${importedProject.name}" imported successfully!`);
        } catch (err) {
          console.error('Import error:', err);
          alert(
            'Failed to import project: ' +
              (err instanceof Error ? err.message : 'Unknown error')
          );
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    },
    [createProject, selectProject, setView]
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImport}
        className="hidden"
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 h-8 px-2">
            <FolderKanban className="w-4 h-4" />
            <span className="max-w-[150px] truncate">
              {currentProject?.name || 'Select Project'}
            </span>
            <ChevronDown className="w-4 h-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[280px]">
          {/* Project list */}
          <div className="max-h-[300px] overflow-y-auto">
            {projectList.length === 0 ? (
              <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                No projects yet
              </div>
            ) : (
              projectList.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  className="flex items-start justify-between gap-2 cursor-pointer"
                  onClick={() => handleSelectProject(project.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <FolderKanban className="w-4 h-4 shrink-0" />
                      <span className="truncate font-medium">
                        {project.name}
                      </span>
                      {currentProject?.id === project.id && (
                        <Check className="w-4 h-4 text-primary shrink-0" />
                      )}
                    </div>
                    {project.description && (
                      <p className="text-xs text-muted-foreground ml-6 truncate">
                        {project.description}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={(e) => handleExport(project, e)}
                  >
                    <Download className="w-3 h-3" />
                  </Button>
                </DropdownMenuItem>
              ))
            )}
          </div>

          <DropdownMenuSeparator />

          {/* Actions */}
          <DropdownMenuItem onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" />
            Import Project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Project Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
    </>
  );
}
