<script lang="ts">
  /**
   * Écran « Étiquettes » — le groupe Sélections de la barre latérale.
   *
   * Demandé par Bertrand le 02/09/2026. Il n'existait NULLE PART, ni dans le
   * client actuel ni dans le nouveau : on pouvait poser une étiquette depuis le
   * détail d'un album, jamais retrouver ce qu'on avait étiqueté. Un rangement
   * qu'on ne peut pas relire ne sert à rien.
   *
   * ## Ce que le serveur sait rendre, et pas plus
   *
   * `GET /tags/{id}/albums` est la SEULE route qui liste par étiquette. Les
   * étiquettes acceptent pourtant quatre sortes d'objets — album, artiste,
   * playlist, piste — plus les deux sortes de collection depuis la PR #3194.
   *
   * Cet écran montre donc les ALBUMS d'une étiquette, et le dit. Afficher un
   * compte global qui ne correspondrait pas à ce qu'on voit serait pire que de
   * ne rien annoncer.
   */
  import { onMount } from 'svelte';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { currentZoneId } from '../../lib/stores/zones';
  import type { Album, UserTag } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';

  let etiquettes = $state<UserTag[]>([]);
  let chargement = $state(true);
  let ouverte = $state<UserTag | null>(null);
  let albums = $state<Album[]>([]);
  let albumsChargement = $state(false);
  let albumOuvert = $state<Album | null>(null);

  async function charger() {
    chargement = true;
    try {
      etiquettes = (await api.getTags()) ?? [];
    } catch {
      etiquettes = [];
    }
    chargement = false;
  }

  async function ouvrir(tag: UserTag) {
    ouverte = tag;
    albums = [];
    albumsChargement = true;
    try {
      const r = await api.getTagAlbums(tag.id!);
      albums = r?.albums ?? [];
    } catch {
      albums = [];
    }
    albumsChargement = false;
  }

  function lireAlbum(a: Album) {
    const zid = $currentZoneId;
    if (zid == null || a.id == null) return;
    api.play(zid, { album_id: a.id }).catch(() => {});
  }

  onMount(() => {
    void charger();
  });
</script>

<section class="v2-tags tune-v2">
  {#if ouverte}
    {@const tag = ouverte}
    <header class="top">
      <button class="back" onclick={() => (ouverte = null)}>← {$t('common.back' as any)}</button>
      <div class="eyebrow">{$t('v2.tags.eyebrow' as any)}</div>
      <h1><span class="pastille" style={tag.color ? `--c:${tag.color}` : ''}></span>{tag.name}</h1>
      <!-- On annonce des ALBUMS, pas un total : le serveur ne liste par
           étiquette que ceux-là, alors qu'une étiquette peut aussi porter des
           artistes, des playlists et des pistes. -->
      <p class="sub">{albums.length} {$t('v2.tags.albumsWithTag' as any)}</p>
    </header>

    {#if albumsChargement}
      <div class="etat">{$t('common.loading' as any)}</div>
    {:else if !albums.length}
      <div class="etat">{$t('v2.tags.noAlbumWithTag' as any)}</div>
    {:else}
      <div class="grille">
        {#each albums as a (a.id)}
          <div class="carte">
            <div class="cv">
              <PochetteActions
                favori={a.id != null ? { albumId: a.id } : null}
                etiquettes={a.id != null ? { itemType: 'album', itemId: a.id } : null}
                onLire={() => lireAlbum(a)}
                onOuvrir={() => (albumOuvert = a)}
                nom={a.title}
              >
                <AlbumArt coverPath={a.cover_path} albumId={a.id} size={0} alt={a.title}
                  fallbackInitials={a.title?.slice(0, 1)} />
              </PochetteActions>
            </div>
            <button class="meta" onclick={() => (albumOuvert = a)}>
              <span class="ct">{a.title}</span>
              <span class="ca">{a.artist_name ?? ''}</span>
            </button>
          </div>
        {/each}
      </div>
    {/if}

    {#if albumOuvert}
      <AlbumDetailV2 album={albumOuvert} depot={null} onClose={() => (albumOuvert = null)} />
    {/if}

  {:else}
    <header class="top">
      <div class="eyebrow">{$t('v2.tags.eyebrow' as any)}</div>
      <h1>{$t('v2.cover.tags' as any)}</h1>
    </header>

    {#if chargement}
      <div class="etat">{$t('common.loading' as any)}</div>
    {:else if !etiquettes.length}
      <!-- Une étiquette se pose depuis la pochette : on le DIT, sinon l'écran
           vide se lit comme une panne. -->
      <div class="etat">{$t('v2.tags.emptyHint' as any)}</div>
    {:else}
      <ul class="liste">
        {#each etiquettes as tag (tag.id)}
          <li>
            <button class="tag" style={tag.color ? `--c:${tag.color}` : ''} onclick={() => ouvrir(tag)}>
              <span class="pastille"></span>
              <span class="nom">{tag.name}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<style>
  .v2-tags{height:100%; overflow-y:auto; background:var(--v2-bg); color:var(--v2-txt); font-family:var(--v2-sans)}
  .top{padding:24px 30px 12px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{display:flex; align-items:center; gap:10px; font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .sub{color:var(--v2-txt2); font-size:13.5px; margin-top:6px}
  .back{background:transparent; border:0; color:var(--v2-txt2); cursor:pointer; font:600 13px var(--v2-sans); padding:0 0 8px}
  .back:hover{color:var(--v2-txt)}
  .etat{padding:30px; color:var(--v2-txt3); font-size:13.5px; max-width:60ch}

  .liste{display:flex; flex-wrap:wrap; gap:10px; padding:12px 30px 30px; list-style:none}
  .tag{
    --c:var(--v2-acc1);
    display:inline-flex; align-items:center; gap:9px; cursor:pointer;
    padding:9px 15px; border-radius:var(--v2-r-pill);
    border:1px solid color-mix(in srgb, var(--c) 45%, transparent);
    background:color-mix(in srgb, var(--c) 12%, transparent);
    color:var(--v2-txt); font:600 13.5px var(--v2-sans);
  }
  .tag:hover{background:color-mix(in srgb, var(--c) 24%, transparent)}
  .pastille{--c:var(--v2-acc1); width:9px; height:9px; border-radius:50%; background:var(--c); flex:none}

  .grille{display:grid; grid-template-columns:repeat(auto-fill, minmax(148px, 1fr)); gap:22px 18px; padding:12px 30px 40px}
  .carte{display:flex; flex-direction:column; content-visibility:auto; contain-intrinsic-size:auto 210px}
  .cv{position:relative; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden}
  .cv :global(img){width:100%; height:100%; object-fit:cover; display:block}
  .meta{display:block; width:100%; border:0; background:transparent; padding:0; text-align:left; color:inherit; font:inherit; cursor:pointer}
  .ct{display:block; margin-top:9px; font:600 12.5px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{display:block; margin-top:2px; font:11px var(--v2-mono); color:var(--v2-txt3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
</style>
