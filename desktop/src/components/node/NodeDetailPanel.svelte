<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Node, NodeUpdate, NodeStatus, AgentType, AgentTemplate } from '../../lib/types';
  import { updateNode, deleteNode } from '../../stores/graph';
  import { templates, loadTemplates } from '../../stores/agentTemplates';
  import { launch, previewLaunch } from '../../stores/executions';
  import { onMount } from 'svelte';
  import Button from '../shared/Button.svelte';
  import StatusBadge from '../shared/StatusBadge.svelte';
  import ResourceEditor from './ResourceEditor.svelte';
  import AgentLauncher from './AgentLauncher.svelte';
  import EditNodeModal from '../modals/EditNodeModal.svelte';
  import Modal from '../shared/Modal.svelte';

  export let node: Node;

  const dispatch = createEventDispatcher();

  let showEditModal = false;
  let showLaunchModal = false;
  let selectedTemplateId: number | null = null;
  let createWorktree = false;
  let launching = false;

  let editing = false;
  let editTitle = node.title;
  let editStatus = node.status;
  let editInstructions = node.prompt || node.description || '';
  let editContext = node.context || '';
  let editDeliverables = node.metadata.deliverables || '';
  let editAgentType: AgentType | '' = node.agent_type || '';
  let saving = false;
  let error: string | null = null;

  // Computed: use prompt if available, otherwise description
  $: displayInstructions = node.prompt || node.description || '';

  const statusOptions: NodeStatus[] = ['pending', 'in_progress', 'completed', 'blocked', 'failed'];
  const agentOptions: AgentType[] = ['claude', 'codex', 'gemini', 'custom'];

  $: {
    // Reset form when node changes
    editTitle = node.title;
    editStatus = node.status;
    editInstructions = node.prompt || node.description || '';
    editContext = node.context || '';
    editDeliverables = node.metadata.deliverables || '';
    editAgentType = node.agent_type || '';
    editing = false;
    error = null;
  }

  async function handleSave() {
    saving = true;
    error = null;

    const updates: NodeUpdate = {
      title: editTitle,
      description: editInstructions || undefined,
      status: editStatus,
      prompt: editInstructions || undefined,
      context: editContext || undefined,
      agent_type: editAgentType || undefined,
      metadata: {
        ...node.metadata,
        deliverables: editDeliverables || undefined,
      },
    };

    const result = await updateNode(node.id, updates);
    if (result) {
      editing = false;
    } else {
      error = 'Failed to save changes';
    }
    saving = false;
  }

  async function handleDelete() {
    if (confirm('Delete this node?')) {
      await deleteNode(node.id);
    }
  }

  function handleCancel() {
    editTitle = node.title;
    editStatus = node.status;
    editInstructions = node.prompt || node.description || '';
    editContext = node.context || '';
    editDeliverables = node.metadata.deliverables || '';
    editAgentType = node.agent_type || '';
    editing = false;
    error = null;
  }

  onMount(() => {
    loadTemplates();
  });

  function openLaunchModal() {
    showLaunchModal = true;
  }

  async function handleQuickLaunch() {
    if (!selectedTemplateId) return;

    launching = true;
    const result = await launch(node.id, {
      template_id: selectedTemplateId,
      create_worktree: createWorktree,
    });

    launching = false;
    if (result) {
      showLaunchModal = false;
      selectedTemplateId = null;
    }
  }
</script>

