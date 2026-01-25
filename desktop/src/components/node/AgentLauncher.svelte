<script lang="ts">
  import { onMount } from 'svelte';
  import type { Node, AgentTemplate, LaunchPreview, ExecutionWithStepRuns } from '../../lib/types';
  import { createRun, runs } from '../../stores/runs';
  import {
    templates,
    loadTemplates,
  } from '../../stores/agentTemplates';
  import {
    executions,
    loadExecutions,
    previewLaunch,
    launch,
    getExecutionsForNode,
  } from '../../stores/executions';
  import Button from '../shared/Button.svelte';
  import StatusBadge from '../shared/StatusBadge.svelte';
  import Modal from '../shared/Modal.svelte';

  export let node: Node;

  let launching = false;
  let error: string | null = null;
  let selectedTemplateId: number | null = null;
  let createWorktree = false;

  // Preview state
  let showPreview = false;
  let previewData: LaunchPreview | null = null;
  let loadingPreview = false;

  // Recent executions for this node
  $: nodeExecutions = getExecutionsForNode(node.id).slice(0, 5);
  $: nodeRuns = $runs.filter(r => r.node_id === node.id).slice(0, 5);

  onMount(() => {
    loadTemplates();
    loadExecutions(node.id);
  });

  function buildPrompt(): string {
    let prompt = '';

    // Include context if available
    if (node.context) {
      prompt += `## Context\n${node.context}\n\n`;
    }

    // Include prompt/instructions
    if (node.prompt) {
      prompt += `## Instructions\n${node.prompt}\n`;
    }

    // Append resources to prompt
    if (node.metadata.resources.length > 0) {
      prompt += '\n\n## Resources\n';
      for (const resource of node.metadata.resources) {
        prompt += `\n### ${resource.title}`;
        if (resource.url) prompt += `\nURL: ${resource.url}`;
        if (resource.notes) prompt += `\nNotes: ${resource.notes}`;
      }
    }

    return prompt.trim();
  }

  async function launchAgent() {
    if (!node.agent_type) return;

    launching = true;
    error = null;

    const result = await createRun({
      node_id: node.id,
      agent_type: node.agent_type,
      prompt: buildPrompt(),
    });

    if (!result) {
      error = 'Failed to launch agent';
    }
    launching = false;
  }

  async function handlePreview() {
    if (!selectedTemplateId) return;

    loadingPreview = true;
    error = null;

    const result = await previewLaunch(node.id, {
      template_id: selectedTemplateId,
      create_worktree: createWorktree,
    });

    if (result) {
      previewData = result;
      showPreview = true;
    } else {
      error = 'Failed to load preview';
    }

    loadingPreview = false;
  }

  async function handleLaunch() {
    if (!selectedTemplateId) return;

    launching = true;
    error = null;
    showPreview = false;

    const result = await launch(node.id, {
      template_id: selectedTemplateId,
      create_worktree: createWorktree,
    });

    if (!result) {
      error = 'Failed to launch execution';
    }

    launching = false;
  }

  async function handleQuickLaunch() {
    if (!selectedTemplateId) return;
    await handleLaunch();
  }
</script>

