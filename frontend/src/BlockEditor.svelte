<script>
  import { createEventDispatcher, onMount } from 'svelte'

  export let block = null  // null for new block, object for editing
  export let graphId
  export let contextItems = []

  const dispatch = createEventDispatcher()

  let title = ''
  let description = ''
  let agentType = 'claude'
  let prompt = ''
  let winConditions = []

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

  const CONDITION_TYPES = [
    { value: 'test', label: 'Test', desc: 'Run command, check exit code' },
    { value: 'human', label: 'Human Review', desc: 'Require human approval' },
    { value: 'llm_judge', label: 'LLM Judge', desc: 'LLM evaluates output' },
    { value: 'metric', label: 'Metric', desc: 'Check numeric threshold' }
  ]

  onMount(() => {
    if (block) {
      title = block.title
      description = block.description || ''
      agentType = block.agent_type || 'claude'
      prompt = block.prompt || ''
      winConditions = block.win_conditions?.length > 0 ? [...block.win_conditions] : []
      loadAttachedContexts()
    }
  })

  async function loadAttachedContexts() {
    if (!block) return
    const res = await fetch(`/blocks/${block.id}/context`)
    if (res.ok) {
      attachedContexts = await res.json()
    }
  }

  function addCondition(type) {
    let newCond = { type }
    if (type === 'test') {
      newCond.command = ''
    } else if (type === 'human') {
      newCond.prompt = 'Please review and approve this output.'
    } else if (type === 'llm_judge') {
      newCond.prompt = 'Is this output satisfactory?'
      newCond.agent = 'claude'
    } else if (type === 'metric') {
      newCond.command = ''
      newCond.threshold = 80
      newCond.comparison = '>='
    }
    winConditions = [...winConditions, newCond]
  }

  function removeCondition(index) {
    winConditions = winConditions.filter((_, i) => i !== index)
  }

  async function handleSave() {
    if (!title.trim()) return

    const data = {
      title: title.trim(),
      description: description.trim() || null,
      agent_type: agentType,
      prompt: prompt.trim() || null,
      win_conditions: winConditions
    }

    if (block) {
      // Update existing block
      const res = await fetch(`/blocks/${block.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      const updated = await res.json()
      dispatch('save', updated)
    } else {
      // Create new block
      const res = await fetch(`/graphs/${graphId}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          pos_x: 100 + Math.random() * 200,
          pos_y: 100 + Math.random() * 150
        })
      })
      const newBlock = await res.json()
      dispatch('save', newBlock)
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
    if (!block) return

    const res = await fetch(`/blocks/${block.id}/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_item_id: contextId })
    })

    if (res.ok) {
      await loadAttachedContexts()
    }
  }

  async function detachContext(contextId) {
    if (!block) return

    const res = await fetch(`/blocks/${block.id}/context/${contextId}`, { method: 'DELETE' })
    if (res.ok) {
      attachedContexts = attachedContexts.filter(c => c.context_item_id !== contextId)
    }
  }
</script>

<div class="modal-overlay" on:click|self={handleCancel}>
  <div class="modal">
    <div class="modal-header">
      <h2>{block ? 'Edit Block' : 'New Block'}</h2>
      <button class="close-btn" on:click={handleCancel}>×</button>
    </div>

    <div class="modal-body">
      <div class="main-section">
        <input
          type="text"
          class="title-input"
          placeholder="Block title..."
          bind:value={title}
        />

        <textarea
          class="desc-input"
          placeholder="Description (optional)..."
          bind:value={description}
          rows="2"
        ></textarea>

        <!-- Agent Selection -->
        <div class="agent-select">
          <label>Agent:</label>
          <div class="agent-buttons">
            {#each ['claude', 'codex', 'gemini'] as agent}
              <button
                class:active={agentType === agent}
                style="--color: {AGENT_COLORS[agent]}"
                on:click={() => agentType = agent}
              >{agent}</button>
            {/each}
          </div>
        </div>

        <!-- Prompt -->
        <textarea
          class="prompt-input"
          placeholder="Enter prompt for this block..."
          bind:value={prompt}
          rows="12"
        ></textarea>

        <!-- Win Conditions -->
        <div class="conditions-section">
          <div class="section-header">
            <label>Win Conditions</label>
            <div class="add-condition">
              {#each CONDITION_TYPES as ct}
                <button class="add-cond-btn" on:click={() => addCondition(ct.value)} title={ct.desc}>
                  + {ct.label}
                </button>
              {/each}
            </div>
          </div>

          {#if winConditions.length === 0}
            <div class="no-conditions">No conditions - block will auto-complete when agent finishes</div>
          {:else}
            <div class="conditions-list">
              {#each winConditions as cond, i}
                <div class="condition-item">
                  <span class="cond-type">{cond.type}</span>

                  {#if cond.type === 'test'}
                    <input type="text" placeholder="Command (e.g., pytest tests/)" bind:value={cond.command} />
                  {:else if cond.type === 'human'}
                    <input type="text" placeholder="Review prompt..." bind:value={cond.prompt} />
                  {:else if cond.type === 'llm_judge'}
                    <input type="text" placeholder="Judge prompt..." bind:value={cond.prompt} />
                    <select bind:value={cond.agent}>
                      <option value="claude">Claude</option>
                      <option value="gemini">Gemini</option>
                    </select>
                  {:else if cond.type === 'metric'}
                    <input type="text" placeholder="Command..." bind:value={cond.command} />
                    <select bind:value={cond.comparison}>
                      <option value=">=">>=</option>
                      <option value=">">&gt;</option>
                      <option value="<=">&lt;=</option>
                      <option value="<">&lt;</option>
                      <option value="==">=</option>
                    </select>
                    <input type="number" bind:value={cond.threshold} />
                  {/if}

                  <button class="remove-cond" on:click={() => removeCondition(i)}>×</button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
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

        {#if block && contextItems.length > 0}
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
        disabled={!title.trim()}
      >
        {block ? 'Save Changes' : 'Create Block'}
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
    width: 95vw;
    max-width: 1000px;
    height: 90vh;
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

  .desc-input {
    width: 100%;
    padding: 0.5rem 1rem;
    background: #0a0a0a;
    border: 1px solid #333;
    border-radius: 6px;
    color: #ccc;
    font-size: 0.875rem;
    resize: none;
  }

  .agent-select {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .agent-select label {
    font-size: 0.875rem;
    color: #888;
  }

  .agent-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .agent-buttons button {
    padding: 0.5rem 1rem;
    background: #0a0a0a;
    border: 1px solid #333;
    border-radius: 6px;
    color: #888;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .agent-buttons button.active {
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

  .conditions-section {
    padding: 0.75rem;
    background: #0d0d0d;
    border: 1px solid #222;
    border-radius: 6px;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .section-header label {
    font-size: 0.75rem;
    color: #666;
    font-weight: 600;
  }

  .add-condition {
    display: flex;
    gap: 0.25rem;
  }

  .add-cond-btn {
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: 1px dashed #333;
    border-radius: 4px;
    color: #666;
    font-size: 0.625rem;
    cursor: pointer;
  }

  .add-cond-btn:hover {
    border-color: #22c55e;
    color: #22c55e;
  }

  .no-conditions {
    color: #444;
    font-size: 0.75rem;
    font-style: italic;
  }

  .conditions-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .condition-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: #0a0a0a;
    border-radius: 4px;
  }

  .cond-type {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    background: #22c55e;
    border-radius: 4px;
    color: #000;
    font-weight: 600;
    text-transform: uppercase;
  }

  .condition-item input[type="text"] {
    flex: 1;
    padding: 0.375rem 0.5rem;
    background: #111;
    border: 1px solid #333;
    border-radius: 4px;
    color: #fff;
    font-size: 0.75rem;
  }

  .condition-item input[type="number"] {
    width: 60px;
    padding: 0.375rem 0.5rem;
    background: #111;
    border: 1px solid #333;
    border-radius: 4px;
    color: #fff;
    font-size: 0.75rem;
  }

  .condition-item select {
    padding: 0.375rem 0.5rem;
    background: #111;
    border: 1px solid #333;
    border-radius: 4px;
    color: #fff;
    font-size: 0.75rem;
  }

  .remove-cond {
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    color: #666;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .remove-cond:hover {
    color: #dc2626;
  }

  .assist-section {
    width: 280px;
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
