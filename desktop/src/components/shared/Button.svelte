<script lang="ts">
  export let variant: 'primary' | 'secondary' | 'danger' = 'secondary';
  export let size: 'normal' | 'small' = 'normal';
  export let disabled = false;
  export let type: 'button' | 'submit' = 'button';
</script>

<button
  {type}
  {disabled}
  class:primary={variant === 'primary'}
  class:danger={variant === 'danger'}
  class:small={size === 'small'}
  on:click
>
  <slot />
</button>

<style>
  button {
    cursor: pointer;
    border: none;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 14px;
    transition: background 0.2s, opacity 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  button:hover:not(:disabled) {
    background: var(--border-color);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  button.primary {
    background: var(--accent-primary);
    color: var(--bg-primary);
  }

  button.primary:hover:not(:disabled) {
    background: #00b8d9;
  }

  button.danger {
    background: var(--accent-error);
    color: white;
  }

  button.danger:hover:not(:disabled) {
    background: #cc3333;
  }

  button.small {
    padding: 4px 10px;
    font-size: 12px;
  }
</style>
