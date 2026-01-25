<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { selectedNode, selectNode } from '../../stores/graph';
  import NodeDetailPanel from '../node/NodeDetailPanel.svelte';

  const dispatch = createEventDispatcher();

  function handleClose() {
    selectNode(null);
  }
</script>

{#if $selectedNode}
  <aside class="drawer">
    <header>
      <h2>Node Details</h2>
      <button class="close-btn" on:click={handleClose} aria-label="Close">×</button>
    </header>
    <div class="content">
      <NodeDetailPanel node={$selectedNode} on:update on:delete on:launchAgent />
    </div>
  </aside>
{/if}

<style>
  .drawer {
    width: 360px;
    background: var(--bg-secondary);
    border-left: 1px solid var(--border-color);
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
    font-size: 16px;
    font-weight: 600;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .content {
    flex: 1;
    overflow-y: auto;
  }
</style>
