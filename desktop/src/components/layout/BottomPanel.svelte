<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    executions,
    sortedExecutions,
    runningExecutions,
    selectedExecutionId,
    selectedExecution,
    terminalOutput,
    terminalConnected,
    loadExecutions,
    selectExecution,
    connectTerminal,
    disconnectTerminal,
    cancelExecution,
  } from '../../stores/executions';
  import { selectedProjectId } from '../../stores/projects';
  import type { Execution } from '../../lib/types';
  import Button from '../shared/Button.svelte';
  import StatusBadge from '../shared/StatusBadge.svelte';

  type Tab = 'executions' | 'output' | 'logs';

  let activeTab: Tab = 'executions';
  let collapsed = false;
  let panelHeight = 250;
  let resizing = false;
  let outputEl: HTMLPreElement;
  let panelEl: HTMLDivElement;

  // Auto-scroll output
  $: if (outputEl && $terminalOutput) {
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  // Load executions when project changes
  $: if ($selectedProjectId !== null) {
    loadExecutions();
  }

  // Auto-connect terminal when execution is selected and running
  $: if ($selectedExecutionId && $selectedExecution?.status === 'running') {
    connectTerminal($selectedExecutionId);
  }

  onDestroy(() => {
    disconnectTerminal();
  });

  function handleSelectExecution(exec: Execution) {
    selectExecution(exec.id);
    activeTab = 'output';
    if (!collapsed) {
      collapsed = false;
    }
  }

  function handleTabClick(tab: Tab) {
    activeTab = tab;
    if (collapsed) {
      collapsed = false;
    }
  }

  function toggleCollapse() {
    collapsed = !collapsed;
  }

  let lastHeight = 250; // Remember height before collapse/maximize

  function handleMouseDown(e: MouseEvent) {
    resizing = true;
    e.preventDefault();
  }

  function handleDoubleClick() {
    // Double-click to toggle between normal and maximized
    const maxHeight = window.innerHeight * 0.7;
    if (panelHeight < maxHeight - 50) {
      lastHeight = panelHeight;
      panelHeight = maxHeight;
    } else {
      panelHeight = lastHeight || 250;
    }
    collapsed = false;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!resizing) return;
    // Calculate height based on mouse position relative to window
    const newHeight = window.innerHeight - e.clientY;
    // Allow dragging from 100px to 80% of window height
    const maxHeight = window.innerHeight * 0.8;
    panelHeight = Math.max(100, Math.min(maxHeight, newHeight));
  }

  function handleMouseUp() {
    resizing = false;
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'running': return 'var(--accent-warning)';
      case 'completed': return 'var(--accent-success)';
      case 'failed': return 'var(--accent-error)';
      case 'cancelled': return 'var(--text-secondary)';
      default: return 'var(--text-tertiary)';
    }
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async function handleCancel(execId: number) {
    await cancelExecution(execId);
  }
</script>

<svelte:window on:mousemove={handleMouseMove} on:mouseup={handleMouseUp} />

<div
  class="bottom-panel"
  class:collapsed
  class:resizing
  style="--panel-height: {panelHeight}px"
  bind:this={panelEl}
