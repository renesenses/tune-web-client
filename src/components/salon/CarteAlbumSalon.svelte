<script lang="ts">
  /** Une pochette, son titre et son artiste ; le clic ouvre la fiche album. */
  import { bulleTexte } from '../../lib/infobulleTexte';
  import { t } from '../../lib/i18n';
  import type { Album } from '../../lib/types';
  import { allerA } from '../../lib/stores/salon';
  import { lireAlbum, ajouterAlbumALaFile, ajouterAlbumsALaFile } from '../../lib/lectureSalon';
  import { ouvrirMenuContextuel } from '../../lib/stores/menuContextuelSalon';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import IconeSalon from './IconeSalon.svelte';

  let { album, surtitre = null, inverse = false, onOuvrir = null, choisie = false, surSelection = null, cibles = null }: {
    album: Album; surtitre?: string | null; inverse?: boolean; onOuvrir?: (() => void) | null;
    /** Lot 12 — sélection multiple tenue par la grille : la carte est-elle choisie ? */
    choisie?: boolean;
    /** Cmd/Ctrl/Maj + clic : rend `true` si la grille a pris le clic (sélection). */
    surSelection?: ((e: MouseEvent) => boolean) | null;
    /** Les albums que vise le clic droit (la sélection, si la carte en fait partie). */
    cibles?: (() => number[]) | null;
  } = $props();

  /** Lot 12 — le clic droit : les actions de l'album, ou de la sélection. */
  function menu(e: MouseEvent) {
    if (album.id == null) return;
    const ids = cibles?.() ?? [album.id];
    if (ids.length > 1) {
      ouvrirMenuContextuel(e, [
        { libelle: $t('roonLike.lire.ensuite' as any), faire: () => ajouterAlbumsALaFile(ids, 'ensuite') },
        { libelle: $t('roonLike.lire.enFile' as any), faire: () => ajouterAlbumsALaFile(ids, 'fin') },
      ], $t('roonLike.menu.selectionAlbums' as any).replace('{n}', String(ids.length)));
      return;
    }
    const id = album.id;
    ouvrirMenuContextuel(e, [
      { libelle: $t('roonLike.lire.maintenant' as any), faire: () => lireAlbum(id) },
      { libelle: $t('roonLike.lire.aleatoire' as any), faire: () => lireAlbum(id, { aleatoire: true }) },
      { libelle: $t('roonLike.lire.ensuite' as any), faire: () => ajouterAlbumALaFile(id, 'ensuite') },
      { libelle: $t('roonLike.lire.enFile' as any), faire: () => ajouterAlbumALaFile(id, 'fin') },
      { libelle: $t('roonLike.menu.ouvrirAlbum' as any), faire: () => allerA({ page: 'album', id }) },
      ...(album.artist_id != null ? [{ libelle: $t('roonLike.allerArtiste' as any), faire: () => allerA({ page: 'artiste', id: album.artist_id! }) }] : []),
    ], album.title);
  }
  function clicCapture(e: MouseEvent) {
    if (surSelection && (e.metaKey || e.ctrlKey || e.shiftKey) && surSelection(e)) { e.preventDefault(); e.stopPropagation(); }
  }

  function ouvrir() {
    if (onOuvrir) { onOuvrir(); return; }
    if (album.id != null) allerA({ page: 'album', id: album.id });
  }
</script>

<div class="carte" class:inverse class:choisie data-carte-album oncontextmenu={menu} onclickcapture={clicCapture}>
  <div class="pochette">
    <button class="ouvrir" onclick={ouvrir} aria-label={album.title}>
      <AlbumArt coverPath={album.cover_path} albumId={album.id} size={0} vignette alt={album.title} />
    </button>
    {#if album.id != null}
      <button class="lire" onclick={() => lireAlbum(album.id!)} aria-label={$t('roonLike.lire.maintenant' as any)} title={$t('roonLike.lire.maintenant' as any)}>
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
      <span class="artiste" use:bulleTexte>{album.artist_name}</span>
    {/if}
  {/if}
</div>

<style>
  .carte { display: flex; flex-direction: column; min-width: 0; border-radius: var(--s-r-pochette); }
  .carte.choisie { background: var(--s-selection); box-shadow: var(--s-halo-selection); }
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
