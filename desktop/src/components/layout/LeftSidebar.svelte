<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    projects,
    selectedProjectId,
    projectsLoading,
    projectsError,
    selectProject,
    deleteProject,
    loadProjects,
  } from '../../stores/projects';
  import Button from '../shared/Button.svelte';
  import ErrorBanner from '../shared/ErrorBanner.svelte';

  const dispatch = createEventDispatcher();

  let showDeleteConfirm: number | null = null;

  function handleSelect(id: number) {
    selectProject(id);
  }

  function handleCreate() {
    dispatch('createProject');
  }

  async function handleDelete(id: number) {
    await deleteProject(id);
    showDeleteConfirm = null;
  }

  function confirmDelete(id: number, e: Event) {
    e.stopPropagation();
    showDeleteConfirm = id;
  }

  function cancelDelete(e: Event) {
    e.stopPropagation();
    showDeleteConfirm = null;
  }

  // Load projects on mount
  loadProjects();
</script>

<aside class="sidebar">
  <header>
    <h2>Projects</h2>
    <Button on:click={handleCreate}>+</Button>
  </header>

  <ErrorBanner message={$projectsError} />

  <div class="project-list">
    {#if $projectsLoading}
      <div class="loading">Loading...</div>
    {:else if $projects.length === 0}
      <div class="empty">No projects yet</div>
    {:else}
      {#each $projects as project (project.id)}
        <div
          class="project-item"
          class:selected={$selectedProjectId === project.id}
          on:click={() => handleSelect(project.id)}
          on:keydown={(e) => e.key === 'Enter' && handleSelect(project.id)}
          role="button"
          tabindex="0"
        >
          <span class="project-name">{project.name}</span>
          {#if showDeleteConfirm === project.id}
            <div class="delete-confirm">
              <button class="confirm-btn" on:click|stopPropagation={() => handleDelete(project.id)}>Delete</button>
              <button class="cancel-btn" on:click|stopPropagation={cancelDelete}>Cancel</button>
            </div>
          {:else}
            <button
              class="delete-btn"
              on:click|stopPropagation={(e) => confirmDelete(project.id, e)}
              aria-label="Delete project"
            >
              ×
            </button>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</aside>

<style>
  .sidebar {
    width: var(--sidebar-width);
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid var(--border-color);
  }

  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary);
  }

  .project-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .loading,
  .empty {
    text-align: center;
    padding: 24px;
    color: var(--text-secondary);
    font-size: 14px;
  }

  .project-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 12px;
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
    margin-bottom: 4px;
    transition: background 0.2s;
  }

  .project-item:hover {
    background: var(--bg-tertiary);
  }

  .project-item.selected {
    background: var(--bg-tertiary);
    border-left: 3px solid var(--accent-primary);
  }

  .project-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .delete-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 18px;
    cursor: pointer;
    padding: 0 4px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .project-item:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    color: var(--accent-error);
  }

  .delete-confirm {
    display: flex;
    gap: 4px;
  }

  .confirm-btn,
  .cancel-btn {
    padding: 2px 8px;
    font-size: 11px;
    border: none;
    border-radius: 2px;
    cursor: pointer;
  }

  .confirm-btn {
    background: var(--accent-error);
    color: white;
  }

  .cancel-btn {
    background: var(--bg-primary);
    color: var(--text-secondary);
  }
</style>
