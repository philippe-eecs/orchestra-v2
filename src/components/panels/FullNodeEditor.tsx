import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOrchestraStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Collapsible } from '@/components/ui/collapsible';
import type { AgentType, Check, ContextRef, Deliverable, LaunchMode } from '@/lib/types';

const AGENTS: AgentType[] = ['claude', 'codex', 'gemini'];

const MODEL_OPTIONS: Record<AgentType, { value: string; label: string }[]> = {
  claude: [
    { value: 'sonnet', label: 'Sonnet (Default)' },
    { value: 'opus', label: 'Opus' },
    { value: 'haiku', label: 'Haiku' },
  ],
  codex: [
    { value: 'codex-1', label: 'Codex 1' },
  ],
  gemini: [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Default)' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
};

const CHECK_TYPES = ['file_exists', 'command', 'contains', 'human_approval', 'test_runner'] as const;
const TEST_FRAMEWORKS = ['npm', 'pytest', 'jest', 'cargo'] as const;

interface FullNodeEditorProps {
  nodeId: string;
  open: boolean;
  onClose: () => void;
}

function randomId() {
  return crypto.randomUUID();
}

function createDefaultCheck(type: Check['type']): Check {
  switch (type) {
    case 'file_exists':
      return { id: randomId(), type: 'file_exists', path: '' };
    case 'command':
      return { id: randomId(), type: 'command', cmd: '' };
    case 'contains':
      return { id: randomId(), type: 'contains', path: '', pattern: '' };
    case 'human_approval':
      return { id: randomId(), type: 'human_approval' };
    case 'test_runner':
      return { id: randomId(), type: 'test_runner', framework: 'npm' };
  }
}

function parseExtraArgs(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function formatExtraArgs(args: string[]): string {
  return args.join('\n');
}

function removeFlag(args: string[], flag: string): string[] {
  return args.filter((a) => a !== flag);
}

function removeFlagWithValue(args: string[], flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === flag) {
      // Skip the flag and its value if present
      i += 1;
      continue;
    }
    out.push(a);
  }
  return out;
}

function upsertFlagWithValue(args: string[], flag: string, value: string | null): string[] {
  let out = removeFlagWithValue(args, flag);
  if (value && value.trim()) out = [...out, flag, value.trim()];
  return out;
}

