<script lang="ts">
  import * as api from '../../lib/api';
  import { notifications } from '../../lib/stores/notifications';
  import { t as tr, locale } from '../../lib/i18n';
  import { ligneCommunautaire, type AgregatsCommunautaires } from '../../lib/notesCommunautaires';

  interface Props {
    albumId: number;
  }
  let { albumId }: Props = $props();

  let rating = $state(0);
  let loadedAlbumId = $state<number | null>(null);
  let submitting = $state(false);
  // #6545 — les agrégats publics de la communauté (null : rien à afficher).
  let communaute = $state<AgregatsCommunautaires | null>(null);
  let ligne = $derived(ligneCommunautaire(communaute, $locale, $tr));

  async function load(id: number) {
    // Mark the target album before awaiting so the effect doesn't re-fire.
    loadedAlbumId = id;
    communaute = null;
    // Indépendant de la note : un serveur muet ou non relié n'empêche rien.
    api.getAlbumCommunity(id).then((c) => { if (loadedAlbumId === id) communaute = c; }).catch(() => {});
    try {
      const r = await api.getAlbumRating(id);
      rating = r.rating ?? 0;
    } catch {
      rating = 0;
    }
  }

  // Load (once) whenever the selected album changes.
  $effect(() => {
    if (albumId !== loadedAlbumId) load(albumId);
  });

  /**
   * web#2653 — la note libre de l'album a quitté ce composant pour le bloc
   * « Mes notes » (`MesNotes.svelte`, Markdown). La route des étoiles porte
   * pourtant toujours `album_ratings.note` : on la RELIT au moment d'écrire
   * et on la renvoie telle quelle. Garder une copie chargée à l'ouverture
   * écraserait, au premier clic sur une étoile, ce que « Mes notes » vient
   * d'enregistrer.
   */
  async function submitRating(star: number) {
    submitting = true;
    try {
      const newRating = star === rating ? 0 : star;
      const actuelle = await api.getAlbumRating(albumId).catch(() => null);
      const note = typeof actuelle?.note === 'string' && actuelle.note ? actuelle.note : undefined;
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
  {#if ligne}
    <div class="album-community" data-communaute="album">{ligne}</div>
  {/if}
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

  .album-community {
    font-size: 12px;
    color: var(--tune-text-muted);
  }
</style>
