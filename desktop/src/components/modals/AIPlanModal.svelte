<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import { api } from '../../lib/api';
  import { selectedProjectId } from '../../stores/projects';
  import { createNode, updateNode } from '../../stores/graph';
  import type { Resource, NodeCreate } from '../../lib/types';
  import Modal from '../shared/Modal.svelte';
  import Button from '../shared/Button.svelte';
  import ErrorBanner from '../shared/ErrorBanner.svelte';

  export let open = false;

  const dispatch = createEventDispatcher();

  let prompt = '';
  let resources: Resource[] = [];
  let newResource: Resource = { kind: 'url', title: '', url: '' };
  let generating = false;
  let error: string | null = null;
  let preview: { nodes: Partial<NodeCreate>[]; edges: { source_index: number; target_index: number }[] } | null = null;
  let applying = false;

  const kindOptions = ['url', 'file', 'note', 'doc', 'image'];

  function resetForm() {
    prompt = '';
    resources = [];
    newResource = { kind: 'url', title: '', url: '' };
    error = null;
    preview = null;
  }

  function handleClose() {
    resetForm();
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

  async function handleGenerate() {
    if (!prompt.trim()) {
      error = 'Please enter a prompt';
      return;
    }

    const projectId = get(selectedProjectId);
    if (!projectId) {
      error = 'No project selected';
      return;
    }

    generating = true;
    error = null;

    try {
      const result = await api.generatePlan(projectId, {
        prompt: prompt.trim(),
        resources: resources.length > 0 ? resources : undefined,
      });
      preview = result;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to generate plan';
    } finally {
      generating = false;
    }
  }

  async function handleApply() {
    if (!preview) return;

    applying = true;
    error = null;

    const createdNodeIds: number[] = [];

    try {
      // First pass: create all nodes without edges
      for (let i = 0; i < preview.nodes.length; i++) {
        const nodeData = preview.nodes[i];
        const node = await createNode({
          title: nodeData.title || 'Untitled',
          description: nodeData.description,
          status: nodeData.status || 'pending',
          position_x: nodeData.position_x || 100 + i * 200,
          position_y: nodeData.position_y || 100,
        });
        if (node) {
          createdNodeIds.push(node.id);
        } else {
          throw new Error(`Failed to create node: ${nodeData.title}`);
        }
      }

      // Second pass: apply edges by updating nodes with parent_ids
      const parentMap = new Map<number, number[]>();
      for (const edge of preview.edges) {
        const sourceId = createdNodeIds[edge.source_index];
        const targetId = createdNodeIds[edge.target_index];
        if (sourceId === undefined || targetId === undefined) continue;
        const parents = parentMap.get(targetId) || [];
        parents.push(sourceId);
        parentMap.set(targetId, parents);
      }

      for (const [targetId, parentIds] of parentMap.entries()) {
        const uniqueParents = Array.from(new Set(parentIds));
        const result = await updateNode(targetId, { parent_ids: uniqueParents });
        if (!result) {
          throw new Error(`Failed to set dependencies for node ${targetId}`);
        }
      }

      handleClose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to apply plan';
    } finally {
      applying = false;
    }
  }
</script>

<Modal title="AI Plan Generator" {open} on:close={handleClose}>
  {#if !preview}
    <form on:submit|preventDefault={handleGenerate}>
      <div class="field">
        <label for="prompt">Describe what you want to build</label>
        <textarea
          id="prompt"
          bind:value={prompt}
          rows="4"
          placeholder="e.g., Build a REST API with user authentication and CRUD operations..."
        ></textarea>
      </div>

      <div class="resources-section">
        <span class="section-label">Reference Resources (optional)</span>
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

      <ErrorBanner message={error} />

      <div class="actions">
        <Button type="button" on:click={handleClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={generating}>
          {generating ? 'Generating...' : 'Generate Plan'}
        </Button>
      </div>
    </form>
  {:else}
    <div class="preview">
      <h3>Generated Plan</h3>
      <p class="hint">Review the plan before applying</p>

      <div class="nodes-preview">
        {#each preview.nodes as node, i}
          <div class="node-preview">
            <span class="node-num">#{i + 1}</span>
            <div class="node-info">
              <strong>{node.title}</strong>
              {#if node.description}
                <p>{node.description}</p>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      {#if preview.edges.length > 0}
        <div class="edges-preview">
          <strong>Dependencies:</strong>
          {#each preview.edges as edge}
            <span class="edge">#{edge.source_index + 1} → #{edge.target_index + 1}</span>
          {/each}
        </div>
      {/if}

      <ErrorBanner message={error} />

      <div class="actions">
        <Button on:click={() => preview = null}>Back</Button>
        <Button variant="primary" on:click={handleApply} disabled={applying}>
          {applying ? 'Applying...' : 'Apply Plan'}
        </Button>
      </div>
    </div>
  {/if}
</Modal>

<style>
  form, .preview {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  label, .section-label {
    font-size: 12px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  textarea, input, select {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 14px;
    font-family: inherit;
    width: 100%;
  }

  .resources-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
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
    display: grid;
    grid-template-columns: auto 1fr 1fr auto;
    gap: 8px;
  }

  .add-resource select {
    width: auto;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }

  h3 {
    margin: 0;
    font-size: 18px;
  }

  .hint {
    color: var(--text-secondary);
    font-size: 14px;
    margin: 0;
  }

  .nodes-preview {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .node-preview {
    display: flex;
    gap: 12px;
    padding: 12px;
    background: var(--bg-primary);
    border-radius: 4px;
  }

  .node-num {
    color: var(--accent-primary);
    font-weight: 600;
  }

  .node-info {
    flex: 1;
  }

  .node-info p {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--text-secondary);
  }

  .edges-preview {
    font-size: 13px;
    color: var(--text-secondary);
  }

  .edge {
    display: inline-block;
    margin-left: 8px;
    padding: 2px 8px;
    background: var(--bg-tertiary);
    border-radius: 4px;
  }
</style>
