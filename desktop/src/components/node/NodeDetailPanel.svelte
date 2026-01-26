<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Node, NodeUpdate, NodeStatus, AgentType, SynthesisQuestions, FeedbackSubmission, Deliverable, DeliverableSchema } from '../../lib/types';
  import { updateNode, deleteNode } from '../../stores/graph';
  import { selectedProjectId } from '../../stores/projects';
  import { api } from '../../lib/api';
  import { get } from 'svelte/store';
  import Button from '../shared/Button.svelte';
  import StatusBadge from '../shared/StatusBadge.svelte';
  import ResourceEditor from './ResourceEditor.svelte';
  import EditNodeModal from '../modals/EditNodeModal.svelte';
  import Modal from '../shared/Modal.svelte';

  export let node: Node;

  const dispatch = createEventDispatcher();

  let showEditModal = false;
  let showRunModal = false;
  let selectedWorkflow: 'claude' | 'codex' | 'gemini' | 'pipeline' | null = null;
  let launching = false;

  let editing = false;
  let editTitle = node.title;
  let editStatus = node.status;
  let editInstructions = node.prompt || node.description || '';
  let editContext = node.context || '';
  let editDeliverables = node.metadata.deliverables || '';
  let editAgentType: AgentType | '' = node.agent_type || '';
  let saving = false;
  let error: string | null = null;

  // Feedback state
  let synthesis: SynthesisQuestions | null = null;
  let feedbackAnswers: Record<string, string> = {};
  let feedbackNotes = '';
  let submittingFeedback = false;
  let feedbackError: string | null = null;

  // Deliverables state
  let deliverables: Deliverable[] = [];
  let loadingDeliverables = false;
  let selectedDeliverable: Deliverable | null = null;
  let showDeliverableModal = false;

  // Computed: use prompt if available, otherwise description
  $: displayInstructions = node.prompt || node.description || '';

  const statusOptions: NodeStatus[] = ['pending', 'in_progress', 'needs_review', 'completed', 'blocked', 'failed'];
  const agentOptions: AgentType[] = ['claude', 'codex', 'gemini', 'custom'];

  // Load synthesis questions when node needs review
  $: if (node.status === 'needs_review') {
    loadSynthesisQuestions();
  } else {
    synthesis = null;
    feedbackAnswers = {};
    feedbackNotes = '';
  }

  // Load deliverables when node changes
  $: if (node.id) {
    loadDeliverables();
  }

  async function loadDeliverables() {
    const projectId = get(selectedProjectId);
    if (!projectId) return;

    loadingDeliverables = true;
    try {
      deliverables = await api.listDeliverables(projectId, node.id);
    } catch (e) {
      console.error('Failed to load deliverables:', e);
      deliverables = [];
    } finally {
      loadingDeliverables = false;
    }
  }

  function viewDeliverable(d: Deliverable) {
    selectedDeliverable = d;
    showDeliverableModal = true;
  }

  function getDeliverableForSchema(schema: DeliverableSchema): Deliverable | undefined {
    return deliverables.find(d => d.name === schema.name);
  }

  function getDeliverableStatusColor(status: string): string {
    switch (status) {
      case 'completed': return 'var(--accent-success)';
      case 'validated': return '#00d9ff';
      case 'failed': return 'var(--accent-error)';
      case 'in_progress': return 'var(--accent-warning)';
      default: return 'var(--text-secondary)';
    }
  }

  async function loadSynthesisQuestions() {
    const projectId = get(selectedProjectId);
    if (!projectId) return;

    try {
      synthesis = await api.getSynthesisQuestions(projectId, node.id);
      // Initialize answers for each question
      feedbackAnswers = {};
      synthesis.questions.forEach((_, index) => {
        feedbackAnswers[String(index)] = '';
      });
    } catch (e) {
      console.error('Failed to load synthesis questions:', e);
    }
  }

  async function submitFeedback(approved: boolean) {
    const projectId = get(selectedProjectId);
    if (!projectId) return;

    submittingFeedback = true;
    feedbackError = null;

    try {
      const feedback: FeedbackSubmission = {
        answers: feedbackAnswers,
        notes: feedbackNotes || undefined,
        approved,
      };

      await api.submitFeedback(projectId, node.id, feedback);
      synthesis = null;
      feedbackAnswers = {};
      feedbackNotes = '';
    } catch (e) {
      feedbackError = e instanceof Error ? e.message : 'Failed to submit feedback';
    } finally {
      submittingFeedback = false;
    }
  }


  $: {
    // Reset form when node changes
    editTitle = node.title;
    editStatus = node.status;
    editInstructions = node.prompt || node.description || '';
    editContext = node.context || '';
    editDeliverables = node.metadata.deliverables || '';
    editAgentType = node.agent_type || '';
    editing = false;
    error = null;
  }

  async function handleSave() {
    saving = true;
    error = null;

    const updates: NodeUpdate = {
      title: editTitle,
      description: editInstructions || undefined,
      status: editStatus,
      prompt: editInstructions || undefined,
      context: editContext || undefined,
      agent_type: editAgentType || undefined,
      metadata: {
        ...node.metadata,
        deliverables: editDeliverables || undefined,
      },
    };

    const result = await updateNode(node.id, updates);
    if (result) {
      editing = false;
    } else {
      error = 'Failed to save changes';
    }
    saving = false;
  }

  async function handleDelete() {
    if (confirm('Delete this node?')) {
      await deleteNode(node.id);
    }
  }

  function handleCancel() {
    editTitle = node.title;
    editStatus = node.status;
    editInstructions = node.prompt || node.description || '';
    editContext = node.context || '';
    editDeliverables = node.metadata.deliverables || '';
    editAgentType = node.agent_type || '';
    editing = false;
    error = null;
  }


  function openRunModal() {
    // Default to pipeline for multi-agent collaboration
    selectedWorkflow = 'pipeline';
    showRunModal = true;
  }

  async function handleRun() {
    if (!selectedWorkflow) return;

    const projectId = get(selectedProjectId);
    if (!projectId) return;

    launching = true;
    error = null;

    try {
      // All workflows use the pipeline API
      await api.launchPipeline(projectId, node.id, {
        use_default_pipeline: true,
      });
      showRunModal = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to run workflow';
    } finally {
      launching = false;
    }
  }
