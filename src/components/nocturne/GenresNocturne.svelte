<script lang="ts">
  /**
   * Genres de la bibliothèque en MOSAÏQUE (itération 9) : des tuiles de
   * tailles variées, pochette d'un album du genre en fond, voile sombre en
   * bas, nom et nombre d'albums en bas à gauche. Un toucher ouvre les albums
   * du genre (écran Albums de Nocturne, filtré).
   */
  import { t } from '../../lib/i18n';
  import { demanderBibliothequeEntiere } from '../../lib/stores/albumsPagines';
  import { albums as albumsBibliotheque, libraryLoading } from '../../lib/stores/library';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import { allerA } from './navigationNocturne';
  import { tuilesDeGenres } from './genresNocturne';

  $effect(() => { void demanderBibliothequeEntiere().catch(() => {}); });
  const tuiles = $derived(tuilesDeGenres($albumsBibliotheque));
</script>

<div class="noc-genres" data-mosaique-genres>
  <header class="noc-genres-entete">
    <span class="noc-surtitre">{$t('nav.library')}</span>
    <h1>{$t('nav.genres')}</h1>
    <p>{$t('nocturne.genres.aide' as any)}</p>
  </header>

  {#if !tuiles.length}
    <p class="noc-vide">{$albumsBibliotheque.length || !$libraryLoading ? $t('common.noResult') : $t('common.loading')}</p>
  {:else}
    <ul class="noc-mosaique">
      {#each tuiles as g (g.genre)}
        <li class="noc-tuile-genre" style:--col={g.large.colonnes} style:--lig={g.large.lignes} style:--col-e={g.etroit.colonnes} style:--lig-e={g.etroit.lignes}>
          <button type="button" onclick={() => allerA({ nom: 'genre', genre: g.genre })} aria-label={`${g.genre} — ${g.nombre}`}>
            <span class="noc-tuile-fond"><AlbumArt coverPath={g.pochette?.cover_path ?? null} albumId={g.pochette?.id ?? null} size={0} recadrer alt="" /></span>
            <span class="noc-tuile-voile" aria-hidden="true"></span>
            <span class="noc-tuile-textes">
              <span class="noc-tuile-nom" title={g.genre}>{g.genre}</span>
              <span class="noc-tuile-compte">{$t('nocturne.genres.compte' as any).replace('{n}', String(g.nombre))}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .noc-genres { padding: 34px 0 40px; }
  .noc-genres-entete h1 {
    margin: 6px 0 4px;
    font-size: var(--noc-taille-titre-page);
    font-weight: var(--noc-graisse-titre);
    letter-spacing: var(--noc-interlettre-titre);
    color: var(--noc-texte);
  }
  .noc-genres-entete p { margin: 0; color: var(--noc-texte-2); font-size: var(--noc-taille-sous-titre); }
  .noc-surtitre {
    font-size: var(--noc-taille-surtitre);
    font-weight: var(--noc-graisse-forte);
    letter-spacing: var(--noc-interlettre-surtitre);
    text-transform: uppercase;
    color: var(--noc-texte-3);
  }
  .noc-vide { color: var(--noc-texte-3); margin-top: 34px; }
  /* Six colonnes, rangées de hauteur fixe ; la taille de chaque tuile (large,
     haute, moyenne, petite) vient d'un motif qui se répète (genresNocturne). */
  .noc-mosaique {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    grid-auto-rows: var(--noc-rangee-mosaique);
    gap: var(--noc-ecart-tuiles);
    margin: 26px 0 0;
    padding: 0;
    list-style: none;
  }
  .noc-tuile-genre { grid-column: span var(--col); grid-row: span var(--lig); }
  .noc-tuile-genre button {
    position: relative;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: var(--noc-rayon-grand);
    overflow: hidden;
    background: var(--noc-pochette-fond);
    color: var(--noc-texte);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .noc-tuile-fond { position: absolute; inset: 0; }
  .noc-tuile-fond > :global(*) { width: 100%; height: 100%; }
  .noc-tuile-fond :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform var(--noc-duree); }
  .noc-tuile-genre button:hover .noc-tuile-fond :global(img) { transform: scale(1.04); }
  .noc-tuile-voile { position: absolute; inset: 0; background: linear-gradient(to top, var(--noc-voile-tuile), transparent 62%); }
  .noc-tuile-textes { position: absolute; left: 16px; right: 16px; bottom: 14px; display: flex; flex-direction: column; gap: 2px; }
  .noc-tuile-nom {
    color: var(--noc-sur-avatar);
    font-size: var(--noc-taille-section);
    font-weight: var(--noc-graisse-titre);
    letter-spacing: var(--noc-interlettre-titre);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .noc-tuile-compte { color: var(--noc-sur-avatar); opacity: 0.8; font-size: var(--noc-taille-petit); }
  @media (max-width: 900px) {
    .noc-mosaique { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .noc-tuile-genre { grid-column: span var(--col-e); grid-row: span var(--lig-e); }
  }
</style>
