<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  import { selectedProject, createProject, loadProjects } from './stores/projects';
  import { loadTasks } from './stores/tasks';

  import TopBar from './components/layout/TopBar.svelte';
  import LeftSidebar from './components/layout/LeftSidebar.svelte';
  import RightDrawer from './components/layout/RightDrawer.svelte';
  import BottomPanel from './components/layout/BottomPanel.svelte';

  import DagView from './components/views/DagView.svelte';
  import AgentsView from './components/views/AgentsView.svelte';
  import TodoView from './components/views/TodoView.svelte';
  import CalendarView from './components/views/CalendarView.svelte';

  import CreateNodeModal from './components/modals/CreateNodeModal.svelte';
  import AIPlanModal from './components/modals/AIPlanModal.svelte';
  import HubConfigModal from './components/modals/HubConfigModal.svelte';
  import DebugPanel from './components/shared/DebugPanel.svelte';
  import Modal from './components/shared/Modal.svelte';
  import Button from './components/shared/Button.svelte';

  type View = 'dag' | 'agents' | 'todo' | 'calendar';

  let activeView: View = 'dag';
  let showCreateNodeModal = false;
  let showAIPlanModal = false;
  let showHubConfigModal = false;
  let showCreateProjectModal = false;
  let newProjectName = '';

  onMount(async () => {
    // Check hub connection on startup
    await api.checkHealth();
    // Load initial data
    await loadProjects();
    await loadTasks();
  });

  function handleViewChange(event: CustomEvent<View>) {
    activeView = event.detail;
  }

  async function handleCreateProject() {
    if (!newProjectName.trim()) return;
    const project = await createProject({ name: newProjectName.trim() });
    if (project) {
      newProjectName = '';
      showCreateProjectModal = false;
    }
  }
</script>

<div class="app">
  <TopBar
    {activeView}
    on:viewChange={handleViewChange}
    on:openHubConfig={() => showHubConfigModal = true}
    on:openCreateNode={() => showCreateNodeModal = true}
    on:openAIPlan={() => showAIPlanModal = true}
  />

  <div class="main">
    <LeftSidebar on:createProject={() => showCreateProjectModal = true} />

    <div class="center-column">
      <main class="content">
        {#if activeView === 'dag'}
          <DagView />
        {:else if activeView === 'agents'}
          <AgentsView />
        {:else if activeView === 'todo'}
          <TodoView />
        {:else if activeView === 'calendar'}
          <CalendarView />
        {/if}
      </main>

      <BottomPanel />
    </div>

    <RightDrawer />
  </div>

  <CreateNodeModal
    open={showCreateNodeModal}
    on:close={() => showCreateNodeModal = false}
  />

  <AIPlanModal
    open={showAIPlanModal}
    on:close={() => showAIPlanModal = false}
  />

  <HubConfigModal
    open={showHubConfigModal}
    on:close={() => showHubConfigModal = false}
  />

  <Modal
    title="Create Project"
    open={showCreateProjectModal}
    on:close={() => showCreateProjectModal = false}
  >
    <form on:submit|preventDefault={handleCreateProject}>
      <div class="form-field">
        <label for="project-name">Project Name</label>
<!-- svelte-ignore a11y-autofocus -->
        <input
          id="project-name"
          bind:value={newProjectName}
          placeholder="My Project"
          autofocus
        />
      </div>
      <div class="form-actions">
        <Button type="button" on:click={() => showCreateProjectModal = false}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!newProjectName.trim()}>Create</Button>
      </div>
    </form>
  </Modal>

  <DebugPanel />
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .main {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .center-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  .form-field label {
    font-size: 12px;
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