export default function FullNodeEditor({ nodeId, open, onClose }: FullNodeEditorProps) {
  const projectId = useOrchestraStore((s) => s.currentProjectId);
  const updateNode = useOrchestraStore((s) => s.updateNode);
  const runNode = useOrchestraStore((s) => s.runNode);

  const node = useOrchestraStore((s) => {
    if (!projectId) return null;
    return s.projects[projectId]?.nodes.find((n) => n.id === nodeId) ?? null;
  });

  // Local state for editing
  const [title, setTitle] = useState('');
  const [agentType, setAgentType] = useState<AgentType>('claude');
  const [model, setModel] = useState<string>('');
  const [extraArgsText, setExtraArgsText] = useState<string>('');
  const [launchMode, setLaunchMode] = useState<LaunchMode>('interactive');
  const [prompt, setPrompt] = useState('');
  const [context, setContext] = useState<ContextRef[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);

  // Initialize from node
  useEffect(() => {
    if (node) {
      setTitle(node.title);
      setAgentType(node.agent.type);
      setModel(node.agent.model ?? '');
      setExtraArgsText((node.agent.extraArgs ?? []).join('\n'));
      setLaunchMode(node.launchMode ?? 'interactive');
      setPrompt(node.prompt);
      setContext(node.context ?? []);
      setDeliverables(node.deliverables ?? []);
      setChecks(node.checks ?? []);
    }
  }, [node, open]);

  // Track dirty state
  const isDirty = useMemo(() => {
    if (!node) return false;
    return (
      title !== node.title ||
      agentType !== node.agent.type ||
      model !== (node.agent.model ?? '') ||
      extraArgsText !== (node.agent.extraArgs ?? []).join('\n') ||
      launchMode !== (node.launchMode ?? 'interactive') ||
      prompt !== node.prompt ||
      JSON.stringify(context) !== JSON.stringify(node.context ?? []) ||
      JSON.stringify(deliverables) !== JSON.stringify(node.deliverables ?? []) ||
      JSON.stringify(checks) !== JSON.stringify(node.checks ?? [])
    );
  }, [node, title, agentType, model, extraArgsText, launchMode, prompt, context, deliverables, checks]);

  const setExtraArgs = useCallback((updater: (args: string[]) => string[]) => {
    setExtraArgsText((prev) => formatExtraArgs(updater(parseExtraArgs(prev))));
  }, []);

  const claudePermissionMode = useMemo(() => {
    const args = parseExtraArgs(extraArgsText);
    const idx = args.lastIndexOf('--permission-mode');
    if (idx >= 0) return args[idx + 1] ?? '';
    return '';
  }, [extraArgsText]);

  const claudeDangerousSkip = useMemo(() => {
    const args = parseExtraArgs(extraArgsText);
    return args.includes('--dangerously-skip-permissions');
  }, [extraArgsText]);

  const codexAutomation = useMemo(() => {
    const args = parseExtraArgs(extraArgsText);
    if (args.includes('--dangerously-bypass-approvals-and-sandbox')) return 'danger';
    if (args.includes('--full-auto')) return 'full-auto';
    return '';
  }, [extraArgsText]);

  const geminiApprovalMode = useMemo(() => {
    const args = parseExtraArgs(extraArgsText);
    const idx = args.lastIndexOf('--approval-mode');
    if (idx >= 0) return args[idx + 1] ?? '';
    return '';
  }, [extraArgsText]);

  const handleSave = useCallback(async () => {
    if (!node) return;
    const extraArgs = parseExtraArgs(extraArgsText);
    await updateNode(node.id, {
      title,
      agent: { type: agentType, model: model || undefined, extraArgs: extraArgs.length ? extraArgs : undefined },
      launchMode,
      prompt,
      context,
      deliverables,
      checks,
    });
  }, [
    node,
    updateNode,
    title,
    agentType,
    model,
    extraArgsText,
    launchMode,
    prompt,
    context,
    deliverables,
    checks,
  ]);

  const handleClose = useCallback(() => {
    if (isDirty) {
      if (!confirm('You have unsaved changes. Discard them?')) {
        return;
      }
    }
    onClose();
  }, [isDirty, onClose]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void handleSave();
      }
      if (e.key === 'Escape' && !isDirty) {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleSave, isDirty, onClose]);

  // Context management
  const addContext = (type: ContextRef['type']) => {
    if (type === 'file') {
      setContext([...context, { type: 'file', path: '' }]);
    } else if (type === 'parent_output') {
      setContext([...context, { type: 'parent_output', nodeId: '' }]);
    } else {
      setContext([...context, { type: 'text', content: '' }]);
    }
  };

  const updateContext = (index: number, update: Partial<ContextRef>) => {
    setContext(context.map((c, i) => (i === index ? { ...c, ...update } as ContextRef : c)));
  };

  const removeContext = (index: number) => {
    setContext(context.filter((_, i) => i !== index));
  };

  // Deliverables management
  const addDeliverable = () => {
    setDeliverables([...deliverables, { id: randomId(), type: 'file', description: '' }]);
  };

  const updateDeliverable = (id: string, update: Partial<Deliverable>) => {
    setDeliverables(deliverables.map((d) => (d.id === id ? { ...d, ...update } : d)));
  };

  const removeDeliverable = (id: string) => {
    setDeliverables(deliverables.filter((d) => d.id !== id));
  };

  // Checks management
  const addCheck = (type: Check['type']) => {
    setChecks([...checks, createDefaultCheck(type)]);
  };

  const updateCheck = (id: string, update: Partial<Check>) => {
    setChecks(checks.map((c) => (c.id === id ? { ...c, ...update } as Check : c)));
  };

  const removeCheck = (id: string) => {
    setChecks(checks.filter((c) => c.id !== id));
  };

  if (!node) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="!max-w-[90vw] !w-[1200px] !h-[85vh] !max-h-[85vh] flex flex-col p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-transparent text-lg font-semibold focus:outline-none"
              placeholder="Node title"
            />
            {isDirty && <span className="text-xs text-muted-foreground">(unsaved)</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void (async () => {
                  if (isDirty) await handleSave();
                  await runNode(node.id);
                })();
              }}
              disabled={node.status === 'running'}
            >
              {node.status === 'running'
                ? 'Running...'
                : launchMode === 'interactive'
                  ? 'Start Interactive'
                  : 'Run One-shot'}
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={!isDirty}>
              Save
            </Button>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="flex flex-1 min-h-0">
          {/* Left column: Main editing */}
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto border-r border-border p-4">
            <div className="flex gap-4">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">Agent</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={agentType}
                  onChange={(e) => {
                    setAgentType(e.target.value as AgentType);
                    setModel('');
                  }}
                >
                  {AGENTS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">Model</label>
                <Input
                  list={`model-options-${agentType}`}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Default"
                />
                <datalist id={`model-options-${agentType}`}>
                  {MODEL_OPTIONS[agentType].map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </datalist>
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">Launch mode</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={launchMode}
                  onChange={(e) => setLaunchMode(e.target.value as LaunchMode)}
                >
                  <option value="interactive">Interactive (tmux chat)</option>
                  <option value="one_shot">One-shot (stream output)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              {agentType === 'claude' && (
                <div className="flex gap-4">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">Claude mode</label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={claudePermissionMode}
                      onChange={(e) => {
                        const next = e.target.value;
                        setExtraArgs((args) => upsertFlagWithValue(args, '--permission-mode', next || null));
                      }}
                    >
                      <option value="">Default</option>
                      <option value="acceptEdits">Accept edits</option>
                      <option value="dontAsk">Don’t ask</option>
                      <option value="bypassPermissions">Bypass permissions</option>
                      <option value="delegate">Delegate</option>
                      <option value="plan">Plan</option>
                    </select>
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">Skip permissions</label>
                    <label className="flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm">
                      <input
                        type="checkbox"
                        checked={claudeDangerousSkip}
                        onChange={(e) => {
                          const enabled = e.target.checked;
                          setExtraArgs((args) => {
                            let out = removeFlag(args, '--dangerously-skip-permissions');
                            if (enabled) out = [...out, '--dangerously-skip-permissions'];
                            return out;
                          });
                        }}
                      />
                      <span>Dangerous</span>
                    </label>
                  </div>
                </div>
              )}

              {agentType === 'codex' && (
                <div className="flex gap-4">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">Codex automation</label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={codexAutomation}
                      onChange={(e) => {
                        const next = e.target.value;
                        setExtraArgs((args) => {
                          let out = removeFlag(args, '--full-auto');
                          out = removeFlag(out, '--dangerously-bypass-approvals-and-sandbox');
                          if (next === 'full-auto') return [...out, '--full-auto'];
                          if (next === 'danger') return [...out, '--dangerously-bypass-approvals-and-sandbox'];
                          return out;
                        });
                      }}
                    >
                      <option value="">Default</option>
                      <option value="full-auto">Full auto (workspace-write)</option>
                      <option value="danger">Danger: bypass approvals + sandbox</option>
                    </select>
                  </div>
                </div>
              )}

              {agentType === 'gemini' && (
                <div className="flex gap-4">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">Gemini approval</label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={geminiApprovalMode}
                      onChange={(e) => {
                        const next = e.target.value;
                        setExtraArgs((args) => upsertFlagWithValue(args, '--approval-mode', next || null));
                      }}
                    >
                      <option value="">Default</option>
                      <option value="auto_edit">Auto-edit</option>
                      <option value="yolo">YOLO</option>
                    </select>
                  </div>
                </div>
              )}

              <label className="text-xs text-muted-foreground">Extra CLI args (one per line)</label>
              <textarea
                className="min-h-[72px] w-full resize-y rounded-md border border-input bg-background p-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={extraArgsText}
                onChange={(e) => setExtraArgsText(e.target.value)}
                placeholder={agentType === 'codex' ? '--full-auto' : '--some-flag'}
              />
            </div>

            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Prompt</label>
                <span className="text-[10px] text-muted-foreground">{prompt.length} chars</span>
              </div>
              <textarea
                className="flex-1 min-h-[200px] resize-none rounded-md border border-input bg-background p-3 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Write the prompt to send to the agent..."
              />
            </div>
          </div>

          {/* Right column: Configuration */}
          <div className="flex w-[360px] shrink-0 flex-col overflow-y-auto">
            {/* Context Section */}
            <Collapsible title="Context" count={context.length} defaultOpen>
              <div className="space-y-2">
                {context.map((ctx, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <div className="flex-1 space-y-1">
                      {ctx.type === 'file' && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">file:</span>
                          <Input
                            value={ctx.path}
                            onChange={(e) => updateContext(index, { path: e.target.value })}
                            placeholder="path/to/file"
                            className="h-7 text-xs"
                          />
                        </div>
                      )}
                      {ctx.type === 'parent_output' && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">parent:</span>
                          <Input
                            value={ctx.nodeId}
                            onChange={(e) => updateContext(index, { nodeId: e.target.value })}
                            placeholder="node-id"
                            className="h-7 text-xs"
                          />
                        </div>
                      )}
                      {ctx.type === 'text' && (
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">text:</span>
                          <textarea
                            value={ctx.content}
                            onChange={(e) => updateContext(index, { content: e.target.value })}
                            placeholder="Inline text content"
                            className="h-16 w-full resize-none rounded-md border border-input bg-background p-2 text-xs"
                          />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeContext(index)}
                      className="mt-1 p-1 text-muted-foreground hover:text-destructive"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <select
                    className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        addContext(e.target.value as ContextRef['type']);
                        e.target.value = '';
                      }
                    }}
                  >
                    <option value="" disabled>
                      + Add context...
                    </option>
                    <option value="file">File</option>
                    <option value="parent_output">Parent Output</option>
                    <option value="text">Text</option>
                  </select>
                </div>
              </div>
            </Collapsible>

            {/* Deliverables Section */}
            <Collapsible title="Deliverables" count={deliverables.length}>
              <div className="space-y-2">
                {deliverables.map((d) => (
                  <div key={d.id} className="flex items-start gap-2">
                    <select
                      className="h-7 w-20 shrink-0 rounded-md border border-input bg-background px-2 text-xs"
                      value={d.type}
                      onChange={(e) => updateDeliverable(d.id, { type: e.target.value as 'file' | 'response' })}
                    >
                      <option value="file">file</option>
                      <option value="response">response</option>
                    </select>
                    <Input
                      value={d.description}
                      onChange={(e) => updateDeliverable(d.id, { description: e.target.value })}
                      placeholder="Description"
                      className="h-7 text-xs"
                    />
                    <button
                      onClick={() => removeDeliverable(d.id)}
                      className="mt-1 p-1 text-muted-foreground hover:text-destructive"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={addDeliverable}>
                  + Add deliverable
                </Button>
              </div>
            </Collapsible>

            {/* Checks Section */}
            <Collapsible title="Checks" count={checks.length}>
              <div className="space-y-2">
                {checks.map((check) => (
                  <div key={check.id} className="rounded-md border border-border bg-muted/30 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{check.type}</span>
                      <button
                        onClick={() => removeCheck(check.id)}
                        className="p-1 text-muted-foreground hover:text-destructive"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {check.type === 'file_exists' && (
                        <Input
                          value={check.path}
                          onChange={(e) => updateCheck(check.id, { path: e.target.value })}
                          placeholder="File path"
                          className="h-7 text-xs"
                        />
                      )}
                      {check.type === 'command' && (
                        <Input
                          value={check.cmd}
                          onChange={(e) => updateCheck(check.id, { cmd: e.target.value })}
                          placeholder="Command (e.g., npm test)"
                          className="h-7 text-xs"
                        />
                      )}
                      {check.type === 'contains' && (
                        <>
                          <Input
                            value={check.path}
                            onChange={(e) => updateCheck(check.id, { path: e.target.value })}
                            placeholder="File path"
                            className="h-7 text-xs"
                          />
                          <Input
                            value={check.pattern}
                            onChange={(e) => updateCheck(check.id, { pattern: e.target.value })}
                            placeholder="Pattern to match"
                            className="h-7 text-xs"
                          />
                        </>
                      )}
                      {check.type === 'test_runner' && (
                        <select
                          className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
                          value={check.framework}
                          onChange={(e) =>
                            updateCheck(check.id, { framework: e.target.value as typeof TEST_FRAMEWORKS[number] })
                          }
                        >
                          {TEST_FRAMEWORKS.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      )}
                      {check.type === 'human_approval' && (
                        <span className="text-xs text-muted-foreground">Requires manual approval to pass</span>
                      )}
                      {check.type !== 'human_approval' && (
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={'autoRetry' in check ? check.autoRetry ?? false : false}
                            onChange={(e) => updateCheck(check.id, { autoRetry: e.target.checked })}
                          />
                          Auto-retry on failure
                        </label>
                      )}
                    </div>
                  </div>
                ))}
                <select
                  className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      addCheck(e.target.value as Check['type']);
                      e.target.value = '';
                    }
                  }}
                >
                  <option value="" disabled>
                    + Add check...
                  </option>
                  {CHECK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </Collapsible>

            {/* Advanced Section */}
            <Collapsible title="Advanced">
              <div className="space-y-3 text-xs text-muted-foreground">
                <p>Additional configuration options will be available here.</p>
              </div>
            </Collapsible>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <span className="text-xs text-muted-foreground">Press ⌘S to save</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={handleClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
