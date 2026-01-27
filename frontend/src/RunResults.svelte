<script>
  import { onMount, onDestroy } from 'svelte'

  export let runId

  let run = null
  let loading = true
  let pollInterval

  const VM_HOST = '159.65.109.198'

  const STATUS_COLORS = {
    pending: '#666',
    blocked: '#9333ea',
    running: '#eab308',
    validating: '#3b82f6',
    green: '#22c55e',
    red: '#dc2626',
    done: '#22c55e',
    error: '#dc2626'
  }

  const STATUS_ICONS = {
    pending: '○',
    blocked: '◌',
    running: '◐',
    validating: '◑',
    green: '●',
    red: '✕',
    done: '✓',
    error: '✕'
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
    if (!['running', 'validating'].includes(run.status) && pollInterval) {
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

  function getDeliverableIcon(type) {
    switch (type) {
      case 'pr': return '⬡'
      case 'github': return '◐'
      case 'file': return '◫'
      default: return '◇'
    }
  }

  function getConditionIcon(result) {
    if (result.pending) return '⏳'
    return result.passed ? '✓' : '✕'
  }

  function getConditionColor(result) {
    if (result.pending) return '#eab308'
    return result.passed ? '#22c55e' : '#dc2626'
  }

  async function submitReview(reviewId, action) {
    const res = await fetch(`/reviews/${reviewId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    })
    if (res.ok) {
      await loadRun()
    }
  }
</script>

{#if loading}
  <div class="loading">Loading...</div>
{:else}
  <div class="results">
    <div class="header">
      <h2>Run #{run.id}</h2>
      <span class="status" style="background: {STATUS_COLORS[run.status]}">
        {STATUS_ICONS[run.status]} {run.status}
      </span>
    </div>

    {#if run.error}
      <div class="run-error">{run.error}</div>
    {/if}

    <div class="block-runs">
      {#each run.block_runs || run.node_runs as br}
        <div class="block-run" class:current={br.status === 'running'}>
          <div class="block-header">
            <span class="status-icon" style="color: {STATUS_COLORS[br.status]}">
              {STATUS_ICONS[br.status]}
            </span>
            <span class="title">{br.block_title || br.node_title}</span>
            <span class="block-status" style="color: {STATUS_COLORS[br.status]}">{br.status}</span>
          </div>

          <!-- Terminal link for running blocks -->
          {#if br.status === 'running' && br.tmux_session}
            <div class="tmux-links">
              <div class="tmux-link">
                <code>{getTmuxCommand(br.tmux_session)}</code>
                <button on:click={() => copyToClipboard(getTmuxCommand(br.tmux_session))}>Copy</button>
              </div>
            </div>
          {/if}

          <!-- Win Conditions -->
          {#if br.condition_results?.length > 0}
            <div class="conditions">
              <div class="conditions-header">Win Conditions:</div>
              {#each br.condition_results as cond}
                <div class="condition" style="border-color: {getConditionColor(cond)}">
                  <span class="cond-icon" style="color: {getConditionColor(cond)}">{getConditionIcon(cond)}</span>
                  <span class="cond-type">{cond.type}</span>
                  <span class="cond-details">{cond.details || ''}</span>

                  {#if cond.type === 'human' && cond.pending && br.pending_review}
                    <div class="review-actions">
                      <button class="approve-btn" on:click={() => submitReview(br.pending_review, 'approve')}>Approve</button>
                      <button class="reject-btn" on:click={() => submitReview(br.pending_review, 'reject')}>Reject</button>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          <!-- Deliverables -->
          {#if br.deliverables?.length > 0}
            <div class="deliverables">
              {#each br.deliverables as d}
                <a
                  href={d.url || '#'}
                  target="_blank"
                  rel="noopener"
                  class="deliverable"
                  class:file={d.type === 'file'}
                >
                  <span class="icon">{getDeliverableIcon(d.type)}</span>
                  {d.url || d.path}
                </a>
              {/each}
            </div>
          {/if}

          <!-- Output -->
          {#if br.output}
            <details class="output">
              <summary>Output</summary>
              <pre>{br.output}</pre>
            </details>
          {/if}

          {#if br.error}
            <div class="block-error">{br.error}</div>
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
    display: flex;
    align-items: center;
    gap: 0.375rem;
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

  .block-runs {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .block-run {
    background: #111;
    border: 1px solid #222;
    border-radius: 8px;
    overflow: hidden;
  }

  .block-run.current {
    border-color: #eab308;
    box-shadow: 0 0 20px rgba(234, 179, 8, 0.1);
  }

  .block-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: #0a0a0a;
    border-bottom: 1px solid #222;
  }

  .status-icon {
    font-size: 1rem;
  }

  .title {
    flex: 1;
    font-weight: 500;
  }

  .block-status {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .tmux-links {
    border-bottom: 1px solid #222;
  }

  .tmux-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: #1a1a1a;
  }

  .tmux-link code {
    flex: 1;
    font-size: 0.7rem;
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
    font-size: 0.625rem;
    cursor: pointer;
  }

  .tmux-link button:hover {
    background: #3b82f6;
  }

  .conditions {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #222;
    background: #0d0d0d;
  }

  .conditions-header {
    font-size: 0.75rem;
    color: #666;
    margin-bottom: 0.5rem;
    font-weight: 600;
  }

  .condition {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.5rem;
    background: #111;
    border-left: 2px solid;
    border-radius: 4px;
    margin-bottom: 0.375rem;
  }

  .cond-icon {
    font-size: 0.875rem;
    font-weight: bold;
  }

  .cond-type {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    background: #222;
    border-radius: 4px;
    color: #888;
    font-weight: 600;
    text-transform: uppercase;
  }

  .cond-details {
    flex: 1;
    font-size: 0.75rem;
    color: #999;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .review-actions {
    display: flex;
    gap: 0.5rem;
    margin-left: auto;
  }

  .approve-btn, .reject-btn {
    padding: 0.375rem 0.75rem;
    border: none;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
  }

  .approve-btn {
    background: #22c55e;
    color: #000;
  }

  .approve-btn:hover {
    background: #16a34a;
  }

  .reject-btn {
    background: #dc2626;
    color: #fff;
  }

  .reject-btn:hover {
    background: #b91c1c;
  }

  .deliverables {
    padding: 0.75rem 1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    border-bottom: 1px solid #222;
  }

  .deliverable {
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

  .deliverable:hover {
    background: #222;
  }

  .deliverable.file {
    color: #a78bfa;
  }

  .deliverable .icon {
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

  .block-error {
    padding: 0.75rem 1rem;
    color: #ef4444;
    font-size: 0.875rem;
  }
</style>
