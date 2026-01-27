<script>
  import { createEventDispatcher, onMount } from 'svelte'

  export let node = null  // null for new node, object for editing
  export let graphId
  export let contextItems = []

  const dispatch = createEventDispatcher()

  let title = ''
  let prompt = ''
  let agentType = 'claude'

  // Assist state
  let assistDescription = ''
  let assistExplanation = ''
  let assistLoading = false

  // Attached contexts
  let attachedContexts = []

  const AGENT_COLORS = {
    claude: '#f97316',
    codex: '#22c55e',
    gemini: '#3b82f6'
  }

  onMount(() => {
    if (node) {
      title = node.title
      prompt = node.prompt
      agentType = node.agent_type
      loadAttachedContexts()
    }
  })

  async function loadAttachedContexts() {
    if (!node) return
    const res = await fetch(`/nodes/${node.id}/context`)
    if (res.ok) {
      attachedContexts = await res.json()
    }
  }

  async function handleSave() {
    if (!title.trim() || !prompt.trim()) return

    if (node) {
      // Update existing node
      await fetch(`/nodes/${node.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), prompt: prompt.trim() })
      })
      dispatch('save', { ...node, title: title.trim(), prompt: prompt.trim() })
    } else {
      // Create new node
      const res = await fetch(`/graphs/${graphId}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          prompt: prompt.trim(),
          agent_type: agentType,
          pos_x: 100 + Math.random() * 200,
          pos_y: 100 + Math.random() * 150
        })
      })
      const newNode = await res.json()
      dispatch('save', newNode)
    }
  }

  function handleCancel() {
    dispatch('cancel')
  }

  async function generatePrompt() {
    if (!assistDescription.trim()) return

    assistLoading = true
    try {
      const res = await fetch('/assist/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: assistDescription,
          agent_type: agentType
        })
      })

      if (res.ok) {
        const data = await res.json()
        prompt = data.prompt || prompt
        assistExplanation = data.explanation || ''
      }
    } finally {
      assistLoading = false
    }
  }

  async function improvePrompt() {
    if (!prompt.trim()) return

    assistLoading = true
    try {
      const res = await fetch('/assist/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          agent_type: agentType
        })
      })

      if (res.ok) {
        const data = await res.json()
        prompt = data.prompt || prompt
        assistExplanation = data.explanation || ''
      }
    } finally {
      assistLoading = false
    }
  }

  async function attachContext(contextId) {
    if (!node) return  // Can only attach to existing nodes

    const res = await fetch(`/nodes/${node.id}/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_item_id: contextId })
    })

    if (res.ok) {
      await loadAttachedContexts()
    }
  }

  async function detachContext(contextId) {
    if (!node) return

    const res = await fetch(`/nodes/${node.id}/context/${contextId}`, { method: 'DELETE' })
    if (res.ok) {
      attachedContexts = attachedContexts.filter(c => c.context_item_id !== contextId)
    }
  }
</script>

<div class="modal-overlay" on:click|self={handleCancel}>
  <div class="modal">
    <div class="modal-header">
      <h2>{node ? 'Edit Node' : 'New Node'}</h2>
      <button class="close-btn" on:click={handleCancel}>×</button>
    </div>

    <div class="modal-body">
      <div class="main-section">
        <input
          type="text"
          class="title-input"
          placeholder="Node title..."
          bind:value={title}
        />

        <div class="agent-select">
          {#each ['claude', 'codex', 'gemini'] as agent}
            <button
              class:active={agentType === agent}
              style="--color: {AGENT_COLORS[agent]}"
              on:click={() => agentType = agent}
              disabled={node !== null}
            >{agent}</button>
          {/each}
        </div>

        <textarea
          class="prompt-input"
          placeholder="Enter your prompt..."
          bind:value={prompt}
          rows="15"
        ></textarea>
      </div>

      <div class="assist-section">
        <h3>Claude Assist</h3>

        <div class="assist-input">
          <textarea
            placeholder="Describe what you want the agent to do..."
            bind:value={assistDescription}
            rows="4"
          ></textarea>
          <button
            class="assist-btn"
            on:click={generatePrompt}
            disabled={assistLoading || !assistDescription.trim()}
          >
            {assistLoading ? 'Generating...' : 'Generate Prompt'}
          </button>
        </div>

        <button
          class="improve-btn"
          on:click={improvePrompt}
          disabled={assistLoading || !prompt.trim()}
        >
          {assistLoading ? 'Improving...' : 'Improve Prompt'}
        </button>

        {#if assistExplanation}
          <div class="explanation">
            <strong>Explanation:</strong>
            <p>{assistExplanation}</p>
          </div>
        {/if}

        {#if node && contextItems.length > 0}
          <div class="context-attach">
            <h4>Attach Context</h4>
            <div class="context-list">
              {#each contextItems as ctx}
                {@const isAttached = attachedContexts.some(a => a.context_item_id === ctx.id)}
                <button
                  class="context-btn"
                  class:attached={isAttached}
                  on:click={() => isAttached ? detachContext(ctx.id) : attachContext(ctx.id)}
                >
                  {ctx.name}
                  {#if isAttached}
                    <span class="check">✓</span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>

    <div class="modal-footer">
      <button class="cancel-btn" on:click={handleCancel}>Cancel</button>
      <button
        class="save-btn"
        on:click={handleSave}
        disabled={!title.trim() || !prompt.trim()}
      >
        {node ? 'Save Changes' : 'Create Node'}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }

  .modal {
    width: 90vw;
    max-width: 1000px;
    height: 80vh;
    background: #111;
    border: 1px solid #333;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #222;
  }

  .modal-header h2 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #fff;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: 1px solid #333;
    border-radius: 6px;
    color: #888;
    font-size: 1.25rem;
    cursor: pointer;
  }

  .close-btn:hover {
    background: #222;
    color: #fff;
  }

  .modal-body {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .main-section {
    flex: 1;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
  }

  .title-input {
    width: 100%;
    padding: 0.75rem 1rem;
    background: #0a0a0a;
    border: 1px solid #333;
    border-radius: 6px;
    color: #fff;
    font-size: 1.125rem;
    font-weight: 500;
  }

  .title-input:focus {
    outline: none;
    border-color: #3b82f6;
  }

  .agent-select {
    display: flex;
    gap: 0.5rem;
  }

  .agent-select button {
    flex: 1;
    padding: 0.5rem;
    background: #0a0a0a;
    border: 1px solid #333;
    border-radius: 6px;
    color: #888;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .agent-select button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .agent-select button.active {
    background: var(--color);
    color: #000;
    border-color: var(--color);
    font-weight: 600;
  }

  .prompt-input {
    flex: 1;
    padding: 1rem;
    background: #0a0a0a;
    border: 1px solid #333;
    border-radius: 6px;
    color: #fff;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.875rem;
    line-height: 1.5;
    resize: none;
  }

  .prompt-input:focus {
    outline: none;
    border-color: #3b82f6;
  }

  .assist-section {
    width: 300px;
    padding: 1.5rem;
    background: #0d0d0d;
    border-left: 1px solid #222;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
  }

  .assist-section h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .assist-input {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .assist-input textarea {
    padding: 0.75rem;
    background: #0a0a0a;
    border: 1px solid #333;
    border-radius: 6px;
    color: #fff;
    font-size: 0.875rem;
    resize: none;
  }

  .assist-btn, .improve-btn {
    padding: 0.625rem 1rem;
    background: #3b82f6;
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
  }

  .assist-btn:hover:not(:disabled), .improve-btn:hover:not(:disabled) {
    background: #2563eb;
  }

  .assist-btn:disabled, .improve-btn:disabled {
    background: #333;
    color: #666;
    cursor: not-allowed;
  }

  .improve-btn {
    background: #22c55e;
  }

  .improve-btn:hover:not(:disabled) {
    background: #16a34a;
  }

  .explanation {
    padding: 0.75rem;
    background: #1a1a2e;
    border: 1px solid #3b82f6;
    border-radius: 6px;
    font-size: 0.75rem;
    color: #ccc;
  }

  .explanation strong {
    color: #3b82f6;
  }

  .explanation p {
    margin-top: 0.25rem;
  }

  .context-attach {
    margin-top: 1rem;
  }

  .context-attach h4 {
    font-size: 0.75rem;
    font-weight: 600;
    color: #666;
    margin-bottom: 0.5rem;
  }

  .context-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .context-btn {
    padding: 0.375rem 0.625rem;
    background: #0a0a0a;
    border: 1px solid #333;
    border-radius: 4px;
    color: #888;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .context-btn:hover {
    border-color: #8b5cf6;
    color: #fff;
  }

  .context-btn.attached {
    background: #1a1a2e;
    border-color: #8b5cf6;
    color: #fff;
  }

  .check {
    margin-left: 0.25rem;
    color: #8b5cf6;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid #222;
  }

  .cancel-btn {
    padding: 0.625rem 1.25rem;
    background: transparent;
    border: 1px solid #333;
    border-radius: 6px;
    color: #888;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .cancel-btn:hover {
    background: #222;
    color: #fff;
  }

  .save-btn {
    padding: 0.625rem 1.5rem;
    background: #22c55e;
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .save-btn:hover:not(:disabled) {
    background: #16a34a;
  }

  .save-btn:disabled {
    background: #333;
    color: #666;
    cursor: not-allowed;
  }
</style>