<div class="panel">
  {#if editing}
    <div class="form">
      <div class="field">
        <label for="title">Title</label>
        <input id="title" bind:value={editTitle} />
      </div>

      <div class="row">
        <div class="field">
          <label for="status">Status</label>
          <select id="status" bind:value={editStatus}>
            {#each statusOptions as status}
              <option value={status}>{status.replace('_', ' ')}</option>
            {/each}
          </select>
        </div>

        <div class="field">
          <label for="agent">Agent</label>
          <select id="agent" bind:value={editAgentType}>
            <option value="">None</option>
            {#each agentOptions as agent}
              <option value={agent}>{agent}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="field">
        <label for="instructions">Instructions</label>
        <textarea id="instructions" bind:value={editInstructions} rows="8"></textarea>
      </div>

      <div class="field">
        <label for="context">Context</label>
        <textarea id="context" bind:value={editContext} rows="4" placeholder="Background information, codebase details, constraints..."></textarea>
      </div>

      <div class="field">
        <label for="deliverables">Deliverables</label>
        <textarea id="deliverables" bind:value={editDeliverables} rows="4" placeholder="Expected outputs (one per line)"></textarea>
      </div>

      {#if error}
        <div class="error">{error}</div>
      {/if}

      <div class="actions">
        <Button on:click={handleCancel}>Cancel</Button>
        <Button variant="primary" on:click={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  {:else}
    <div class="view">
      <div class="header">
        <h3>{node.title}</h3>
        <div class="header-actions">
          <button class="launch-btn" on:click={openLaunchModal} title="Launch agent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Launch
          </button>
          <button class="icon-btn" on:click={() => showEditModal = true} title="Edit fullscreen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
          </button>
          <StatusBadge status={node.status} />
        </div>
      </div>

      {#if node.agent_type}
        <div class="meta">
          <span class="label">Agent:</span>
          <span class="value">{node.agent_type}</span>
        </div>
      {/if}

      {#if displayInstructions}
        <div class="prompt-section">
          <span class="label">Instructions:</span>
          <pre class="prompt">{displayInstructions}</pre>
        </div>
      {/if}

      {#if node.context}
        <div class="prompt-section">
          <span class="label">Context:</span>
          <pre class="prompt context">{node.context}</pre>
        </div>
      {/if}

      {#if node.metadata.deliverables}
        <div class="prompt-section">
          <span class="label">Deliverables:</span>
          <pre class="prompt deliverables">{node.metadata.deliverables}</pre>
        </div>
      {/if}

      <div class="section">
        <h4>Resources</h4>
        <ResourceEditor nodeId={node.id} resources={node.metadata.resources} />
      </div>

      {#if node.agent_type}
        <div class="section">
          <h4>Run Agent</h4>
          <AgentLauncher {node} />
        </div>
      {/if}

      <div class="actions">
        <Button on:click={() => editing = true}>Edit</Button>
        <Button variant="danger" on:click={handleDelete}>Delete</Button>
      </div>
    </div>
  {/if}
</div>

<EditNodeModal
  {node}
  open={showEditModal}
  on:close={() => showEditModal = false}
/>

<Modal title="Launch Agent" open={showLaunchModal} on:close={() => showLaunchModal = false}>
  <div class="launch-modal-content">
    <div class="launch-summary">
      <h4>{node.title}</h4>
      {#if node.context}
        <div class="launch-field">
          <span class="field-label">Context:</span>
          <p class="field-value">{node.context.slice(0, 200)}{node.context.length > 200 ? '...' : ''}</p>
        </div>
      {/if}
      {#if node.prompt}
        <div class="launch-field">
          <span class="field-label">Instructions:</span>
          <p class="field-value">{node.prompt.slice(0, 200)}{node.prompt.length > 200 ? '...' : ''}</p>
        </div>
      {/if}
    </div>

    <div class="launch-field">
      <label for="launch-template">Template</label>
      <select id="launch-template" bind:value={selectedTemplateId}>
        <option value={null}>Select a template...</option>
        {#each $templates as template}
          <option value={template.id}>{template.name}</option>
        {/each}
      </select>
    </div>

    <label class="checkbox-label">
      <input type="checkbox" bind:checked={createWorktree} />
      Create git worktree (isolated branch)
    </label>
  </div>

  <svelte:fragment slot="footer">
    <Button variant="secondary" on:click={() => showLaunchModal = false}>Cancel</Button>
    <Button variant="primary" on:click={handleQuickLaunch} disabled={!selectedTemplateId || launching}>
      {launching ? 'Launching...' : 'Launch'}
    </Button>
  </svelte:fragment>
</Modal>

<style>
  .panel {
    padding: 16px;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  label {
    font-size: 12px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  input, textarea, select {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 14px;
    font-family: inherit;
  }

  input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .error {
    color: var(--accent-error);
    font-size: 14px;
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;
  }

  .view {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .launch-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--accent-primary);
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  }

  .launch-btn:hover {
    opacity: 0.9;
  }

  .launch-btn svg {
    width: 14px;
    height: 14px;
  }

  .icon-btn {
    background: none;
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    padding: 6px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .meta {
    font-size: 14px;
  }

  .label {
    color: var(--text-secondary);
  }

  .value {
    color: var(--accent-primary);
  }

  .prompt-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .prompt {
    background: var(--bg-primary);
    padding: 12px;
    border-radius: 4px;
    font-size: 13px;
    overflow-x: auto;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .prompt.deliverables {
    border-left: 3px solid var(--accent-primary);
  }

  .prompt.context {
    border-left: 3px solid var(--text-secondary);
    font-style: italic;
  }

  .section {
    border-top: 1px solid var(--border-color);
    padding-top: 16px;
  }

  h4 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  /* Launch Modal Styles */
  .launch-modal-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .launch-summary {
    background: var(--bg-primary);
    padding: 12px;
    border-radius: 6px;
    border: 1px solid var(--border-color);
  }

  .launch-summary h4 {
    margin: 0 0 8px;
    font-size: 16px;
    color: var(--text-primary);
  }

  .launch-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-label {
    font-size: 12px;
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .field-value {
    margin: 0;
    font-size: 13px;
    color: var(--text-primary);
    line-height: 1.4;
  }

  .launch-modal-content select {
    width: 100%;
    padding: 8px 12px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 14px;
  }

  .launch-modal-content select:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .checkbox-label input {
    margin: 0;
  }
</style>
