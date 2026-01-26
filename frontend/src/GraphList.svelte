<script>
  import { createEventDispatcher, onMount } from 'svelte'

  const dispatch = createEventDispatcher()

  let graphs = []
  let newName = ''
  let loading = true

  onMount(async () => {
    await loadGraphs()
  })

  async function loadGraphs() {
    loading = true
    const res = await fetch('/graphs')
    graphs = await res.json()
    loading = false
  }

  async function createGraph() {
    if (!newName.trim()) return
    const res = await fetch('/graphs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() })
    })
    const graph = await res.json()
    newName = ''
    dispatch('select', graph.id)
  }

  async function deleteGraph(id, e) {
    e.stopPropagation()
    if (!confirm('Delete this graph?')) return
    await fetch(`/graphs/${id}`, { method: 'DELETE' })
    await loadGraphs()
  }
</script>

<div class="container">
  <div class="create-form">
    <input
      type="text"
      placeholder="New graph name..."
      bind:value={newName}
      on:keydown={(e) => e.key === 'Enter' && createGraph()}
    />
    <button on:click={createGraph}>Create</button>
  </div>

  {#if loading}
    <p class="loading">Loading...</p>
  {:else if graphs.length === 0}
    <p class="empty">No graphs yet. Create one above.</p>
  {:else}
    <div class="graph-list">
      {#each graphs as graph}
        <div class="graph-card" on:click={() => dispatch('select', graph.id)}>
          <span class="name">{graph.name}</span>
          <span class="date">{new Date(graph.created_at).toLocaleDateString()}</span>
          <button class="delete" on:click={(e) => deleteGraph(graph.id, e)}>×</button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .container {
    max-width: 600px;
    margin: 2rem auto;
    padding: 0 1rem;
  }

  .create-form {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  input {
    flex: 1;
    padding: 0.75rem 1rem;
    border: 1px solid #333;
    border-radius: 6px;
    background: #111;
    color: #fff;
    font-size: 1rem;
  }

  input:focus {
    outline: none;
    border-color: #3b82f6;
  }

  button {
    padding: 0.75rem 1.5rem;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
  }

  button:hover {
    background: #2563eb;
  }

  .loading, .empty {
    text-align: center;
    color: #666;
    padding: 2rem;
  }

  .graph-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .graph-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: #111;
    border: 1px solid #222;
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .graph-card:hover {
    border-color: #3b82f6;
  }

  .name {
    flex: 1;
    font-weight: 500;
  }

  .date {
    color: #666;
    font-size: 0.875rem;
  }

  .delete {
    padding: 0.25rem 0.5rem;
    background: transparent;
    color: #666;
    font-size: 1.25rem;
    line-height: 1;
  }

  .delete:hover {
    background: #dc2626;
    color: #fff;
  }
</style>
