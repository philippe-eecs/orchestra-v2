'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Minimize2,
  Settings2,
  ExternalLink,
  Server,
  Cloud,
  Monitor,
  Cpu,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useOrchestraStore,
  selectCurrentProject,
  selectCurrentProjectNode,
} from '@/lib/store';
import { FullNodeEditor } from './full-node-editor';
import { PromptEditorModal } from './prompt-editor-modal';
import { buildPromptPreview } from '@/lib/execution';
import type { AgentTemplate } from '@/lib/types';
import type {
  ContextRef,
  DeliverableInput,
  Check,
  CheckInput,
  AgentConfig,
  Node,
  Project,
  ExecutionBackend,
  ExecutionConfig,
} from '@/lib/types';
import { AGENT_PRESETS } from '@/lib/types';
import { getBackendCapabilities } from '@/lib/api';
import { cn } from '@/lib/utils';

const executionBackendOptions: Array<{
  value: ExecutionBackend;
  label: string;
  description: string;
  icon: typeof Server;
}> = [
  { value: 'local', label: 'Local', description: 'Direct spawn, fastest', icon: Monitor },
  { value: 'docker', label: 'Docker', description: 'Isolated container', icon: Server },
  { value: 'docker-interactive', label: 'Docker + tmux', description: 'Attachable, interactive', icon: Terminal },
  { value: 'remote', label: 'Remote VM', description: 'SSH + Docker on VM', icon: Cloud },
  { value: 'modal', label: 'Modal', description: 'Serverless, GPU support', icon: Cpu },
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

// ========== Helper Functions ==========

function getPresetIdFromConfig(config: AgentConfig): string {
  if (config.type === 'composed') {
    return `composed-${config.agentId}`;
  }

  for (const preset of AGENT_PRESETS) {
    if (preset.config.type === config.type) {
      if (config.type === 'claude' && preset.config.type === 'claude') {
        if (config.model === preset.config.model) return preset.id;
      } else if (config.type === 'codex' && preset.config.type === 'codex') {
        if (config.reasoningEffort === preset.config.reasoningEffort) return preset.id;
      } else if (config.type === 'gemini' && preset.config.type === 'gemini') {
        if (config.model === preset.config.model) return preset.id;
      }
    }
  }

  const typePresets = AGENT_PRESETS.filter((p) => p.config.type === config.type);
  return typePresets[0]?.id || 'claude-sonnet';
}

function getConfigFromPresetId(presetId: string): AgentConfig {
  if (presetId.startsWith('composed-')) {
    const agentId = presetId.replace('composed-', '');
    return { type: 'composed', agentId };
  }

  const preset = AGENT_PRESETS.find((p) => p.id === presetId);
  if (preset) {
    return { ...preset.config };
  }

  return { type: 'claude', model: 'sonnet' };
}

// ========== Collapsible Section ==========

interface SectionProps {
  title: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, badge, defaultOpen = true, children }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-sm font-medium hover:text-foreground/80 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span>{title}</span>
          {badge !== undefined && (
            <Badge variant="secondary" className="text-xs h-5 px-1.5">
              {badge}
            </Badge>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {isOpen && <div className="space-y-2">{children}</div>}
    </div>
  );
}

// ========== Node Editor Component ==========

interface NodeEditorProps {
  node: Node;
  project: Project;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

function NodeEditor({ node, project, fullscreen, onToggleFullscreen }: NodeEditorProps) {
  const updateNode = useOrchestraStore((state) => state.updateNode);
  const deleteNode = useOrchestraStore((state) => state.deleteNode);
  const addNodeContext = useOrchestraStore((state) => state.addNodeContext);
  const removeNodeContext = useOrchestraStore((state) => state.removeNodeContext);
  const addNodeDeliverable = useOrchestraStore((state) => state.addNodeDeliverable);
  const removeNodeDeliverable = useOrchestraStore((state) => state.removeNodeDeliverable);
  const addNodeCheck = useOrchestraStore((state) => state.addNodeCheck);
  const removeNodeCheck = useOrchestraStore((state) => state.removeNodeCheck);
  const agentLibrary = useOrchestraStore((state) => state.agentLibrary);

  const composedAgents = useMemo(
    () => Object.values(agentLibrary).filter((a): a is AgentTemplate & { kind: 'composed' } => a.kind === 'composed'),
    [agentLibrary]
  );

  // Local state
  const [title, setTitle] = useState(node.title);
  const [description, setDescription] = useState(node.description);
  const [prompt, setPrompt] = useState(node.prompt);
  const [selectedPreset, setSelectedPreset] = useState(() =>
    getPresetIdFromConfig(node.agent)
  );

  // Advanced settings
  const [claudeModel, setClaudeModel] = useState(
    node.agent.type === 'claude' ? node.agent.model || '' : ''
  );
  const [claudeThinkingBudget, setClaudeThinkingBudget] = useState(
    node.agent.type === 'claude' && node.agent.thinkingBudget
      ? String(node.agent.thinkingBudget)
      : ''
  );
  const [codexReasoning, setCodexReasoning] = useState<'low' | 'medium' | 'high' | 'xhigh'>(
    node.agent.type === 'codex' ? node.agent.reasoningEffort || 'xhigh' : 'xhigh'
  );

  const [promptEditorOpen, setPromptEditorOpen] = useState(false);

  // Execution backend state
  const [executionBackend, setExecutionBackend] = useState<ExecutionBackend>(
    node.executionConfig?.backend || project.defaultExecutionConfig?.backend || 'local'
  );
  const [dockerImage, setDockerImage] = useState(
    node.executionConfig?.docker?.image || 'orchestra-agent:full'
  );
  const [remoteHost, setRemoteHost] = useState(
    node.executionConfig?.remote?.host || ''
  );
  const [remoteUser, setRemoteUser] = useState(
    node.executionConfig?.remote?.user || 'root'
  );
  const [modalGpu, setModalGpu] = useState<'T4' | 'A10G' | 'A100' | 'H100' | ''>(
    node.executionConfig?.modal?.gpu || ''
  );

  // Sandbox state
  const [sandboxEnabled, setSandboxEnabled] = useState(
    node.executionConfig?.sandbox?.enabled ?? false
  );
  const [sandboxCreatePR, setSandboxCreatePR] = useState(
    node.executionConfig?.sandbox?.createPR ?? true
  );

  // Form states
  const [newContextType, setNewContextType] = useState<ContextRef['type']>('file');
  const [newContextValue, setNewContextValue] = useState('');
  const [newDeliverableType, setNewDeliverableType] = useState<'file' | 'response' | 'pr' | 'edit'>('file');
  const [newDeliverableValue, setNewDeliverableValue] = useState('');
  const [newCheckType, setNewCheckType] = useState<Check['type']>('file_exists');
  const [newCheckValue, setNewCheckValue] = useState('');
  const [newCheckAutoRetry, setNewCheckAutoRetry] = useState(false);

  // Fullscreen editor state
  const [fullEditorOpen, setFullEditorOpen] = useState(false);

  // Prompt preview state
  const [showPromptPreview, setShowPromptPreview] = useState(false);

  // Get current agent type
  const currentAgentType = useMemo(() => {
    if (selectedPreset.startsWith('composed-')) return 'composed';
    const preset = AGENT_PRESETS.find((p) => p.id === selectedPreset);
    return preset?.config.type || 'claude';
  }, [selectedPreset]);

  // Build agent config
  const buildAgentConfig = useCallback(
    (overridePreset?: string): AgentConfig => {
      const presetId = overridePreset ?? selectedPreset;
      const baseConfig = getConfigFromPresetId(presetId);

      if (baseConfig.type === 'claude') {
        if (claudeModel) baseConfig.model = claudeModel;
        const budget = parseInt(claudeThinkingBudget, 10);
        if (Number.isFinite(budget)) baseConfig.thinkingBudget = budget;
      } else if (baseConfig.type === 'codex') {
        baseConfig.reasoningEffort = codexReasoning;
      }

      return baseConfig;
    },
    [selectedPreset, claudeModel, claudeThinkingBudget, codexReasoning]
  );

  const buildExecutionConfig = useCallback((): ExecutionConfig | undefined => {
    if (executionBackend === 'local' && !node.executionConfig && !sandboxEnabled) {
      return undefined;
    }

    const config: ExecutionConfig = { backend: executionBackend };

    if (['docker', 'docker-interactive', 'remote'].includes(executionBackend)) {
      config.docker = { image: dockerImage || undefined };
    }

    if (executionBackend === 'remote' && remoteHost) {
      config.remote = { host: remoteHost, user: remoteUser || 'root' };
    }

    if (executionBackend === 'modal' && modalGpu) {
      config.modal = { gpu: modalGpu as 'T4' | 'A10G' | 'A100' | 'H100' };
    }

    if (sandboxEnabled) {
      config.sandbox = {
        enabled: true,
        type: 'git-worktree',
        createPR: sandboxCreatePR,
        cleanupOnSuccess: true,
        keepOnFailure: true,
      };
    }

    return config;
  }, [executionBackend, dockerImage, remoteHost, remoteUser, modalGpu, node.executionConfig, sandboxEnabled, sandboxCreatePR]);

  const handleSave = useCallback(() => {
    updateNode(project.id, node.id, {
      title,
      description,
      prompt,
      agent: buildAgentConfig(),
      executionConfig: buildExecutionConfig(),
    });
  }, [project.id, node.id, title, description, prompt, buildAgentConfig, buildExecutionConfig, updateNode]);

  const handleBlur = useCallback(() => {
    handleSave();
  }, [handleSave]);

  const handleDelete = useCallback(() => {
    deleteNode(project.id, node.id);
  }, [project.id, node.id, deleteNode]);

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    updateNode(project.id, node.id, {
      agent: buildAgentConfig(presetId),
    });
  };

  const handleExecutionBackendChange = (v: ExecutionBackend) => {
    setExecutionBackend(v);
    const config: ExecutionConfig = { backend: v };
    if (['docker', 'docker-interactive', 'remote'].includes(v)) {
      config.docker = { image: dockerImage || undefined };
    }
    if (v === 'remote' && remoteHost) {
      config.remote = { host: remoteHost, user: remoteUser || 'root' };
    }
    if (v === 'modal' && modalGpu) {
      config.modal = { gpu: modalGpu as 'T4' | 'A10G' | 'A100' | 'H100' };
    }
    updateNode(project.id, node.id, { executionConfig: config });
  };

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
      case 'contains': {
        const [path, pattern] = newCheckValue.split('|');
        check = { type: 'contains', path, pattern: pattern || '', autoRetry: newCheckAutoRetry };
        break;
      }
      case 'human_approval':
        check = { type: 'human_approval' };
        break;
      default:
        return;
    }

    addNodeCheck(project.id, node.id, check);
    setNewCheckValue('');
    setNewCheckAutoRetry(false);
  }, [project.id, node.id, newCheckType, newCheckValue, newCheckAutoRetry, addNodeCheck]);

  // Prompt preview
  const draftNode = useMemo(() => {
    return {
      ...node,
      title,
      description,
      prompt,
      agent: buildAgentConfig(),
      executionConfig: buildExecutionConfig(),
    };
  }, [node, title, description, prompt, buildAgentConfig, buildExecutionConfig]);

  const promptPreview = useMemo(() => {
    return buildPromptPreview(draftNode, project, {});
  }, [draftNode, project]);

  return (
    <div className="h-full min-h-0 bg-card flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between flex-shrink-0">
        <h2 className="font-semibold text-sm truncate flex-1">{title || 'Node Settings'}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onToggleFullscreen}
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen inspector'}
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setFullEditorOpen(true)}
            title="Open full node editor"
          >
            <Settings2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDelete}>
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-5">
          {/* Title & Description */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleBlur}
                placeholder="Node title"
                className="h-8"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={handleBlur}
                placeholder="Brief description..."
                className="min-h-[50px] resize-none text-sm"
              />
            </div>
          </div>

          <Separator />

          {/* Agent Selection - Grouped Dropdown */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Agent</label>
            <Select value={selectedPreset} onValueChange={handlePresetChange}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select an agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Claude</SelectLabel>
                  {AGENT_PRESETS.filter((p) => p.group === 'Claude').map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex flex-col">
                        <span>{p.label}</span>
                        <span className="text-xs text-muted-foreground">{p.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Codex</SelectLabel>
                  {AGENT_PRESETS.filter((p) => p.group === 'Codex').map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex flex-col">
                        <span>{p.label}</span>
                        <span className="text-xs text-muted-foreground">{p.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Gemini</SelectLabel>
                  {AGENT_PRESETS.filter((p) => p.group === 'Gemini').map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex flex-col">
                        <span>{p.label}</span>
                        <span className="text-xs text-muted-foreground">{p.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
                {composedAgents.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Composed</SelectLabel>
                    {composedAgents.map((agent) => (
                      <SelectItem key={agent.id} value={`composed-${agent.id}`}>
                        <div className="flex flex-col">
                          <span>{agent.name}</span>
                          <span className="text-xs text-muted-foreground">{agent.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Prompt */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Prompt</label>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setPromptEditorOpen(true)}
                title="Edit prompt in large editor"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </div>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onBlur={handleBlur}
              placeholder="Enter the prompt for this node..."
              className="min-h-[180px] resize-y font-mono text-xs"
            />
          </div>

          {/* Prompt Preview */}
          <div>
            <button
              onClick={() => setShowPromptPreview(!showPromptPreview)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Full Prompt Preview</span>
              {showPromptPreview ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {showPromptPreview && (
              <div className="mt-2 p-2 rounded bg-muted/50 space-y-2">
                {promptPreview.sections.context && (
                  <div>
                    <div className="text-[10px] font-medium text-muted-foreground mb-0.5">Context</div>
                    <pre className="text-[10px] font-mono whitespace-pre-wrap bg-background p-1.5 rounded border max-h-24 overflow-auto">
                      {promptPreview.sections.context}
                    </pre>
                  </div>
                )}
                <div>
                  <div className="text-[10px] font-medium text-muted-foreground mb-0.5">Your Prompt</div>
                  <pre className="text-[10px] font-mono whitespace-pre-wrap bg-background p-1.5 rounded border max-h-24 overflow-auto">
                    {promptPreview.sections.prompt || '(empty)'}
                  </pre>
                </div>
                {promptPreview.sections.deliverables && (
                  <div>
                    <div className="text-[10px] font-medium text-muted-foreground mb-0.5">Deliverables</div>
                    <pre className="text-[10px] font-mono whitespace-pre-wrap bg-background p-1.5 rounded border max-h-24 overflow-auto">
                      {promptPreview.sections.deliverables}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Context Section */}
          <Section title="Context" badge={node.context.length}>
            <div className="space-y-1.5">
              {node.context.map((ctx, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-1.5 rounded bg-muted/50"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Badge variant="outline" className="shrink-0 text-[10px] h-5">
                      {ctx.type}
                    </Badge>
                    <span className="text-xs truncate">
                      {ctx.type === 'file' && ctx.path}
                      {ctx.type === 'url' && ctx.url}
                      {ctx.type === 'parent_output' && `Node: ${ctx.nodeId}`}
                      {ctx.type === 'markdown' && ctx.content.slice(0, 20) + '...'}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-5 w-5"
                    onClick={() => removeNodeContext(project.id, node.id, index)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-1.5">
                <Select
                  value={newContextType}
                  onValueChange={(v: ContextRef['type']) => setNewContextType(v)}
                >
                  <SelectTrigger className="h-7 w-24 text-xs">
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
                  placeholder={newContextType === 'file' ? 'path/to/file' : 'value...'}
                  className="h-7 text-xs flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddContext();
                    }
                  }}
                />
                <Button size="sm" className="h-7 px-2" onClick={handleAddContext}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </Section>

          {/* Outputs Section */}
          <Section title="Outputs" badge={node.deliverables.length}>
            <div className="space-y-1.5">
              {node.deliverables.map((del) => (
                <div
                  key={del.id}
                  className="flex items-center justify-between p-1.5 rounded bg-muted/50"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Badge variant="outline" className="shrink-0 text-[10px] h-5">
                      {del.type}
                    </Badge>
                    <span className="text-xs truncate">
                      {del.type === 'file' && del.path}
                      {del.type === 'response' && del.description}
                      {del.type === 'pr' && del.repo}
                      {del.type === 'edit' && del.url}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-5 w-5"
                    onClick={() => removeNodeDeliverable(project.id, node.id, del.id)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-1.5">
                <Select
                  value={newDeliverableType}
                  onValueChange={(v: 'file' | 'response' | 'pr' | 'edit') => setNewDeliverableType(v)}
                >
                  <SelectTrigger className="h-7 w-24 text-xs">
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
                  placeholder={newDeliverableType === 'file' ? 'path/to/output' : 'value...'}
                  className="h-7 text-xs flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddDeliverable();
                    }
                  }}
                />
                <Button size="sm" className="h-7 px-2" onClick={handleAddDeliverable}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </Section>

          {/* Checks Section */}
          <Section title="Checks" badge={node.checks.length}>
            <div className="space-y-1.5">
              {node.checks.map((check) => (
                <div
                  key={check.id}
                  className="flex items-center justify-between p-1.5 rounded bg-muted/50"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Badge variant="outline" className="shrink-0 text-[10px] h-5">
                      {check.type}
                    </Badge>
                    <span className="text-xs truncate">
                      {check.type === 'file_exists' && check.path}
                      {check.type === 'command' && check.cmd}
                      {check.type === 'contains' && `${check.path}|${check.pattern}`}
                      {check.type === 'human_approval' && 'Manual review'}
                    </span>
                    {check.autoRetry && (
                      <Badge variant="secondary" className="shrink-0 text-[10px] h-4">
                        retry
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-5 w-5"
                    onClick={() => removeNodeCheck(project.id, node.id, check.id)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <div className="space-y-1.5">
                <div className="flex gap-1.5">
                  <Select
                    value={newCheckType}
                    onValueChange={(v: Check['type']) => setNewCheckType(v)}
                  >
                    <SelectTrigger className="h-7 text-xs">
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
                </div>
                {newCheckType !== 'human_approval' && (
                  <div className="flex gap-1.5">
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
                      className="h-7 text-xs flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCheck();
                        }
                      }}
                    />
                    <Button size="sm" className="h-7 px-2" onClick={handleAddCheck}>
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
                {newCheckType === 'human_approval' && (
                  <Button size="sm" className="h-7 w-full" onClick={handleAddCheck}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add Human Approval
                  </Button>
                )}
                {newCheckType !== 'human_approval' && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={newCheckAutoRetry}
                      onChange={(e) => setNewCheckAutoRetry(e.target.checked)}
                      className="rounded"
                    />
                    Auto-retry on failure
                  </label>
                )}
              </div>
            </div>
          </Section>

          <Separator />

          {/* Advanced Settings - Collapsed by default */}
          <Section title="Advanced" defaultOpen={false}>
            <div className="space-y-3">
              {/* Agent-specific advanced settings */}
              {currentAgentType === 'claude' && (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">Model Override</label>
                    <Input
                      value={claudeModel}
                      onChange={(e) => setClaudeModel(e.target.value)}
                      onBlur={handleBlur}
                      placeholder="claude-sonnet-4-5-20250929"
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">Thinking Budget</label>
                    <Input
                      type="number"
                      value={claudeThinkingBudget}
                      onChange={(e) => setClaudeThinkingBudget(e.target.value)}
                      onBlur={handleBlur}
                      placeholder="10000"
                      className="h-7 text-xs"
                    />
                  </div>
                </>
              )}

              {currentAgentType === 'codex' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">Reasoning Effort</label>
                  <Select
                    value={codexReasoning}
                    onValueChange={(v: typeof codexReasoning) => {
                      setCodexReasoning(v);
                      handleBlur();
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs">
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
              )}

              <Separator />

              {/* Execution Backend */}
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground">Execution Backend</label>
                <Select
                  value={executionBackend}
                  onValueChange={(v) => handleExecutionBackendChange(v as ExecutionBackend)}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {executionBackendOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          <opt.icon className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{opt.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-1 mt-1">
                  {getBackendCapabilities(executionBackend).isolated && (
                    <Badge variant="outline" className="text-[10px] h-4">Isolated</Badge>
                  )}
                  {getBackendCapabilities(executionBackend).interactive && (
                    <Badge variant="outline" className="text-[10px] h-4">Interactive</Badge>
                  )}
                  {getBackendCapabilities(executionBackend).gpu && (
                    <Badge variant="outline" className="text-[10px] h-4">GPU</Badge>
                  )}
                </div>
              </div>

              {['docker', 'docker-interactive', 'remote'].includes(executionBackend) && (
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">Docker Image</label>
                  <Input
                    value={dockerImage}
                    onChange={(e) => setDockerImage(e.target.value)}
                    onBlur={handleBlur}
                    placeholder="orchestra-agent:full"
                    className="h-7 text-xs"
                  />
                </div>
              )}

              {executionBackend === 'remote' && (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">Remote Host</label>
                    <Input
                      value={remoteHost}
                      onChange={(e) => setRemoteHost(e.target.value)}
                      onBlur={handleBlur}
                      placeholder="your-vm.example.com"
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">SSH User</label>
                    <Input
                      value={remoteUser}
                      onChange={(e) => setRemoteUser(e.target.value)}
                      onBlur={handleBlur}
                      placeholder="root"
                      className="h-7 text-xs"
                    />
                  </div>
                </>
              )}

              {executionBackend === 'modal' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">GPU</label>
                  <Select
                    value={modalGpu}
                    onValueChange={(v) => {
                      setModalGpu(v as typeof modalGpu);
                      handleBlur();
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="No GPU" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No GPU</SelectItem>
                      <SelectItem value="T4">T4</SelectItem>
                      <SelectItem value="A10G">A10G</SelectItem>
                      <SelectItem value="A100">A100</SelectItem>
                      <SelectItem value="H100">H100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Separator />

              {/* Sandbox Mode */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-medium text-muted-foreground">Sandbox Mode</label>
                  <input
                    type="checkbox"
                    checked={sandboxEnabled}
                    onChange={(e) => {
                      setSandboxEnabled(e.target.checked);
                      handleBlur();
                    }}
                    className="rounded"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Agent works on isolated branch, creates PR when done
                </p>

                {sandboxEnabled && (
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-muted-foreground">Auto-create PR</label>
                    <input
                      type="checkbox"
                      checked={sandboxCreatePR}
                      onChange={(e) => {
                        setSandboxCreatePR(e.target.checked);
                        handleBlur();
                      }}
                      className="rounded"
                    />
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* Status indicator */}
          {node.status !== 'pending' && (
            <>
              <Separator />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status:</span>
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
        </div>
      </ScrollArea>

      {/* Fullscreen Editor Modal */}
      <FullNodeEditor
        open={fullEditorOpen}
        onOpenChange={setFullEditorOpen}
        node={node}
        project={project}
      />

      <PromptEditorModal
        open={promptEditorOpen}
        onOpenChange={setPromptEditorOpen}
        title={title}
        initialPrompt={prompt}
        onSave={(nextPrompt) => {
          setPrompt(nextPrompt);
          updateNode(project.id, node.id, { prompt: nextPrompt });
        }}
      />
    </div>
  );
}

// ========== Main Export ==========

interface NodePanelProps {
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

export default function NodePanel({ fullscreen, onToggleFullscreen }: NodePanelProps) {
  const project = useOrchestraStore(selectCurrentProject);
  const node = useOrchestraStore(selectCurrentProjectNode);

  useEffect(() => {
    if (!fullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onToggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [fullscreen, onToggleFullscreen]);

  const content = !node || !project ? (
    <div className="h-full min-h-0 bg-card flex flex-col overflow-hidden">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold text-sm truncate flex-1">Node Settings</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onToggleFullscreen}
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen inspector'}
        >
          {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </Button>
      </div>
      <div className="flex items-center justify-center flex-1 text-muted-foreground p-4">
        <p className="text-sm">Select a node to edit</p>
      </div>
    </div>
  ) : (
    <NodeEditor
      key={node.id}
      node={node}
      project={project}
      fullscreen={fullscreen}
      onToggleFullscreen={onToggleFullscreen}
    />
  );

  return (
    <div
      className={cn(
        'h-full min-h-0',
        fullscreen && 'fixed top-[52px] left-0 right-0 bottom-0 z-50 bg-background p-2 overflow-hidden'
      )}
    >
      <div className="h-full min-h-0 w-full">{content}</div>
    </div>
  );
}
