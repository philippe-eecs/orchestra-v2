<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { hubUrl, hubConnected, setHubUrl, HUB_PRESETS, lastSyncTime, markSynced } from '../../stores/hub';
  import { loadProjects } from '../../stores/projects';
  import { loadTemplates } from '../../stores/agentTemplates';
  import { api } from '../../lib/api';
  import Modal from '../shared/Modal.svelte';
  import Button from '../shared/Button.svelte';

  export let open = false;

  const dispatch = createEventDispatcher();

  let url = $hubUrl;
  let testing = false;
  let syncing = false;
  let testResult: 'success' | 'error' | null = null;

  $: if (open) {
    url = $hubUrl;
    testResult = null;
  }

  function selectPreset(presetUrl: string) {
    url = presetUrl;
  }

  function handleClose() {
    dispatch('close');
  }

  async function testConnection() {
    testing = true;
    testResult = null;

    // Temporarily set URL for testing
    const originalUrl = $hubUrl;
    setHubUrl(url);

    const success = await api.checkHealth();
    testResult = success ? 'success' : 'error';

    // Restore original URL if test failed
    if (!success) {
      setHubUrl(originalUrl);
    }

    testing = false;
  }

  function handleSave() {
    setHubUrl(url);
    handleClose();
  }

  async function handleSync() {
    syncing = true;
    try {
      // Reload all data from hub
      await Promise.all([
        loadProjects(),
        loadTemplates(),
      ]);
      markSynced();
    } catch (e) {
      console.error('Sync failed:', e);
    }
    syncing = false;
  }

  function formatSyncTime(date: Date | null): string {
    if (!date) return 'Never';
    return date.toLocaleTimeString();
  }
</script>

<Modal title="Hub Configuration" {open} on:close={handleClose}>
  <div class="config">
    <div class="status-row">
      <div class="status">
        <span class="dot" class:connected={$hubConnected}></span>
        <span>{$hubConnected ? 'Connected' : 'Disconnected'}</span>
      </div>
      <div class="sync-status">
        <span class="sync-label">Last sync: {formatSyncTime($lastSyncTime)}</span>
        <Button size="small" on:click={handleSync} disabled={!$hubConnected || syncing}>
          {syncing ? 'Syncing...' : 'Sync Now'}
        </Button>
      </div>
    </div>

    <div class="presets">
      <span class="presets-label">Quick Select:</span>
      <div class="preset-buttons">
        {#each HUB_PRESETS as preset}
          <button
            class="preset-btn"
            class:active={url === preset.url}
            on:click={() => selectPreset(preset.url)}
          >
            {preset.name}
          </button>
        {/each}
      </div>
    </div>

    <div class="field">
      <label for="hub-url">Hub URL</label>
      <input
        id="hub-url"
        type="url"
        bind:value={url}
        placeholder="http://localhost:8000"
      />
    </div>

    {#if testResult}
      <div class="test-result" class:success={testResult === 'success'}>
        {testResult === 'success' ? 'Connection successful!' : 'Connection failed'}
      </div>
    {/if}

    <div class="actions">
      <Button on:click={testConnection} disabled={testing}>
        {testing ? 'Testing...' : 'Test Connection'}
      </Button>
      <Button variant="primary" on:click={handleSave}>
        Save
      </Button>
    </div>

    <div class="help">
      <p>The hub URL can also be set via environment variable:</p>
      <code>VITE_HUB_URL=http://localhost:8000</code>
    </div>
  </div>
</Modal>

<style>
  .config {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    background: var(--bg-primary);
    border-radius: 4px;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sync-status {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .sync-label {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .presets {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .presets-label {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .preset-buttons {
    display: flex;
    gap: 8px;
  }

  .preset-btn {
    padding: 6px 12px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .preset-btn:hover {
    background: var(--bg-tertiary);
  }

  .preset-btn.active {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: white;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent-error);
  }

  .dot.connected {
    background: var(--accent-success);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  label {
    font-size: 12px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  input {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 14px;
  }

  .test-result {
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 14px;
    background: rgba(255, 68, 68, 0.1);
    color: var(--accent-error);
  }

  .test-result.success {
    background: rgba(0, 255, 136, 0.1);
    color: var(--accent-success);
  }

  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .help {
    font-size: 13px;
    color: var(--text-secondary);
    padding-top: 12px;
    border-top: 1px solid var(--border-color);
  }

  .help p {
    margin: 0 0 8px;
  }

  code {
    display: block;
    padding: 8px;
    background: var(--bg-primary);
    border-radius: 4px;
    font-size: 12px;
  }
</style>
