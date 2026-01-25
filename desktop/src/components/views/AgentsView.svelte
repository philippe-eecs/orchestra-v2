<script lang="ts">
  import { onMount } from 'svelte';
  import { selectedProject } from '../../stores/projects';
  import { loadTemplates } from '../../stores/agentTemplates';
  import AgentTemplateList from '../agents/AgentTemplateList.svelte';
  import AgentBuilder from '../agents/AgentBuilder.svelte';
  import ExecutionPanel from '../agents/ExecutionPanel.svelte';

  type Tab = 'templates' | 'executions';
  let activeTab: Tab = 'templates';

  onMount(() => {
    loadTemplates();
  });
</script>

<div class="agents-view">
  <div class="tabs">
    <button
      class="tab"
      class:active={activeTab === 'templates'}
      on:click={() => activeTab = 'templates'}
    >
      Templates
    </button>
    <button
      class="tab"
      class:active={activeTab === 'executions'}
      on:click={() => activeTab = 'executions'}
    >
      Executions
    </button>
  </div>

  <div class="tab-content">
    {#if activeTab === 'templates'}
      <div class="templates-layout">
        <div class="template-sidebar">
          <AgentTemplateList on:new={() => {}} />
        </div>
        <div class="template-builder">
          <AgentBuilder />
        </div>
      </div>
    {:else if !$selectedProject}
      <div class="placeholder">
        <p>Select a project to view executions</p>
        <p class="hint">Executions are tied to specific projects and nodes</p>
      </div>
    {:else}
      <ExecutionPanel />
    {/if}
  </div>
</div>

<style>
  .agents-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    padding: 48px;
    text-align: center;
  }

  .placeholder .hint {
    font-size: 13px;
    margin-top: 8px;
    opacity: 0.7;
  }

  .tabs {
    display: flex;
    gap: 0;
    padding: 0 16px;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-secondary);
  }

  .tab {
    padding: 12px 24px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab:hover {
    color: var(--text-primary);
  }

  .tab.active {
    color: var(--accent-primary);
    border-bottom-color: var(--accent-primary);
  }

  .tab-content {
    flex: 1;
    overflow: hidden;
  }

  .templates-layout {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .template-sidebar {
    width: 280px;
    padding: 16px;
    border-right: 1px solid var(--border-color);
    background: var(--bg-secondary);
    overflow-y: auto;
  }

  .template-builder {
    flex: 1;
    overflow: hidden;
  }
</style>
