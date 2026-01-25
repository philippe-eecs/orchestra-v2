<script lang="ts">
  import type { Resource, NodeMetadata } from '../../lib/types';
  import { updateNode, selectedNode } from '../../stores/graph';
  import { get } from 'svelte/store';
  import Button from '../shared/Button.svelte';

  export let nodeId: number;
  export let resources: Resource[];

  let adding = false;
  let newResource: Resource = { kind: 'url', title: '', url: '' };
  let error: string | null = null;

  const kindOptions = ['url', 'file', 'note', 'doc', 'image'];

  async function addResource() {
    if (!newResource.title.trim()) {
      error = 'Title is required';
      return;
    }

    const updatedResources = [...resources, { ...newResource }];
    const currentNode = get(selectedNode);
    const existingExtra = currentNode?.metadata?.extra || {};
    const result = await updateNode(nodeId, {
      metadata: { resources: updatedResources, extra: existingExtra }
    });

    if (result) {
      resources = updatedResources;
      newResource = { kind: 'url', title: '', url: '' };
      adding = false;
      error = null;
    } else {
      error = 'Failed to add resource';
    }
  }

  async function removeResource(index: number) {
    const updatedResources = resources.filter((_, i) => i !== index);
    const currentNode = get(selectedNode);
    const existingExtra = currentNode?.metadata?.extra || {};
    const result = await updateNode(nodeId, {
      metadata: { resources: updatedResources, extra: existingExtra }
    });

    if (result) {
      resources = updatedResources;
    }
  }

  function cancel() {
    adding = false;
    newResource = { kind: 'url', title: '', url: '' };
    error = null;
  }
</script>

<div class="resource-editor">
  {#if resources.length === 0 && !adding}
    <p class="empty">No resources attached</p>
  {/if}

  <ul class="resource-list">
    {#each resources as resource, index}
      <li class="resource-item">
        <span class="kind">{resource.kind}</span>
        <span class="title">{resource.title}</span>
        {#if resource.url}
          <a href={resource.url} target="_blank" rel="noopener" class="url">Open</a>
        {/if}
        <button class="remove" on:click={() => removeResource(index)}>×</button>
      </li>
    {/each}
  </ul>

  {#if adding}
    <div class="add-form">
      <div class="field">
        <select bind:value={newResource.kind}>
          {#each kindOptions as kind}
            <option value={kind}>{kind}</option>
          {/each}
        </select>
      </div>
      <div class="field">
        <input placeholder="Title" bind:value={newResource.title} />
      </div>
      <div class="field">
        <input placeholder="URL (optional)" bind:value={newResource.url} />
      </div>
      <div class="field">
        <input placeholder="Notes (optional)" bind:value={newResource.notes} />
      </div>
      {#if error}
        <div class="error">{error}</div>
      {/if}
      <div class="actions">
        <Button on:click={cancel}>Cancel</Button>
        <Button variant="primary" on:click={addResource}>Add</Button>
      </div>
    </div>
  {:else}
    <Button on:click={() => adding = true}>+ Add Resource</Button>
  {/if}
</div>

<style>
  .resource-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .empty {
    color: var(--text-secondary);
    font-size: 14px;
    margin: 0;
  }

  .resource-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .resource-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
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

  .title {
    flex: 1;
  }

  .url {
    color: var(--accent-primary);
    text-decoration: none;
    font-size: 12px;
  }

  .url:hover {
    text-decoration: underline;
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

  .add-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--bg-primary);
    border-radius: 4px;
  }

  .field input,
  .field select {
    width: 100%;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    padding: 8px;
    border-radius: 4px;
    font-size: 13px;
  }

  .error {
    color: var(--accent-error);
    font-size: 13px;
  }

  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
</style>
