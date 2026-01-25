<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    executions,
    executionsLoading,
    executionsError,
    loadExecutions,
    selectedExecution,
    selectedExecutionId,
    selectExecution,
    cancelExecution,
    terminalOutput,
    terminalConnected,
    connectTerminal,
    disconnectTerminal,
    getTmuxAttachCommand,
  } from '../../stores/executions';
  import { selectedProject } from '../../stores/projects';
  import { nodes } from '../../stores/graph';
  import { templates } from '../../stores/agentTemplates';
  import StatusBadge from '../shared/StatusBadge.svelte';
  import ErrorBanner from '../shared/ErrorBanner.svelte';
  import Button from '../shared/Button.svelte';
  import { formatDateTime } from '../../lib/utils';

  $: if ($selectedProject) {
    loadExecutions();
  }

  $: if ($selectedExecutionId) {
    connectTerminal($selectedExecutionId);
  }

  onDestroy(() => {
    disconnectTerminal();
  });

  function getNodeTitle(nodeId: number | undefined): string {
    if (!nodeId) return 'N/A';
    const node = $nodes.find(n => n.id === nodeId);
    return node?.title || `Node #${nodeId}`;
  }

  function getTemplateName(templateId: number | undefined): string {
    if (!templateId) return 'N/A';
    const template = $templates.find(t => t.id === templateId);
    return template?.name || `Template #${templateId}`;
  }

  function copyTmuxCommand() {
    if ($selectedExecution) {
      navigator.clipboard.writeText(getTmuxAttachCommand($selectedExecution));
    }
  }

  async function handleCancel() {
    if ($selectedExecutionId) {
      await cancelExecution($selectedExecutionId);
    }
  }
</script>

<div class="execution-panel">
  <div class="execution-list">
    <div class="list-header">
      <h3>Executions</h3>
    </div>

    <ErrorBanner message={$executionsError} />

    {#if $executionsLoading}
      <div class="loading">Loading...</div>
    {:else if $executions.length === 0}
      <div class="empty">
        <p>No executions yet</p>
        <p class="hint">Launch a template from a node to start</p>
      </div>
    {:else}
      <div class="list-items">
        {#each $executions as exec (exec.id)}
          <button
            class="exec-item"
            class:selected={$selectedExecutionId === exec.id}
            on:click={() => selectExecution(exec.id)}
          >
            <div class="exec-header">
              <StatusBadge status={exec.status} />
              <span class="exec-time">{formatDateTime(exec.created_at)}</span>
            </div>
            <div class="exec-info">
              <span class="exec-template">{getTemplateName(exec.template_id)}</span>
              <span class="exec-node">{getNodeTitle(exec.node_id)}</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="execution-detail">
    {#if $selectedExecution}
      <div class="detail-header">
        <div class="detail-title">
          <h3>{getTemplateName($selectedExecution.template_id)}</h3>
          <StatusBadge status={$selectedExecution.status} />
        </div>
        <div class="detail-actions">
          {#if $selectedExecution.status === 'running' || $selectedExecution.status === 'pending'}
            <Button size="small" variant="secondary" on:click={handleCancel}>Cancel</Button>
          {/if}
          <Button size="small" variant="secondary" on:click={copyTmuxCommand}>
            Copy tmux cmd
          </Button>
        </div>
      </div>

      <div class="detail-meta">
        <div class="meta-item">
          <span class="meta-label">Node:</span>
          <span>{getNodeTitle($selectedExecution.node_id)}</span>
        </div>
        {#if $selectedExecution.tmux_session}
          <div class="meta-item">
            <span class="meta-label">Session:</span>
            <span>{$selectedExecution.tmux_session}</span>
          </div>
        {/if}
        {#if $selectedExecution.worktree_branch}
          <div class="meta-item">
            <span class="meta-label">Branch:</span>
            <span>{$selectedExecution.worktree_branch}</span>
          </div>
        {/if}
      </div>

      {#if $selectedExecution.step_runs && $selectedExecution.step_runs.length > 0}
        <div class="step-runs">
          <h4>Steps</h4>
          {#each $selectedExecution.step_runs as stepRun (stepRun.id)}
            <div class="step-run" class:running={stepRun.status === 'running'}>
              <StatusBadge status={stepRun.status} size="small" />
              <span class="step-type">{stepRun.agent_type}</span>
              {#if stepRun.error}
                <span class="step-error" title={stepRun.error}>error</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <div class="terminal-container">
        <div class="terminal-header">
          <span>Terminal Output</span>
          <span class="connection-status" class:connected={$terminalConnected}>
            {$terminalConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <pre class="terminal-output">{$terminalOutput || 'Waiting for output...'}</pre>
      </div>
    {:else}
      <div class="placeholder">
        <p>Select an execution to view details</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .execution-panel {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .execution-list {
    width: 300px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border-color);
    background: var(--bg-secondary);
  }

  .list-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
  }

  .list-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .loading,
  .empty,
  .placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    padding: 24px;
    text-align: center;
  }

  .hint {
    font-size: 12px;
    margin-top: 8px;
  }

  .list-items {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .exec-item {
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    margin-bottom: 4px;
    transition: all 0.15s ease;
  }

  .exec-item:hover {
    background: var(--bg-tertiary);
  }

  .exec-item.selected {
    background: var(--bg-tertiary);
    border-color: var(--accent-primary);
  }

  .exec-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .exec-time {
    font-size: 11px;
    color: var(--text-secondary);
  }

  .exec-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .exec-template {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .exec-node {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .execution-detail {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
  }

  .detail-title {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .detail-title h3 {
    margin: 0;
    font-size: 16px;
  }

  .detail-actions {
    display: flex;
    gap: 8px;
  }

  .detail-meta {
    padding: 12px 16px;
    background: var(--bg-secondary);
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }

  .meta-item {
    font-size: 13px;
  }

  .meta-label {
    color: var(--text-secondary);
    margin-right: 6px;
  }

  .step-runs {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
  }

  .step-runs h4 {
    margin: 0 0 8px 0;
    font-size: 12px;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .step-run {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: var(--bg-secondary);
    border-radius: 4px;
    margin-bottom: 4px;
  }

  .step-run.running {
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .step-type {
    font-size: 12px;
    text-transform: uppercase;
    font-weight: 500;
  }

  .step-error {
    font-size: 11px;
    color: var(--accent-error);
    margin-left: auto;
  }

  .terminal-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    margin: 16px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }

  .terminal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    font-size: 12px;
  }

  .connection-status {
    color: var(--accent-error);
    font-size: 11px;
  }

  .connection-status.connected {
    color: var(--accent-success);
  }

  .terminal-output {
    flex: 1;
    margin: 0;
    padding: 12px;
    background: #0d0d0d;
    color: #00ff88;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 12px;
    line-height: 1.5;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }
</style>
