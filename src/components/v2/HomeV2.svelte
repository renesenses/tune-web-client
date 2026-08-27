<script lang="ts">
  /**
   * Accueil du nouveau client (direction Levente). Rangées horizontales sur
   * les vraies données d'accueil : reprendre l'écoute, récemment joué, et les
   * nouveautés des artistes suivis (section corrigée cette semaine côté
   * serveur — libellé « récentes », artiste et parution cliquables).
   *
   * Densité par niveau : Essentiel = Reprendre + Récemment joué ; Avancé/Expert
   * ajoutent les nouveautés d'artistes et une ligne de statistiques.
   */
  import * as api from '../../lib/api';
  import type { ArtistReleaseGroup } from '../../lib/api';
  import { currentZoneId } from '../../lib/stores/zones';
  import { activeView } from '../../lib/stores/navigation';
  import { pendingStreamingArtist } from '../../lib/stores/streaming';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { formatNumber } from '../../lib/utils';
  import type { Album } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import '../../styles/tune-v2.css';

  const showMore = $derived(atLeast($preferences.settingsLevel, 'intermediate'));

  let cont = $state<any[]>([]);
  let recent = $state<Album[]>([]);
  let groups = $state<ArtistReleaseGroup[]>([]);
  let stats = $state<{ tracks: number; albums: number; artists: number } | null>(null);

  $effect(() => {
    api.getContinueListening(12).then((r) => (cont = r ?? [])).catch(() => {});
    api.getRecentAlbums(18).then((r) => (recent = r ?? [])).catch(() => {});
    api.getArtistReleases(12).then((r) => (groups = r ?? [])).catch(() => {});
    api.getLibraryStats().then((r) => (stats = r)).catch(() => {});
  });

  const hour = new Date().getHours();
  const hello = hour < 6 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  function playAlbum(id: number | null | undefined) {
    const zid = $currentZoneId;
    if (zid == null || id == null) return;
    api.play(zid, { album_id: id }).catch(() => {});
  }
  function openArtist(name: string) {
    pendingStreamingArtist.set({ id: null, source_id: null, name } as any);
    activeView.set('streaming');
  }
</script>

<section class="v2-home tune-v2">
  <header class="top">
    <div>
      <div class="hello">{hello}</div>
      <h1>Votre musique</h1>
    </div>
  </header>

  <div class="scroll">
    {#if cont.length}
      <section class="rowsec">
        <h2>Reprendre l'écoute</h2>
        <div class="row">
          {#each cont as it (it.album_id ?? it.id ?? it.title)}
            <button class="tile" onclick={() => playAlbum(it.album_id ?? it.id)}>
              <div class="cv"><AlbumArt coverPath={it.cover_path ?? null} albumId={it.album_id ?? it.id ?? null} size={200} alt={it.title ?? ''} /></div>
              <div class="tt">{it.title ?? it.album_title ?? ''}</div>
              <div class="ta">{it.artist_name ?? ''}</div>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <section class="rowsec">
      <h2>Récemment joué</h2>
      <div class="row">
        {#each recent as a (a.id)}
          <button class="tile" onclick={() => playAlbum(a.id)}>
            <div class="cv"><AlbumArt coverPath={a.cover_path} albumId={a.id} size={200} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} /></div>
            <div class="tt">{a.title}</div>
            <div class="ta">{a.artist_name ?? ''}</div>
          </button>
        {/each}
      </div>
    </section>

    {#if showMore && groups.length}
      <section class="rowsec">
        <h2>Nouveautés de vos artistes</h2>
        {#each groups as g (g.artist_name)}
          <div class="artist-line">
            <button class="artist-name" onclick={() => openArtist(g.artist_name)}>{g.artist_name}</button>
            <div class="row">
              {#each g.releases as r (r.source_id)}
                <div class="tile small">
                  <div class="cv"><AlbumArt coverPath={r.cover_path} albumId={null} size={160} alt={r.title} source={r.service as any} fallbackInitials={r.title?.slice(0,1)} /></div>
                  <div class="tt">{r.title}</div>
                  {#if r.year}<div class="ta">{r.year}</div>{/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </section>
    {/if}

    {#if showMore && stats}
      <div class="stats">
        <div><b>{formatNumber(stats.tracks)}</b><span>titres</span></div>
        <div><b>{formatNumber(stats.albums)}</b><span>albums</span></div>
        <div><b>{formatNumber(stats.artists)}</b><span>artistes</span></div>
      </div>
    {/if}
  </div>
</section>

<style>
  .v2-home{position:relative; display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .top{padding:22px 30px 6px}
  .hello{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}

  .scroll{flex:1; overflow-y:auto; padding:14px 0 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .rowsec{padding:14px 0 6px}
  .rowsec h2{font-size:19px; font-weight:700; padding:0 30px 12px}
  .row{display:flex; gap:18px; overflow-x:auto; padding:2px 30px 10px; scrollbar-width:none}
  .row::-webkit-scrollbar{display:none}
  .tile{flex:0 0 160px; width:160px; border:0; background:transparent; color:inherit; cursor:pointer; text-align:left; padding:0}
  .tile.small{flex-basis:128px; width:128px}
  .cv{aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden; box-shadow:var(--v2-sh-card); transition:.18s}
  .tile:hover .cv{box-shadow:0 10px 24px var(--v2-glow)}
  .tt{margin-top:9px; font:600 13px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ta{margin-top:2px; font:11px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}

  .artist-line{padding:6px 0 10px}
  .artist-name{border:0; background:transparent; color:var(--v2-txt); font:700 15px var(--v2-sans); cursor:pointer;
    padding:0 30px 8px}
  .artist-name:hover{color:var(--v2-acc-tint)}

  .stats{display:flex; gap:34px; padding:20px 30px 8px; margin:12px 30px 0; border-top:1px solid var(--v2-line)}
  .stats div{display:flex; flex-direction:column}
  .stats b{font:800 24px var(--v2-sans)}
  .stats span{font:11px var(--v2-mono); letter-spacing:.08em; color:var(--v2-txt3); text-transform:uppercase; margin-top:2px}
</style>
