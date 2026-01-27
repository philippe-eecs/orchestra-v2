<script>
  import { createEventDispatcher, onMount } from 'svelte'
  import ContextPool from './ContextPool.svelte'
  import BlockEditor from './BlockEditor.svelte'

  export let graphId

  const dispatch = createEventDispatcher()

  let graph = null
  let loading = true
  let selectedBlock = null
  let creatingEdge = null
  let showContextPool = true

  // Block editor modal
  let showBlockEditor = false
  let editingBlock = null

  // Drag state
  let dragging = null
  let dragOffset = { x: 0, y: 0 }

  // Context drag state
  let dragOverBlock = null

  const AGENT_COLORS = {
    claude: '#f97316',
    codex: '#22c55e',
    gemini: '#3b82f6'
  }

  onMount(async () => {
    await loadGraph()
  })

  async function loadGraph() {
    loading = true
    const res = await fetch(`/graphs/${graphId}`)
    graph = await res.json()
    loading = false
  }

  function getBlockAgentTypes(block) {
    const agents = block.agents || []
    if (agents.length === 0) return ['claude']
    return [...new Set(agents.map(a => a.agent_type))]
  }

  function getBlockPrimaryColor(block) {
    const types = getBlockAgentTypes(block)
    return AGENT_COLORS[types[0]] || '#666'
  }

  async function deleteBlock(id) {
    await fetch(`/blocks/${id}`, { method: 'DELETE' })
    graph.blocks = graph.blocks.filter(b => b.id !== id)
    graph.edges = graph.edges.filter(e => e.parent_id !== id && e.child_id !== id)
    if (selectedBlock?.id === id) selectedBlock = null
  }

  async function createEdge(parentId, childId) {
    if (parentId === childId) return
    if (graph.edges.some(e => e.parent_id === parentId && e.child_id === childId)) return

    const res = await fetch(`/graphs/${graphId}/edges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: parentId, child_id: childId })
    })

    const edge = await res.json()
    graph.edges = [...graph.edges, edge]
  }

  async function deleteEdge(id) {
    await fetch(`/edges/${id}`, { method: 'DELETE' })
    graph.edges = graph.edges.filter(e => e.id !== id)
  }

  async function updateBlockPosition(block) {
    await fetch(`/blocks/${block.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pos_x: block.pos_x, pos_y: block.pos_y })
    })
  }

  function handleBlockClick(block, e) {
    e.stopPropagation()
    if (creatingEdge) {
      createEdge(creatingEdge, block.id)
      creatingEdge = null
    } else {
      selectedBlock = block
    }
  }

  function startEdge(block, e) {
    e.stopPropagation()
    creatingEdge = block.id
  }

  function handleMouseDown(block, e) {
    dragging = block
    dragOffset = {
      x: e.clientX - block.pos_x,
      y: e.clientY - block.pos_y
    }
  }

  function handleMouseMove(e) {
    if (!dragging) return
    dragging.pos_x = e.clientX - dragOffset.x
    dragging.pos_y = e.clientY - dragOffset.y
    graph.blocks = graph.blocks
  }

  function handleMouseUp() {
    if (dragging) {
      updateBlockPosition(dragging)
      dragging = null
    }
  }

  function handleCanvasClick() {
    creatingEdge = null
    selectedBlock = null
  }

  async function runGraph() {
    const res = await fetch(`/graphs/${graphId}/run`, { method: 'POST' })
    const { run_id } = await res.json()
    dispatch('run', run_id)
  }

  async function exportGraph() {
    const res = await fetch(`/graphs/${graphId}/export`)
    if (res.ok) {
      const data = await res.json()
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${graph.name || 'graph'}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  let showImport = false
  let importJson = ''

  async function importGraph() {
    if (!importJson.trim()) return

    try {
      const data = JSON.parse(importJson)
      const res = await fetch('/graphs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      if (res.ok) {
        const result = await res.json()
        window.location.hash = `graph/${result.id}`
      }
    } catch (e) {
      alert('Invalid JSON')
    }
  }

  // Context handling
  function handleContextAdd(e) {
    graph.context_items = [...(graph.context_items || []), e.detail]
  }

  function handleContextDelete(e) {
    graph.context_items = (graph.context_items || []).filter(c => c.id !== e.detail)
  }

  async function handleContextRefresh() {
    await loadGraph()
  }

  function handleBlockDragOver(e, block) {
    const data = e.dataTransfer.types.includes('application/json')
    if (data) {
      e.preventDefault()
      dragOverBlock = block.id
    }
  }

  function handleBlockDragLeave(e) {
    dragOverBlock = null
  }

  async function handleBlockDrop(e, block) {
    e.preventDefault()
    dragOverBlock = null

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      if (data.type === 'context') {
        await attachContext(block.id, data.id)
      }
    } catch {}
  }

  async function attachContext(blockId, contextId) {
    const res = await fetch(`/blocks/${blockId}/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_item_id: contextId })
    })

    if (res.ok) {
      graph.blocks = graph.blocks.map(b =>
        b.id === blockId ? {...b, context_count: (b.context_count || 0) + 1} : b
      )
    }
  }

  async function detachContext(blockId, contextId) {
    const res = await fetch(`/blocks/${blockId}/context/${contextId}`, { method: 'DELETE' })
    if (res.ok) {
      graph.blocks = graph.blocks.map(b =>
        b.id === blockId ? {...b, context_count: Math.max(0, (b.context_count || 1) - 1)} : b
      )
      if (selectedBlock?.id === blockId) {
        await loadBlockContexts()
      }
    }
  }

  let selectedBlockContexts = []

  async function loadBlockContexts() {
    if (!selectedBlock) {
      selectedBlockContexts = []
      return
    }
    const res = await fetch(`/blocks/${selectedBlock.id}/context`)
    if (res.ok) {
      selectedBlockContexts = await res.json()
    }
  }

  $: if (selectedBlock) loadBlockContexts()

  // Block editor handlers
  function openNewBlockEditor() {
    editingBlock = null
    showBlockEditor = true
  }

  function openEditBlockEditor(block) {
    editingBlock = block
    showBlockEditor = true
  }

  function handleBlockEditorSave(e) {
    const savedBlock = e.detail
    if (editingBlock) {
      graph.blocks = graph.blocks.map(b => b.id === savedBlock.id ? savedBlock : b)
      selectedBlock = savedBlock
    } else {
      graph.blocks = [...graph.blocks, savedBlock]
      selectedBlock = savedBlock
    }
    showBlockEditor = false
    editingBlock = null
  }

  function handleBlockEditorCancel() {
    showBlockEditor = false
    editingBlock = null
  }

  function handleBlockDoubleClick(block, e) {
    e.stopPropagation()
    openEditBlockEditor(block)
  }

  function getEdgePath(edge) {
    const parent = graph.blocks.find(b => b.id === edge.parent_id)
    const child = graph.blocks.find(b => b.id === edge.child_id)
    if (!parent || !child) return ''

    const x1 = parent.pos_x + 90
    const y1 = parent.pos_y + 30
    const x2 = child.pos_x + 90
    const y2 = child.pos_y + 30

    const cx = (x1 + x2) / 2
    return `M ${x1} ${y1} Q ${cx} ${y1}, ${cx} ${(y1+y2)/2} Q ${cx} ${y2}, ${x2} ${y2}`
  }

  function getConditionSummary(block) {
    const conditions = block.win_conditions || []
    if (conditions.length === 0) return null
    return conditions.map(c => c.type[0].toUpperCase()).join('')
  }
</script>

<svelte:window on:mousemove={handleMouseMove} on:mouseup={handleMouseUp} />

{#if loading}
  <div class="loading">Loading...</div>
{:else}
  <div class="editor">
    <div class="left-panel">
      <button class="toggle-context" on:click={() => showContextPool = !showContextPool}>
        {showContextPool ? '◀' : '▶'} Context
      </button>
      {#if showContextPool}
        <ContextPool
          {graphId}
          contextItems={graph.context_items || []}
          on:add={handleContextAdd}
          on:delete={handleContextDelete}
          on:refresh={handleContextRefresh}
        />
      {/if}
    </div>
    <div class="canvas" on:click={handleCanvasClick}>
      <svg class="edges">
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
            <path d="M0,0 L0,6 L9,3 z" fill="#444" />
          </marker>
        </defs>
        {#each graph.edges as edge}
          <path
            d={getEdgePath(edge)}
            stroke="#444"
            stroke-width="2"
            fill="none"
            marker-end="url(#arrow)"
            on:click|stopPropagation={() => deleteEdge(edge.id)}
            class="edge"
          />
        {/each}
      </svg>

      {#each graph.blocks as block}
        <div
          class="block"
          class:selected={selectedBlock?.id === block.id}
          class:edge-source={creatingEdge === block.id}
          class:drag-over={dragOverBlock === block.id}
          style="left: {block.pos_x}px; top: {block.pos_y}px; border-color: {getBlockPrimaryColor(block)}"
          on:click={(e) => handleBlockClick(block, e)}
          on:dblclick={(e) => handleBlockDoubleClick(block, e)}
          on:mousedown={(e) => handleMouseDown(block, e)}
          on:dragover={(e) => handleBlockDragOver(e, block)}
          on:dragleave={handleBlockDragLeave}
          on:drop={(e) => handleBlockDrop(e, block)}
        >
          <div class="block-header">
            <div class="agent-badges">
              {#each getBlockAgentTypes(block) as agentType}
                <span class="agent-badge" style="background: {AGENT_COLORS[agentType]}">{agentType}</span>
              {/each}
              {#if (block.agents?.length || 0) > 1}
                <span class="multi-badge">×{block.agents.length}</span>
              {/if}
            </div>
            <span class="title">{block.title}</span>
            <div class="badges">
              {#if block.context_count > 0}
                <span class="context-badge" title="{block.context_count} contexts">{block.context_count}</span>
              {/if}
              {#if getConditionSummary(block)}
                <span class="condition-badge" title="Win conditions: {(block.win_conditions || []).map(c => c.type).join(', ')}">{getConditionSummary(block)}</span>
              {/if}
            </div>
          </div>
          <button class="edge-btn" on:click={(e) => startEdge(block, e)} title="Draw edge">→</button>
        </div>
      {/each}

      {#if creatingEdge}
        <div class="edge-hint">Click another block to connect</div>
      {/if}
    </div>

    <div class="sidebar">
      <div class="section">
        <button class="add-block-btn" on:click={openNewBlockEditor}>
          + Add Block
        </button>
      </div>

      {#if selectedBlock}
        <div class="section">
          <h3>Selected: {selectedBlock.title}</h3>

          <div class="block-agents">
            {#each (selectedBlock.agents || []) as agent}
              <div class="agent-item">
                <span class="agent-badge" style="background: {AGENT_COLORS[agent.agent_type]}">{agent.agent_type}</span>
                <span class="role">{agent.role}</span>
              </div>
            {/each}
          </div>

          {#if selectedBlock.win_conditions?.length > 0}
            <div class="block-conditions">
              <p class="label">Win Conditions:</p>
              {#each selectedBlock.win_conditions as cond}
                <div class="cond-item">
                  <span class="cond-type">{cond.type}</span>
                  <span class="cond-info">
                    {#if cond.type === 'test'}
                      {cond.command}
                    {:else if cond.type === 'human'}
                      Human review
                    {:else if cond.type === 'llm_judge'}
                      {cond.agent} judge
                    {:else if cond.type === 'metric'}
                      {cond.comparison} {cond.threshold}
                    {/if}
                  </span>
                </div>
              {/each}
            </div>
          {/if}

          {#if selectedBlockContexts.length > 0}
            <div class="attached-contexts">
              <p class="label">Attached Contexts:</p>
              {#each selectedBlockContexts as ctx}
                <div class="attached-context">
                  <span class="ctx-name">{ctx.context_name}</span>
                  <button class="remove-ctx" on:click={() => detachContext(selectedBlock.id, ctx.context_item_id)}>×</button>
                </div>
              {/each}
            </div>
          {/if}

          <div class="block-actions">
            <button class="edit-btn" on:click={() => openEditBlockEditor(selectedBlock)}>Edit</button>
            <button class="danger" on:click={() => deleteBlock(selectedBlock.id)}>Delete</button>
          </div>
        </div>
      {/if}

      <div class="section export-section">
        <div class="export-actions">
          <button class="export-btn" on:click={exportGraph}>Export</button>
          <button class="import-btn" on:click={() => showImport = !showImport}>Import</button>
        </div>
        {#if showImport}
          <textarea
            class="import-input"
            placeholder="Paste graph JSON..."
            bind:value={importJson}
            rows="4"
          ></textarea>
          <button class="import-submit" on:click={importGraph}>Import Graph</button>
        {/if}
      </div>

      <div class="section run-section">
        <button class="run-btn" on:click={runGraph} disabled={graph.blocks.length === 0}>
          ▶ Run DAG
        </button>
      </div>
    </div>
  </div>

  {#if showBlockEditor}
    <BlockEditor
      block={editingBlock}
      {graphId}
      contextItems={graph.context_items || []}
      on:save={handleBlockEditorSave}
      on:cancel={handleBlockEditorCancel}
    />
  {/if}
{/if}

<style>
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 80vh;
    color: #666;
  }

  .editor {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .left-panel {
    width: 240px;
    background: #0d0d0d;
    border-right: 1px solid #222;
    display: flex;
    flex-direction: column;
  }

  .toggle-context {
    padding: 0.5rem;
    background: transparent;
    border: none;
    border-bottom: 1px solid #222;
    color: #666;
    font-size: 0.75rem;
    cursor: pointer;
    text-align: left;
  }

  .toggle-context:hover {
    color: #fff;
    background: #111;
  }

  .canvas {
    flex: 1;
    position: relative;
    background: #0a0a0a;
    background-image: radial-gradient(#1a1a1a 1px, transparent 1px);
    background-size: 20px 20px;
    overflow: hidden;
  }

  .edges {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .edges path {
    pointer-events: stroke;
    cursor: pointer;
  }

  .edge:hover {
    stroke: #dc2626;
    stroke-width: 3;
  }

  .block {
    position: absolute;
    width: 180px;
    padding: 0.5rem;
    background: #111;
    border: 2px solid #333;
    border-radius: 8px;
    cursor: grab;
    user-select: none;
  }

  .block:active {
    cursor: grabbing;
  }

  .block.selected {
    box-shadow: 0 0 0 2px #3b82f6;
  }

  .block.edge-source {
    box-shadow: 0 0 0 2px #22c55e;
  }

  .block.drag-over {
    box-shadow: 0 0 0 2px #8b5cf6;
    background: #1a1a2e;
  }

  .block-header {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .agent-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .agent-badge {
    font-size: 0.5rem;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    color: #000;
    font-weight: 600;
    text-transform: uppercase;
  }

  .multi-badge {
    font-size: 0.5rem;
    padding: 0.125rem 0.25rem;
    background: #333;
    border-radius: 4px;
    color: #888;
  }

  .title {
    font-size: 0.875rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badges {
    display: flex;
    gap: 0.25rem;
  }

  .context-badge {
    font-size: 0.5rem;
    padding: 0.125rem 0.375rem;
    background: #8b5cf6;
    color: #fff;
    border-radius: 4px;
    font-weight: 600;
  }

  .condition-badge {
    font-size: 0.5rem;
    padding: 0.125rem 0.375rem;
    background: #22c55e;
    color: #000;
    border-radius: 4px;
    font-weight: 600;
  }

  .edge-btn {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    padding: 0;
    background: #222;
    border: 1px solid #333;
    border-radius: 50%;
    color: #888;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .edge-btn:hover {
    background: #3b82f6;
    color: #fff;
    border-color: #3b82f6;
  }

  .edge-hint {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.5rem 1rem;
    background: #22c55e;
    color: #000;
    border-radius: 6px;
    font-weight: 500;
  }

  .sidebar {
    width: 280px;
    background: #111;
    border-left: 1px solid #222;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .section {
    padding: 1rem;
    border-bottom: 1px solid #222;
  }

  .section h3 {
    font-size: 0.875rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
    color: #999;
  }

  .add-block-btn {
    width: 100%;
    padding: 0.75rem;
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .add-block-btn:hover {
    filter: brightness(1.1);
  }

  .block-agents {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 0.75rem;
  }

  .agent-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem;
    background: #0a0a0a;
    border-radius: 4px;
  }

  .agent-item .role {
    font-size: 0.75rem;
    color: #888;
  }

  .block-conditions {
    margin-bottom: 0.75rem;
  }

  .block-conditions .label {
    font-size: 0.75rem;
    color: #666;
    margin-bottom: 0.5rem;
  }

  .cond-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    background: #0a0a0a;
    border-radius: 4px;
    margin-bottom: 0.25rem;
  }

  .cond-type {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    background: #22c55e;
    color: #000;
    border-radius: 4px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .cond-info {
    font-size: 0.75rem;
    color: #888;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .block-actions {
    display: flex;
    gap: 0.5rem;
  }

  .edit-btn {
    flex: 1;
    padding: 0.5rem;
    background: #3b82f6;
    border: none;
    border-radius: 4px;
    color: #fff;
    cursor: pointer;
  }

  .edit-btn:hover {
    background: #2563eb;
  }

  .section button.danger {
    flex: 1;
    padding: 0.5rem;
    background: #dc2626;
    border: none;
    border-radius: 4px;
    color: #fff;
    cursor: pointer;
  }

  .attached-contexts {
    margin-bottom: 0.75rem;
  }

  .attached-contexts .label {
    font-size: 0.75rem;
    color: #666;
    margin-bottom: 0.5rem;
  }

  .attached-context {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.375rem 0.5rem;
    background: #1a1a2e;
    border: 1px solid #8b5cf6;
    border-radius: 4px;
    margin-bottom: 0.25rem;
  }

  .ctx-name {
    font-size: 0.75rem;
    color: #ccc;
  }

  .remove-ctx {
    width: 18px;
    height: 18px;
    padding: 0;
    background: transparent;
    border: none;
    color: #666;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .remove-ctx:hover {
    color: #dc2626;
  }

  .export-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .export-actions {
    display: flex;
    gap: 0.5rem;
  }

  .export-btn, .import-btn {
    flex: 1;
    padding: 0.5rem;
    background: #222;
    border: 1px solid #333;
    border-radius: 4px;
    color: #888;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .export-btn:hover, .import-btn:hover {
    background: #333;
    color: #fff;
  }

  .import-input {
    width: 100%;
    padding: 0.5rem;
    background: #0a0a0a;
    border: 1px solid #333;
    border-radius: 4px;
    color: #fff;
    font-size: 0.75rem;
    font-family: 'SF Mono', monospace;
    resize: none;
  }

  .import-submit {
    width: 100%;
    padding: 0.5rem;
    background: #8b5cf6;
    border: none;
    border-radius: 4px;
    color: #fff;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .import-submit:hover {
    background: #7c3aed;
  }

  .run-section {
    margin-top: auto;
    border-top: 1px solid #222;
    border-bottom: none;
  }

  .run-btn {
    width: 100%;
    padding: 1rem;
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
  }

  .run-btn:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .run-btn:disabled {
    background: #333;
    color: #666;
    cursor: not-allowed;
  }
</style>
