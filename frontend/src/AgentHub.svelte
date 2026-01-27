<script>
  import { onMount, onDestroy } from 'svelte'

  let agents = []
  let expanded = false
  let pollInterval

  const AGENT_COLORS = {
    claude: '#f97316',
    codex: '#22c55e',
    gemini: '#3b82f6'
  }

  const VM_HOST = 'root@159.65.109.198'

  onMount(() => {
    loadAgents()
    pollInterval = setInterval(loadAgents, 3000)
  })

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval)
  })

  async function loadAgents() {
    try {
      const res = await fetch('/agents/active')
      if (res.ok) {
        agents = await res.json()
      }
    } catch {}
  }

  function getTmuxCommand(session) {
    return `ssh -t ${VM_HOST} "tmux attach -t ${session}"`
  }

  async function copyCommand(session) {
    const cmd = getTmuxCommand(session)
    await navigator.clipboard.writeText(cmd)
  }

  async function killAgent(id) {
    await fetch(`/agents/${id}`, { method: 'DELETE' })
    agents = agents.filter(a => a.id !== id)
  }

  function formatTime(isoString) {
    if (!isoString) return ''
    const date = new Date(isoString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
</script>

<div class="agent-hub" class:expanded>
  <button class="hub-toggle" on:click={() => expanded = !expanded}>
    <span class="badge" class:active={agents.length > 0}>{agents.length}</span>
    <span class="label">Agents</span>
    <span class="arrow">{expanded ? '▼' : '▲'}</span>
  </button>

  {#if expanded}
    <div class="agent-list">
      {#if agents.length === 0}
        <p class="empty">No running agents</p>
      {:else}
        {#each agents as agent}
          <div class="agent-card" style="border-left-color: {AGENT_COLORS[agent.agent_type]}">
            <div class="agent-info">
              <span class="agent-badge" style="background: {AGENT_COLORS[agent.agent_type]}">{agent.agent_type}</span>
              <span class="agent-title">{agent.title || 'Untitled'}</span>
              <span class="agent-time">{formatTime(agent.started_at)}</span>
            </div>
            <div class="agent-actions">
              <button class="copy-btn" on:click={() => copyCommand(agent.tmux_session)} title="Copy tmux command">
                Copy
              </button>
              <button class="kill-btn" on:click={() => killAgent(agent.id)} title="Kill agent">
                Kill
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .agent-hub {
    position: fixed;
    bottom: 0;
    right: 1rem;
    z-index: 1000;
    background: #111;
    border: 1px solid #333;
    border-bottom: none;
    border-radius: 8px 8px 0 0;
    min-width: 280px;
  }

  .hub-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    color: #ccc;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .hub-toggle:hover {
    background: #1a1a1a;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 0.375rem;
    background: #333;
    border-radius: 10px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .badge.active {
    background: #22c55e;
    color: #000;
  }

  .label {
    flex: 1;
    text-align: left;
    font-weight: 500;
  }

  .arrow {
    color: #666;
    font-size: 0.625rem;
  }

  .agent-list {
    max-height: 300px;
    overflow-y: auto;
    border-top: 1px solid #222;
  }

  .empty {
    padding: 1.5rem 1rem;
    text-align: center;
    color: #555;
    font-size: 0.875rem;
  }

  .agent-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-left: 3px solid #333;
    border-bottom: 1px solid #222;
    background: #0d0d0d;
  }

  .agent-card:last-child {
    border-bottom: none;
  }

  .agent-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    overflow: hidden;
  }

  .agent-badge {
    font-size: 0.5rem;
    padding: 0.125rem 0.25rem;
    border-radius: 2px;
    color: #000;
    font-weight: 600;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .agent-title {
    font-size: 0.75rem;
    color: #ccc;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 120px;
  }

  .agent-time {
    font-size: 0.625rem;
    color: #555;
    flex-shrink: 0;
  }

  .agent-actions {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .copy-btn, .kill-btn {
    padding: 0.25rem 0.5rem;
    background: #222;
    border: 1px solid #333;
    border-radius: 4px;
    color: #888;
    font-size: 0.625rem;
    cursor: pointer;
  }

  .copy-btn:hover {
    background: #3b82f6;
    border-color: #3b82f6;
    color: #fff;
  }

  .kill-btn:hover {
    background: #dc2626;
    border-color: #dc2626;
    color: #fff;
  }
</style>
