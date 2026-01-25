<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Node, NodeUpdate, NodeStatus, AgentType, Resource } from '../../lib/types';
  import { updateNode, graphError } from '../../stores/graph';
  import Modal from '../shared/Modal.svelte';
  import Button from '../shared/Button.svelte';
  import ErrorBanner from '../shared/ErrorBanner.svelte';

  export let open = false;
  export let node: Node;

  const dispatch = createEventDispatcher();

  let title = '';
  let status: NodeStatus = 'pending';
  let agentType: AgentType | '' = '';
  let instructions = '';
  let context = '';
  let deliverables = '';
  let resources: Resource[] = [];
  let newResource: Resource = { kind: 'url', title: '', url: '' };
  let saving = false;
  let error: string | null = null;

  const statusOptions: NodeStatus[] = ['pending', 'in_progress', 'completed', 'blocked', 'failed'];
  const agentOptions: AgentType[] = ['claude', 'codex', 'gemini', 'custom'];
  const kindOptions = ['url', 'file', 'note', 'doc', 'image'];

  // Reset form when node changes or modal opens
  $: if (open && node) {
    title = node.title;
    status = node.status;
    agentType = node.agent_type || '';
    // Use prompt if available, otherwise description
    instructions = node.prompt || node.description || '';
    context = node.context || '';
    deliverables = node.metadata.deliverables || '';
    resources = [...(node.metadata.resources || [])];
    error = null;
  }

  function handleClose() {
    dispatch('close');
  }

  function addResource() {
    if (!newResource.title.trim()) return;
    resources = [...resources, { ...newResource }];
    newResource = { kind: 'url', title: '', url: '' };
  }

  function removeResource(index: number) {
    resources = resources.filter((_, i) => i !== index);
  }

  async function handleSubmit() {
    if (!title.trim()) {
      error = 'Title is required';
      return;
    }

    saving = true;
    error = null;

    const updates: NodeUpdate = {
      title: title.trim(),
      description: instructions.trim() || undefined,
      status,
      agent_type: agentType || undefined,
      prompt: instructions.trim() || undefined,
      context: context.trim() || undefined,
      metadata: {
        resources,
        deliverables: deliverables.trim() || undefined,
        extra: node.metadata.extra || {},
      },
    };

    const result = await updateNode(node.id, updates);
    if (result) {
      handleClose();
    } else {
      error = $graphError || 'Failed to update node';
    }
    saving = false;
  }
</script>

<Modal title="Edit Node" {open} on:close={handleClose} fullscreen>
  <form on:submit|preventDefault={handleSubmit}>
    <div class="layout">
      <div class="main-section">
        <div class="field">
          <label for="edit-title">Title *</label>
          <input id="edit-title" bind:value={title} placeholder="What needs to be done?" />
        </div>

        <div class="field flex-grow">
          <label for="edit-instructions">Instructions</label>
          <textarea
            id="edit-instructions"
            bind:value={instructions}
            class="tall"
            placeholder="Describe the task and detailed instructions..."
          ></textarea>
        </div>

        <div class="field">
          <label for="edit-context">Context</label>
          <textarea
            id="edit-context"
            bind:value={context}
            rows="6"
            placeholder="Background information, codebase details, constraints..."
          ></textarea>
        </div>

        <div class="field">
          <label for="edit-deliverables">Deliverables</label>
          <textarea
            id="edit-deliverables"
            bind:value={deliverables}
            rows="4"
            placeholder="Expected outputs (one per line)"
          ></textarea>
        </div>
      </div>

      <div class="side-section">
        <div class="field">
          <label for="edit-status">Status</label>
          <select id="edit-status" bind:value={status}>
            {#each statusOptions as s}
              <option value={s}>{s.replace('_', ' ')}</option>
            {/each}
          </select>
        </div>

        <div class="field">
          <label for="edit-agent">Agent</label>
          <select id="edit-agent" bind:value={agentType}>
            <option value="">None</option>
            {#each agentOptions as a}
              <option value={a}>{a}</option>
            {/each}
          </select>
        </div>

        <div class="resources-section">
          <span class="section-label">Resources</span>
          {#if resources.length > 0}
            <ul class="resources">
              {#each resources as r, i}
                <li>
                  <span class="kind">{r.kind}</span>
                  <span class="r-title">{r.title}</span>
                  <button type="button" class="remove" on:click={() => removeResource(i)}>×</button>
                </li>
              {/each}
            </ul>
          {/if}
          <div class="add-resource">
            <select bind:value={newResource.kind}>
              {#each kindOptions as k}
                <option value={k}>{k}</option>
              {/each}
            </select>
            <input placeholder="Title" bind:value={newResource.title} />
            <input placeholder="URL" bind:value={newResource.url} />
            <Button type="button" on:click={addResource}>+</Button>
          </div>
        </div>
      </div>
    </div>

    <ErrorBanner message={error} />

    <div class="actions">
      <Button type="button" on:click={handleClose}>Cancel</Button>
      <Button type="submit" variant="primary" disabled={saving}>
        {saving ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  </form>
</Modal>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;
  }

  .layout {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 24px;
    flex: 1;
    min-height: 0;
  }

  .main-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
  }

  .side-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    border-left: 1px solid var(--border-color);
    padding-left: 24px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field.flex-grow {
    flex: 1;
    min-height: 0;
  }

  .field.flex-grow textarea {
    flex: 1;
    min-height: 120px;
  }

  label, .section-label {
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
    width: 100%;
  }

  textarea {
    resize: vertical;
  }

  textarea.tall {
    min-height: 150px;
  }

  .resources-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
  }

  .resources {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .resources li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: var(--bg-primary);
    border-radius: 4px;
    margin-bottom: 4px;
    font-size: 13px;
  }

  .kind {
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 2px;
    font-size: 11px;
    text-transform: uppercase;
  }

  .r-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .remove {
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 16px;
    padding: 0 4px;
  }

  .remove:hover {
    color: var(--accent-error);
  }

  .add-resource {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .add-resource select {
    width: 100%;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border-color);
  }
</style>
