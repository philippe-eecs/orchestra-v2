<script lang="ts">
  import { statusColor } from '../../lib/utils';

  export let status: string;
</script>

<span class="badge" style="--status-color: {statusColor(status)}">
  {status.replace('_', ' ')}
</span>

<style>
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    text-transform: capitalize;
    background: color-mix(in srgb, var(--status-color) 20%, transparent);
    color: var(--status-color);
    border: 1px solid var(--status-color);
  }
</style>
