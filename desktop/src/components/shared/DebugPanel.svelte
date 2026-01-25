<script lang="ts">
  import { debugEntries, debugPanelOpen, clearDebugEntries } from '../../stores/debug';

  function togglePanel() {
    debugPanelOpen.update(v => !v);
  }

  function formatJson(data: unknown): string {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }
</script>

<div class="debug-toggle">
  <button on:click={togglePanel} class:active={$debugPanelOpen}>
    Debug ({$debugEntries.length})
  </button>
</div>

{#if $debugPanelOpen}
  <div class="debug-panel">
    <div class="header">
      <h3>Debug Log</h3>
      <button on:click={clearDebugEntries}>Clear</button>
    </div>
    <div class="entries">
      {#each $debugEntries as entry}
        <div class="entry" class:error={entry.type === 'error'}>
          <div class="entry-header">
            <span class="type">{entry.type.toUpperCase()}</span>
            {#if entry.method}
              <span class="method">{entry.method}</span>
            {/if}
            {#if entry.status}
              <span class="status" class:ok={entry.status < 400}>{entry.status}</span>
            {/if}
            <span class="timestamp">{new Date(entry.timestamp).toLocaleTimeString()}</span>
          </div>
          <div class="url">{entry.url}</div>
          {#if entry.body}
            <pre class="body">{formatJson(entry.body)}</pre>
          {/if}
          {#if entry.data}
            <pre class="data">{formatJson(entry.data)}</pre>
          {/if}
          {#if entry.error}
            <div class="error-msg">{entry.error}</div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .debug-toggle {
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 999;
  }

  .debug-toggle button {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 12px;
  }

  .debug-toggle button.active {
    background: var(--accent-primary);
    color: var(--bg-primary);
  }

  .debug-panel {
    position: fixed;
    bottom: 60px;
    right: 16px;
    width: 500px;
    max-height: 400px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    z-index: 999;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border-bottom: 1px solid var(--border-color);
  }

  .header h3 {
    margin: 0;
    font-size: 14px;
  }

  .header button {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 12px;
    cursor: pointer;
  }

  .entries {
    overflow-y: auto;
    flex: 1;
  }

  .entry {
    padding: 12px;
    border-bottom: 1px solid var(--border-color);
    font-size: 12px;
  }

  .entry.error {
    background: rgba(255, 68, 68, 0.05);
  }

  .entry-header {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 4px;
  }

  .type {
    font-weight: 600;
    color: var(--accent-primary);
  }

  .method {
    color: var(--accent-warning);
  }

  .status {
    color: var(--accent-error);
  }

  .status.ok {
    color: var(--accent-success);
  }

  .timestamp {
    color: var(--text-secondary);
    margin-left: auto;
  }

  .url {
    color: var(--text-secondary);
    word-break: break-all;
  }

  pre {
    margin: 8px 0 0;
    padding: 8px;
    background: var(--bg-primary);
    border-radius: 4px;
    overflow-x: auto;
    font-size: 11px;
    max-height: 100px;
    overflow-y: auto;
  }

  .error-msg {
    color: var(--accent-error);
    margin-top: 8px;
  }
</style>
