'use client';

import { useState, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  FileText,
  Link,
  GitBranch,
  Eye,
  Terminal,
  Search,
  FileCheck,
  Settings2,
  Maximize2,
  Minimize2,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrchestraStore } from '@/lib/store';
import { buildPromptPreview } from '@/lib/execution';
import type {
  Node,
  Project,
  AgentConfig,
  ContextRef,
  DeliverableInput,
  CheckInput,
  Check,
  AgentTemplate,
} from '@/lib/types';
import { AGENT_PRESETS as presets } from '@/lib/types';

// ========== Types ==========

interface FullNodeEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: Node;
  project: Project;
}

// ========== Constants ==========

const contextTypeOptions = [
  { value: 'file', label: 'File', icon: FileText },
  { value: 'url', label: 'URL', icon: Link },
  { value: 'parent_output', label: 'Parent Output', icon: GitBranch },
  { value: 'markdown', label: 'Markdown', icon: FileText },
];

const deliverableTypeOptions = [
  { value: 'file', label: 'File', icon: FileText },
  { value: 'response', label: 'Response', icon: FileText },
  { value: 'pr', label: 'Pull Request', icon: GitBranch },
  { value: 'edit', label: 'Edit', icon: Link },
];

const checkTypeOptions = [
  { value: 'file_exists', label: 'File Exists', icon: FileCheck },
  { value: 'command', label: 'Command', icon: Terminal },
  { value: 'contains', label: 'Contains', icon: Search },
  { value: 'human_approval', label: 'Human Approval', icon: Eye },
];

// ========== Helper Functions ==========

function getPresetIdFromConfig(config: AgentConfig): string {
  if (config.type === 'composed') {
    return `composed-${config.agentId}`;
  }

  // Find matching preset
  for (const preset of presets) {
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

  // Default to first preset of that type
  const typePresets = presets.filter((p) => p.config.type === config.type);
  return typePresets[0]?.id || 'claude-sonnet';
}

function getConfigFromPresetId(presetId: string): AgentConfig {
  // Check for composed agent
  if (presetId.startsWith('composed-')) {
    const agentId = presetId.replace('composed-', '');
    return { type: 'composed', agentId };
  }

  // Find preset
  const preset = presets.find((p) => p.id === presetId);
  if (preset) {
    return { ...preset.config };
  }

  // Default
  return { type: 'claude', model: 'sonnet' };
}

// ========== Collapsible Section Component ==========

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string | number;
}

