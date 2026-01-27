<script>
  import GraphList from './GraphList.svelte'
  import GraphEditor from './GraphEditor.svelte'
  import RunResults from './RunResults.svelte'
  import AgentHub from './AgentHub.svelte'
  import ReviewQueue from './ReviewQueue.svelte'

  let route = { page: 'list', id: null }
  let pendingReviewCount = 0

  // Check for pending reviews periodically
  async function checkPendingReviews() {
    try {
      const res = await fetch('/reviews')
      if (res.ok) {
        const reviews = await res.json()
        pendingReviewCount = reviews.length
      }
    } catch {}
  }

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
    } else if (hash === 'reviews') {
      route = { page: 'reviews', id: null }
    } else {
      route = { page: 'list', id: null }
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', handleHash)
    handleHash()

    // Check for pending reviews every 10 seconds
    checkPendingReviews()
    setInterval(checkPendingReviews, 10000)
  }
</script>

<main>
  <header>
    <h1 on:click={() => { window.location.hash = ''; navigate('list') }}>Orchestra V4</h1>
    <nav>
      <a
        href="#reviews"
        class="nav-link"
        class:active={route.page === 'reviews'}
        on:click|preventDefault={() => { window.location.hash = 'reviews'; navigate('reviews') }}
      >
        Reviews
        {#if pendingReviewCount > 0}
          <span class="badge">{pendingReviewCount}</span>
        {/if}
      </a>
    </nav>
  </header>

  {#if route.page === 'list'}
    <GraphList on:select={(e) => { window.location.hash = `graph/${e.detail}`; navigate('editor', e.detail) }} />
  {:else if route.page === 'editor'}
    <GraphEditor graphId={route.id} on:run={(e) => { window.location.hash = `run/${e.detail}`; navigate('run', e.detail) }} />
  {:else if route.page === 'run'}
    <RunResults runId={route.id} />
  {:else if route.page === 'reviews'}
    <ReviewQueue />
  {/if}

  <AgentHub />
</main>

<style>
  main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
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

  nav {
    display: flex;
    gap: 1rem;
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    color: #888;
    text-decoration: none;
    font-size: 0.875rem;
    border-radius: 6px;
    transition: all 0.15s;
  }

  .nav-link:hover {
    color: #fff;
    background: #222;
  }

  .nav-link.active {
    color: #fff;
    background: #333;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    background: #eab308;
    color: #000;
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: 10px;
  }
</style>
