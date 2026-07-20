<script lang="ts">
  import * as api from '../lib/api';
  import { notifications } from '../lib/stores/notifications';
  import { t as tr } from '../lib/i18n';

  interface Props {
    albumId: number;
  }
  let { albumId }: Props = $props();

  let rating = $state(0);
  let note = $state('');
  let loadedAlbumId = $state<number | null>(null);
  let submitting = $state(false);

  async function load(id: number) {
    // Mark the target album before awaiting so the effect doesn't re-fire.
    loadedAlbumId = id;
    try {
      const r = await api.getAlbumRating(id);
      rating = r.rating ?? 0;
      note = r.note ?? '';
    } catch {
      rating = 0;
      note = '';
    }
  }

  // Load (once) whenever the selected album changes.
  $effect(() => {
    if (albumId !== loadedAlbumId) load(albumId);
  });

  async function submitRating(star: number) {
    submitting = true;
    try {
      const newRating = star === rating ? 0 : star;
      await api.rateAlbum(albumId, newRating, note);
      rating = newRating;
      notifications.success(
        newRating > 0 ? `${$tr('library.rating')}: ${newRating}/5` : $tr('library.ratingRemoved')
      );
    } catch (e) {
      console.error('Rate album error:', e);
      notifications.error($tr('library.ratingError'));
    }
    submitting = false;
  }

  async function submitNote() {
    submitting = true;
    try {
      await api.rateAlbum(albumId, rating, note);
      notifications.success($tr('library.ratingSaved'));
    } catch (e) {
      console.error('Rate album note error:', e);
    }
    submitting = false;
  }
</script>

<div class="album-rating-section">
  <div class="album-stars">
    {#each [1, 2, 3, 4, 5] as star}
      <button
        class="star-btn"
        class:filled={star <= rating}
        disabled={submitting}
        onclick={() => submitRating(star)}
      >
        <svg viewBox="0 0 24 24" fill={star <= rating ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" width="18" height="18">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </button>
    {/each}
  </div>
  <div class="album-rating-note">
    <input
      type="text"
      class="rating-note-input"
      placeholder={$tr('library.ratingNotePlaceholder')}
      bind:value={note}
      onkeydown={(e) => e.key === 'Enter' && submitNote()}
      onblur={() => { if (note !== '' || rating > 0) submitNote(); }}
    />
  </div>
</div>

<style>
  .album-rating-section {
    margin-top: var(--space-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .album-stars {
    display: flex;
    gap: 2px;
  }

  .star-btn {
    background: none;
    border: none;
    padding: 2px;
    cursor: pointer;
    color: var(--tune-text-muted);
    transition: color 0.1s, transform 0.1s;
  }

  .star-btn:hover {
    color: #f59e0b;
    transform: scale(1.2);
  }

  .star-btn.filled {
    color: #f59e0b;
  }

  .star-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .rating-note-input {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text);
    width: 100%;
    max-width: 250px;
    outline: none;
    transition: border-color 0.12s;
  }

  .rating-note-input:focus {
    border-color: var(--tune-accent);
  }

  .rating-note-input::placeholder {
    color: var(--tune-text-muted);
  }
</style>
