<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let title: string;
  export let open = false;
  export let fullscreen = false;

  const dispatch = createEventDispatcher();

  function handleClose() {
    dispatch('close');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      handleClose();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="overlay" on:click={handleClose}>
    <div class="modal" class:fullscreen on:click|stopPropagation={() => {}} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header>
        <h2 id="modal-title">{title}</h2>
        <button class="close-btn" on:click={handleClose} aria-label="Close">×</button>
      </header>
      <div class="content">
        <slot />
      </div>
      {#if $$slots.footer}
        <footer>
          <slot name="footer" />
        </footer>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal.fullscreen {
    width: 95%;
    max-width: 1200px;
    height: 90vh;
    max-height: 90vh;
  }

  .modal.fullscreen .content {
    flex: 1;
    min-height: 0;
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
    font-size: 18px;
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
    padding: 16px;
    overflow-y: auto;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px;
    border-top: 1px solid var(--border-color);
  }
</style>
