<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Node, NodeUpdate, NodeStatus, AgentType } from '../../lib/types';
  import { updateNode, deleteNode } from '../../stores/graph';
  import Button from '../shared/Button.svelte';
  import StatusBadge from '../shared/StatusBadge.svelte';
  import ResourceEditor from './ResourceEditor.svelte';
  import AgentLauncher from './AgentLauncher.svelte';
  import EditNodeModal from '../modals/EditNodeModal.svelte';

  export let node: Node;

  const dispatch = createEventDispatcher();

  let showEditModal = false;

  let editing = false;
  let editTitle = node.title;
  let editStatus = node.status;
  let editInstructions = node.prompt || node.description || '';
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
    editDeliverables = node.metadata.deliverables || '';
    editAgentType = node.agent_type || '';
    editing = false;
    error = null;
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
</style>
