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
  Maximize2,
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
import { PromptEditorModal } from './prompt-editor-modal';
import type { AgentTemplate } from '@/lib/types';
import type {
  ContextRef,
  DeliverableInput,
  Check,
  CheckInput,
  AgentType,
  AgentConfig,
  Node,
  Project,
} from '@/lib/types';

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
  { value: 'llm_critic', label: 'LLM Critic', icon: Eye },
  { value: 'test_runner', label: 'Test Runner', icon: Terminal },
  { value: 'eval_baseline', label: 'Performance Baseline', icon: FileCheck },
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
  const agentLibrary = useOrchestraStore((state) => state.agentLibrary);

  // Separate primitive and composed agents from library
  const composedAgents = Object.values(agentLibrary).filter(
    (a): a is AgentTemplate & { kind: 'composed' } => a.kind === 'composed'
  );

  // Initialize state from node props - component remounts when node.id changes
  const [title, setTitle] = useState(node.title);
  const [description, setDescription] = useState(node.description);
  const [prompt, setPrompt] = useState(node.prompt);
  const [agentType, setAgentType] = useState<AgentType>(node.agent.type);
  const [composedAgentId, setComposedAgentId] = useState(
    node.agent.type === 'composed' ? node.agent.agentId : ''
  );
  const [claudeModel, setClaudeModel] = useState(
    node.agent.type === 'claude' ? node.agent.model || '' : ''
  );
  const [claudeThinkingBudget, setClaudeThinkingBudget] = useState(
    node.agent.type === 'claude' && node.agent.thinkingBudget
      ? String(node.agent.thinkingBudget)
      : ''
  );
  const [codexModel, setCodexModel] = useState(
    node.agent.type === 'codex' ? node.agent.model || 'gpt-5.2-codex' : 'gpt-5.2-codex'
  );
  const [codexReasoning, setCodexReasoning] = useState<
    'low' | 'medium' | 'high' | 'xhigh'
  >(node.agent.type === 'codex' ? node.agent.reasoningEffort || 'xhigh' : 'xhigh');
  const [geminiModel, setGeminiModel] = useState(
    node.agent.type === 'gemini' ? node.agent.model || 'gemini-3-pro' : 'gemini-3-pro'
  );

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

  // LLM Critic check fields
  const [newCriticAgent, setNewCriticAgent] = useState<AgentType>('claude');
  const [newCriticCriteria, setNewCriticCriteria] = useState('');
  const [newCriticThreshold, setNewCriticThreshold] = useState('70');
  const [newCriticAddToContext, setNewCriticAddToContext] = useState(false);

  // Test Runner check fields
  const [newTestFramework, setNewTestFramework] = useState<'npm' | 'pytest' | 'jest' | 'cargo' | 'go' | 'custom'>('npm');
  const [newTestCommand, setNewTestCommand] = useState('');
  const [newTestPattern, setNewTestPattern] = useState('');

  // Eval Baseline check fields
  const [newEvalMetric, setNewEvalMetric] = useState<'duration' | 'memory' | 'accuracy' | 'custom'>('duration');
  const [newEvalBaseline, setNewEvalBaseline] = useState('');
  const [newEvalTolerance, setNewEvalTolerance] = useState('10');
  const [newEvalCommand, setNewEvalCommand] = useState('');
  const [newEvalEvaluator, setNewEvalEvaluator] = useState('');

  // Fullscreen prompt editor state
  const [promptModalOpen, setPromptModalOpen] = useState(false);

  const buildAgentConfig = useCallback(
    (overrideType?: AgentType, overrideComposedId?: string): AgentConfig => {
      const type = overrideType ?? agentType;
      switch (type) {
        case 'claude': {
          const budget = parseInt(claudeThinkingBudget, 10);
          return {
            type: 'claude',
            model: claudeModel || undefined,
            thinkingBudget: Number.isFinite(budget) ? budget : undefined,
          };
        }
        case 'codex': {
          return {
            type: 'codex',
            model: codexModel || undefined,
            reasoningEffort: codexReasoning,
          };
        }
        case 'gemini': {
          return { type: 'gemini', model: geminiModel || undefined };
        }
        case 'composed': {
          return {
            type: 'composed',
            agentId: overrideComposedId ?? composedAgentId,
          };
        }
      }
    },
    [agentType, claudeModel, claudeThinkingBudget, codexModel, codexReasoning, geminiModel, composedAgentId]
  );

  const handleSave = useCallback(() => {
    updateNode(project.id, node.id, {
      title,
      description,
      prompt,
      agent: buildAgentConfig(),
    });
  }, [project.id, node.id, title, description, prompt, buildAgentConfig, updateNode]);

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
    // Validation based on check type
    const needsValue = ['file_exists', 'command', 'contains'].includes(newCheckType);
    const needsCriteria = newCheckType === 'llm_critic';
    const needsBaseline = newCheckType === 'eval_baseline';
    const needsCommand = newCheckType === 'test_runner' && newTestFramework === 'custom';

    if (needsValue && !newCheckValue) return;
    if (needsCriteria && !newCriticCriteria) return;
    if (needsBaseline && !newEvalBaseline) return;
    if (needsCommand && !newTestCommand) return;

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
      case 'llm_critic':
        check = {
          type: 'llm_critic',
          criticAgent: newCriticAgent,
          criteria: newCriticCriteria,
          threshold: parseInt(newCriticThreshold, 10) || 70,
          addToContext: newCriticAddToContext,
          autoRetry: newCheckAutoRetry,
        };
        break;
      case 'test_runner':
        check = {
          type: 'test_runner',
          framework: newTestFramework,
          command: newTestFramework === 'custom' ? newTestCommand : undefined,
          testPattern: newTestPattern || undefined,
          autoRetry: newCheckAutoRetry,
        };
        break;
      case 'eval_baseline':
        check = {
          type: 'eval_baseline',
          metric: newEvalMetric,
          baseline: parseFloat(newEvalBaseline) || 0,
          tolerance: parseFloat(newEvalTolerance) || 10,
          command: ['duration', 'memory'].includes(newEvalMetric) ? newEvalCommand : undefined,
          evaluator: ['accuracy', 'custom'].includes(newEvalMetric) ? newEvalEvaluator : undefined,
          autoRetry: newCheckAutoRetry,
        };
        break;
    }

    addNodeCheck(project.id, node.id, check);

    // Reset form state
    setNewCheckValue('');
    setNewCheckAutoRetry(false);
    setNewCriticCriteria('');
    setNewCriticThreshold('70');
    setNewCriticAddToContext(false);
    setNewTestCommand('');
    setNewTestPattern('');
    setNewEvalBaseline('');
    setNewEvalTolerance('10');
    setNewEvalCommand('');
    setNewEvalEvaluator('');
  }, [
    project.id, node.id, newCheckType, newCheckValue, newCheckAutoRetry, addNodeCheck,
    newCriticAgent, newCriticCriteria, newCriticThreshold, newCriticAddToContext,
    newTestFramework, newTestCommand, newTestPattern,
    newEvalMetric, newEvalBaseline, newEvalTolerance, newEvalCommand, newEvalEvaluator,
  ]);

  const handleAgentTypeChange = (v: AgentType) => {
    setAgentType(v);
    // Save immediately on agent type change
    updateNode(project.id, node.id, {
      agent: buildAgentConfig(v),
    });
  };

  const handleComposedAgentChange = (agentId: string) => {
    setComposedAgentId(agentId);
    updateNode(project.id, node.id, {
      agent: { type: 'composed', agentId },
    });
  };

  const handleCodexReasoningChange = (v: 'low' | 'medium' | 'high' | 'xhigh') => {
    setCodexReasoning(v);
    updateNode(project.id, node.id, {
      agent: { type: 'codex', model: codexModel || undefined, reasoningEffort: v },
    });
  };

  const handleGeminiModelChange = (v: string) => {
    setGeminiModel(v);
    updateNode(project.id, node.id, {
      agent: { type: 'gemini', model: v || undefined },
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
                  {composedAgents.length > 0 && (
                    <SelectItem value="composed">
                      <div className="flex flex-col">
                        <span>Composed Agent</span>
                        <span className="text-xs text-muted-foreground">Custom multi-agent workflow</span>
                      </div>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {agentType === 'composed' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Composed Agent</label>
                <Select
                  value={composedAgentId}
                  onValueChange={handleComposedAgentChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {composedAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <div className="flex flex-col">
                          <span>{agent.name}</span>
                          <span className="text-xs text-muted-foreground">{agent.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {agentType === 'gemini' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Model</label>
                <Select
                  value={geminiModel || 'gemini-3-pro-preview'}
                  onValueChange={handleGeminiModelChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini-3-pro-preview">Gemini 3 Pro (Preview)</SelectItem>
                    <SelectItem value="gemini-3-pro">Gemini 3 Pro</SelectItem>
                    <SelectItem value="gemini-3-flash">Gemini 3 Flash</SelectItem>
                    <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                    <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                    <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro</SelectItem>
                    <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {agentType === 'claude' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Model (optional)</label>
                  <Input
                    value={claudeModel}
                    onChange={(e) => setClaudeModel(e.target.value)}
                    onBlur={handleBlur}
                    placeholder="sonnet / opus / claude-sonnet-4-5-20250929"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Thinking Budget (soft)</label>
                  <Input
                    type="number"
                    value={claudeThinkingBudget}
                    onChange={(e) => setClaudeThinkingBudget(e.target.value)}
                    onBlur={handleBlur}
                    placeholder="10000"
                  />
                </div>
              </>
            )}

            {agentType === 'codex' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Model</label>
                  <Input
                    value={codexModel}
                    onChange={(e) => setCodexModel(e.target.value)}
                    onBlur={handleBlur}
                    placeholder="gpt-5.2-codex"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reasoning Effort</label>
                  <Select value={codexReasoning} onValueChange={handleCodexReasoningChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="xhigh">XHigh</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Prompt</label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setPromptModalOpen(true)}
                  title="Edit in fullscreen"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </Button>
              </div>
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
                        {check.type === 'llm_critic' && `Critic: ${check.criteria.slice(0, 30)}...`}
                        {check.type === 'test_runner' && `${check.framework} tests`}
                        {check.type === 'eval_baseline' && `${check.metric} ≤${check.baseline}±${check.tolerance}%`}
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

                {/* Basic check types */}
                {['file_exists', 'command', 'contains'].includes(newCheckType) && (
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

                {/* LLM Critic fields */}
                {newCheckType === 'llm_critic' && (
                  <>
                    <Select
                      value={newCriticAgent}
                      onValueChange={(v: AgentType) => setNewCriticAgent(v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Critic Agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {agentOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      value={newCriticCriteria}
                      onChange={(e) => setNewCriticCriteria(e.target.value)}
                      placeholder="Evaluation criteria..."
                      className="min-h-[80px] text-sm"
                    />
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={newCriticThreshold}
                        onChange={(e) => setNewCriticThreshold(e.target.value)}
                        placeholder="Threshold"
                        className="w-24"
                      />
                      <span className="text-xs text-muted-foreground self-center">/ 100</span>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={newCriticAddToContext}
                        onChange={(e) => setNewCriticAddToContext(e.target.checked)}
                        className="rounded"
                      />
                      Add critique to context on retry
                    </label>
                  </>
                )}

                {/* Test Runner fields */}
                {newCheckType === 'test_runner' && (
                  <>
                    <Select
                      value={newTestFramework}
                      onValueChange={(v: 'npm' | 'pytest' | 'jest' | 'cargo' | 'go' | 'custom') => setNewTestFramework(v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Test Framework" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="npm">npm test</SelectItem>
                        <SelectItem value="jest">Jest</SelectItem>
                        <SelectItem value="pytest">pytest</SelectItem>
                        <SelectItem value="cargo">Cargo (Rust)</SelectItem>
                        <SelectItem value="go">Go test</SelectItem>
                        <SelectItem value="custom">Custom command</SelectItem>
                      </SelectContent>
                    </Select>
                    {newTestFramework === 'custom' && (
                      <Input
                        value={newTestCommand}
                        onChange={(e) => setNewTestCommand(e.target.value)}
                        placeholder="Custom test command..."
                      />
                    )}
                    <Input
                      value={newTestPattern}
                      onChange={(e) => setNewTestPattern(e.target.value)}
                      placeholder="Test pattern (optional)"
                    />
                  </>
                )}

                {/* Eval Baseline fields */}
                {newCheckType === 'eval_baseline' && (
                  <>
                    <Select
                      value={newEvalMetric}
                      onValueChange={(v: 'duration' | 'memory' | 'accuracy' | 'custom') => setNewEvalMetric(v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Metric" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="duration">Duration (ms)</SelectItem>
                        <SelectItem value="memory">Memory (MB)</SelectItem>
                        <SelectItem value="accuracy">Accuracy</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={newEvalBaseline}
                        onChange={(e) => setNewEvalBaseline(e.target.value)}
                        placeholder="Baseline"
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        value={newEvalTolerance}
                        onChange={(e) => setNewEvalTolerance(e.target.value)}
                        placeholder="±%"
                        className="w-20"
                      />
                    </div>
                    {['duration', 'memory'].includes(newEvalMetric) && (
                      <Input
                        value={newEvalCommand}
                        onChange={(e) => setNewEvalCommand(e.target.value)}
                        placeholder="Command to measure..."
                      />
                    )}
                    {['accuracy', 'custom'].includes(newEvalMetric) && (
                      <Input
                        value={newEvalEvaluator}
                        onChange={(e) => setNewEvalEvaluator(e.target.value)}
                        placeholder="Evaluator script (returns number)..."
                      />
                    )}
                  </>
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

      <PromptEditorModal
        open={promptModalOpen}
        onOpenChange={setPromptModalOpen}
        title={title}
        initialPrompt={prompt}
        onSave={(newPrompt) => {
          setPrompt(newPrompt);
          updateNode(project.id, node.id, { prompt: newPrompt });
        }}
      />
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
