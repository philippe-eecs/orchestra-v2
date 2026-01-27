'use client';

import { useCallback, useState } from 'react';
import {
  Trash2,
  Plus,
  X,
  FileText,
  Link,
  GitBranch,
  FileCheck,
  Terminal,
  Eye,
  Search,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useOrchestraStore,
  selectCurrentProject,
  selectCurrentProjectNode,
} from '@/lib/store';
import type { ContextRef, DeliverableInput, Check, CheckInput, AgentType, Node, Project } from '@/lib/types';

const agentOptions = [
  { value: 'claude', label: 'Claude', description: 'Complex reasoning, planning' },
  { value: 'codex', label: 'Codex', description: 'Code generation, refactoring' },
  { value: 'gemini', label: 'Gemini', description: 'Multimodal, web search' },
];

const checkTypeOptions = [
  { value: 'file_exists', label: 'File Exists', icon: FileCheck },
  { value: 'command', label: 'Command', icon: Terminal },
  { value: 'contains', label: 'Contains', icon: Search },
  { value: 'human_approval', label: 'Human Approval', icon: Eye },
];

const deliverableTypeOptions = [
  { value: 'file', label: 'File', icon: FileText },
  { value: 'response', label: 'Response', icon: FileText },
  { value: 'pr', label: 'Pull Request', icon: GitBranch },
  { value: 'edit', label: 'Edit', icon: Link },
];

const contextTypeOptions = [
  { value: 'file', label: 'File', icon: FileText },
  { value: 'url', label: 'URL', icon: Link },
  { value: 'parent_output', label: 'Parent Output', icon: GitBranch },
  { value: 'markdown', label: 'Markdown', icon: FileText },
];

// Inner component that handles the actual editing - key prop forces remount on node change
interface NodeEditorProps {
  node: Node;
  project: Project;
}

