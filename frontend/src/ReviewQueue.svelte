<script>
  import { onMount, onDestroy } from 'svelte'
  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher()

  let reviews = []
  let loading = true
  let selectedReview = null
  let pollInterval

  onMount(() => {
    loadReviews()
    pollInterval = setInterval(loadReviews, 5000)
  })

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval)
  })

  async function loadReviews() {
    const res = await fetch('/reviews')
    if (res.ok) {
      reviews = await res.json()
    }
    loading = false
  }

  async function loadReviewDetails(reviewId) {
    const res = await fetch(`/reviews/${reviewId}`)
    if (res.ok) {
      selectedReview = await res.json()
    }
  }

  async function submitReview(action, notes = '') {
    if (!selectedReview) return

    const res = await fetch(`/reviews/${selectedReview.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, notes })
    })

    if (res.ok) {
      selectedReview = null
      await loadReviews()
    }
  }

  function getDeliverableIcon(type) {
    switch (type) {
      case 'pr': return '⬡'
      case 'github': return '◐'
      case 'file': return '◫'
      default: return '◇'
    }
  }

  let reviewNotes = ''
</script>

<div class="review-queue">
  <h2>Pending Reviews</h2>

  {#if loading}
    <div class="loading">Loading...</div>
  {:else if reviews.length === 0}
    <div class="empty">No pending reviews</div>
  {:else}
    <div class="reviews-list">
      {#each reviews as review}
        <div class="review-item" on:click={() => loadReviewDetails(review.id)}>
          <div class="review-header">
            <span class="block-title">{review.block_title}</span>
            <span class="run-id">Run #{review.run_id}</span>
          </div>
          <div class="review-prompt">{review.prompt}</div>
          {#if review.deliverables?.length > 0}
            <div class="review-deliverables">
              {#each review.deliverables as d}
                <span class="deliverable-badge">
                  {getDeliverableIcon(d.type)} {d.type}
                </span>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if selectedReview}
  <div class="modal-overlay" on:click|self={() => selectedReview = null}>
    <div class="modal">
      <div class="modal-header">
        <h3>Review: {selectedReview.block_title}</h3>
        <button class="close-btn" on:click={() => selectedReview = null}>×</button>
      </div>

      <div class="modal-body">
        <div class="review-prompt-section">
          <label>Review Prompt:</label>
          <p>{selectedReview.prompt}</p>
        </div>

        {#if selectedReview.deliverables?.length > 0}
          <div class="deliverables-section">
            <label>Deliverables:</label>
            <div class="deliverables-list">
              {#each selectedReview.deliverables as d}
                <a href={d.url || '#'} target="_blank" rel="noopener" class="deliverable-link">
                  <span class="icon">{getDeliverableIcon(d.type)}</span>
                  {d.url || d.path}
                </a>
              {/each}
            </div>
          </div>
        {/if}

        <div class="output-section">
          <label>Block Output:</label>
          <pre class="output">{selectedReview.output || '(No output)'}</pre>
        </div>

        <div class="notes-section">
          <label>Notes (optional):</label>
          <textarea bind:value={reviewNotes} placeholder="Add any notes..."></textarea>
        </div>
      </div>

      <div class="modal-footer">
        <button class="reject-btn" on:click={() => submitReview('reject', reviewNotes)}>
          Reject
        </button>
        <button class="approve-btn" on:click={() => submitReview('approve', reviewNotes)}>
          Approve
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .review-queue {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem;
  }

  h2 {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 1.5rem;
  }

  .loading, .empty {
    text-align: center;
    padding: 3rem;
    color: #666;
  }

  .reviews-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .review-item {
    padding: 1rem;
    background: #111;
    border: 1px solid #222;
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .review-item:hover {
    border-color: #3b82f6;
  }

  .review-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .block-title {
    font-weight: 600;
  }

  .run-id {
    font-size: 0.75rem;
    color: #666;
  }

  .review-prompt {
    font-size: 0.875rem;
    color: #888;
    margin-bottom: 0.5rem;
  }

  .review-deliverables {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
  }

  .deliverable-badge {
    font-size: 0.625rem;
    padding: 0.25rem 0.5rem;
    background: #1a1a1a;
    border-radius: 4px;
    color: #3b82f6;
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }

  .modal {
    width: 90vw;
    max-width: 800px;
    max-height: 90vh;
    background: #111;
    border: 1px solid #333;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #222;
  }

  .modal-header h3 {
    font-size: 1.125rem;
    font-weight: 600;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: 1px solid #333;
    border-radius: 6px;
    color: #888;
    font-size: 1.25rem;
    cursor: pointer;
  }

  .close-btn:hover {
    background: #222;
    color: #fff;
  }

  .modal-body {
    flex: 1;
    padding: 1.5rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .modal-body label {
    display: block;
    font-size: 0.75rem;
    color: #666;
    font-weight: 600;
    margin-bottom: 0.5rem;
    text-transform: uppercase;
  }

  .review-prompt-section p {
    color: #ccc;
  }

  .deliverables-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .deliverable-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #1a1a1a;
    border-radius: 4px;
    color: #3b82f6;
    text-decoration: none;
    font-size: 0.875rem;
  }

  .deliverable-link:hover {
    background: #222;
  }

  .deliverable-link .icon {
    font-size: 1rem;
  }

  .output {
    padding: 1rem;
    background: #0a0a0a;
    border: 1px solid #222;
    border-radius: 6px;
    font-size: 0.75rem;
    line-height: 1.5;
    max-height: 300px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .notes-section textarea {
    width: 100%;
    padding: 0.75rem;
    background: #0a0a0a;
    border: 1px solid #333;
    border-radius: 6px;
    color: #fff;
    font-size: 0.875rem;
    resize: none;
    min-height: 80px;
  }

  .notes-section textarea:focus {
    outline: none;
    border-color: #3b82f6;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid #222;
  }

  .approve-btn, .reject-btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .approve-btn {
    background: #22c55e;
    color: #000;
  }

  .approve-btn:hover {
    background: #16a34a;
  }

  .reject-btn {
    background: #dc2626;
    color: #fff;
  }

  .reject-btn:hover {
    background: #b91c1c;
  }
</style>
