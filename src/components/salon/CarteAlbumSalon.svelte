<script lang="ts">
  /** Une pochette, son titre et son artiste ; le clic ouvre la fiche album. */
  import { t } from '../../lib/i18n';
  import type { Album } from '../../lib/types';
  import { allerA } from '../../lib/stores/salon';
  import { lireAlbum } from '../../lib/lectureSalon';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import IconeSalon from './IconeSalon.svelte';

  let { album, surtitre = null, inverse = false }: { album: Album; surtitre?: string | null; inverse?: boolean } = $props();

  function ouvrir() {
    if (album.id != null) allerA({ page: 'album', id: album.id });
  }
</script>

<div class="carte" class:inverse data-carte-album>
  <div class="pochette">
    <button class="ouvrir" onclick={ouvrir} aria-label={album.title}>
      <AlbumArt coverPath={album.cover_path} albumId={album.id} size={0} vignette alt={album.title} />
    </button>
    {#if album.id != null}
      <button class="lire" onclick={() => lireAlbum(album.id!)} aria-label={$t('salon.lire.maintenant' as any)} title={$t('salon.lire.maintenant' as any)}>
        <IconeSalon nom="lecture" taille={16} plein trait={1} />
      </button>
    {/if}
  </div>
  {#if surtitre}<span class="surtitre">{surtitre}</span>{/if}
  <button class="titre" onclick={ouvrir} title={album.title}>{album.title}</button>
  {#if album.artist_name}
    {#if album.artist_id != null}
      <button class="artiste" onclick={() => allerA({ page: 'artiste', id: album.artist_id! })} title={album.artist_name}>{album.artist_name}</button>
    {:else}
      <span class="artiste">{album.artist_name}</span>
    {/if}
  {/if}
</div>

<style>
  .carte { display: flex; flex-direction: column; min-width: 0; }
  button { background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; text-align: left; }
  .pochette { position: relative; margin-bottom: 12px; }
  .ouvrir { display: block; width: 100%; }
  .lire {
    position: absolute; left: 10px; bottom: 10px;
    width: 40px; height: 40px; border-radius: 50%;
    display: grid; place-items: center; text-align: center;
    background: var(--s-acc); color: var(--s-sur-acc); opacity: 0; transition: opacity .15s;
    box-shadow: var(--s-ombre-bouton);
  }
  .pochette:hover .lire, .lire:focus-visible { opacity: 1; }
  .surtitre { font-size: var(--s-t-micro); color: var(--s-txt2); margin-bottom: 4px; }
  .titre, .artiste { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .titre { font-size: var(--s-t-texte); color: var(--s-txt); }
  .artiste { font-size: var(--s-t-texte); color: var(--s-txt2); }
  .titre:hover, button.artiste:hover { text-decoration: underline; }
  .inverse .surtitre, .inverse .artiste { color: var(--s-bandeau-doux); }
  .inverse .titre { color: var(--s-bandeau-txt); font-weight: var(--s-graisse-forte); }
</style>
