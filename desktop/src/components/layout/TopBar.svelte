<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { hubUrl, hubConnected } from '../../stores/hub';
  import { selectedProject } from '../../stores/projects';
  import Button from '../shared/Button.svelte';

  export let activeView: 'dag' | 'agents' | 'todo' | 'calendar' = 'dag';

  const dispatch = createEventDispatcher();

  function getHostFromUrl(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  const views = [
    { id: 'dag', label: 'DAG' },
    { id: 'agents', label: 'Agents' },
    { id: 'todo', label: 'TODO' },
    { id: 'calendar', label: 'Cal' },
  ] as const;

  function handleViewChange(view: typeof activeView) {
    dispatch('viewChange', view);
  }

  function openHubConfig() {
    dispatch('openHubConfig');
  }

  function openCreateNode() {
    dispatch('openCreateNode');
  }

  function openAIPlan() {
    dispatch('openAIPlan');
  }
</script>

<header class="topbar">
  <nav class="views">
    {#each views as view}
      <button
        class="view-btn"
        class:active={activeView === view.id}
        on:click={() => handleViewChange(view.id)}
      >
        {view.label}
      </button>
    {/each}
  </nav>

  <div class="project-name">
    {#if $selectedProject}
      {$selectedProject.name}
    {:else}
      <span class="muted">No project selected</span>
    {/if}
  </div>

  <div class="right-section">
    <button class="hub-status" on:click={openHubConfig}>
      <span class="status-dot" class:connected={$hubConnected}></span>
      <span class="url">{getHostFromUrl($hubUrl)}</span>
    </button>

    {#if $selectedProject}
      <Button on:click={openCreateNode}>+ Node</Button>
      <Button variant="primary" on:click={openAIPlan}>AI Plan</Button>
    {/if}
  </div>
</header>

<style>
  .topbar {
    height: var(--topbar-height);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 16px;
  }

  .views {
    display: flex;
    gap: 4px;
  }

  .view-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .view-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .view-btn.active {
    background: var(--bg-tertiary);
    color: var(--accent-primary);
  }

  .project-name {
    flex: 1;
    text-align: center;
    font-weight: 500;
  }

  .muted {
    color: var(--text-secondary);
  }

  .right-section {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .hub-status {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: 1px solid var(--border-color);
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
  }

  .hub-status:hover {
    background: var(--bg-tertiary);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent-error);
  }

  .status-dot.connected {
    background: var(--accent-success);
  }

  .url {
    font-size: 12px;
    color: var(--text-secondary);
  }
</style>