<div class="launcher">
  <!-- Template-based Launch -->
  <div class="template-launcher">
    <h5>Launch Template</h5>

    <div class="form-group">
      <select
        bind:value={selectedTemplateId}
        class="select"
        disabled={launching}
      >
        <option value={null}>Select a template...</option>
        {#each $templates as template}
          <option value={template.id}>{template.name}</option>
        {/each}
      </select>
    </div>

    <label class="checkbox-label">
      <input
        type="checkbox"
        bind:checked={createWorktree}
        disabled={launching}
      />
      Create git worktree (isolated branch)
    </label>

    <div class="button-group">
      <Button
        variant="secondary"
        size="small"
        on:click={handlePreview}
        disabled={!selectedTemplateId || loadingPreview || launching}
      >
        {loadingPreview ? 'Loading...' : 'Preview'}
      </Button>
      <Button
        variant="primary"
        size="small"
        on:click={handleQuickLaunch}
        disabled={!selectedTemplateId || launching}
      >
        {launching ? 'Launching...' : 'Launch'}
      </Button>
    </div>
  </div>

  <!-- Simple Agent Launch (existing behavior) -->
  {#if node.agent_type}
    <div class="simple-launcher">
      <h5>Quick Run</h5>
      <Button variant="secondary" on:click={launchAgent} disabled={launching}>
        {launching ? 'Launching...' : `Run ${node.agent_type}`}
      </Button>
    </div>
  {/if}

  {#if error}
    <div class="error">{error}</div>
  {/if}

  <!-- Recent Executions -->
  {#if nodeExecutions.length > 0}
    <div class="history">
      <h5>Recent Executions</h5>
      <ul>
        {#each nodeExecutions as exec}
          <li class="history-item">
            <StatusBadge status={exec.status} />
            <span class="history-info">
              {#if exec.tmux_session}
                <span class="session">{exec.tmux_session}</span>
              {/if}
              <span class="time">
                {new Date(exec.created_at).toLocaleTimeString()}
              </span>
            </span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- Recent Runs (legacy) -->
  {#if nodeRuns.length > 0}
    <div class="history">
      <h5>Recent Runs</h5>
      <ul>
        {#each nodeRuns as run}
          <li class="history-item">
            <StatusBadge status={run.status} />
            <span class="time">
              {new Date(run.created_at).toLocaleTimeString()}
            </span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<!-- Preview Modal -->
{#if previewData}
  <Modal title="Launch Preview" open={showPreview} on:close={() => showPreview = false}>
    <div class="preview-content">
      <p class="preview-intro">
        The following prompts will be sent to each agent step:
      </p>

      {#each previewData.resolved_prompts as step}
        <div class="preview-step">
          <div class="step-header">
            <span class="step-name">{step.step_name}</span>
            <span class="step-type">{step.agent_type}</span>
          </div>
          <pre class="step-prompt">{step.resolved_prompt}</pre>
        </div>
      {/each}

      <div class="preview-context">
        <h6>Context Variables</h6>
        <pre>{JSON.stringify(previewData.context, null, 2)}</pre>
      </div>
    </div>

    <svelte:fragment slot="footer">
      <Button variant="secondary" on:click={() => showPreview = false}>
        Cancel
      </Button>
      <Button variant="primary" on:click={handleLaunch} disabled={launching}>
        {launching ? 'Launching...' : 'Launch Execution'}
      </Button>
    </svelte:fragment>
  </Modal>
{/if}

<style>
  .launcher {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  h5 {
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .template-launcher,
  .simple-launcher {
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border-color);
  }

  .form-group {
    margin-bottom: 12px;
  }

  .select {
    width: 100%;
    padding: 8px 12px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 14px;
  }

  .select:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 12px;
    cursor: pointer;
  }

  .checkbox-label input {
    margin: 0;
  }

  .button-group {
    display: flex;
    gap: 8px;
  }

  .error {
    color: var(--accent-error);
    font-size: 13px;
    padding: 8px 12px;
    background: rgba(255, 68, 68, 0.1);
    border-radius: 6px;
  }

  .history {
    margin-top: 8px;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .history-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    font-size: 13px;
  }

  .history-info {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .session {
    font-family: monospace;
    font-size: 11px;
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .time {
    color: var(--text-secondary);
    font-size: 12px;
  }

  /* Preview Modal Styles */
  .preview-content {
    max-height: 60vh;
    overflow-y: auto;
  }

  .preview-intro {
    margin: 0 0 16px;
    color: var(--text-secondary);
    font-size: 14px;
  }

  .preview-step {
    margin-bottom: 16px;
    background: var(--bg-secondary);
    border-radius: 8px;
    overflow: hidden;
  }

  .step-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: var(--bg-tertiary);
  }

  .step-name {
    font-weight: 500;
    font-size: 14px;
  }

  .step-type {
    font-size: 11px;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--accent-primary);
  }

  .step-prompt {
    margin: 0;
    padding: 12px;
    font-size: 12px;
    background: var(--bg-primary);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 150px;
    overflow-y: auto;
  }

  .preview-context {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border-color);
  }

  .preview-context h6 {
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .preview-context pre {
    margin: 0;
    padding: 12px;
    font-size: 11px;
    background: var(--bg-secondary);
    border-radius: 6px;
    max-height: 100px;
    overflow: auto;
  }
</style>
