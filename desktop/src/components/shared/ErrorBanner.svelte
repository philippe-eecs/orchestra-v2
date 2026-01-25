<script lang="ts">
  export let message: string | null;
  export let dismissable = true;

  let dismissed = false;

  $: if (message) dismissed = false;

  function dismiss() {
    dismissed = true;
  }
</script>

{#if message && !dismissed}
  <div class="error-banner">
    <span>{message}</span>
    {#if dismissable}
      <button on:click={dismiss} aria-label="Dismiss">×</button>
    {/if}
  </div>
{/if}

<style>
  .error-banner {
    background: rgba(255, 68, 68, 0.1);
    border: 1px solid var(--accent-error);
    color: var(--accent-error);
    padding: 12px;
    border-radius: 4px;
    margin: 8px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 14px;
  }

  button {
    background: none;
    border: none;
    color: var(--accent-error);
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    margin-left: 8px;
  }

  button:hover {
    opacity: 0.7;
  }
</style>
