import { useMemo } from 'react';
import { useOrchestraStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Node</div>
        <Button variant="destructive" size="sm" onClick={() => void deleteNode(node.id)}>
          Delete
        </Button>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Title</div>
        <Input value={node.title} onChange={(e) => void updateNode(node.id, { title: e.target.value })} />
      </div>

      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Agent</div>
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

      <div className="flex min-h-[180px] flex-1 flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Prompt</div>
          <Button size="sm" onClick={() => void runNode(node.id)} disabled={node.status === 'running'}>
            {node.status === 'running' ? 'Running…' : 'Run'}
          </Button>
        </div>
        <textarea
          className="w-full flex-1 resize-none rounded-md border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={node.prompt}
          onChange={(e) => void updateNode(node.id, { prompt: e.target.value })}
          placeholder="Write the prompt to send to the agent…"
        />
      </div>

      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Output</div>
        <pre className="max-h-[260px] overflow-auto rounded-md border border-border bg-background p-3 text-xs leading-relaxed">
          {latestSession?.output ?? 'No output yet.'}
        </pre>
        {latestSession?.error ? <div className="text-xs text-destructive">{latestSession.error}</div> : null}
      </div>
    </div>
  );
}