function NodeEditor({ node, project }: NodeEditorProps) {
  const updateNode = useOrchestraStore((state) => state.updateNode);
  const deleteNode = useOrchestraStore((state) => state.deleteNode);
  const addNodeContext = useOrchestraStore((state) => state.addNodeContext);
  const removeNodeContext = useOrchestraStore((state) => state.removeNodeContext);
  const addNodeDeliverable = useOrchestraStore((state) => state.addNodeDeliverable);
  const removeNodeDeliverable = useOrchestraStore((state) => state.removeNodeDeliverable);
  const addNodeCheck = useOrchestraStore((state) => state.addNodeCheck);
  const removeNodeCheck = useOrchestraStore((state) => state.removeNodeCheck);

  // Initialize state from node props - component remounts when node.id changes
  const [title, setTitle] = useState(node.title);
  const [description, setDescription] = useState(node.description);
  const [prompt, setPrompt] = useState(node.prompt);
  const [agentType, setAgentType] = useState<AgentType>(node.agent.type);
  const [agentModel, setAgentModel] = useState(node.agent.model || '');

  // Context form state
  const [newContextType, setNewContextType] = useState<ContextRef['type']>('file');
  const [newContextValue, setNewContextValue] = useState('');

  // Deliverable form state
  const [newDeliverableType, setNewDeliverableType] = useState<'file' | 'response' | 'pr' | 'edit'>('file');
  const [newDeliverableValue, setNewDeliverableValue] = useState('');

  // Check form state
  const [newCheckType, setNewCheckType] = useState<Check['type']>('file_exists');
  const [newCheckValue, setNewCheckValue] = useState('');
  const [newCheckAutoRetry, setNewCheckAutoRetry] = useState(false);

  const handleSave = useCallback(() => {
    updateNode(project.id, node.id, {
      title,
      description,
      prompt,
      agent: { type: agentType, model: agentModel || undefined },
    });
  }, [project.id, node.id, title, description, prompt, agentType, agentModel, updateNode]);

  const handleBlur = useCallback(() => {
    handleSave();
  }, [handleSave]);

  const handleDelete = useCallback(() => {
    deleteNode(project.id, node.id);
  }, [project.id, node.id, deleteNode]);

  const handleAddContext = useCallback(() => {
    if (!newContextValue) return;

    let contextRef: ContextRef;
    switch (newContextType) {
      case 'file':
        contextRef = { type: 'file', path: newContextValue };
        break;
      case 'url':
        contextRef = { type: 'url', url: newContextValue };
        break;
      case 'parent_output':
        contextRef = { type: 'parent_output', nodeId: newContextValue };
        break;
      case 'markdown':
        contextRef = { type: 'markdown', content: newContextValue };
        break;
    }

    addNodeContext(project.id, node.id, contextRef);
    setNewContextValue('');
  }, [project.id, node.id, newContextType, newContextValue, addNodeContext]);

  const handleAddDeliverable = useCallback(() => {
    if (!newDeliverableValue) return;

    let deliverable: DeliverableInput;
    switch (newDeliverableType) {
      case 'file':
        deliverable = { type: 'file', path: newDeliverableValue };
        break;
      case 'response':
        deliverable = { type: 'response', description: newDeliverableValue };
        break;
      case 'pr':
        deliverable = { type: 'pr', repo: newDeliverableValue };
        break;
      case 'edit':
        deliverable = { type: 'edit', url: newDeliverableValue };
        break;
    }

    addNodeDeliverable(project.id, node.id, deliverable);
    setNewDeliverableValue('');
  }, [project.id, node.id, newDeliverableType, newDeliverableValue, addNodeDeliverable]);

  const handleAddCheck = useCallback(() => {
    if (newCheckType !== 'human_approval' && !newCheckValue) return;

    let check: CheckInput;
    switch (newCheckType) {
      case 'file_exists':
        check = { type: 'file_exists', path: newCheckValue, autoRetry: newCheckAutoRetry };
        break;
      case 'command':
        check = { type: 'command', cmd: newCheckValue, autoRetry: newCheckAutoRetry };
        break;
      case 'contains':
        const [path, pattern] = newCheckValue.split('|');
        check = { type: 'contains', path, pattern: pattern || '', autoRetry: newCheckAutoRetry };
        break;
      case 'human_approval':
        check = { type: 'human_approval' };
        break;
    }

    addNodeCheck(project.id, node.id, check);
    setNewCheckValue('');
    setNewCheckAutoRetry(false);
  }, [project.id, node.id, newCheckType, newCheckValue, newCheckAutoRetry, addNodeCheck]);

  const handleAgentTypeChange = (v: AgentType) => {
    setAgentType(v);
    // Save immediately on agent type change
    updateNode(project.id, node.id, {
      agent: { type: v, model: agentModel || undefined },
    });
  };

  const handleAgentModelChange = (v: string) => {
    setAgentModel(v);
    // Save immediately on model change
    updateNode(project.id, node.id, {
      agent: { type: agentType, model: v || undefined },
    });
  };

  return (
    <div className="w-[320px] border-l border-border bg-card flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold">Node Settings</h2>
        <Button variant="ghost" size="icon" onClick={handleDelete}>
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="w-full grid grid-cols-4 px-2">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="context">Context</TabsTrigger>
            <TabsTrigger value="output">Output</TabsTrigger>
            <TabsTrigger value="checks">Checks</TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="p-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleBlur}
                placeholder="Node title"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={handleBlur}
                placeholder="Brief description..."
                className="min-h-[60px] resize-none"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <label className="text-sm font-medium">Agent</label>
              <Select
                value={agentType}
                onValueChange={handleAgentTypeChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  {agentOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span>{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {agentType === 'gemini' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Model</label>
                <Select value={agentModel || 'gemini-3-pro'} onValueChange={handleAgentModelChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini-3-pro">Gemini 3 Pro</SelectItem>
                    <SelectItem value="gemini-3-flash">Gemini 3 Flash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <Separator />

            <div className="space-y-2">
              <label className="text-sm font-medium">Prompt</label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onBlur={handleBlur}
                placeholder="Enter the prompt for this node..."
                className="min-h-[150px] resize-none font-mono text-sm"
              />
            </div>

            {node.status !== 'pending' && (
              <>
                <Separator />
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Badge
                    variant={
                      node.status === 'running'
                        ? 'default'
                        : node.status === 'completed'
                        ? 'secondary'
                        : 'destructive'
                    }
                  >
                    {node.status}
                  </Badge>
                </div>
              </>
            )}
          </TabsContent>

          {/* Context Tab */}
          <TabsContent value="context" className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Context files/resources the agent should read
            </p>

            {/* Existing context items */}
            <div className="space-y-2">
              {node.context.map((ctx, index) => (
                <Card key={index} className="p-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Badge variant="outline" className="shrink-0">
                        {ctx.type}
                      </Badge>
                      <span className="text-sm truncate">
                        {ctx.type === 'file' && ctx.path}
                        {ctx.type === 'url' && ctx.url}
                        {ctx.type === 'parent_output' && `Node: ${ctx.nodeId}`}
                        {ctx.type === 'markdown' && ctx.content.slice(0, 30) + '...'}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => removeNodeContext(project.id, node.id, index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            {/* Add new context */}
            <Card className="p-3 space-y-3">
              <CardHeader className="p-0">
                <CardTitle className="text-sm">Add Context</CardTitle>
              </CardHeader>
              <CardContent className="p-0 space-y-2">
                <Select
                  value={newContextType}
                  onValueChange={(v: ContextRef['type']) => setNewContextType(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {contextTypeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={newContextValue}
                  onChange={(e) => setNewContextValue(e.target.value)}
                  placeholder={
                    newContextType === 'file'
                      ? 'path/to/file.ts'
                      : newContextType === 'url'
                      ? 'https://...'
                      : newContextType === 'parent_output'
                      ? 'node-id'
                      : 'Markdown content...'
                  }
                />
                <Button size="sm" onClick={handleAddContext} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Output/Deliverables Tab */}
          <TabsContent value="output" className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              What this node must produce
            </p>

            {/* Existing deliverables */}
            <div className="space-y-2">
              {node.deliverables.map((del) => (
                <Card key={del.id} className="p-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Badge variant="outline" className="shrink-0">
                        {del.type}
                      </Badge>
                      <span className="text-sm truncate">
                        {del.type === 'file' && del.path}
                        {del.type === 'response' && del.description}
                        {del.type === 'pr' && del.repo}
                        {del.type === 'edit' && del.url}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => removeNodeDeliverable(project.id, node.id, del.id)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            {/* Add new deliverable */}
            <Card className="p-3 space-y-3">
              <CardHeader className="p-0">
                <CardTitle className="text-sm">Add Deliverable</CardTitle>
              </CardHeader>
              <CardContent className="p-0 space-y-2">
                <Select
                  value={newDeliverableType}
                  onValueChange={(v: 'file' | 'response' | 'pr' | 'edit') => setNewDeliverableType(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {deliverableTypeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={newDeliverableValue}
                  onChange={(e) => setNewDeliverableValue(e.target.value)}
                  placeholder={
                    newDeliverableType === 'file'
                      ? 'output/report.md'
                      : newDeliverableType === 'response'
                      ? 'Analysis summary'
                      : newDeliverableType === 'pr'
                      ? 'owner/repo'
                      : 'https://docs.google.com/...'
                  }
                />
                <Button size="sm" onClick={handleAddDeliverable} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Checks Tab */}
          <TabsContent value="checks" className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              How to verify node success
            </p>

            {/* Existing checks */}
            <div className="space-y-2">
              {node.checks.map((check) => (
                <Card key={check.id} className="p-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Badge variant="outline" className="shrink-0">
                        {check.type}
                      </Badge>
                      <span className="text-sm truncate">
                        {check.type === 'file_exists' && check.path}
                        {check.type === 'command' && check.cmd}
                        {check.type === 'contains' && `${check.path} contains "${check.pattern}"`}
                        {check.type === 'human_approval' && 'Manual review'}
                      </span>
                      {check.autoRetry && (
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          retry
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => removeNodeCheck(project.id, node.id, check.id)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            {/* Add new check */}
            <Card className="p-3 space-y-3">
              <CardHeader className="p-0">
                <CardTitle className="text-sm">Add Check</CardTitle>
              </CardHeader>
              <CardContent className="p-0 space-y-2">
                <Select
                  value={newCheckType}
                  onValueChange={(v: Check['type']) => setNewCheckType(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {checkTypeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {newCheckType !== 'human_approval' && (
                  <Input
                    value={newCheckValue}
                    onChange={(e) => setNewCheckValue(e.target.value)}
                    placeholder={
                      newCheckType === 'file_exists'
                        ? 'path/to/file'
                        : newCheckType === 'command'
                        ? 'npm test'
                        : 'path|pattern'
                    }
                  />
                )}

                {newCheckType !== 'human_approval' && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newCheckAutoRetry}
                      onChange={(e) => setNewCheckAutoRetry(e.target.checked)}
                      className="rounded"
                    />
                    Auto-retry on failure
                  </label>
                )}

                <Button size="sm" onClick={handleAddCheck} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </ScrollArea>
    </div>
  );
}

// Main export - wraps NodeEditor with key to force remount on node change
export default function NodePanel() {
  const project = useOrchestraStore(selectCurrentProject);
  const node = useOrchestraStore(selectCurrentProjectNode);

  if (!node || !project) {
    return (
      <div className="w-[320px] border-l border-border bg-card p-4">
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p className="text-sm">Select a node to edit</p>
        </div>
      </div>
    );
  }

  // Key forces remount when node changes, resetting all local state
  return <NodeEditor key={node.id} node={node} project={project} />;
}
