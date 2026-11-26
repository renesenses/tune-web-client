<script lang="ts">
  /** Tuile d'album : pochette carrée, bouton Lire au survol, titre et artiste. */
  import Play from '@lucide/svelte/icons/play';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import { t } from '../../lib/i18n';
  import type { Album } from '../../lib/types';
  import { allerA } from './navigationNocturne';
  import { lireAlbum } from './lectureNocturne';
  import { currentTrack } from '../../lib/stores/nowPlaying';

  interface Props { album: Album; sousTitre?: string | null }
  let { album, sousTitre = null }: Props = $props();

  /** L'album qui joue garde son bouton doré visible, comme un repère. */
  const enLecture = $derived(album.id != null && $currentTrack?.album_id === album.id);

  function ouvrir() {
    if (album.id != null) allerA({ nom: 'album', id: album.id });
  }
  function ouvrirArtiste(e: MouseEvent) {
    e.stopPropagation();
    if (album.artist_id != null) allerA({ nom: 'artiste', id: album.artist_id });
  }
  function lire(e: MouseEvent) {
    e.stopPropagation();
    if (album.id != null) lireAlbum(album.id);
  }
</script>

<div class="noc-carte">
  <button type="button" class="noc-carte-pochette" class:en-lecture={enLecture} onclick={ouvrir} aria-label={album.title}>
    <AlbumArt coverPath={album.cover_path} albumId={album.id} size={0} vignette alt={album.title} source={album.source ?? null} />
    <span class="noc-carte-lire" role="button" tabindex="-1" aria-label={$t('common.play')} onclick={lire} onkeydown={() => {}}>
      <Play size={17} fill="currentColor" />
    </span>
  </button>
  <button type="button" class="noc-carte-titre" title={album.title} onclick={ouvrir}>{album.title}</button>
  {#if sousTitre}
    <span class="noc-carte-artiste" title={sousTitre}>{sousTitre}</span>
  {:else if album.artist_name}
    <button type="button" class="noc-carte-artiste" title={album.artist_name} onclick={ouvrirArtiste}>{album.artist_name}</button>
  {/if}
</div>

<style>
  .noc-carte {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .noc-carte-pochette {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1;
    padding: 0;
    border: 1px solid var(--noc-ligne-tuile);
    border-radius: var(--noc-rayon-pochette);
    overflow: hidden;
    background: var(--noc-pochette-fond);
    cursor: pointer;
    transition: border-color var(--noc-duree), box-shadow var(--noc-duree);
  }
  .noc-carte-pochette :global(img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .noc-carte-pochette:hover {
    border-color: var(--noc-texte-2);
    box-shadow: var(--noc-carte-ombre);
  }
  /* L'album qui joue : liseré clair de 2 px, bouton Lecture visible. */
  .noc-carte-pochette.en-lecture {
    border: 2px solid var(--noc-texte-2);
    box-shadow: var(--noc-carte-ombre);
  }
  .noc-carte-pochette:focus-visible {
    outline: 2px solid var(--noc-focus);
    outline-offset: 2px;
  }
  .noc-carte-lire {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 44px;
    height: 44px;
    margin: -22px 0 0 -22px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    padding-left: 2px;
    background: var(--noc-ambre);
    color: var(--noc-sur-ambre);
    opacity: 0;
    transform: scale(0.85);
    transition: opacity var(--noc-duree), transform var(--noc-duree);
  }
  .noc-carte-pochette:hover .noc-carte-lire,
  .noc-carte-pochette:focus-visible .noc-carte-lire,
  .noc-carte-pochette.en-lecture .noc-carte-lire {
    opacity: 1;
    transform: scale(1);
  }
  .noc-carte-lire:hover { background: var(--noc-ambre-vif); }
  .noc-carte-titre,
  .noc-carte-artiste {
    display: block;
    max-width: 100%;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
    font-family: inherit;
    cursor: pointer;
  }
  .noc-carte-titre {
    margin-top: 9px;
    color: var(--noc-texte);
    font-size: var(--noc-taille-texte);
    font-weight: var(--noc-graisse-forte);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
  .noc-carte-artiste {
    margin-top: 4px;
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-petit);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  button.noc-carte-artiste:hover,
  .noc-carte-titre:hover { color: var(--noc-ambre); }
</style>
