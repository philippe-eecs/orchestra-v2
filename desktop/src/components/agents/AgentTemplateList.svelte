<script lang="ts">
  import { onMount } from 'svelte';
  import {
    templates,
    templatesLoading,
    templatesError,
    loadTemplates,
    selectTemplate,
    deleteTemplate,
    selectedTemplateId,
  } from '../../stores/agentTemplates';
  import ErrorBanner from '../shared/ErrorBanner.svelte';
  import Button from '../shared/Button.svelte';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  onMount(() => {
    loadTemplates();
  });

  function handleSelectTemplate(id: number) {
    selectTemplate(id);
    dispatch('select', { id });
  }

  function handleNewTemplate() {
    dispatch('new');
  }

  async function handleDelete(e: MouseEvent, id: number) {
    e.stopPropagation();
    if (confirm('Delete this template?')) {
      await deleteTemplate(id);
    }
  }

  function getAgentIcon(metadata: Record<string, unknown>): string {
    return (metadata.icon as string) || '🤖';
  }

  function getStepCount(metadata: Record<string, unknown>): number {
    return (metadata.step_count as number) || 0;
  }
</script>

<div class="template-list">
  <div class="header">
    <h3>Agent Templates</h3>
    <Button size="small" on:click={handleNewTemplate}>+ New</Button>
  </div>

  <ErrorBanner message={$templatesError} />

  {#if $templatesLoading}
    <div class="loading">Loading templates...</div>
  {:else if $templates.length === 0}
    <div class="empty">
      <p>No templates yet</p>
      <p class="hint">Create a template to define reusable agent workflows</p>
    </div>
  {:else}
    <div class="template-grid">
      {#each $templates as template (template.id)}
        <button
          class="template-card"
          class:selected={$selectedTemplateId === template.id}
          on:click={() => handleSelectTemplate(template.id)}
        >
          <div class="template-icon">{getAgentIcon(template.metadata)}</div>
          <div class="template-info">
            <div class="template-name">{template.name}</div>
            {#if template.description}
              <div class="template-description">{template.description}</div>
            {/if}
          </div>
          <button class="delete-btn" on:click={(e) => handleDelete(e, template.id)}>
            &times;
          </button>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .template-list {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .loading,
  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    padding: 32px;
    text-align: center;
  }

  .hint {
    font-size: 13px;
    margin-top: 8px;
  }

  .template-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
  }

  .template-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--bg-secondary);
    border: 1px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .template-card:hover {
    background: var(--bg-tertiary);
  }

  .template-card.selected {
    border-color: var(--accent-primary);
    background: var(--bg-tertiary);
  }

  .template-icon {
    font-size: 24px;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-primary);
    border-radius: 8px;
    flex-shrink: 0;
  }

  .template-info {
    flex: 1;
    min-width: 0;
  }

  .template-name {
    font-weight: 500;
    font-size: 14px;
    color: var(--text-primary);
  }

  .template-description {
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }

  .delete-btn {
    width: 24px;
    height: 24px;
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 18px;
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .template-card:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    background: var(--accent-error);
    color: white;
  }
</style>
