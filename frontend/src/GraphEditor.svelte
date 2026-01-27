<script>
  import { createEventDispatcher, onMount } from 'svelte'
  import ContextPool from './ContextPool.svelte'
  import NodeEditor from './NodeEditor.svelte'

  export let graphId

  const dispatch = createEventDispatcher()

  let graph = null
  let loading = true
  let selectedNode = null
  let creatingEdge = null  // node id we're drawing from
  let showContextPool = true

  // Form state (deprecated - now using modal)
  let newTitle = ''
  let newPrompt = ''
  let newAgent = 'claude'

  // Node editor modal
  let showNodeEditor = false
  let editingNode = null  // null for new, node object for editing

  // Drag state
  let dragging = null
  let dragOffset = { x: 0, y: 0 }

  // Context drag state
  let dragOverNode = null

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

  async function createNode() {
    if (!newTitle.trim() || !newPrompt.trim()) return

    // Position new node
    const pos_x = 100 + (graph.nodes.length % 3) * 200
    const pos_y = 100 + Math.floor(graph.nodes.length / 3) * 150

    const res = await fetch(`/graphs/${graphId}/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle.trim(),
        prompt: newPrompt.trim(),
        agent_type: newAgent,
        pos_x, pos_y
      })
    })

    const node = await res.json()
    graph.nodes = [...graph.nodes, node]

    newTitle = ''
    newPrompt = ''
    selectedNode = node
  }

  async function deleteNode(id) {
    await fetch(`/nodes/${id}`, { method: 'DELETE' })
    graph.nodes = graph.nodes.filter(n => n.id !== id)
    graph.edges = graph.edges.filter(e => e.parent_id !== id && e.child_id !== id)
    if (selectedNode?.id === id) selectedNode = null
  }

  async function createEdge(parentId, childId) {
    if (parentId === childId) return
    // Check if edge already exists
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

  async function updateNodePosition(node) {
    await fetch(`/nodes/${node.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pos_x: node.pos_x, pos_y: node.pos_y })
    })
  }

  function handleNodeClick(node, e) {
    e.stopPropagation()
    if (creatingEdge) {
      createEdge(creatingEdge, node.id)
      creatingEdge = null
    } else {
      selectedNode = node
    }
  }

  function startEdge(node, e) {
    e.stopPropagation()
    creatingEdge = node.id
  }

  function handleMouseDown(node, e) {
    dragging = node
    dragOffset = {
      x: e.clientX - node.pos_x,
      y: e.clientY - node.pos_y
    }
  }

  function handleMouseMove(e) {
    if (!dragging) return
    dragging.pos_x = e.clientX - dragOffset.x
    dragging.pos_y = e.clientY - dragOffset.y
    graph.nodes = graph.nodes  // trigger reactivity
  }

  function handleMouseUp() {
    if (dragging) {
      updateNodePosition(dragging)
      dragging = null
    }
  }

  function handleCanvasClick() {
    creatingEdge = null
    selectedNode = null
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
    // Update node context counts
    graph.nodes = graph.nodes.map(n => ({...n, context_count: n.context_count}))
  }

  async function handleContextRefresh() {
    await loadGraph()
  }

  function handleNodeDragOver(e, node) {
    const data = e.dataTransfer.types.includes('application/json')
    if (data) {
      e.preventDefault()
      dragOverNode = node.id
    }
  }

  function handleNodeDragLeave(e) {
    dragOverNode = null
  }

  async function handleNodeDrop(e, node) {
    e.preventDefault()
    dragOverNode = null

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      if (data.type === 'context') {
        await attachContext(node.id, data.id)
      }
    } catch {}
  }

  async function attachContext(nodeId, contextId) {
    const res = await fetch(`/nodes/${nodeId}/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_item_id: contextId })
    })

    if (res.ok) {
      // Update node context count
      graph.nodes = graph.nodes.map(n =>
        n.id === nodeId ? {...n, context_count: (n.context_count || 0) + 1} : n
      )
    }
  }

  async function detachContext(nodeId, contextId) {
    const res = await fetch(`/nodes/${nodeId}/context/${contextId}`, { method: 'DELETE' })
    if (res.ok) {
      graph.nodes = graph.nodes.map(n =>
        n.id === nodeId ? {...n, context_count: Math.max(0, (n.context_count || 1) - 1)} : n
      )
      if (selectedNode?.id === nodeId) {
        await loadNodeContexts()
      }
    }
  }

  let selectedNodeContexts = []

  async function loadNodeContexts() {
    if (!selectedNode) {
      selectedNodeContexts = []
      return
    }
    const res = await fetch(`/nodes/${selectedNode.id}/context`)
    if (res.ok) {
      selectedNodeContexts = await res.json()
    }
  }

  $: if (selectedNode) loadNodeContexts()

  // Node editor handlers
  function openNewNodeEditor() {
    editingNode = null
    showNodeEditor = true
  }

  function openEditNodeEditor(node) {
    editingNode = node
    showNodeEditor = true
  }

  function handleNodeEditorSave(e) {
    const savedNode = e.detail
    if (editingNode) {
      // Update existing node in list
      graph.nodes = graph.nodes.map(n => n.id === savedNode.id ? savedNode : n)
      selectedNode = savedNode
    } else {
      // Add new node to list
      graph.nodes = [...graph.nodes, savedNode]
      selectedNode = savedNode
    }
    showNodeEditor = false
    editingNode = null
  }

  function handleNodeEditorCancel() {
    showNodeEditor = false
    editingNode = null
  }

  function handleNodeDoubleClick(node, e) {
    e.stopPropagation()
    openEditNodeEditor(node)
  }

  function getEdgePath(edge) {
    const parent = graph.nodes.find(n => n.id === edge.parent_id)
    const child = graph.nodes.find(n => n.id === edge.child_id)
    if (!parent || !child) return ''

    const x1 = parent.pos_x + 80
    const y1 = parent.pos_y + 25
    const x2 = child.pos_x + 80
    const y2 = child.pos_y + 25

    // Bezier curve
    const cx = (x1 + x2) / 2
    return `M ${x1} ${y1} Q ${cx} ${y1}, ${cx} ${(y1+y2)/2} Q ${cx} ${y2}, ${x2} ${y2}`
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

      {#each graph.nodes as node}
        <div
          class="node"
          class:selected={selectedNode?.id === node.id}
          class:edge-source={creatingEdge === node.id}
          class:drag-over={dragOverNode === node.id}
          style="left: {node.pos_x}px; top: {node.pos_y}px; border-color: {AGENT_COLORS[node.agent_type]}"
          on:click={(e) => handleNodeClick(node, e)}
          on:dblclick={(e) => handleNodeDoubleClick(node, e)}
          on:mousedown={(e) => handleMouseDown(node, e)}
          on:dragover={(e) => handleNodeDragOver(e, node)}
          on:dragleave={handleNodeDragLeave}
          on:drop={(e) => handleNodeDrop(e, node)}
        >
          <div class="node-header">
            <span class="agent-badge" style="background: {AGENT_COLORS[node.agent_type]}">{node.agent_type}</span>
            <span class="title">{node.title}</span>
            {#if node.context_count > 0}
              <span class="context-badge" title="{node.context_count} contexts attached">{node.context_count}</span>
            {/if}
          </div>
          <button class="edge-btn" on:click={(e) => startEdge(node, e)} title="Draw edge">→</button>
        </div>
      {/each}

      {#if creatingEdge}
        <div class="edge-hint">Click another node to connect</div>
      {/if}
    </div>

    <div class="sidebar">
      <div class="section">
        <button class="add-node-btn" on:click={openNewNodeEditor}>
          + Add Node
        </button>
      </div>

      {#if selectedNode}
        <div class="section">
          <h3>Selected: {selectedNode.title}</h3>
          <p class="agent-type" style="color: {AGENT_COLORS[selectedNode.agent_type]}">{selectedNode.agent_type}</p>
          <pre class="prompt">{selectedNode.prompt}</pre>

          {#if selectedNodeContexts.length > 0}
            <div class="attached-contexts">
              <p class="label">Attached Contexts:</p>
              {#each selectedNodeContexts as ctx}
                <div class="attached-context">
                  <span class="ctx-name">{ctx.context_name}</span>
                  <button class="remove-ctx" on:click={() => detachContext(selectedNode.id, ctx.context_item_id)}>×</button>
                </div>
              {/each}
            </div>
          {/if}

          <div class="node-actions">
            <button class="edit-btn" on:click={() => openEditNodeEditor(selectedNode)}>Edit</button>
            <button class="danger" on:click={() => deleteNode(selectedNode.id)}>Delete</button>
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
        <button class="run-btn" on:click={runGraph} disabled={graph.nodes.length === 0}>
          ▶ Run DAG
        </button>
      </div>
    </div>
  </div>

  {#if showNodeEditor}
    <NodeEditor
      node={editingNode}
      {graphId}
      contextItems={graph.context_items || []}
      on:save={handleNodeEditorSave}
      on:cancel={handleNodeEditorCancel}
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

  .node {
    position: absolute;
    width: 160px;
    padding: 0.5rem;
    background: #111;
    border: 2px solid #333;
    border-radius: 8px;
    cursor: grab;
    user-select: none;
  }

  .node:active {
    cursor: grabbing;
  }

  .node.selected {
    box-shadow: 0 0 0 2px #3b82f6;
  }

  .node.edge-source {
    box-shadow: 0 0 0 2px #22c55e;
  }

  .node.drag-over {
    box-shadow: 0 0 0 2px #8b5cf6;
    background: #1a1a2e;
  }

  .node-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .agent-badge {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    color: #000;
    font-weight: 600;
    text-transform: uppercase;
  }

  .title {
    font-size: 0.875rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .context-badge {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    background: #8b5cf6;
    color: #fff;
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

  .section input, .section textarea {
    width: 100%;
    padding: 0.5rem;
    background: #0a0a0a;
    border: 1px solid #333;
    border-radius: 4px;
    color: #fff;
    font-size: 0.875rem;
    margin-bottom: 0.5rem;
    resize: none;
  }

  .section input:focus, .section textarea:focus {
    outline: none;
    border-color: #3b82f6;
  }

  .agent-select {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
  }

  .agent-select button {
    flex: 1;
    padding: 0.375rem;
    background: #0a0a0a;
    border: 1px solid #333;
    border-radius: 4px;
    color: #888;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .agent-select button.active {
    background: var(--color);
    color: #000;
    border-color: var(--color);
    font-weight: 600;
  }

  .add-node-btn {
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

  .add-node-btn:hover {
    filter: brightness(1.1);
  }

  .node-actions {
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

  .agent-type {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    margin-bottom: 0.5rem;
  }

  .prompt {
    font-size: 0.75rem;
    background: #0a0a0a;
    padding: 0.5rem;
    border-radius: 4px;
    margin-bottom: 0.75rem;
    white-space: pre-wrap;
    max-height: 150px;
    overflow-y: auto;
    color: #999;
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