>
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="resize-handle" on:mousedown={handleMouseDown} on:dblclick={handleDoubleClick}>
    <div class="resize-grip"></div>
  </div>

  <div class="tab-bar">
    <div class="tabs">
      <button
        class="tab"
        class:active={activeTab === 'executions'}
        on:click={() => handleTabClick('executions')}
        title="List of all agent execution jobs"
      >
        Executions
        {#if $runningExecutions.length > 0}
          <span class="badge running">{$runningExecutions.length}</span>
        {/if}
      </button>
      <button
        class="tab"
        class:active={activeTab === 'output'}
        on:click={() => handleTabClick('output')}
        title="Live terminal output from selected execution"
      >
        Output
        {#if $terminalConnected}
          <span class="connected-dot"></span>
        {/if}
      </button>
      <button
        class="tab"
        class:active={activeTab === 'logs'}
        on:click={() => handleTabClick('logs')}
        title="System and debug logs"
      >
        Logs
      </button>
    </div>
    <button class="collapse-btn" on:click={toggleCollapse}>
      {collapsed ? '▲' : '▼'}
    </button>
  </div>

  {#if !collapsed}
    <div class="panel-content">
      {#if activeTab === 'executions'}
        <div class="executions-list">
          {#if $sortedExecutions.length === 0}
            <div class="empty">No executions yet. Launch an agent from a node to see it here.</div>
          {:else}
            {#each $sortedExecutions as exec}
              <button
                class="execution-item"
                class:selected={$selectedExecutionId === exec.id}
                on:click={() => handleSelectExecution(exec)}
              >
                <div class="exec-status" style="background: {getStatusColor(exec.status)}"></div>
                <div class="exec-info">
                  <span class="exec-id">#{exec.id}</span>
                  <span class="exec-session">{exec.tmux_session || `exec-${exec.id}`}</span>
                </div>
                <span class="exec-time">{formatTime(exec.created_at)}</span>
                <span class="exec-status-text">{exec.status}</span>
                {#if exec.status === 'running' || exec.status === 'pending'}
                  <button class="cancel-btn" on:click|stopPropagation={() => handleCancel(exec.id)}>
                    Cancel
                  </button>
                {/if}
              </button>
            {/each}
          {/if}
        </div>
      {:else if activeTab === 'output'}
        <div class="output-container">
          {#if $selectedExecution}
            <div class="output-header">
              <span>Execution #{$selectedExecution.id}</span>
              <StatusBadge status={$selectedExecution.status} />
              {#if $terminalConnected}
                <span class="connected-label">Live</span>
              {/if}
            </div>
            <pre class="output" bind:this={outputEl}>{$terminalOutput || 'Waiting for output...'}</pre>
          {:else}
            <div class="empty">Select an execution to view output</div>
          {/if}
        </div>
      {:else if activeTab === 'logs'}
        <div class="logs-container">
          <div class="empty">Logs coming soon...</div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .bottom-panel {
    background: var(--bg-secondary);
    border-top: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    height: var(--panel-height);
    min-height: 36px;
    position: relative;
  }

  .bottom-panel:not(.resizing) {
    transition: height 0.2s ease;
  }

  .bottom-panel.collapsed {
    height: 36px;
  }

  .resize-handle {
    position: absolute;
    top: -4px;
    left: 0;
    right: 0;
    height: 8px;
    cursor: ns-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  }

  .resize-grip {
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--border-color);
    transition: background 0.15s;
  }

  .resize-handle:hover .resize-grip,
  .bottom-panel.resizing .resize-grip {
    background: var(--accent-primary);
  }

  .tab-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    height: 36px;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
  }

  .tabs {
    display: flex;
    gap: 4px;
  }

  .tab {
    background: none;
    border: none;
    color: var(--text-secondary);
    padding: 8px 12px;
    font-size: 13px;
    cursor: pointer;
    border-radius: 4px 4px 0 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tab:hover {
    color: var(--text-primary);
    background: var(--bg-tertiary);
  }

  .tab.active {
    color: var(--text-primary);
    background: var(--bg-primary);
    border-bottom: 2px solid var(--accent-primary);
  }

  .badge {
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 10px;
    font-size: 11px;
  }

  .badge.running {
    background: var(--accent-warning);
    color: black;
  }

  .connected-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent-success);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .collapse-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 4px 8px;
    font-size: 12px;
  }

  .collapse-btn:hover {
    color: var(--text-primary);
  }

  .panel-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .executions-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .execution-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    margin-bottom: 4px;
    cursor: pointer;
    text-align: left;
  }

  .execution-item:hover {
    background: var(--bg-tertiary);
  }

  .execution-item.selected {
    border-color: var(--accent-primary);
  }

  .exec-status {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .exec-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .exec-id {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .exec-session {
    font-size: 13px;
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .exec-time {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .exec-status-text {
    font-size: 12px;
    text-transform: capitalize;
    color: var(--text-secondary);
    min-width: 70px;
  }

  .cancel-btn {
    background: var(--accent-error);
    color: white;
    border: none;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
  }

  .cancel-btn:hover {
    opacity: 0.8;
  }

  .output-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .output-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-color);
    font-size: 13px;
  }

  .connected-label {
    background: var(--accent-success);
    color: white;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    text-transform: uppercase;
  }

  .output {
    flex: 1;
    margin: 0;
    padding: 12px;
    overflow: auto;
    font-family: monospace;
    font-size: 12px;
    line-height: 1.4;
    background: var(--bg-primary);
    white-space: pre-wrap;
    word-break: break-all;
  }

  .logs-container {
    flex: 1;
    padding: 12px;
  }

  .empty {
    color: var(--text-secondary);
    font-size: 13px;
    text-align: center;
    padding: 24px;
  }
</style>