</script>

<div class="panel">
  {#if editing}
    <div class="form">
      <div class="field">
        <label for="title">Title</label>
        <input id="title" bind:value={editTitle} />
      </div>

      <div class="row">
        <div class="field">
          <label for="status">Status</label>
          <select id="status" bind:value={editStatus}>
            {#each statusOptions as status}
              <option value={status}>{status.replace('_', ' ')}</option>
            {/each}
          </select>
        </div>

        <div class="field">
          <label for="agent">Agent</label>
          <select id="agent" bind:value={editAgentType}>
            <option value="">None</option>
            {#each agentOptions as agent}
              <option value={agent}>{agent}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="field">
        <label for="instructions">Instructions</label>
        <textarea id="instructions" bind:value={editInstructions} rows="8"></textarea>
      </div>

      <div class="field">
        <label for="context">Context</label>
        <textarea id="context" bind:value={editContext} rows="4" placeholder="Background information, codebase details, constraints..."></textarea>
      </div>

      <div class="field">
        <label for="deliverables">Deliverables</label>
        <textarea id="deliverables" bind:value={editDeliverables} rows="4" placeholder="Expected outputs (one per line)"></textarea>
      </div>

      {#if error}
        <div class="error">{error}</div>
      {/if}

      <div class="actions">
        <Button on:click={handleCancel}>Cancel</Button>
        <Button variant="primary" on:click={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  {:else}
    <div class="view">
      <div class="header">
        <h3>{node.title}</h3>
        <div class="header-actions">
          <button
            class="run-btn"
            on:click={openRunModal}
            disabled={node.status === 'in_progress' || node.status === 'needs_review'}
            title="Run a workflow to complete this node"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Run
          </button>
          <button class="icon-btn" on:click={() => showEditModal = true} title="Edit fullscreen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
          </button>
          <StatusBadge status={node.status} />
        </div>
      </div>

      {#if node.agent_type}
        <div class="meta">
          <span class="label">Agent:</span>
          <span class="value">{node.agent_type}</span>
        </div>
      {/if}

      {#if displayInstructions}
        <div class="prompt-section">
          <span class="label">Instructions:</span>
          <pre class="prompt">{displayInstructions}</pre>
        </div>
      {/if}

      {#if node.context}
        <div class="prompt-section">
          <span class="label">Context:</span>
          <pre class="prompt context">{node.context}</pre>
        </div>
      {/if}

      {#if node.metadata.deliverables}
        <div class="prompt-section">
          <span class="label">Deliverables:</span>
          <pre class="prompt deliverables">{node.metadata.deliverables}</pre>
        </div>
      {/if}

      <div class="section">
        <h4>Resources</h4>
        <ResourceEditor nodeId={node.id} resources={node.metadata.resources} />
      </div>

      {#if node.expected_deliverables && node.expected_deliverables.length > 0}
        <div class="section">
          <h4>Deliverables</h4>
          <div class="deliverables-list">
            {#each node.expected_deliverables as schema}
              {@const produced = getDeliverableForSchema(schema)}
              <div class="deliverable-row">
                <div class="deliverable-info">
                  <span class="deliverable-name">{schema.name}</span>
                  {#if schema.required}
                    <span class="required-badge">required</span>
                  {/if}
                </div>
                <div class="deliverable-status">
                  {#if produced}
                    <span class="status-dot" style="background: {getDeliverableStatusColor(produced.status)}"></span>
                    <span class="status-text">{produced.status}</span>
                    <button class="view-btn" on:click={() => viewDeliverable(produced)}>
                      View
                    </button>
                  {:else}
                    <span class="status-dot" style="background: var(--text-secondary)"></span>
                    <span class="status-text pending">pending</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if deliverables.length > 0 && (!node.expected_deliverables || node.expected_deliverables.length === 0)}
        <div class="section">
          <h4>Produced Deliverables</h4>
          <div class="deliverables-list">
            {#each deliverables as d}
              <div class="deliverable-row">
                <div class="deliverable-info">
                  <span class="deliverable-name">{d.name}</span>
                  <span class="deliverable-type">{d.type}</span>
                </div>
                <div class="deliverable-status">
                  <span class="status-dot" style="background: {getDeliverableStatusColor(d.status)}"></span>
                  <span class="status-text">{d.status}</span>
                  <button class="view-btn" on:click={() => viewDeliverable(d)}>
                    View
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if node.status === 'needs_review' && synthesis}
        <div class="section feedback-section">
          <h4 class="review-header">
            <span class="pulse-dot"></span>
            Human Review Required
          </h4>

          {#if synthesis.agreements.length > 0}
            <div class="synthesis-block">
              <span class="label">Agreements:</span>
              <ul class="synthesis-list">
                {#each synthesis.agreements as agreement}
                  <li>{agreement}</li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if synthesis.conflicts.length > 0}
            <div class="synthesis-block conflicts">
              <span class="label">Conflicts:</span>
              <ul class="synthesis-list">
                {#each synthesis.conflicts as conflict}
                  <li>{conflict}</li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if synthesis.final_plan}
            <div class="synthesis-block">
              <span class="label">Proposed Plan:</span>
              <pre class="plan-preview">{synthesis.final_plan}</pre>
            </div>
          {/if}

          {#if synthesis.questions.length > 0}
            <div class="questions-section">
              <span class="label">Questions for you:</span>
              {#each synthesis.questions as question, index}
                <div class="question-field">
                  <label for="q-{index}">{index + 1}. {question}</label>
                  <textarea
                    id="q-{index}"
                    bind:value={feedbackAnswers[String(index)]}
                    rows="2"
                    placeholder="Your answer..."
                  ></textarea>
                </div>
              {/each}
            </div>
          {/if}

          <div class="feedback-notes">
            <label for="feedback-notes">Additional Notes (optional):</label>
            <textarea
              id="feedback-notes"
              bind:value={feedbackNotes}
              rows="3"
              placeholder="Any additional context or instructions..."
            ></textarea>
          </div>

          {#if feedbackError}
            <div class="error">{feedbackError}</div>
          {/if}

          <div class="feedback-actions">
            <Button variant="danger" on:click={() => submitFeedback(false)} disabled={submittingFeedback}>
              Reject Plan
            </Button>
            <Button variant="primary" on:click={() => submitFeedback(true)} disabled={submittingFeedback}>
              {submittingFeedback ? 'Submitting...' : 'Approve & Continue'}
            </Button>
          </div>
        </div>
      {/if}

      <div class="actions">
        <Button on:click={() => editing = true}>Edit</Button>
        <Button variant="danger" on:click={handleDelete}>Delete</Button>
      </div>
    </div>
  {/if}
</div>

<EditNodeModal
  {node}
  open={showEditModal}
  on:close={() => showEditModal = false}
/>

<!-- Deliverable Content Modal -->
<Modal title={selectedDeliverable?.name || 'Deliverable'} open={showDeliverableModal} on:close={() => showDeliverableModal = false}>
  <div class="deliverable-modal-content">
    {#if selectedDeliverable}
      <div class="deliverable-meta">
        <span class="label">Type:</span>
        <span class="value">{selectedDeliverable.type}</span>
        <span class="label">Status:</span>
        <span class="value" style="color: {getDeliverableStatusColor(selectedDeliverable.status)}">{selectedDeliverable.status}</span>
      </div>
      {#if selectedDeliverable.validation_errors && selectedDeliverable.validation_errors.length > 0}
        <div class="validation-errors">
          <span class="label">Validation Errors:</span>
          <ul>
            {#each selectedDeliverable.validation_errors as error}
              <li>{error}</li>
            {/each}
          </ul>
        </div>
      {/if}
      <pre class="deliverable-content">{selectedDeliverable.content || '(empty)'}</pre>
    {/if}
  </div>
</Modal>

<Modal title="Run Workflow" open={showRunModal} on:close={() => showRunModal = false}>
  <div class="run-modal-content">
    <div class="node-summary">
      <h4>{node.title}</h4>
      {#if node.expected_deliverables && node.expected_deliverables.length > 0}
        <div class="deliverables-preview">
          <span class="field-label">Deliverables to produce:</span>
          <div class="deliverable-tags">
            {#each node.expected_deliverables as d}
              <span class="deliverable-tag">{d.name}</span>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <div class="workflow-section">
      <span class="field-label">Select Workflow:</span>
      <div class="workflow-buttons">
        <button
          class="workflow-btn pipeline"
          class:selected={selectedWorkflow === 'pipeline'}
          on:click={() => selectedWorkflow = 'pipeline'}
        >
          <div class="workflow-header">
            <span class="workflow-icon">🔄</span>
            <span class="workflow-name">Multi-Agent Pipeline</span>
          </div>
          <span class="workflow-desc">All agents collaborate: Research → Plan → Implement → Review</span>
          <span class="workflow-badge recommended">Recommended</span>
        </button>

        <div class="workflow-divider">
          <span>or run single agent</span>
        </div>

        <div class="single-agents">
          <button
            class="workflow-btn single claude"
            class:selected={selectedWorkflow === 'claude'}
            on:click={() => selectedWorkflow = 'claude'}
          >
            <span class="workflow-icon">🧠</span>
            <span class="workflow-name">Claude</span>
            <span class="workflow-desc">Planning & Synthesis</span>
          </button>
          <button
            class="workflow-btn single codex"
            class:selected={selectedWorkflow === 'codex'}
            on:click={() => selectedWorkflow = 'codex'}
          >
            <span class="workflow-icon">⚡</span>
            <span class="workflow-name">Codex</span>
            <span class="workflow-desc">Code & Implementation</span>
          </button>
          <button
            class="workflow-btn single gemini"
            class:selected={selectedWorkflow === 'gemini'}
            on:click={() => selectedWorkflow = 'gemini'}
          >
            <span class="workflow-icon">🔍</span>
            <span class="workflow-name">Gemini</span>
            <span class="workflow-desc">Research & Analysis</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <svelte:fragment slot="footer">
    <Button variant="secondary" on:click={() => showRunModal = false}>Cancel</Button>
    <Button variant="primary" on:click={handleRun} disabled={!selectedWorkflow || launching}>
      {launching ? 'Starting...' : 'Start Workflow'}
    </Button>
  </svelte:fragment>
</Modal>

<style>
  .panel {
    padding: 16px;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  label {
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
  }

  input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .error {
    color: var(--accent-error);
    font-size: 14px;
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;
  }

  .view {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .run-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
  }

  .run-btn:hover {
    opacity: 0.9;
  }

  .run-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .run-btn svg {
    width: 14px;
    height: 14px;
  }

  .icon-btn {
    background: none;
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    padding: 6px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .meta {
    font-size: 14px;
  }

  .label {
    color: var(--text-secondary);
  }

  .value {
    color: var(--accent-primary);
  }

  .prompt-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .prompt {
    background: var(--bg-primary);
    padding: 12px;
    border-radius: 4px;
    font-size: 13px;
    overflow-x: auto;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .prompt.deliverables {
    border-left: 3px solid var(--accent-primary);
  }

  .prompt.context {
    border-left: 3px solid var(--text-secondary);
    font-style: italic;
  }

  .section {
    border-top: 1px solid var(--border-color);
    padding-top: 16px;
  }

  h4 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  /* Run Modal Styles */
  .run-modal-content {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .node-summary {
    background: var(--bg-primary);
    padding: 12px;
    border-radius: 6px;
    border: 1px solid var(--border-color);
  }

  .node-summary h4 {
    margin: 0;
    font-size: 16px;
    color: var(--text-primary);
  }

  .deliverables-preview {
    margin-top: 8px;
  }

  .deliverable-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }

  .deliverable-tag {
    font-size: 12px;
    padding: 4px 8px;
    background: color-mix(in srgb, var(--accent-primary) 20%, transparent);
    color: var(--accent-primary);
    border-radius: 4px;
    font-weight: 500;
  }

  .workflow-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-label {
    font-size: 12px;
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .workflow-buttons {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .workflow-btn {
    display: flex;
    flex-direction: column;
    padding: 12px;
    background: var(--bg-primary);
    border: 2px solid var(--border-color);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
  }

  .workflow-btn:hover {
    border-color: var(--text-secondary);
  }

  .workflow-btn.selected {
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
  }

  .workflow-btn.pipeline.selected {
    border-color: #8b5cf6;
    background: color-mix(in srgb, #8b5cf6 10%, transparent);
  }

  .workflow-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .workflow-icon {
    font-size: 20px;
  }

  .workflow-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .workflow-desc {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 4px;
  }

  .workflow-badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    font-weight: 600;
    margin-top: 8px;
    width: fit-content;
  }

  .workflow-badge.recommended {
    background: color-mix(in srgb, #22c55e 20%, transparent);
    color: #22c55e;
  }

  .workflow-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .workflow-divider::before,
  .workflow-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border-color);
  }

  .single-agents {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .workflow-btn.single {
    align-items: center;
    text-align: center;
    padding: 12px 8px;
  }

  .workflow-btn.single .workflow-icon {
    font-size: 24px;
  }

  .workflow-btn.single .workflow-name {
    font-size: 13px;
  }

  .workflow-btn.single .workflow-desc {
    font-size: 10px;
    margin-top: 2px;
  }

  .workflow-btn.single.claude.selected {
    border-color: #f97316;
    background: color-mix(in srgb, #f97316 10%, transparent);
  }

  .workflow-btn.single.codex.selected {
    border-color: #22c55e;
    background: color-mix(in srgb, #22c55e 10%, transparent);
  }

  .workflow-btn.single.gemini.selected {
    border-color: #3b82f6;
    background: color-mix(in srgb, #3b82f6 10%, transparent);
  }

  /* Feedback / Human Review Section */
  .feedback-section {
    background: color-mix(in srgb, var(--accent-error) 10%, transparent);
    border: 1px solid var(--accent-error);
    border-radius: 8px;
    padding: 16px;
    margin-top: 16px;
  }

  .review-header {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--accent-error);
    margin: 0 0 16px;
  }

  .pulse-dot {
    width: 10px;
    height: 10px;
    background: var(--accent-error);
    border-radius: 50%;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.2); }
  }

  .synthesis-block {
    margin-bottom: 16px;
  }

  .synthesis-block.conflicts {
    background: color-mix(in srgb, var(--accent-warning) 10%, transparent);
    border-left: 3px solid var(--accent-warning);
    padding: 8px 12px;
    border-radius: 4px;
  }

  .synthesis-list {
    margin: 8px 0 0 20px;
    padding: 0;
  }

  .synthesis-list li {
    margin-bottom: 4px;
    font-size: 13px;
  }

  .plan-preview {
    background: var(--bg-primary);
    padding: 12px;
    border-radius: 4px;
    font-size: 13px;
    max-height: 200px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    margin-top: 8px;
  }

  .questions-section {
    margin-bottom: 16px;
  }

  .question-field {
    margin-top: 12px;
  }

  .question-field label {
    display: block;
    font-size: 13px;
    color: var(--text-primary);
    margin-bottom: 4px;
    font-weight: 500;
  }

  .question-field textarea {
    width: 100%;
    resize: vertical;
  }

  .feedback-notes {
    margin-bottom: 16px;
  }

  .feedback-notes label {
    display: block;
    margin-bottom: 4px;
  }

  .feedback-notes textarea {
    width: 100%;
    resize: vertical;
  }

  .feedback-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  /* Deliverables Section */
  .deliverables-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .deliverable-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: var(--bg-primary);
    border-radius: 4px;
    border: 1px solid var(--border-color);
  }

  .deliverable-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .deliverable-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .deliverable-type {
    font-size: 11px;
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .required-badge {
    font-size: 10px;
    padding: 2px 6px;
    background: color-mix(in srgb, var(--accent-warning) 20%, transparent);
    color: var(--accent-warning);
    border-radius: 4px;
    text-transform: uppercase;
    font-weight: 500;
  }

  .deliverable-status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-text {
    font-size: 12px;
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .status-text.pending {
    color: var(--text-secondary);
  }

  .view-btn {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
  }

  .view-btn:hover {
    background: var(--accent-primary);
    color: white;
    border-color: var(--accent-primary);
  }

  /* Deliverable Modal */
  .deliverable-modal-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .deliverable-meta {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 13px;
  }

  .deliverable-meta .label {
    color: var(--text-secondary);
  }

  .deliverable-meta .value {
    margin-right: 12px;
  }

  .validation-errors {
    background: color-mix(in srgb, var(--accent-error) 10%, transparent);
    border: 1px solid var(--accent-error);
    border-radius: 4px;
    padding: 8px 12px;
  }

  .validation-errors ul {
    margin: 4px 0 0 16px;
    padding: 0;
  }

  .validation-errors li {
    font-size: 12px;
    color: var(--accent-error);
  }

  .deliverable-content {
    background: var(--bg-primary);
    padding: 12px;
    border-radius: 4px;
    font-size: 13px;
    max-height: 400px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
  }

</style>
