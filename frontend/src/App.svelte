<script>
  import GraphList from './GraphList.svelte'
  import GraphEditor from './GraphEditor.svelte'
  import RunResults from './RunResults.svelte'

  let route = { page: 'list', id: null }

  function navigate(page, id = null) {
    route = { page, id }
  }

  // Simple hash-based routing
  function handleHash() {
    const hash = window.location.hash.slice(1)
    if (hash.startsWith('graph/')) {
      const id = parseInt(hash.split('/')[1])
      route = { page: 'editor', id }
    } else if (hash.startsWith('run/')) {
      const id = parseInt(hash.split('/')[1])
      route = { page: 'run', id }
    } else {
      route = { page: 'list', id: null }
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', handleHash)
    handleHash()
  }
</script>

<main>
  <header>
    <h1 on:click={() => { window.location.hash = ''; navigate('list') }}>Orchestra</h1>
  </header>

  {#if route.page === 'list'}
    <GraphList on:select={(e) => { window.location.hash = `graph/${e.detail}`; navigate('editor', e.detail) }} />
  {:else if route.page === 'editor'}
    <GraphEditor graphId={route.id} on:run={(e) => { window.location.hash = `run/${e.detail}`; navigate('run', e.detail) }} />
  {:else if route.page === 'run'}
    <RunResults runId={route.id} />
  {/if}
</main>

<style>
  main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #222;
    background: #111;
  }

  header h1 {
    font-size: 1.25rem;
    font-weight: 600;
    cursor: pointer;
    color: #fff;
  }

  header h1:hover {
    color: #3b82f6;
  }
</style>
