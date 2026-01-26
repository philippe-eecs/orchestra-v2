<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { nodes, edges, selectedNodeId, selectNode, graphLoading, graphError } from '../../stores/graph';
  import { selectedProject } from '../../stores/projects';
  import ErrorBanner from '../shared/ErrorBanner.svelte';

  let canvasContainer: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;

  // Canvas state
  let panX = 0;
  let panY = 0;
  let scale = 1;
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let dragNode: number | null = null;
  let animationFrame: number | null = null;

  const NODE_WIDTH = 180;
  const NODE_HEIGHT = 60;
  const NODE_RADIUS = 8;

  // Re-acquire context whenever canvas element changes (e.g., after conditional re-render)
  $: if (canvas) {
    ctx = canvas.getContext('2d');
    resizeCanvas();
  }

  $: if (canvas && ctx && $nodes) {
    draw();
    // Start animation loop if any nodes need review
    startAnimationIfNeeded();
  }

  function startAnimationIfNeeded() {
    const hasNeedsReview = $nodes.some(n => n.status === 'needs_review');
    if (hasNeedsReview && !animationFrame) {
      const animate = () => {
        draw();
        animationFrame = requestAnimationFrame(animate);
      };
      animationFrame = requestAnimationFrame(animate);
    } else if (!hasNeedsReview && animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }

  onMount(() => {
    window.addEventListener('resize', resizeCanvas);
  });

  onDestroy(() => {
    window.removeEventListener('resize', resizeCanvas);
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
  });

  function resizeCanvas() {
    if (canvas && canvasContainer) {
      canvas.width = canvasContainer.clientWidth;
      canvas.height = canvasContainer.clientHeight;
      draw();
    }
  }

  function draw() {
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);

    // Draw edges
    ctx.strokeStyle = '#3a3a5a';
    ctx.lineWidth = 2;
    for (const edge of $edges) {
      const sourceNode = $nodes.find(n => n.id === edge.source_id);
      const targetNode = $nodes.find(n => n.id === edge.target_id);
      if (sourceNode && targetNode) {
        ctx.beginPath();
        ctx.moveTo(sourceNode.position_x + NODE_WIDTH, sourceNode.position_y + NODE_HEIGHT / 2);
        ctx.lineTo(targetNode.position_x, targetNode.position_y + NODE_HEIGHT / 2);
        ctx.stroke();

        // Draw arrow
        const angle = Math.atan2(
          targetNode.position_y - sourceNode.position_y,
          targetNode.position_x - sourceNode.position_x
        );
        const arrowX = targetNode.position_x;
        const arrowY = targetNode.position_y + NODE_HEIGHT / 2;
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(arrowX - 10 * Math.cos(angle - 0.3), arrowY - 10 * Math.sin(angle - 0.3));
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(arrowX - 10 * Math.cos(angle + 0.3), arrowY - 10 * Math.sin(angle + 0.3));
        ctx.stroke();
      }
    }

    // Draw nodes
    for (const node of $nodes) {
      const isSelected = node.id === $selectedNodeId;
      const nodeType = node.node_type || 'task';

      if (nodeType === 'hook') {
        // Draw HOOK nodes as diamonds (purple)
        drawHookNode(ctx, node, isSelected);
      } else if (nodeType === 'milestone') {
        // Draw MILESTONE nodes as hexagons (gold)
        drawMilestoneNode(ctx, node, isSelected);
      } else {
        // Draw TASK nodes as rounded rectangles (default)
        drawTaskNode(ctx, node, isSelected);
      }
    }

    ctx.restore();
  }

  function drawTaskNode(ctx: CanvasRenderingContext2D, node: any, isSelected: boolean) {
    // Node background
    ctx.fillStyle = isSelected ? '#0f3460' : '#16213e';
    ctx.strokeStyle = isSelected ? '#00d9ff' : '#2a2a4a';
    ctx.lineWidth = isSelected ? 2 : 1;

    ctx.beginPath();
    ctx.roundRect(node.position_x, node.position_y, NODE_WIDTH, NODE_HEIGHT, NODE_RADIUS);
    ctx.fill();
    ctx.stroke();

    // Status indicator
    drawStatusIndicator(ctx, node);

    // Title
    ctx.fillStyle = '#e8e8e8';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
    const maxWidth = NODE_WIDTH - 30;
    let title = node.title;
    while (ctx.measureText(title).width > maxWidth && title.length > 3) {
      title = title.slice(0, -4) + '...';
    }
    ctx.fillText(title, node.position_x + 24, node.position_y + 16);

    // Description or agent type
    ctx.fillStyle = '#a0a0a0';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    const subtitle = node.agent_type || node.status;
    ctx.fillText(subtitle, node.position_x + 12, node.position_y + 40);
  }

  function drawHookNode(ctx: CanvasRenderingContext2D, node: any, isSelected: boolean) {
    // Diamond shape for hook nodes
    const cx = node.position_x + NODE_WIDTH / 2;
    const cy = node.position_y + NODE_HEIGHT / 2;
    const hw = NODE_WIDTH / 2 - 10;  // Half width
    const hh = NODE_HEIGHT / 2 - 5;   // Half height

    // Purple color scheme for hooks
    ctx.fillStyle = isSelected ? '#4c1d95' : '#2e1065';
    ctx.strokeStyle = isSelected ? '#a78bfa' : '#7c3aed';
    ctx.lineWidth = isSelected ? 2 : 1;

    ctx.beginPath();
    ctx.moveTo(cx, node.position_y + 5);       // Top
    ctx.lineTo(cx + hw, cy);                    // Right
    ctx.lineTo(cx, node.position_y + NODE_HEIGHT - 5);  // Bottom
    ctx.lineTo(cx - hw, cy);                    // Left
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hook icon (checkmark)
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 2);
    ctx.lineTo(cx - 2, cy + 4);
    ctx.lineTo(cx + 10, cy - 6);
    ctx.stroke();

    // Title (centered)
    ctx.fillStyle = '#e8e8e8';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    let title = node.title;
    const maxWidth = NODE_WIDTH - 40;
    while (ctx.measureText(title).width > maxWidth && title.length > 3) {
      title = title.slice(0, -4) + '...';
    }
    ctx.fillText(title, cx, node.position_y + NODE_HEIGHT - 12);
    ctx.textAlign = 'left';

    drawStatusIndicator(ctx, node);
  }

  function drawMilestoneNode(ctx: CanvasRenderingContext2D, node: any, isSelected: boolean) {
    // Hexagon shape for milestone nodes
    const cx = node.position_x + NODE_WIDTH / 2;
    const cy = node.position_y + NODE_HEIGHT / 2;
    const r = NODE_HEIGHT / 2 - 5;

    // Gold color scheme for milestones
    ctx.fillStyle = isSelected ? '#78350f' : '#451a03';
    ctx.strokeStyle = isSelected ? '#fbbf24' : '#f59e0b';
    ctx.lineWidth = isSelected ? 2 : 1;

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      const x = cx + r * Math.cos(angle) * 1.5;
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Star icon
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(cx, cy - 5, 4, 0, Math.PI * 2);
    ctx.fill();

    // Title (centered)
    ctx.fillStyle = '#e8e8e8';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    let title = node.title;
    const maxWidth = NODE_WIDTH - 40;
    while (ctx.measureText(title).width > maxWidth && title.length > 3) {
      title = title.slice(0, -4) + '...';
    }
    ctx.fillText(title, cx, node.position_y + NODE_HEIGHT - 12);
    ctx.textAlign = 'left';

    drawStatusIndicator(ctx, node);
  }

  function drawStatusIndicator(ctx: CanvasRenderingContext2D, node: any) {
    const statusColors: Record<string, string> = {
      pending: '#a0a0a0',
      in_progress: '#ffaa00',
      needs_review: '#ff4444',  // RED - human attention needed
      completed: '#00ff88',
      blocked: '#ffaa00',
      failed: '#ff4444',
    };
    ctx.fillStyle = statusColors[node.status] || '#a0a0a0';

    // Draw pulsing glow for needs_review status
    if (node.status === 'needs_review') {
      ctx.save();
      ctx.shadowColor = '#ff4444';
      ctx.shadowBlur = 8 + Math.sin(Date.now() / 200) * 4;  // Pulsing effect
      ctx.beginPath();
      ctx.arc(node.position_x + 12, node.position_y + 12, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(node.position_x + 12, node.position_y + 12, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function getMousePos(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - panX) / scale,
      y: (e.clientY - rect.top - panY) / scale,
    };
  }

  function findNodeAt(x: number, y: number) {
    for (const node of $nodes) {
      if (
        x >= node.position_x &&
        x <= node.position_x + NODE_WIDTH &&
        y >= node.position_y &&
        y <= node.position_y + NODE_HEIGHT
      ) {
        return node.id;
      }
    }
    return null;
  }

  function handleMouseDown(e: MouseEvent) {
    const pos = getMousePos(e);
    const nodeId = findNodeAt(pos.x, pos.y);

    if (nodeId) {
      selectNode(nodeId);
      dragNode = nodeId;
    } else {
      isDragging = true;
    }
    dragStart = { x: e.clientX, y: e.clientY };
  }

  function handleMouseMove(e: MouseEvent) {
    if (isDragging) {
      panX += e.clientX - dragStart.x;
      panY += e.clientY - dragStart.y;
      dragStart = { x: e.clientX, y: e.clientY };
      draw();
    }
  }

  function handleMouseUp() {
    isDragging = false;
    dragNode = null;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    scale *= zoomFactor;
    scale = Math.max(0.1, Math.min(3, scale));
    draw();
  }

  function handleDoubleClick(e: MouseEvent) {
    const pos = getMousePos(e);
    const nodeId = findNodeAt(pos.x, pos.y);
    if (nodeId) {
      selectNode(nodeId);
    }
  }
</script>

<div class="dag-view">
  {#if !$selectedProject}
    <div class="placeholder">
      <p>Select a project to view its DAG</p>
    </div>
  {:else}
    <ErrorBanner message={$graphError} />

    {#if $graphLoading}
      <div class="loading">Loading graph...</div>
    {:else if $nodes.length === 0}
      <div class="empty">
        <p>No nodes yet</p>
        <p class="hint">Click "+ Node" to create your first node</p>
      </div>
    {:else}
      <div class="canvas-container" bind:this={canvasContainer}>
        <canvas
          bind:this={canvas}
          on:mousedown={handleMouseDown}
          on:mousemove={handleMouseMove}
          on:mouseup={handleMouseUp}
          on:mouseleave={handleMouseUp}
          on:wheel={handleWheel}
          on:dblclick={handleDoubleClick}
        ></canvas>
      </div>
    {/if}

    <div class="controls">
      <button on:click={() => { scale *= 1.2; draw(); }}>+</button>
      <button on:click={() => { scale *= 0.8; draw(); }}>-</button>
      <button on:click={() => { panX = 0; panY = 0; scale = 1; draw(); }}>Reset</button>
    </div>
  {/if}
</div>

<style>
  .dag-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }

  .placeholder,
  .loading,
  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .hint {
    font-size: 14px;
    margin-top: 8px;
  }

  .canvas-container {
    flex: 1;
    background: var(--bg-primary);
  }

  canvas {
    display: block;
    cursor: grab;
  }

  canvas:active {
    cursor: grabbing;
  }

  .controls {
    position: absolute;
    bottom: 16px;
    left: 16px;
    display: flex;
    gap: 4px;
  }

  .controls button {
    width: 32px;
    height: 32px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
  }

  .controls button:hover {
    background: var(--bg-tertiary);
  }

  .controls button:last-child {
    width: auto;
    padding: 0 12px;
    font-size: 12px;
  }
</style>
