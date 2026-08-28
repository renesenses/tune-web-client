<script lang="ts">
  /**
   * Favoris — nouveau client (direction Levente).
   *
   * Niveau Avancé. Les favoris sont attachés à un PROFIL : sans profil actif
   * il n'y a rien à afficher, et l'écran le dit au lieu de faire croire à une
   * liste vide. Le profil est chargé par l'amorçage v2 (voir lib/v2Bootstrap) —
   * `loadProfiles()` ne vit que dans App.svelte, que `?v2` ne monte jamais.
   *
   * Densité :
   *   Avancé → Albums, Titres, Artistes ; lecture, mise en file, retrait.
   *   Expert → ligne technique sur les titres.
   */
  import * as api from '../../lib/api';
  import { currentZoneId } from '../../lib/stores/zones';
  import { currentTrackId } from '../../lib/stores/nowPlaying';
  import { currentProfileId, loadFavoriteIds } from '../../lib/stores/profile';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { fold, formatDuration, getQualityTier } from '../../lib/utils';
  import type { Album, Track, Artist } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';
  import '../../styles/tune-v2.css';

  const level = $derived($preferences.settingsLevel);
  const showExpert = $derived(atLeast(level, 'expert'));

  type Tab = 'albums' | 'tracks' | 'artists';
  let tab = $state<Tab>('albums');
  let q = $state('');

  let albums = $state<Album[]>([]);
  let tracks = $state<Track[]>([]);
  let artists = $state<Artist[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let opened = $state<Album | null>(null);

  async function reload() {
    const pid = $currentProfileId;
    if (pid == null) { loading = false; return; }
    loading = true;
    try {
      const f = await api.getFavorites(pid);
      albums = f.albums ?? []; tracks = f.tracks ?? []; artists = f.artists ?? [];
      error = null;
    } catch {
      error = 'Favoris indisponibles.';
    }
    loading = false;
  }
  // Rechargé si le profil change : les favoris sont personnels.
  $effect(() => { void $currentProfileId; reload(); });

  function match(s: string | null | undefined): boolean {
    return !q || fold(s).includes(fold(q));
  }
  const vAlbums = $derived(albums.filter((a) => match(a.title) || match(a.artist_name)));
  const vTracks = $derived(tracks.filter((t) => match(t.title) || match(t.artist_name)));
  const vArtists = $derived(artists.filter((a) => match(a.name)));

  const TABS: { id: Tab; label: string; n: number }[] = $derived([
    { id: 'albums', label: 'Albums', n: vAlbums.length },
    { id: 'tracks', label: 'Titres', n: vTracks.length },
    { id: 'artists', label: 'Artistes', n: vArtists.length },
  ]);

  function playAlbum(id: number | null | undefined) {
    const zid = $currentZoneId;
    if (zid == null || id == null) return;
    api.play(zid, { album_id: id }).catch(() => { error = 'Lecture impossible.'; });
  }
  function playTrack(t: Track) {
    const zid = $currentZoneId;
    if (zid == null || t.id == null) return;
    api.play(zid, { track_id: t.id }).catch(() => { error = 'Lecture impossible.'; });
  }
  function queueAlbum(id: number | null | undefined, e: MouseEvent) {
    e.stopPropagation();
    const zid = $currentZoneId;
    if (zid == null || id == null) return;
    api.addToQueue(zid, { album_id: id }).catch(() => { error = 'Mise en file impossible.'; });
  }

  /** Retrait d'un favori. On recharge aussi les ENSEMBLES d'identifiants du
   *  store : sans ça, les boutons cœur des autres écrans continueraient
   *  d'afficher l'élément comme favori jusqu'au prochain rechargement. */
  async function unfav(body: { track_id?: number; album_id?: number; artist_id?: number }, e: MouseEvent) {
    e.stopPropagation();
    const pid = $currentProfileId;
    if (pid == null || busy) return;
    busy = true;
    try {
      await api.removeFavorite(pid, body);
      await reload();
      await loadFavoriteIds(pid);
    } catch { error = 'Retrait impossible.'; }
    busy = false;
  }

  function tech(t: Track): string {
    if (getQualityTier(t) === 'dsd') return 'DSD';
    const r = t.sample_rate ? `${Math.round(t.sample_rate / 100) / 10} kHz` : '';
    return [t.format?.toUpperCase(), r].filter(Boolean).join(' · ');
  }
</script>

<section class="v2-fav tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">Votre sélection</div>
      <h1>Favoris</h1>
    </div>
    <nav class="tabs">
      {#each TABS as t (t.id)}
        <button class:on={tab === t.id} onclick={() => (tab = t.id)}>{t.label}<span>{t.n}</span></button>
      {/each}
    </nav>
    <div class="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input placeholder="Filtrer" bind:value={q} />
    </div>
  </header>

  {#if error}<div class="err">{error}<button onclick={() => (error = null)} aria-label="Fermer">×</button></div>{/if}

  <div class="scroll">
    {#if $currentProfileId == null}
      <div class="state">Aucun profil actif — les favoris sont attachés à un profil.</div>
    {:else if loading}
      <div class="state">Chargement des favoris…</div>
    {:else if tab === 'albums'}
      {#if !vAlbums.length}
        <div class="state">{albums.length ? 'Aucun album ne correspond.' : 'Aucun album en favori.'}</div>
      {:else}
        <div class="grid">
          {#each vAlbums as a (a.id)}
            <div class="card">
              <button class="open" onclick={() => (opened = a)} aria-label={`Ouvrir ${a.title}`}></button>
              <span class="cv"><AlbumArt coverPath={a.cover_path} albumId={a.id} size={0} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} /></span>
              <span class="ct">{a.title}</span>
              <span class="ca">{a.artist_name ?? ''}</span>
              <span class="acts">
                <button onclick={(e) => { e.stopPropagation(); playAlbum(a.id); }} aria-label="Lire">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8V4z"/></svg>
                </button>
                <button onclick={(e) => queueAlbum(a.id, e)} aria-label="Ajouter à la file">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 6h13M4 11h13M4 16h8M18 15l3 2-3 2z"/></svg>
                </button>
                <button class="hot" onclick={(e) => unfav({ album_id: a.id ?? undefined }, e)} disabled={busy} aria-label="Retirer des favoris">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20s-6.5-4-9-8C1 9 3 5.5 6.2 5.5c1.8 0 3 1 3.8 2 .8-1 2-2 3.8-2C17 5.5 19 9 17 12c-2.5 4-9 8-9 8z"/></svg>
                </button>
              </span>
            </div>
          {/each}
        </div>
      {/if}

    {:else if tab === 'tracks'}
      {#if !vTracks.length}
        <div class="state">{tracks.length ? 'Aucun titre ne correspond.' : 'Aucun titre en favori.'}</div>
      {:else}
        <div class="list">
          {#each vTracks as t, i (t.id ?? i)}
            <div class="row" class:np={t.id != null && t.id === $currentTrackId}>
              <button class="play" onclick={() => playTrack(t)}>
                <span class="cv sm"><AlbumArt coverPath={t.cover_path} albumId={t.album_id ?? null} size={0} alt={t.title} source={t.source} fallbackInitials={t.title?.slice(0,1)} /></span>
                <span class="ti">{t.title}<em>{t.artist_name ?? ''}{t.album_title ? ' · ' + t.album_title : ''}</em></span>
              </button>
              {#if showExpert && tech(t)}<span class="tk">{tech(t)}</span>{/if}
              <span class="dur">{formatDuration(t.duration_ms ?? 0)}</span>
              <button class="hot flat" onclick={(e) => unfav({ track_id: t.id ?? undefined }, e)} disabled={busy} aria-label="Retirer des favoris">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20s-6.5-4-9-8C1 9 3 5.5 6.2 5.5c1.8 0 3 1 3.8 2 .8-1 2-2 3.8-2C17 5.5 19 9 17 12c-2.5 4-9 8-9 8z"/></svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}

    {:else}
      {#if !vArtists.length}
        <div class="state">{artists.length ? 'Aucun artiste ne correspond.' : 'Aucun artiste en favori.'}</div>
      {:else}
        <div class="arow">
          {#each vArtists as a (a.id ?? a.name)}
            <div class="art">
              <span class="acv"><AlbumArt coverPath={a.image_path ?? null} albumId={null} size={0} alt={a.name} fallbackInitials={a.name?.slice(0,1)} /></span>
              <span class="an">{a.name}</span>
              <button class="hot round" onclick={(e) => unfav({ artist_id: a.id ?? undefined }, e)} disabled={busy} aria-label="Retirer des favoris">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20s-6.5-4-9-8C1 9 3 5.5 6.2 5.5c1.8 0 3 1 3.8 2 .8-1 2-2 3.8-2C17 5.5 19 9 17 12c-2.5 4-9 8-9 8z"/></svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  {#if opened}
    <AlbumDetailV2 album={opened} onClose={() => (opened = null)} />
  {/if}
</section>

<style>
  .v2-fav{position:relative; display:flex; flex-direction:column; height:100%; background:var(--v2-bg);
    color:var(--v2-txt); font-family:var(--v2-sans); overflow:hidden}
  .top{display:flex; align-items:flex-end; gap:22px; padding:24px 30px 14px; padding-right:96px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .tabs{display:flex; gap:4px}
  .tabs button{display:inline-flex; align-items:center; gap:7px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; font:600 12px var(--v2-sans); padding:8px 14px; border-radius:var(--v2-r-pill); transition:.15s}
  .tabs button span{font:9.5px var(--v2-mono); color:var(--v2-txt3)}
  .tabs button:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .tabs button.on{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .tabs button.on span{color:var(--v2-on-acc); opacity:.75}
  .search{position:relative; margin-left:auto; display:flex; align-items:center; width:240px; flex:0 0 auto}
  .search svg{position:absolute; left:14px; width:16px; height:16px; color:var(--v2-txt3); pointer-events:none}
  .search input{width:100%; height:40px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:13px var(--v2-sans); padding:0 14px 0 38px; outline:none}
  .search input:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}

  .err{display:flex; align-items:center; gap:12px; margin:0 30px 10px; padding:9px 14px; border-radius:10px;
    font-size:12.5px; border:1px solid var(--v2-danger-bd); background:var(--v2-acc-soft)}
  .err button{margin-left:auto; border:0; background:transparent; color:inherit; font-size:16px; cursor:pointer}

  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:30px 0; color:var(--v2-txt3)}

  .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:22px}
  .card{position:relative; display:flex; flex-direction:column}
  .open{position:absolute; inset:0; z-index:1; border:0; background:transparent; cursor:pointer; border-radius:var(--v2-r-card)}
  .open:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
  .cv{display:block; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden; box-shadow:var(--v2-sh-card); transition:.18s}
  .card:hover .cv{box-shadow:0 10px 24px var(--v2-glow)}
  .ct{margin-top:9px; font:600 13px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{margin-top:2px; font:11px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .acts{position:absolute; right:8px; bottom:64px; z-index:2; display:flex; gap:5px; opacity:0; transition:.16s}
  .card:hover .acts{opacity:1}
  .acts button{width:30px; height:30px; border-radius:50%; border:0; cursor:pointer; display:grid; place-items:center;
    background:rgba(0,0,0,.55); color:#fff}
  .acts button:hover{background:var(--v2-acc1); color:var(--v2-on-acc)}
  .acts svg{width:14px; height:14px}
  .hot{color:var(--v2-acc1)}
  .hot:hover{background:var(--v2-danger-bd); color:#fff}
  .hot:disabled{opacity:.5; cursor:default}

  .list{display:flex; flex-direction:column; gap:1px}
  .row{display:grid; grid-template-columns:1fr auto auto auto; align-items:center; gap:14px; padding:0 8px;
    border-radius:9px; color:var(--v2-txt2)}
  .row:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .row.np{color:var(--v2-acc1)}
  .play{display:grid; grid-template-columns:40px 1fr; align-items:center; gap:13px; min-width:0; border:0;
    background:transparent; color:inherit; cursor:pointer; text-align:left; padding:7px 0; font-family:inherit}
  .cv.sm{width:40px; height:40px; aspect-ratio:auto; border-radius:6px; box-shadow:none}
  .ti{min-width:0; font-size:13.5px; font-weight:500; display:flex; flex-direction:column; gap:2px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .ti em{font:11px var(--v2-sans); font-style:normal; color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis}
  .row .tk{font:10px var(--v2-mono); color:var(--v2-acc2)}
  .row .dur{font:11.5px var(--v2-mono); color:var(--v2-txt3)}
  .hot.flat{width:28px; height:28px; border:0; border-radius:8px; background:transparent; cursor:pointer;
    display:grid; place-items:center}
  .hot.flat svg{width:14px; height:14px}

  .arow{display:grid; grid-template-columns:repeat(auto-fill,minmax(128px,1fr)); gap:24px}
  .art{position:relative; display:flex; flex-direction:column; align-items:center; text-align:center}
  .acv{display:block; width:112px; height:112px; border-radius:50%; overflow:hidden; box-shadow:var(--v2-sh-card)}
  .an{margin-top:10px; font:600 13px var(--v2-sans); max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .hot.round{position:absolute; top:2px; right:50%; transform:translateX(58px); width:28px; height:28px;
    border-radius:50%; border:0; background:rgba(0,0,0,.55); cursor:pointer; display:grid; place-items:center; opacity:0; transition:.16s}
  .art:hover .hot.round{opacity:1}
  .hot.round svg{width:14px; height:14px}
</style>
