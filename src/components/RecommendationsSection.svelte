<script lang="ts">
  /**
   * « Recommandations » — sortie du Tableau de bord, remise en bas de l'accueil.
   *
   * Elle avait suivi les classements dans `DashboardHighlights` lors du
   * déménagement, mais elle n'a pas la même nature : un classement se date (« les
   * plus écoutés de QUAND ? ») et gagne au sélecteur de période du tableau de
   * bord, alors qu'une recommandation est une invitation à écouter — sa place
   * est sur l'accueil, en bas, une fois qu'on a parcouru ce qu'on possède déjà
   * (Bertrand, 24/08/2026).
   *
   * Composant plutôt que copier-coller : l'état, le chargement et les styles
   * n'existent qu'ICI. Recopier le bloc dans `HomeView` aurait laissé deux
   * définitions à tenir à jour — c'est exactement ce montage qui a fait perdre
   * le canal des bandes d'EQ (#2313).
   */
  import { onMount } from 'svelte';
  import * as api from '../lib/api';
  import { t } from '../lib/i18n';
  import { ouvrirAlbum } from '../lib/libraryNavigation';
  import AlbumArt from './AlbumArt.svelte';

  let recommendations: any[] = $state([]);
  let recsLoaded = $state(false);

  async function loadRecommendations() {
    try {
      const r = await api.getRecommendations(12);
      recommendations = Array.isArray(r) ? r : (r.albums ?? r.recommendations ?? []);
      recsLoaded = true;
    } catch (e) {
      console.error('Load recommendations error:', e);
      recsLoaded = true;
    }
  }

  onMount(() => {
    loadRecommendations();
  });
</script>

{#if recsLoaded && recommendations.length > 0}
  <div class="top-section">
    <h2 class="section-title">{$t('home.recommendations')}</h2>
    <div class="recs-carousel">
      {#each recommendations as rec}
        <button
          class="rec-card"
          onclick={() =>
            rec.id ? ouvrirAlbum(rec.id) : rec.album_id ? ouvrirAlbum(rec.album_id) : null}
        >
          <AlbumArt
            coverPath={rec.cover_path}
            albumId={rec.id ?? rec.album_id}
            size={140}
            alt={rec.title}
          />
          <span class="rec-title truncate" title={rec.title}>{rec.title}</span>
          <span class="rec-artist truncate" title={rec.artist_name ?? ''}>{rec.artist_name ?? ''}</span>
          {#if rec.reason}
            <span class="rec-reason" title={rec.reason}>{rec.reason}</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .top-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .section-title {
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text);
    margin: 0;
  }

  .recs-carousel {
    display: flex;
    gap: var(--space-md);
    overflow-x: auto;
    padding: var(--space-xs) 0;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .recs-carousel::-webkit-scrollbar {
    display: none;
  }

  .rec-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    flex-shrink: 0;
    width: 140px;
    min-height: 210px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--tune-text);
  }

  .rec-card:hover .rec-title {
    color: var(--tune-accent);
  }

  .rec-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    max-width: 140px;
    transition: color 0.12s;
  }

  .rec-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    max-width: 140px;
  }

  .rec-reason {
    display: inline-block;
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    color: var(--tune-accent);
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.12);
    padding: 2px 8px;
    border-radius: 8px;
    margin-top: auto;
    white-space: nowrap;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
