<script lang="ts">
  // Placeholder for Calendar view
  import { selectedProject } from '../../stores/projects';
</script>

<div class="calendar-view">
  {#if !$selectedProject}
    <div class="placeholder">
      <p>Select a project to view calendar</p>
    </div>
  {:else}
    <div class="placeholder">
      <h2>Calendar View</h2>
      <p>Coming soon...</p>
      <p class="hint">This view will show tasks and deadlines on a calendar</p>
    </div>
  {/if}
</div>

<style>
  .calendar-view {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  h2 {
    margin: 0 0 16px;
    color: var(--text-primary);
  }

  .hint {
    font-size: 14px;
    margin-top: 8px;
  }
</style>