function CollapsibleSection({ title, defaultOpen = true, children, badge }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{title}</span>
          {badge !== undefined && (
            <Badge variant="secondary" className="text-xs">
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
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

// ========== Main Component ==========

export function FullNodeEditor({ open, onOpenChange, node, project }: FullNodeEditorProps) {
  const updateNode = useOrchestraStore((state) => state.updateNode);
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [isMaximized, setIsMaximized] = useState(true); // Start maximized (true fullscreen)

  // Advanced settings state
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

  // Form states for adding items
  const [newContextType, setNewContextType] = useState<ContextRef['type']>('file');
  const [newContextValue, setNewContextValue] = useState('');
  const [newDeliverableType, setNewDeliverableType] = useState<'file' | 'response' | 'pr' | 'edit'>('file');
  const [newDeliverableValue, setNewDeliverableValue] = useState('');
  const [newCheckType, setNewCheckType] = useState<Check['type']>('file_exists');
  const [newCheckValue, setNewCheckValue] = useState('');
  const [newCheckAutoRetry, setNewCheckAutoRetry] = useState(false);

  // Sync state when modal opens - using ref to track previous open state
  // This is intentional: we sync external props to local state when the modal opens
  const wasOpen = useRef(open);
  useLayoutEffect(() => {
    // Only sync when transitioning from closed to open
    if (open && !wasOpen.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(node.title);
      setDescription(node.description);
      setPrompt(node.prompt);
      setSelectedPreset(getPresetIdFromConfig(node.agent));
      setClaudeModel(node.agent.type === 'claude' ? node.agent.model || '' : '');
      setClaudeThinkingBudget(
        node.agent.type === 'claude' && node.agent.thinkingBudget
          ? String(node.agent.thinkingBudget)
          : ''
      );
      setCodexReasoning(
        node.agent.type === 'codex' ? node.agent.reasoningEffort || 'xhigh' : 'xhigh'
      );
    }
    wasOpen.current = open;
  }, [open, node]);

  // Build agent config from current state
  const buildAgentConfig = useCallback((): AgentConfig => {
    const baseConfig = getConfigFromPresetId(selectedPreset);

    // Apply advanced overrides
    if (baseConfig.type === 'claude') {
      if (claudeModel) baseConfig.model = claudeModel;
      const budget = parseInt(claudeThinkingBudget, 10);
      if (Number.isFinite(budget)) baseConfig.thinkingBudget = budget;
    } else if (baseConfig.type === 'codex') {
      baseConfig.reasoningEffort = codexReasoning;
    }

    return baseConfig;
  }, [selectedPreset, claudeModel, claudeThinkingBudget, codexReasoning]);

  // Save handler
  const handleSave = useCallback(() => {
    updateNode(project.id, node.id, {
      title,
      description,
      prompt,
      agent: buildAgentConfig(),
    });
    onOpenChange(false);
  }, [project.id, node.id, title, description, prompt, buildAgentConfig, updateNode, onOpenChange]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave]
  );

  // Add context handler
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

  // Add deliverable handler
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

  // Add check handler
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

  // Build prompt preview
  const promptPreview = useMemo(() => {
    return buildPromptPreview(node, project, {});
  }, [node, project]);

  // Get current agent type from preset
  const currentAgentType = useMemo(() => {
    if (selectedPreset.startsWith('composed-')) return 'composed';
    const preset = presets.find((p) => p.id === selectedPreset);
    return preset?.config.type || 'claude';
  }, [selectedPreset]);

  // Pop out to new browser window
  const handlePopOut = useCallback(() => {
    // Create URL with node data encoded
    const nodeData = encodeURIComponent(JSON.stringify({
      projectId: project.id,
      nodeId: node.id,
    }));
    const url = `${window.location.origin}/?editor=${nodeData}`;

    // Open in new window with specific dimensions
    const width = Math.min(1600, window.screen.width - 100);
    const height = Math.min(1000, window.screen.height - 100);
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    window.open(
      url,
      `node-editor-${node.id}`,
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    );

    // Close this modal
    onOpenChange(false);
  }, [project.id, node.id, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex flex-col p-0 transition-all duration-200',
          isMaximized
            ? 'max-w-none w-screen h-screen rounded-none'
            : 'max-w-[90vw] w-[90vw] h-[85vh] rounded-lg'
        )}
        onKeyDown={handleKeyDown}
      >
        <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Node title"
                className="text-lg font-semibold border-none bg-transparent px-0 focus-visible:ring-0 w-64"
              />
              <Badge variant="outline">{node.status}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground mr-2">
                <kbd className="px-1 py-0.5 rounded bg-muted border text-xs">⌘S</kbd> save
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handlePopOut}
                title="Open in new window"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsMaximized(!isMaximized)}
                title={isMaximized ? 'Restore window' : 'Maximize window'}
              >
                {isMaximized ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex min-h-0">
          {/* Left Column - Main editing */}
          <div className="flex-1 flex flex-col border-r min-w-0">
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                {/* Description */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of what this node does..."
                    className="min-h-[60px] resize-none"
                  />
                </div>

                {/* Agent Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Agent</label>
                  <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an agent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Claude</SelectLabel>
                        {presets
                          .filter((p) => p.group === 'Claude')
                          .map((p) => (
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
                        {presets
                          .filter((p) => p.group === 'Codex')
                          .map((p) => (
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
                        {presets
                          .filter((p) => p.group === 'Gemini')
                          .map((p) => (
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
                          <SelectLabel>Composed Agents</SelectLabel>
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

                {/* Advanced Settings */}
                <div>
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Settings2 className="w-4 h-4" />
                    <span>Advanced Settings</span>
                    {showAdvanced ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {showAdvanced && (
                    <div className="mt-3 p-4 rounded-lg bg-muted/50 space-y-4">
                      {currentAgentType === 'claude' && (
                        <>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Model Override</label>
                            <Input
                              value={claudeModel}
                              onChange={(e) => setClaudeModel(e.target.value)}
                              placeholder="e.g., claude-sonnet-4-5-20250929"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Thinking Budget</label>
                            <Input
                              type="number"
                              value={claudeThinkingBudget}
                              onChange={(e) => setClaudeThinkingBudget(e.target.value)}
                              placeholder="e.g., 10000"
                            />
                          </div>
                        </>
                      )}
                      {currentAgentType === 'codex' && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Reasoning Effort</label>
                          <Select value={codexReasoning} onValueChange={(v: typeof codexReasoning) => setCodexReasoning(v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="xhigh">XHigh (Maximum)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Prompt */}
                <div className="space-y-2 flex-1 flex flex-col">
                  <label className="text-sm font-medium">Prompt</label>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter the instructions for this agent..."
                    className={cn(
                      'resize-none font-mono text-sm flex-1',
                      isMaximized ? 'min-h-[400px]' : 'min-h-[250px]'
                    )}
                  />
                </div>

                {/* Prompt Preview */}
                <div>
                  <button
                    onClick={() => setShowPromptPreview(!showPromptPreview)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Full Prompt Preview</span>
                    <Badge variant="secondary" className="text-xs">
                      {promptPreview.compiled.length} chars
                    </Badge>
                    {showPromptPreview ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {showPromptPreview && (
                    <div className="mt-3 p-4 rounded-lg bg-muted/50 space-y-3">
                      {promptPreview.sections.context && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">Context</div>
                          <pre className="text-xs font-mono whitespace-pre-wrap bg-background p-2 rounded border">
                            {promptPreview.sections.context}
                          </pre>
                        </div>
                      )}
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">Your Prompt</div>
                        <pre className="text-xs font-mono whitespace-pre-wrap bg-background p-2 rounded border">
                          {promptPreview.sections.prompt || '(empty)'}
                        </pre>
                      </div>
                      {promptPreview.sections.deliverables && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">Deliverables</div>
                          <pre className="text-xs font-mono whitespace-pre-wrap bg-background p-2 rounded border">
                            {promptPreview.sections.deliverables}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Right Column - Context, Output, Checks */}
          <div className={cn(
            'flex flex-col min-h-0 transition-all',
            isMaximized ? 'w-[500px]' : 'w-[380px]'
          )}>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {/* Context Section */}
                <CollapsibleSection title="Context" badge={node.context.length}>
                  <div className="space-y-2">
                    {node.context.map((ctx, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 rounded bg-muted/50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className="shrink-0 text-xs">
                            {ctx.type}
                          </Badge>
                          <span className="text-sm truncate">
                            {ctx.type === 'file' && ctx.path}
                            {ctx.type === 'url' && ctx.url}
                            {ctx.type === 'parent_output' && `Node: ${ctx.nodeId}`}
                            {ctx.type === 'markdown' && ctx.content.slice(0, 20) + '...'}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-6 w-6"
                          onClick={() => removeNodeContext(project.id, node.id, index)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}

                    <div className="space-y-2 pt-2">
                      <Select
                        value={newContextType}
                        onValueChange={(v: ContextRef['type']) => setNewContextType(v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
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
                      <div className="flex gap-2">
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
                              : 'Markdown...'
                          }
                          className="h-8 text-xs"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddContext();
                            }
                          }}
                        />
                        <Button size="sm" className="h-8 px-2" onClick={handleAddContext}>
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CollapsibleSection>

                {/* Deliverables Section */}
                <CollapsibleSection title="Outputs" badge={node.deliverables.length}>
                  <div className="space-y-2">
                    {node.deliverables.map((del) => (
                      <div
                        key={del.id}
                        className="flex items-center justify-between p-2 rounded bg-muted/50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className="shrink-0 text-xs">
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
                          className="shrink-0 h-6 w-6"
                          onClick={() => removeNodeDeliverable(project.id, node.id, del.id)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}

                    <div className="space-y-2 pt-2">
                      <Select
                        value={newDeliverableType}
                        onValueChange={(v: 'file' | 'response' | 'pr' | 'edit') => setNewDeliverableType(v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
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
                      <div className="flex gap-2">
                        <Input
                          value={newDeliverableValue}
                          onChange={(e) => setNewDeliverableValue(e.target.value)}
                          placeholder={
                            newDeliverableType === 'file'
                              ? 'output/file.md'
                              : newDeliverableType === 'response'
                              ? 'Description'
                              : newDeliverableType === 'pr'
                              ? 'owner/repo'
                              : 'https://...'
                          }
                          className="h-8 text-xs"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddDeliverable();
                            }
                          }}
                        />
                        <Button size="sm" className="h-8 px-2" onClick={handleAddDeliverable}>
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CollapsibleSection>

                {/* Checks Section */}
                <CollapsibleSection title="Checks" badge={node.checks.length}>
                  <div className="space-y-2">
                    {node.checks.map((check) => (
                      <div
                        key={check.id}
                        className="flex items-center justify-between p-2 rounded bg-muted/50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className="shrink-0 text-xs">
                            {check.type}
                          </Badge>
                          <span className="text-sm truncate">
                            {check.type === 'file_exists' && check.path}
                            {check.type === 'command' && check.cmd}
                            {check.type === 'contains' && `${check.path}|${check.pattern}`}
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
                          className="shrink-0 h-6 w-6"
                          onClick={() => removeNodeCheck(project.id, node.id, check.id)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}

                    <div className="space-y-2 pt-2">
                      <Select
                        value={newCheckType}
                        onValueChange={(v: Check['type']) => setNewCheckType(v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
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
                        <>
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
                            className="h-8 text-xs"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCheck();
                              }
                            }}
                          />
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={newCheckAutoRetry}
                              onChange={(e) => setNewCheckAutoRetry(e.target.checked)}
                              className="rounded"
                            />
                            Auto-retry on failure
                          </label>
                        </>
                      )}
                      <Button size="sm" className="w-full h-8" onClick={handleAddCheck}>
                        <Plus className="w-4 h-4 mr-1" />
                        Add Check
                      </Button>
                    </div>
                  </div>
                </CollapsibleSection>
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
