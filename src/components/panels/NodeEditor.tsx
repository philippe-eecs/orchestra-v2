import { useMemo, useState } from 'react';
import { useOrchestraStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible } from '@/components/ui/collapsible';
import FullNodeEditor from './FullNodeEditor';
import type { AgentType } from '@/lib/types';

const AGENTS: AgentType[] = ['claude', 'codex', 'gemini'];

export default function NodeEditor() {
  const projectId = useOrchestraStore((s) => s.currentProjectId);
  const selectedNodeId = useOrchestraStore((s) => s.selectedNodeId);
  const updateNode = useOrchestraStore((s) => s.updateNode);
  const deleteNode = useOrchestraStore((s) => s.deleteNode);
  const runNode = useOrchestraStore((s) => s.runNode);
  const latestSessionIdByNodeId = useOrchestraStore((s) => s.latestSessionIdByNodeId);
  const sessions = useOrchestraStore((s) => s.sessions);

  const [fullEditorOpen, setFullEditorOpen] = useState(false);

  const node = useOrchestraStore((s) => {
    if (!projectId || !selectedNodeId) return null;
    return s.projects[projectId]?.nodes.find((n) => n.id === selectedNodeId) ?? null;
  });

  const latestSession = useMemo(() => {
    if (!node) return null;
    const sessionId = latestSessionIdByNodeId[node.id];
    if (!sessionId) return null;
    return sessions[sessionId] ?? null;
  }, [latestSessionIdByNodeId, node, sessions]);

  if (!node) {
    return <div className="h-full p-4 text-sm text-muted-foreground">Select a node to edit.</div>;
  }

  const contextCount = node.context?.length ?? 0;
  const deliverablesCount = node.deliverables?.length ?? 0;
  const checksCount = node.checks?.length ?? 0;
  const promptPreview = node.prompt ? node.prompt.slice(0, 100) + (node.prompt.length > 100 ? '...' : '') : '';

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

        {/* Output */}
        <div className="px-4 py-3">
          <div className="text-xs text-muted-foreground mb-2">Output</div>
          <pre className="max-h-[200px] overflow-auto rounded-md border border-border bg-background p-3 text-xs leading-relaxed">
            {latestSession?.output ?? 'No output yet.'}
          </pre>
          {latestSession?.error ? <div className="mt-1 text-xs text-destructive">{latestSession.error}</div> : null}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border p-4">
        <Button className="w-full" onClick={() => void runNode(node.id)} disabled={node.status === 'running'}>
          {node.status === 'running' ? 'Running...' : 'Run Node'}
        </Button>
      </div>

      {/* Fullscreen editor modal */}
      <FullNodeEditor nodeId={node.id} open={fullEditorOpen} onClose={() => setFullEditorOpen(false)} />
    </div>
  );
}
