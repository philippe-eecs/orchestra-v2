<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    selectedTemplate,
    selectedTemplateLoading,
    templatesError,
    createTemplate,
    updateTemplate,
    createStep,
    updateStep,
    deleteStep,
    createEdge,
    deleteEdge,
  } from '../../stores/agentTemplates';
  import ErrorBanner from '../shared/ErrorBanner.svelte';
  import Button from '../shared/Button.svelte';
  import type { AgentStep, AgentStepCreate, AgentType, OutputFormat } from '../../lib/types';

  // Canvas state
  let canvasContainer: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let panX = 50;
  let panY = 50;
  let scale = 1;
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let dragStep: number | null = null;
  let dragStepStart = { x: 0, y: 0 };

  // Edge creation state
  let isCreatingEdge = false;
  let edgeSource: number | null = null;
  let edgePreviewPos = { x: 0, y: 0 };

  // Step editor state
  let selectedStepId: number | null = null;
  let editingStep: Partial<AgentStep> | null = null;

  // New template state
  type CreateMode = 'choose' | 'simple' | 'advanced';
  let createMode: CreateMode | null = null;
  let newTemplateName = '';
  let newAgentType: AgentType = 'claude';
  let newPrompt = '';

  const STEP_WIDTH = 160;
  const STEP_HEIGHT = 80;
  const STEP_RADIUS = 8;

  const agentColors: Record<string, string> = {
    claude: '#f97316',
    codex: '#22c55e',
    gemini: '#3b82f6',
    custom: '#8b5cf6',
  };

  $: if (canvas) {
    ctx = canvas.getContext('2d');
    resizeCanvas();
  }

  $: if (canvas && ctx && $selectedTemplate) {
    draw();
  }

  $: selectedStep = $selectedTemplate?.steps.find(s => s.id === selectedStepId) || null;
  $: templateName = $selectedTemplate ? $selectedTemplate.name : '';

  onMount(() => {
    window.addEventListener('resize', resizeCanvas);
  });

  onDestroy(() => {
    window.removeEventListener('resize', resizeCanvas);
  });

  function resizeCanvas() {
    if (canvas && canvasContainer) {
      canvas.width = canvasContainer.clientWidth;
      canvas.height = canvasContainer.clientHeight;
      draw();
    }
  }

  function draw() {
    if (!ctx || !canvas || !$selectedTemplate) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);

    const steps = $selectedTemplate.steps;
    const edges = $selectedTemplate.edges;

    // Draw edges
    ctx.strokeStyle = '#3a3a5a';
    ctx.lineWidth = 2;
    for (const edge of edges) {
      const parent = steps.find(s => s.id === edge.parent_id);
      const child = steps.find(s => s.id === edge.child_id);
      if (parent && child) {
        drawEdge(parent, child);
      }
    }

    // Draw edge preview
    if (isCreatingEdge && edgeSource !== null) {
      const source = steps.find(s => s.id === edgeSource);
      if (source) {
        ctx.strokeStyle = '#00d9ff';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(source.position_x + STEP_WIDTH, source.position_y + STEP_HEIGHT / 2);
        ctx.lineTo(edgePreviewPos.x, edgePreviewPos.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw steps
    for (const step of steps) {
      drawStep(step);
    }

    ctx.restore();
  }

  function drawEdge(parent: AgentStep, child: AgentStep) {
    if (!ctx) return;

    const startX = parent.position_x + STEP_WIDTH;
    const startY = parent.position_y + STEP_HEIGHT / 2;
    const endX = child.position_x;
    const endY = child.position_y + STEP_HEIGHT / 2;

    // Draw curved line
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    const cpOffset = Math.abs(endX - startX) / 2;
    ctx.bezierCurveTo(
      startX + cpOffset, startY,
      endX - cpOffset, endY,
      endX, endY
    );
    ctx.stroke();

    // Draw arrow
    const angle = Math.atan2(endY - startY, endX - startX);
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - 10 * Math.cos(angle - 0.3), endY - 10 * Math.sin(angle - 0.3));
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - 10 * Math.cos(angle + 0.3), endY - 10 * Math.sin(angle + 0.3));
    ctx.stroke();
  }

  function drawStep(step: AgentStep) {
    if (!ctx) return;

    const isSelected = step.id === selectedStepId;
    const color = agentColors[step.agent_type] || agentColors.custom;

    // Background
    ctx.fillStyle = isSelected ? '#1a2744' : '#16213e';
    ctx.strokeStyle = isSelected ? color : '#2a2a4a';
    ctx.lineWidth = isSelected ? 2 : 1;

    ctx.beginPath();
    ctx.roundRect(step.position_x, step.position_y, STEP_WIDTH, STEP_HEIGHT, STEP_RADIUS);
    ctx.fill();
    ctx.stroke();

    // Agent type indicator
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(step.position_x, step.position_y, 4, STEP_HEIGHT, [STEP_RADIUS, 0, 0, STEP_RADIUS]);
    ctx.fill();

    // Name
    ctx.fillStyle = '#e8e8e8';
    ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
    let name = step.name;
    const maxWidth = STEP_WIDTH - 20;
    while (ctx.measureText(name).width > maxWidth && name.length > 3) {
      name = name.slice(0, -4) + '...';
    }
    ctx.fillText(name, step.position_x + 14, step.position_y + 28);

    // Agent type
    ctx.fillStyle = color;
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(step.agent_type.toUpperCase(), step.position_x + 14, step.position_y + 48);

    // Output format
    ctx.fillStyle = '#666';
    ctx.fillText(step.output_format, step.position_x + 14, step.position_y + 64);

    // Connection points
    ctx.fillStyle = '#4a4a6a';

    // Input (left)
    ctx.beginPath();
    ctx.arc(step.position_x, step.position_y + STEP_HEIGHT / 2, 5, 0, Math.PI * 2);
    ctx.fill();

    // Output (right)
    ctx.beginPath();
    ctx.arc(step.position_x + STEP_WIDTH, step.position_y + STEP_HEIGHT / 2, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function getMousePos(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - panX) / scale,
      y: (e.clientY - rect.top - panY) / scale,
    };
  }

  function findStepAt(x: number, y: number): number | null {
    if (!$selectedTemplate) return null;
    for (const step of $selectedTemplate.steps) {
      if (
        x >= step.position_x &&
        x <= step.position_x + STEP_WIDTH &&
        y >= step.position_y &&
        y <= step.position_y + STEP_HEIGHT
      ) {
        return step.id;
      }
    }
    return null;
  }

  function isNearOutputPort(x: number, y: number, step: AgentStep): boolean {
    const portX = step.position_x + STEP_WIDTH;
    const portY = step.position_y + STEP_HEIGHT / 2;
    const distance = Math.sqrt((x - portX) ** 2 + (y - portY) ** 2);
    return distance < 12;
  }

  function isNearInputPort(x: number, y: number, step: AgentStep): boolean {
    const portX = step.position_x;
    const portY = step.position_y + STEP_HEIGHT / 2;
    const distance = Math.sqrt((x - portX) ** 2 + (y - portY) ** 2);
    return distance < 12;
  }

  function handleMouseDown(e: MouseEvent) {
    const pos = getMousePos(e);
    const stepId = findStepAt(pos.x, pos.y);

    if (stepId && $selectedTemplate) {
      const step = $selectedTemplate.steps.find(s => s.id === stepId);
      if (step && isNearOutputPort(pos.x, pos.y, step)) {
        // Start edge creation
        isCreatingEdge = true;
        edgeSource = stepId;
        edgePreviewPos = pos;
      } else {
        // Start step drag
        selectedStepId = stepId;
        dragStep = stepId;
        dragStepStart = { x: step!.position_x, y: step!.position_y };
      }
    } else {
      // Start canvas pan
      selectedStepId = null;
      isDragging = true;
    }
    dragStart = { x: e.clientX, y: e.clientY };
  }

  function handleMouseMove(e: MouseEvent) {
    const pos = getMousePos(e);

    if (isCreatingEdge) {
      edgePreviewPos = pos;
      draw();
    } else if (dragStep !== null && $selectedTemplate) {
      const dx = (e.clientX - dragStart.x) / scale;
      const dy = (e.clientY - dragStart.y) / scale;

      // Update step position locally for smooth dragging
      const step = $selectedTemplate.steps.find(s => s.id === dragStep);
      if (step) {
        step.position_x = dragStepStart.x + dx;
        step.position_y = dragStepStart.y + dy;
        draw();
      }
    } else if (isDragging) {
      panX += e.clientX - dragStart.x;
      panY += e.clientY - dragStart.y;
      dragStart = { x: e.clientX, y: e.clientY };
      draw();
    }
  }

  async function handleMouseUp(e: MouseEvent) {
    if (isCreatingEdge && edgeSource !== null && $selectedTemplate) {
      const pos = getMousePos(e);

      // Check if dropped on a step's input port
      for (const step of $selectedTemplate.steps) {
        if (step.id !== edgeSource && isNearInputPort(pos.x, pos.y, step)) {
          await createEdge($selectedTemplate.id, {
            parent_id: edgeSource,
            child_id: step.id,
          });
          break;
        }
      }
    }

    if (dragStep !== null && $selectedTemplate) {
      const step = $selectedTemplate.steps.find(s => s.id === dragStep);
      if (step) {
        // Save position to backend
        await updateStep($selectedTemplate.id, dragStep, {
          position_x: step.position_x,
          position_y: step.position_y,
        });
      }
    }

    isCreatingEdge = false;
    edgeSource = null;
    isDragging = false;
    dragStep = null;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    scale *= zoomFactor;
    scale = Math.max(0.3, Math.min(2, scale));
    draw();
  }

  async function handleAddStep() {
    if (!$selectedTemplate) return;

    const newStep: AgentStepCreate = {
      name: 'New Step',
      agent_type: 'claude' as AgentType,
      prompt_template: 'Enter your prompt here...',
      output_format: 'text' as OutputFormat,
      position_x: 100 + ($selectedTemplate.steps.length * 200),
      position_y: 100,
    };

    const step = await createStep($selectedTemplate.id, newStep);
    if (step) {
      selectedStepId = step.id;
    }
  }

  async function handleDeleteStep() {
    if (!$selectedTemplate || selectedStepId === null) return;
    await deleteStep($selectedTemplate.id, selectedStepId);
    selectedStepId = null;
  }

  async function handleSaveStep() {
    if (!$selectedTemplate || !editingStep || selectedStepId === null) return;
    await updateStep($selectedTemplate.id, selectedStepId, editingStep);
    editingStep = null;
  }

  function startEditing() {
    if (selectedStep) {
      editingStep = { ...selectedStep };
    }
  }

  async function handleCreateSimpleAgent() {
    if (!newTemplateName.trim() || !newPrompt.trim()) return;

    await createTemplate({
      name: newTemplateName,
      description: `Simple ${newAgentType} agent`,
      metadata: { icon: getAgentIcon(newAgentType), simple: true },
      steps: [{
        name: newTemplateName,
        agent_type: newAgentType,
        prompt_template: newPrompt,
        output_format: 'text',
        position_x: 100,
        position_y: 100,
      }],
      edges: [],
    });

    resetCreateForm();
  }

  async function handleCreateAdvancedTemplate() {
    if (!newTemplateName.trim()) return;

    await createTemplate({
      name: newTemplateName,
      description: '',
      metadata: {},
      steps: [],
      edges: [],
    });

    resetCreateForm();
  }

  function resetCreateForm() {
    createMode = null;
    newTemplateName = '';
    newAgentType = 'claude';
    newPrompt = '';
  }

  function getAgentIcon(type: AgentType): string {
    const icons: Record<AgentType, string> = {
      claude: '🧠',
      codex: '💻',
      gemini: '✨',
      custom: '🔧',
    };
    return icons[type] || '🤖';
  }
