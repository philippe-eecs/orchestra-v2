import { useEffect, useState } from 'react';
import { useOrchestraStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible } from '@/components/ui/collapsible';
import FullNodeEditor from './FullNodeEditor';
import type { AgentType, CheckResult, LaunchMode, NodeStatus, Session } from '@/lib/types';
import * as api from '@/lib/api';

const AGENTS: AgentType[] = ['claude', 'codex', 'gemini'];

export default function NodeEditor() {
  const projectId = useOrchestraStore((s) => s.currentProjectId);
  const selectedNodeId = useOrchestraStore((s) => s.selectedNodeId);
  const updateNode = useOrchestraStore((s) => s.updateNode);
  const deleteNode = useOrchestraStore((s) => s.deleteNode);
  const runNode = useOrchestraStore((s) => s.runNode);

  const [fullEditorOpen, setFullEditorOpen] = useState(false);
  const [session, setSession] = useState<api.InteractiveSession | null>(null);
  const [outputPreview, setOutputPreview] = useState<string>('');
  const [quickInput, setQuickInput] = useState('');
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [checkResults, setCheckResults] = useState<CheckResult[]>([]);

  const node = useOrchestraStore((s) => {
    if (!projectId || !selectedNodeId) return null;
    return s.projects[projectId]?.nodes.find((n) => n.id === selectedNodeId) ?? null;
  });

  const launchMode: LaunchMode = node?.launchMode ?? 'interactive';
  const latestOneShot: Session | null = useOrchestraStore((s) => {
    if (!selectedNodeId) return null;
    const sid = s.latestSessionIdByNodeId[selectedNodeId];
    return sid ? s.sessions[sid] ?? null : null;
  });

  useEffect(() => {
    setSession(null);
    setOutputPreview('');
    setQuickInput('');
    setSessionError(null);
    setCopied(false);
    setCheckResults([]);

    if (!node || launchMode !== 'interactive') return;
    let cancelled = false;

    void (async () => {
      try {
        const sessions = await api.listInteractiveSessions();
        const existing =
          sessions.find((s) => s.nodeId === node.id && (s.status === 'running' || s.status === 'awaiting_input')) ??
          null;
        if (!cancelled) setSession(existing);
      } catch (e) {
        if (!cancelled) setSessionError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [node?.id, launchMode]);

  // When an interactive node is running but we don't have the session ID yet, poll for it.
  useEffect(() => {
    if (!node || launchMode !== 'interactive') return;
    if (node.status !== 'running') return;
    if (session) return;

    let cancelled = false;
    const interval = setInterval(() => {
      void (async () => {
        try {
          const sessions = await api.listInteractiveSessions();
          const existing =
            sessions.find((s) => s.nodeId === node.id && (s.status === 'running' || s.status === 'awaiting_input')) ??
            null;
          if (!cancelled) setSession(existing);
        } catch {
          // ignore
        }
      })();
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [launchMode, node?.id, node?.status, session]);

  // Listen for session completion events
  useEffect(() => {
    if (!node || launchMode !== 'interactive') return;

    const nodeId = node.id;
    let cancelled = false;
    let unlistenFn: (() => void) | undefined;

    void (async () => {
      const fn = await api.listenSessionCompleted((event) => {
        if (event.nodeId !== nodeId) return;

        // Agent finished - update UI
        setOutputPreview(event.output);
        setCheckResults(event.checkResults);

        // Determine new status based on checks
        let newStatus: 'completed' | 'failed' | 'awaiting_approval' = event.success ? 'completed' : 'failed';

        // If there are human approval checks that haven't passed, mark as awaiting
        const hasAwaitingApproval = event.checkResults.some(
          (r) => r.checkType === 'human_approval' && !r.passed
        );
        if (hasAwaitingApproval && event.exitCode === 0) {
          newStatus = 'awaiting_approval';
        }

        void updateNode(nodeId, { status: newStatus });

        // Note: session may still exist (user in shell) - don't clear it
        // Let the polling interval handle that
      });
      if (cancelled) fn();
      else unlistenFn = fn;
    })();

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [launchMode, node?.id, updateNode]);

  useEffect(() => {
    if (!session || !node || launchMode !== 'interactive') return;

    let cancelled = false;
    const interval = setInterval(() => {
      void (async () => {
        try {
          const out = await api.captureSessionOutput(session.id, 40);
          if (!cancelled) setOutputPreview(out);
        } catch {
          if (!cancelled) {
            setSession(null);
          }
        }
      })();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [launchMode, node?.id, session?.id, updateNode]);

  if (!node) {
    return <div className="h-full p-4 text-sm text-muted-foreground">Select a node to edit.</div>;
  }

  const contextCount = node.context?.length ?? 0;
  const deliverablesCount = node.deliverables?.length ?? 0;
  const checksCount = node.checks?.length ?? 0;
  const promptPreview = node.prompt ? node.prompt.slice(0, 100) + (node.prompt.length > 100 ? '...' : '') : '';
  const effectiveStatus: NodeStatus = node.status;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="text-sm font-semibold">Node</div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2"
            onClick={() => setFullEditorOpen(true)}
            title="Open fullscreen editor"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              />
            </svg>
          </Button>
          <Button variant="destructive" size="sm" className="h-7" onClick={() => void deleteNode(node.id)}>
            Delete
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Title */}
        <div className="border-b border-border px-4 py-3">
          <div className="text-xs text-muted-foreground mb-1">Title</div>
          <Input value={node.title} onChange={(e) => void updateNode(node.id, { title: e.target.value })} />
        </div>

        {/* Agent */}
        <div className="border-b border-border px-4 py-3">
          <div className="text-xs text-muted-foreground mb-1">Agent</div>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={node.agent.type}
            onChange={(e) => void updateNode(node.id, { agent: { ...node.agent, type: e.target.value as AgentType } })}
          >
            {AGENTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {/* Launch mode */}
        <div className="border-b border-border px-4 py-3">
          <div className="text-xs text-muted-foreground mb-1">Launch mode</div>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={launchMode}
            onChange={(e) => void updateNode(node.id, { launchMode: e.target.value as LaunchMode })}
          >
            <option value="interactive">Interactive (tmux chat)</option>
            <option value="one_shot">One-shot (stream output)</option>
          </select>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Interactive starts a tmux session you can attach to. One-shot runs a single command and streams output here.
          </div>
        </div>

        {/* Prompt preview */}
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Prompt</div>
            <span className="text-[10px] text-muted-foreground">{node.prompt?.length ?? 0} chars</span>
          </div>
          <div className="mt-1 text-xs text-foreground/70 whitespace-pre-wrap break-words line-clamp-3">
            {promptPreview || <span className="italic text-muted-foreground">No prompt yet</span>}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-7 w-full text-xs"
            onClick={() => setFullEditorOpen(true)}
          >
            Edit prompt
          </Button>
        </div>

        {/* Context (collapsed) */}
        <Collapsible title="Context" count={contextCount}>
          {contextCount === 0 ? (
            <div className="text-xs text-muted-foreground">No context configured.</div>
          ) : (
            <div className="space-y-1">
              {node.context?.map((ctx, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {ctx.type === 'file' && '📄'}
                    {ctx.type === 'parent_output' && '🔗'}
                    {ctx.type === 'text' && '📝'}
                  </span>
                  <span className="truncate">
                    {ctx.type === 'file' && ctx.path}
                    {ctx.type === 'parent_output' && `node: ${ctx.nodeId}`}
                    {ctx.type === 'text' && ctx.content.slice(0, 30) + (ctx.content.length > 30 ? '...' : '')}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-6 w-full text-xs"
            onClick={() => setFullEditorOpen(true)}
          >
            Manage context
          </Button>
        </Collapsible>

        {/* Deliverables (collapsed) */}
        <Collapsible title="Deliverables" count={deliverablesCount}>
          {deliverablesCount === 0 ? (
            <div className="text-xs text-muted-foreground">No deliverables configured.</div>
          ) : (
            <div className="space-y-1">
              {node.deliverables?.map((d) => (
                <div key={d.id} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{d.type === 'file' ? '📄' : '💬'}</span>
                  <span className="truncate">{d.description || `(${d.type})`}</span>
                </div>
              ))}
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-6 w-full text-xs"
            onClick={() => setFullEditorOpen(true)}
          >
            Manage deliverables
          </Button>
        </Collapsible>

        {/* Checks (collapsed) */}
        <Collapsible title="Checks" count={checksCount}>
          {checksCount === 0 ? (
            <div className="text-xs text-muted-foreground">No checks configured.</div>
          ) : (
            <div className="space-y-1">
              {node.checks?.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">✓</span>
                  <span className="truncate">{c.type}</span>
                  {'autoRetry' in c && c.autoRetry && (
                    <span className="text-[10px] text-blue-500">[retry]</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-6 w-full text-xs"
            onClick={() => setFullEditorOpen(true)}
          >
            Manage checks
          </Button>
        </Collapsible>

        {/* Check Results */}
        {checkResults.length > 0 && (
          <div className="border-b border-border px-4 py-3">
            <div className="text-xs text-muted-foreground mb-2">Check Results</div>
            <div className="space-y-1">
              {checkResults.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-xs">
                  <span className={r.passed ? 'text-green-500' : 'text-red-500'}>
                    {r.passed ? '✓' : '✗'}
                  </span>
                  <span className="text-muted-foreground">{r.checkType}</span>
                  {r.message && <span className="text-foreground/70 truncate">- {r.message}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Output */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Output</div>
            {launchMode === 'interactive' && session ? (
              <div className="text-[10px] text-muted-foreground">tmux: {session.id}</div>
            ) : null}
            {launchMode === 'one_shot' && latestOneShot ? (
              <div className="text-[10px] text-muted-foreground">run: {latestOneShot.id}</div>
            ) : null}
          </div>
          <pre className="mt-2 max-h-[200px] overflow-auto rounded-md border border-border bg-background p-3 text-xs leading-relaxed">
            {launchMode === 'interactive'
              ? outputPreview || (session ? 'Waiting for output...' : 'No session output yet.')
              : latestOneShot?.output || latestOneShot?.error || 'No run output yet.'}
          </pre>
          {launchMode === 'interactive' && sessionError ? (
            <div className="mt-2 text-xs text-destructive">{sessionError}</div>
          ) : null}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border p-4">
        {launchMode === 'interactive' && session ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => {
                  void api.attachSession(session.id).catch((e) => {
                    setSessionError(e instanceof Error ? e.message : String(e));
                  });
                }}
              >
                Open Terminal
              </Button>
              <Button
                className="flex-1"
                variant="ghost"
                onClick={() => {
                  const cmd = `tmux attach -t ${session.id}`;
                  void navigator.clipboard.writeText(cmd).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
              >
                {copied ? '✓ Copied!' : 'Copy'}
              </Button>
              <Button
                className="flex-1"
                variant="destructive"
                onClick={() => {
                  void (async () => {
                    try {
                      await api.killInteractiveSession(session.id);
                      setSession(null);
                      setOutputPreview('');
                      void updateNode(node.id, { status: 'pending' });
                    } catch (e) {
                      setSessionError(e instanceof Error ? e.message : String(e));
                    }
                  })();
                }}
              >
                Kill
              </Button>
            </div>

            <div className="flex gap-2">
              <Input
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                placeholder="Send input without attaching..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && quickInput) {
                    void api.sendSessionInput(session.id, quickInput);
                    setQuickInput('');
                  }
                }}
              />
              <Button
                onClick={() => {
                  if (quickInput) {
                    void api.sendSessionInput(session.id, quickInput);
                    setQuickInput('');
                  }
                }}
              >
                Send
              </Button>
            </div>
          </div>
        ) : launchMode === 'interactive' ? (
          <Button
            className="w-full"
            onClick={() => {
              void runNode(node.id).catch((e) => {
                setSessionError(e instanceof Error ? e.message : String(e));
              });
            }}
            disabled={effectiveStatus === 'running'}
          >
            {effectiveStatus === 'running' ? 'Starting...' : 'Start Interactive Session'}
          </Button>
        ) : (
          <Button className="w-full" onClick={() => void runNode(node.id)} disabled={effectiveStatus === 'running'}>
            {effectiveStatus === 'running' ? 'Running...' : 'Run One-shot'}
          </Button>
        )}
      </div>

      {/* Fullscreen editor modal */}
      <FullNodeEditor nodeId={node.id} open={fullEditorOpen} onClose={() => setFullEditorOpen(false)} />
    </div>
  );
}
