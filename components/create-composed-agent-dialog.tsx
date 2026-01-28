'use client';

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useOrchestraStore, selectCurrentProject } from '@/lib/store';

interface CreateComposedAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const categoryOptions = [
  { value: 'general', label: 'General' },
  { value: 'code', label: 'Code' },
  { value: 'research', label: 'Research' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'content', label: 'Content' },
];

export function CreateComposedAgentDialog({
  open,
  onOpenChange,
}: CreateComposedAgentDialogProps) {
  const project = useOrchestraStore(selectCurrentProject);
  const createComposedAgentFromProject = useOrchestraStore(
    (state) => state.createComposedAgentFromProject
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');

  const handleCreate = useCallback(() => {
    if (!project || !name.trim()) return;

    createComposedAgentFromProject(project.id, name.trim(), {
      description: description.trim() || undefined,
      category,
    });

    // Reset form
    setName('');
    setDescription('');
    setCategory('general');
    onOpenChange(false);
  }, [project, name, description, category, createComposedAgentFromProject, onOpenChange]);

  if (!project) return null;

  // Calculate auto-detected inputs and outputs for preview
  const rootNodes = project.nodes.filter(
    (n) => !project.edges.some((e) => e.targetId === n.id)
  );
  const terminalNodes = project.nodes.filter(
    (n) => !project.edges.some((e) => e.sourceId === n.id)
  );
  const inputCount = rootNodes.reduce(
    (sum, n) => sum + n.context.filter((c) => c.type !== 'parent_output').length,
    0
  );
  const outputCount = terminalNodes.reduce(
    (sum, n) => sum + n.deliverables.length,
    0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save DAG as Composed Agent</DialogTitle>
          <DialogDescription>
            Create a reusable agent from the current project&apos;s DAG structure
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Custom Agent"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do..."
              className="min-h-[80px] resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
            <p className="text-sm font-medium">Auto-detected Configuration</p>
            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
              <div>
                <span className="font-medium">{project.nodes.length}</span> nodes
              </div>
              <div>
                <span className="font-medium">{project.edges.length}</span> edges
              </div>
              <div>
                <span className="font-medium">{inputCount}</span> inputs
              </div>
              <div>
                <span className="font-medium">{outputCount}</span> outputs
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim()}>
            Create Agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
