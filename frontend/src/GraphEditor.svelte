<script>
  import { createEventDispatcher, onMount } from 'svelte'

  export let graphId

  const dispatch = createEventDispatcher()

  let graph = null
  let loading = true
  let selectedNode = null
  let creatingEdge = null  // node id we're drawing from

  // Form state
  let newTitle = ''
  let newPrompt = ''
  let newAgent = 'claude'

  // Drag state
  let dragging = null
  let dragOffset = { x: 0, y: 0 }

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
          style="left: {node.pos_x}px; top: {node.pos_y}px; border-color: {AGENT_COLORS[node.agent_type]}"
          on:click={(e) => handleNodeClick(node, e)}
          on:mousedown={(e) => handleMouseDown(node, e)}
        >
          <div class="node-header">
            <span class="agent-badge" style="background: {AGENT_COLORS[node.agent_type]}">{node.agent_type}</span>
            <span class="title">{node.title}</span>
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
        <h3>New Node</h3>
        <input type="text" placeholder="Title" bind:value={newTitle} />
        <textarea placeholder="Prompt..." bind:value={newPrompt} rows="4"></textarea>
        <div class="agent-select">
          {#each ['claude', 'codex', 'gemini'] as agent}
            <button
              class:active={newAgent === agent}
              style="--color: {AGENT_COLORS[agent]}"
              on:click={() => newAgent = agent}
            >{agent}</button>
          {/each}
        </div>
        <button class="primary" on:click={createNode}>Add Node</button>
      </div>

      {#if selectedNode}
        <div class="section">
          <h3>Selected: {selectedNode.title}</h3>
          <p class="agent-type" style="color: {AGENT_COLORS[selectedNode.agent_type]}">{selectedNode.agent_type}</p>
          <pre class="prompt">{selectedNode.prompt}</pre>
          <button class="danger" on:click={() => deleteNode(selectedNode.id)}>Delete Node</button>
        </div>
      {/if}

      <div class="section run-section">
        <button class="run-btn" on:click={runGraph} disabled={graph.nodes.length === 0}>
          ▶ Run DAG
        </button>
      </div>
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

  .editor {
    display: flex;
    flex: 1;
    overflow: hidden;
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

  .section button.primary {
    width: 100%;
    padding: 0.5rem;
    background: #3b82f6;
    border: none;
    border-radius: 4px;
    color: #fff;
    cursor: pointer;
  }

  .section button.primary:hover {
    background: #2563eb;
  }

  .section button.danger {
    width: 100%;
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
