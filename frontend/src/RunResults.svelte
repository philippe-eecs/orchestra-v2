<script>
  import { onMount, onDestroy } from 'svelte'

  export let runId

  let run = null
  let loading = true
  let pollInterval

  const VM_HOST = '159.65.109.198'

  const AGENT_COLORS = {
    claude: '#f97316',
    codex: '#22c55e',
    gemini: '#3b82f6'
  }

  const STATUS_COLORS = {
    pending: '#666',
    running: '#eab308',
    done: '#22c55e',
    error: '#dc2626'
  }

  onMount(() => {
    loadRun()
    pollInterval = setInterval(loadRun, 2000)
  })

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval)
  })

  async function loadRun() {
    const res = await fetch(`/runs/${runId}`)
    run = await res.json()
    loading = false

    // Stop polling when done
    if (run.status !== 'running' && pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }

  function getTmuxCommand(session) {
    return `ssh -t root@${VM_HOST} "tmux attach -t ${session}"`
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
  }

  function getArtifactIcon(type) {
    switch (type) {
      case 'pr': return '⬡'
      case 'github': return '◐'
      case 'file': return '◫'
      default: return '◇'
    }
  }
</script>

{#if loading}
  <div class="loading">Loading...</div>
{:else}
  <div class="results">
    <div class="header">
      <h2>Run #{run.id}</h2>
      <span class="status" style="background: {STATUS_COLORS[run.status]}">{run.status}</span>
    </div>

    {#if run.error}
      <div class="run-error">{run.error}</div>
    {/if}

    <div class="node-runs">
      {#each run.node_runs as nr}
        <div class="node-run" class:current={nr.status === 'running'}>
          <div class="node-header">
            <span class="agent" style="background: {AGENT_COLORS[nr.agent_type]}">{nr.agent_type}</span>
            <span class="title">{nr.node_title}</span>
            <span class="node-status" style="color: {STATUS_COLORS[nr.status]}">{nr.status}</span>
          </div>

          {#if nr.status === 'running' && nr.tmux_session}
            <div class="tmux-link">
              <span class="label">Terminal:</span>
              <code>{getTmuxCommand(nr.tmux_session)}</code>
              <button on:click={() => copyToClipboard(getTmuxCommand(nr.tmux_session))}>Copy</button>
            </div>
          {/if}

          {#if nr.artifacts && nr.artifacts.length > 0}
            <div class="artifacts">
              {#each nr.artifacts as artifact}
                <a
                  href={artifact.url || '#'}
                  target="_blank"
                  rel="noopener"
                  class="artifact"
                  class:file={artifact.type === 'file'}
                >
                  <span class="icon">{getArtifactIcon(artifact.type)}</span>
                  {artifact.url || artifact.path}
                </a>
              {/each}
            </div>
          {/if}

          {#if nr.output}
            <details class="output">
              <summary>Output</summary>
              <pre>{nr.output}</pre>
            </details>
          {/if}

          {#if nr.error}
            <div class="node-error">{nr.error}</div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 80vh;
    color: #666;
  }

  .results {
    max-width: 900px;
    margin: 0 auto;
    padding: 1.5rem;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .header h2 {
    font-size: 1.5rem;
    font-weight: 600;
  }

  .status {
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: #000;
  }

  .run-error {
    padding: 1rem;
    background: #1f1f1f;
    border-left: 3px solid #dc2626;
    border-radius: 4px;
    margin-bottom: 1rem;
    color: #ef4444;
  }

  .node-runs {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .node-run {
    background: #111;
    border: 1px solid #222;
    border-radius: 8px;
    overflow: hidden;
  }

  .node-run.current {
    border-color: #eab308;
    box-shadow: 0 0 20px rgba(234, 179, 8, 0.1);
  }

  .node-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: #0a0a0a;
    border-bottom: 1px solid #222;
  }

  .agent {
    font-size: 0.625rem;
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
    color: #000;
    font-weight: 600;
    text-transform: uppercase;
  }

  .title {
    flex: 1;
    font-weight: 500;
  }

  .node-status {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .tmux-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: #1a1a1a;
    border-bottom: 1px solid #222;
  }

  .tmux-link .label {
    color: #888;
    font-size: 0.875rem;
  }

  .tmux-link code {
    flex: 1;
    font-size: 0.75rem;
    color: #22c55e;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tmux-link button {
    padding: 0.25rem 0.5rem;
    background: #333;
    border: none;
    border-radius: 4px;
    color: #fff;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .tmux-link button:hover {
    background: #3b82f6;
  }

  .artifacts {
    padding: 0.75rem 1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    border-bottom: 1px solid #222;
  }

  .artifact {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    background: #1a1a1a;
    border-radius: 4px;
    color: #3b82f6;
    text-decoration: none;
    font-size: 0.75rem;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .artifact:hover {
    background: #222;
  }

  .artifact.file {
    color: #a78bfa;
  }

  .artifact .icon {
    font-size: 0.875rem;
  }

  .output {
    border-bottom: 1px solid #222;
  }

  .output summary {
    padding: 0.75rem 1rem;
    cursor: pointer;
    color: #888;
    font-size: 0.875rem;
  }

  .output summary:hover {
    color: #fff;
  }

  .output pre {
    padding: 1rem;
    background: #0a0a0a;
    font-size: 0.75rem;
    line-height: 1.5;
    overflow-x: auto;
    max-height: 400px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .node-error {
    padding: 0.75rem 1rem;
    color: #ef4444;
    font-size: 0.875rem;
  }
</style>
