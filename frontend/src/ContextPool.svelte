<script>
  import { createEventDispatcher } from 'svelte'

  export let graphId
  export let contextItems = []

  const dispatch = createEventDispatcher()

  let showAddForm = false
  let newName = ''
  let newType = 'file'
  let configPath = ''
  let configUrl = ''
  let configKeyFiles = ''

  const TYPE_ICONS = {
    file: 'file',
    repo: 'folder',
    github: 'git-branch',
    url: 'link',
    image: 'image'
  }

  const TYPE_COLORS = {
    file: '#8b5cf6',
    repo: '#22c55e',
    github: '#f97316',
    url: '#3b82f6',
    image: '#ec4899'
  }

  async function addContext() {
    if (!newName.trim()) return

    let config = {}
    if (newType === 'file' || newType === 'image') {
      config = { path: configPath }
    } else if (newType === 'repo') {
      config = { path: configPath, key_files: configKeyFiles.split(',').map(f => f.trim()).filter(f => f) }
    } else if (newType === 'github' || newType === 'url') {
      config = { url: configUrl }
    }

    const res = await fetch(`/graphs/${graphId}/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, context_type: newType, config })
    })

    if (res.ok) {
      const item = await res.json()
      dispatch('add', item)
      resetForm()
    }
  }

  async function deleteContext(id) {
    const res = await fetch(`/context/${id}`, { method: 'DELETE' })
    if (res.ok) {
      dispatch('delete', id)
    }
  }

  async function refreshContext(id) {
    const res = await fetch(`/context/${id}/refresh`, { method: 'POST' })
    if (res.ok) {
      dispatch('refresh')
    }
  }

  function resetForm() {
    showAddForm = false
    newName = ''
    newType = 'file'
    configPath = ''
    configUrl = ''
    configKeyFiles = ''
  }

  function handleDragStart(e, item) {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'context', id: item.id, name: item.name }))
    e.dataTransfer.effectAllowed = 'link'
  }
</script>

<div class="context-pool">
  <div class="header">
    <h3>Context Pool</h3>
    <button class="add-btn" on:click={() => showAddForm = !showAddForm}>
      {showAddForm ? '×' : '+'}
    </button>
  </div>

  {#if showAddForm}
    <div class="add-form">
      <input type="text" placeholder="Context name..." bind:value={newName} />

      <div class="type-select">
        {#each ['file', 'repo', 'github', 'url', 'image'] as type}
          <button
            class:active={newType === type}
            style="--color: {TYPE_COLORS[type]}"
            on:click={() => newType = type}
          >{type}</button>
        {/each}
      </div>

      {#if newType === 'file' || newType === 'repo' || newType === 'image'}
        <input type="text" placeholder="Path..." bind:value={configPath} />
        {#if newType === 'repo'}
          <input type="text" placeholder="Key files (comma-separated)..." bind:value={configKeyFiles} />
        {/if}
      {:else}
        <input type="text" placeholder="URL..." bind:value={configUrl} />
      {/if}

      <button class="submit-btn" on:click={addContext}>Add Context</button>
    </div>
  {/if}

  <div class="items">
    {#each contextItems as item}
      <div
        class="context-item"
        style="border-left-color: {TYPE_COLORS[item.context_type]}"
        draggable="true"
        on:dragstart={(e) => handleDragStart(e, item)}
      >
        <div class="item-header">
          <span class="type-badge" style="background: {TYPE_COLORS[item.context_type]}">{item.context_type}</span>
          <span class="name">{item.name}</span>
        </div>
        <div class="item-actions">
          <button class="icon-btn" on:click={() => refreshContext(item.id)} title="Refresh">↻</button>
          <button class="icon-btn danger" on:click={() => deleteContext(item.id)} title="Delete">×</button>
        </div>
      </div>
    {:else}
      <p class="empty">Drag context onto nodes to attach</p>
    {/each}
  </div>
</div>

<style>
  .context-pool {
    border-bottom: 1px solid #222;
    background: #0d0d0d;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #222;
  }

  .header h3 {
    font-size: 0.75rem;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .add-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    background: #222;
    border: 1px solid #333;
    border-radius: 4px;
    color: #888;
    font-size: 1rem;
    cursor: pointer;
  }

  .add-btn:hover {
    background: #3b82f6;
    color: #fff;
    border-color: #3b82f6;
  }

  .add-form {
    padding: 0.75rem;
    border-bottom: 1px solid #222;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .add-form input {
    width: 100%;
    padding: 0.5rem;
    background: #0a0a0a;
    border: 1px solid #333;
    border-radius: 4px;
    color: #fff;
    font-size: 0.75rem;
  }

  .type-select {
    display: flex;
    gap: 0.25rem;
  }

  .type-select button {
    flex: 1;
    padding: 0.25rem;
    background: #0a0a0a;
    border: 1px solid #333;
    border-radius: 4px;
    color: #666;
    font-size: 0.625rem;
    cursor: pointer;
  }

  .type-select button.active {
    background: var(--color);
    color: #000;
    border-color: var(--color);
    font-weight: 600;
  }

  .submit-btn {
    padding: 0.5rem;
    background: #3b82f6;
    border: none;
    border-radius: 4px;
    color: #fff;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .items {
    padding: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .empty {
    font-size: 0.75rem;
    color: #555;
    text-align: center;
    padding: 1rem 0;
  }

  .context-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem;
    background: #111;
    border: 1px solid #222;
    border-left-width: 3px;
    border-radius: 4px;
    margin-bottom: 0.5rem;
    cursor: grab;
  }

  .context-item:active {
    cursor: grabbing;
  }

  .item-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    overflow: hidden;
  }

  .type-badge {
    font-size: 0.5rem;
    padding: 0.125rem 0.25rem;
    border-radius: 2px;
    color: #000;
    font-weight: 600;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .name {
    font-size: 0.75rem;
    color: #ccc;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-actions {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .icon-btn {
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: 1px solid #333;
    border-radius: 3px;
    color: #666;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .icon-btn:hover {
    background: #222;
    color: #fff;
  }

  .icon-btn.danger:hover {
    background: #dc2626;
    border-color: #dc2626;
  }
</style>
