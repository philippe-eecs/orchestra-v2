import { useMemo, useState } from 'react';
import Canvas from '@/components/canvas/Canvas';
import NodeEditor from '@/components/panels/NodeEditor';
import { useOrchestraStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export default function CanvasView() {
  const projects = useOrchestraStore((s) => s.projects);
  const projectId = useOrchestraStore((s) => s.currentProjectId);
  const openProject = useOrchestraStore((s) => s.openProject);
  const createProject = useOrchestraStore((s) => s.createProject);
  const addNode = useOrchestraStore((s) => s.addNode);

  const [name, setName] = useState('My Project');
  const [desc, setDesc] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectList = useMemo(() => Object.values(projects).sort((a, b) => b.updatedAt - a.updatedAt), [projects]);

  const current = projectId ? projects[projectId] : null;

  return (
    <div className="grid h-full grid-cols-[1fr_360px]">
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center gap-2 border-b border-border bg-card px-3">
          <select
            className="h-9 max-w-[360px] rounded-md border border-input bg-background px-3 text-sm"
            value={projectId ?? ''}
            onChange={(e) => void openProject(e.target.value)}
          >
            {projectList.length === 0 ? <option value="">No projects yet</option> : null}
            {projectList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary">
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create project</DialogTitle>
                <DialogDescription>Creates an empty project with a canvas.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Name</div>
                  <Input value={name} onChange={(e) => setName(e.target.value)} disabled={isCreating} />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Description</div>
                  <Input value={desc} onChange={(e) => setDesc(e.target.value)} disabled={isCreating} />
                </div>
                {error && <div className="text-sm text-destructive">{error}</div>}
                <div className="flex justify-end gap-2">
                  <Button
                    disabled={isCreating}
                    onClick={async () => {
                      setIsCreating(true);
                      setError(null);
                      try {
                        await createProject({ name, description: desc });
                        setDialogOpen(false);
                        setName('My Project');
                        setDesc('');
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Failed to create project');
                      } finally {
                        setIsCreating(false);
                      }
                    }}
                  >
                    {isCreating ? 'Creating…' : 'Create'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" onClick={() => void addNode({ position: { x: 120, y: 120 } })} disabled={!current}>
              Add Node
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {current ? (
            <Canvas />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Create a project to start.
            </div>
          )}
        </div>
      </div>

      <div className="h-full border-l border-border bg-card">
        <NodeEditor />
      </div>
    </div>
  );
}