</script>

<div class="agent-builder">
  {#if !$selectedTemplate && !createMode}
    <div class="placeholder">
      <p>Select a template to edit or create a new one</p>
      <Button on:click={() => createMode = 'choose'}>Create Agent</Button>
    </div>

  {:else if createMode === 'choose'}
    <div class="create-choice">
      <h3>Create New Agent</h3>
      <p class="choice-subtitle">Choose how you want to create your agent</p>

      <div class="choice-cards">
        <button class="choice-card" on:click={() => createMode = 'simple'}>
          <div class="choice-icon">⚡</div>
          <div class="choice-info">
            <h4>Simple Agent</h4>
            <p>Single step with one prompt. Quick and easy.</p>
          </div>
        </button>

        <button class="choice-card" on:click={() => createMode = 'advanced'}>
          <div class="choice-icon">🔀</div>
          <div class="choice-info">
            <h4>Multi-Step Pipeline</h4>
            <p>Build a DAG with multiple agents working together.</p>
          </div>
        </button>
      </div>

      <Button variant="secondary" on:click={() => createMode = null}>Cancel</Button>
    </div>

  {:else if createMode === 'simple'}
    <div class="simple-form">
      <h3>Create Simple Agent</h3>

      <div class="form-group">
        <label>Name</label>
        <input
          type="text"
          bind:value={newTemplateName}
          placeholder="e.g., Code Reviewer, Research Assistant"
          class="input"
        />
      </div>

      <div class="form-group">
        <label>Agent Type</label>
        <div class="agent-type-selector">
          {#each ['claude', 'codex', 'gemini', 'custom'] as type}
            <button
              class="agent-type-btn"
              class:selected={newAgentType === type}
              on:click={() => newAgentType = type}
            >
              <span class="agent-icon">{getAgentIcon(type)}</span>
              <span>{type}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="form-group">
        <label>Prompt</label>
        <textarea
          bind:value={newPrompt}
          placeholder="Enter your prompt here. Use {'{'}context.node.title{'}'} for node context."
          class="input textarea"
          rows="8"
        ></textarea>
      </div>

      <div class="form-actions">
        <Button variant="secondary" on:click={() => createMode = 'choose'}>Back</Button>
        <Button on:click={handleCreateSimpleAgent} disabled={!newTemplateName.trim() || !newPrompt.trim()}>
          Create Agent
        </Button>
      </div>
    </div>

  {:else if createMode === 'advanced'}
    <div class="advanced-form">
      <h3>Create Multi-Step Pipeline</h3>

      <div class="form-group">
        <label>Pipeline Name</label>
        <input
          type="text"
          bind:value={newTemplateName}
          placeholder="e.g., Research Pipeline, Code Review Flow"
          class="input"
        />
      </div>

      <div class="form-actions">
        <Button variant="secondary" on:click={() => createMode = 'choose'}>Back</Button>
        <Button on:click={handleCreateAdvancedTemplate} disabled={!newTemplateName.trim()}>
          Create & Edit Pipeline
        </Button>
      </div>

      <p class="form-hint">After creating, add steps and connect them in the visual editor.</p>
    </div>

  {:else if $selectedTemplateLoading}
    <div class="loading">Loading template...</div>
  {:else}
    <div class="builder-layout">
      <div class="toolbar">
        <span class="template-name">{templateName}</span>
        <div class="toolbar-actions">
          <Button size="small" on:click={handleAddStep}>+ Add Step</Button>
          {#if selectedStepId}
            <Button size="small" variant="secondary" on:click={handleDeleteStep}>Delete Step</Button>
          {/if}
        </div>
      </div>

      <ErrorBanner message={$templatesError} />

      <div class="builder-content">
        <div class="canvas-container" bind:this={canvasContainer}>
          <canvas
            bind:this={canvas}
            on:mousedown={handleMouseDown}
            on:mousemove={handleMouseMove}
            on:mouseup={handleMouseUp}
            on:mouseleave={handleMouseUp}
            on:wheel={handleWheel}
          ></canvas>

          <!-- Help overlay when no steps exist -->
          {#if $selectedTemplate && $selectedTemplate.steps.length === 0}
            <div class="empty-canvas-help">
              <div class="help-icon">📦</div>
              <h4>Empty Pipeline</h4>
              <p>Click "+ Add Step" above to add your first agent step</p>
            </div>
          {:else if !selectedStepId}
            <div class="canvas-hint">
              <span class="hint-item">🖱️ Click step to edit</span>
              <span class="hint-item">↔️ Drag step to move</span>
              <span class="hint-item">🔗 Drag from ● to ● to connect</span>
            </div>
          {/if}
        </div>

        {#if selectedStep}
          <div class="step-editor">
            <div class="step-editor-header">
              <h4>Edit Step</h4>
              <div class="step-color-indicator" style="background: {agentColors[selectedStep.agent_type] || agentColors.custom}"></div>
            </div>

            <div class="form-group">
              <label>Name</label>
              <input
                type="text"
                value={editingStep?.name ?? selectedStep.name}
                on:input={(e) => {
                  if (!editingStep) startEditing();
                  editingStep = { ...editingStep, name: e.currentTarget.value };
                }}
                class="input"
              />
            </div>

            <div class="form-group">
              <label>Agent Type</label>
              <select
                value={editingStep?.agent_type ?? selectedStep.agent_type}
                on:change={(e) => {
                  if (!editingStep) startEditing();
                  editingStep = { ...editingStep, agent_type: e.currentTarget.value };
                }}
                class="input"
              >
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
                <option value="gemini">Gemini</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div class="form-group">
              <label>Output Format</label>
              <select
                value={editingStep?.output_format ?? selectedStep.output_format}
                on:change={(e) => {
                  if (!editingStep) startEditing();
                  editingStep = { ...editingStep, output_format: e.currentTarget.value };
                }}
                class="input"
              >
                <option value="text">Text</option>
                <option value="json">JSON</option>
                <option value="code">Code</option>
                <option value="markdown">Markdown</option>
              </select>
            </div>

            <div class="form-group">
              <label>Prompt Template</label>
              <textarea
                value={editingStep?.prompt_template ?? selectedStep.prompt_template}
                on:input={(e) => {
                  if (!editingStep) startEditing();
                  editingStep = { ...editingStep, prompt_template: e.currentTarget.value };
                }}
                class="input textarea"
                rows="6"
                placeholder="Use {'{'}context.node.title{'}'} for variables"
              ></textarea>
              <div class="hint">Variables: {'{'}context.node.title{'}'}, {'{'}context.node.description{'}'}</div>
            </div>

            {#if editingStep}
              <div class="form-actions">
                <Button variant="secondary" on:click={() => editingStep = null}>Cancel</Button>
                <Button on:click={handleSaveStep}>Save</Button>
              </div>
            {/if}
          </div>
        {:else if $selectedTemplate && $selectedTemplate.steps.length > 0}
          <div class="step-editor step-editor-empty">
            <div class="no-selection">
              <div class="no-selection-icon">👆</div>
              <h4>Select a Step</h4>
              <p>Click on any step in the canvas to edit its properties</p>
              <div class="step-list">
                <span class="step-list-label">Steps in this pipeline:</span>
                {#each $selectedTemplate.steps as step}
                  <button
                    class="step-list-item"
                    on:click={() => selectedStepId = step.id}
                  >
                    <span class="step-dot" style="background: {agentColors[step.agent_type]}"></span>
                    {step.name}
                  </button>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </div>

      <div class="canvas-controls">
        <button on:click={() => { scale *= 1.2; draw(); }}>+</button>
        <button on:click={() => { scale *= 0.8; draw(); }}>-</button>
        <button on:click={() => { panX = 50; panY = 50; scale = 1; draw(); }}>Reset</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .agent-builder {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .placeholder,
  .loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: var(--text-secondary);
  }

  /* Create Choice Screen */
  .create-choice {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    max-width: 600px;
    margin: 0 auto;
  }

  .create-choice h3 {
    margin: 0 0 8px 0;
    font-size: 20px;
  }

  .choice-subtitle {
    color: var(--text-secondary);
    margin: 0 0 24px 0;
  }

  .choice-cards {
    display: flex;
    gap: 16px;
    margin-bottom: 24px;
    width: 100%;
  }

  .choice-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px;
    background: var(--bg-secondary);
    border: 2px solid var(--border-color);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: center;
  }

  .choice-card:hover {
    border-color: var(--accent-primary);
    background: var(--bg-tertiary);
  }

  .choice-icon {
    font-size: 32px;
  }

  .choice-info h4 {
    margin: 0 0 4px 0;
    font-size: 16px;
    color: var(--text-primary);
  }

  .choice-info p {
    margin: 0;
    font-size: 13px;
    color: var(--text-secondary);
  }

  /* Simple & Advanced Forms */
  .simple-form,
  .advanced-form {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 32px;
    max-width: 600px;
    margin: 0 auto;
    width: 100%;
  }

  .simple-form h3,
  .advanced-form h3 {
    margin: 0 0 24px 0;
    font-size: 20px;
  }

  .agent-type-selector {
    display: flex;
    gap: 8px;
  }

  .agent-type-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px;
    background: var(--bg-primary);
    border: 2px solid var(--border-color);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .agent-type-btn:hover {
    border-color: var(--text-secondary);
  }

  .agent-type-btn.selected {
    border-color: var(--accent-primary);
    background: var(--bg-tertiary);
  }

  .agent-icon {
    font-size: 20px;
  }

  .form-hint {
    margin-top: 16px;
    font-size: 13px;
    color: var(--text-secondary);
    text-align: center;
  }

  .builder-layout {
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
  }

  .template-name {
    font-weight: 600;
    font-size: 15px;
  }

  .toolbar-actions {
    display: flex;
    gap: 8px;
  }

  .builder-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .canvas-container {
    flex: 1;
    background: var(--bg-primary);
    position: relative;
  }

  canvas {
    display: block;
    cursor: grab;
  }

  canvas:active {
    cursor: grabbing;
  }

  .step-editor {
    width: 280px;
    background: var(--bg-secondary);
    border-left: 1px solid var(--border-color);
    padding: 16px;
    overflow-y: auto;
  }

  .step-editor h4 {
    margin: 0 0 16px 0;
    font-size: 14px;
    font-weight: 600;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    display: block;
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 6px;
    text-transform: uppercase;
  }

  .input {
    width: 100%;
    padding: 8px 12px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 14px;
    font-family: inherit;
  }

  .input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .textarea {
    resize: vertical;
    min-height: 100px;
  }

  .hint {
    font-size: 11px;
    color: var(--text-secondary);
    margin-top: 4px;
  }

  .form-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 16px;
  }

  .canvas-controls {
    position: absolute;
    bottom: 16px;
    left: 16px;
    display: flex;
    gap: 4px;
  }

  .canvas-controls button {
    width: 32px;
    height: 32px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
  }

  .canvas-controls button:hover {
    background: var(--bg-tertiary);
  }

  .canvas-controls button:last-child {
    width: auto;
    padding: 0 12px;
    font-size: 12px;
  }

  /* Empty canvas help overlay */
  .empty-canvas-help {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    color: var(--text-secondary);
    pointer-events: none;
  }

  .empty-canvas-help .help-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .empty-canvas-help h4 {
    margin: 0 0 8px 0;
    font-size: 18px;
    color: var(--text-primary);
  }

  .empty-canvas-help p {
    margin: 0;
    font-size: 14px;
  }

  /* Canvas hint bar */
  .canvas-hint {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 24px;
    padding: 8px 16px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    font-size: 12px;
    color: var(--text-secondary);
    pointer-events: none;
  }

  .hint-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* Step editor header */
  .step-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .step-editor-header h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .step-color-indicator {
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }

  /* No selection panel */
  .step-editor-empty {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .no-selection {
    text-align: center;
    padding: 24px 16px;
  }

  .no-selection-icon {
    font-size: 32px;
    margin-bottom: 12px;
  }

  .no-selection h4 {
    margin: 0 0 8px 0;
    font-size: 16px;
    color: var(--text-primary);
  }

  .no-selection p {
    margin: 0 0 20px 0;
    font-size: 13px;
    color: var(--text-secondary);
  }

  .step-list {
    text-align: left;
  }

  .step-list-label {
    display: block;
    font-size: 11px;
    text-transform: uppercase;
    color: var(--text-secondary);
    margin-bottom: 8px;
  }

  .step-list-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    margin-bottom: 4px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .step-list-item:hover {
    border-color: var(--accent-primary);
    background: var(--bg-tertiary);
  }

  .step-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
</style>
