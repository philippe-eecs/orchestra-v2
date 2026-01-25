<script lang="ts">
  import { onMount } from 'svelte';
  import {
    filteredTasks,
    tasksLoading,
    tasksError,
    showCompletedTasks,
    filterByProject,
    loadTasks,
    createTask,
    toggleTaskComplete,
    deleteTask,
  } from '../../stores/tasks';
  import { selectedProject } from '../../stores/projects';
  import Button from '../shared/Button.svelte';
  import ErrorBanner from '../shared/ErrorBanner.svelte';

  let newTaskTitle = '';
  let adding = false;

  onMount(() => {
    loadTasks();
  });

  async function handleAddTask() {
    if (!newTaskTitle.trim()) return;

    adding = true;
    const result = await createTask({ title: newTaskTitle.trim() });
    if (result) {
      newTaskTitle = '';
    }
    adding = false;
  }

  async function handleToggle(id: number) {
    await toggleTaskComplete(id);
  }

  async function handleDelete(id: number) {
    await deleteTask(id);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddTask();
    }
  }
</script>

<div class="todo-view">
  <header>
    <h2>Tasks</h2>
    <div class="filters">
      <label>
        <input type="checkbox" bind:checked={$showCompletedTasks} />
        Show completed
      </label>
      <label>
        <input type="checkbox" bind:checked={$filterByProject} disabled={!$selectedProject} />
        Project only
      </label>
    </div>
  </header>

  <ErrorBanner message={$tasksError} />

  <div class="add-task">
    <input
      placeholder="Add a new task..."
      bind:value={newTaskTitle}
      on:keydown={handleKeydown}
      disabled={adding}
    />
    <Button variant="primary" on:click={handleAddTask} disabled={adding || !newTaskTitle.trim()}>
      Add
    </Button>
  </div>

  <div class="task-list">
    {#if $tasksLoading}
      <div class="loading">Loading tasks...</div>
    {:else if $filteredTasks.length === 0}
      <div class="empty">No tasks yet</div>
    {:else}
      {#each $filteredTasks as task (task.id)}
        <div class="task-item" class:completed={task.completed}>
          <button
            class="checkbox"
            class:checked={task.completed}
            on:click={() => handleToggle(task.id)}
            aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
          >
            {#if task.completed}
              <span>✓</span>
            {/if}
          </button>
          <div class="task-content">
            <span class="title">{task.title}</span>
            {#if task.description}
              <span class="description">{task.description}</span>
            {/if}
          </div>
          <button class="delete" on:click={() => handleDelete(task.id)} aria-label="Delete task">
            ×
          </button>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .todo-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 24px;
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  h2 {
    margin: 0;
    font-size: 24px;
  }

  .filters {
    display: flex;
    gap: 16px;
  }

  .filters label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .filters input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .add-task {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
  }

  .add-task input {
    flex: 1;
  }

  .task-list {
    flex: 1;
    overflow-y: auto;
  }

  .loading,
  .empty {
    text-align: center;
    padding: 48px;
    color: var(--text-secondary);
  }

  .task-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    background: var(--bg-secondary);
    border-radius: 8px;
    margin-bottom: 8px;
    transition: opacity 0.2s;
  }

  .task-item.completed {
    opacity: 0.6;
  }

  .checkbox {
    width: 24px;
    height: 24px;
    border: 2px solid var(--border-color);
    border-radius: 50%;
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--accent-success);
    font-size: 14px;
  }

  .checkbox.checked {
    background: var(--accent-success);
    border-color: var(--accent-success);
    color: var(--bg-primary);
  }

  .task-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .title {
    font-size: 15px;
  }

  .completed .title {
    text-decoration: line-through;
    color: var(--text-secondary);
  }

  .description {
    font-size: 13px;
    color: var(--text-secondary);
  }

  .delete {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .task-item:hover .delete {
    opacity: 1;
  }

  .delete:hover {
    color: var(--accent-error);
  }
</style>
