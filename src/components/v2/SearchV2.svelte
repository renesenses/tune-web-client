<script lang="ts">
  /**
   * Recherche du nouveau client (direction Levente). Cœur de nav : présente à
   * tous les niveaux. Densité par niveau :
   *   Essentiel  → bibliothèque locale : Albums + Titres.
   *   Avancé     → ajoute les Artistes et une section « Sur les services »
   *                (recherche fédérée streaming).
   *   Expert     → ajoute la recherche acoustique en langage naturel
   *                (« jazz analogique chaleureux ») quand le serveur l'embarque.
   *
   * L'ouverture d'un album réutilise l'overlay AlbumDetailV2 (la section est
   * `position:relative`). Un clic sur un artiste redéroule la recherche sur son
   * nom — tout reste dans cet écran, sans navigation cassée.
   */
  import * as api from '../../lib/api';
  import type { AcousticSearchResult } from '../../lib/api';
  import { currentZoneId } from '../../lib/stores/zones';
  import { currentTrackId } from '../../lib/stores/nowPlaying';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { formatDuration, getQualityTier } from '../../lib/utils';
  import type { Album, Track, SearchResult, FederatedSearchResult } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import AvatarMenu from './AvatarMenu.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';
  import '../../styles/tune-v2.css';

  const showAdvanced = $derived(atLeast($preferences.settingsLevel, 'intermediate'));
  const showExpert = $derived(atLeast($preferences.settingsLevel, 'expert'));

  let q = $state('');
  let local = $state<SearchResult | null>(null);
  let fed = $state<Record<string, SearchResult>>({});
  let acoustic = $state<AcousticSearchResult | null>(null);
  let acousticOn = $state(false);
  let acousticAvailable = $state(false);
  let busy = $state(false);
  let opened = $state<Album | null>(null);
  let seq = 0;

  // Disponibilité de la brique acoustique (Expert seulement, une fois).
  $effect(() => {
    if (!showExpert) return;
    api.getAcousticStatus()
      .then((s) => { acousticAvailable = !!(s.available && s.enabled); })
      .catch(() => { acousticAvailable = false; });
  });

  // Recherche débouncée sur la frappe / le niveau.
  $effect(() => {
    const query = q.trim();
    const advanced = showAdvanced;
    if (query.length < 2) { local = null; fed = {}; acoustic = null; busy = false; return; }
    const mine = ++seq;
    busy = true;
    const t = setTimeout(() => {
      api.searchLibrary(query, 40)
        .then((r) => { if (mine === seq) local = r; })
        .catch(() => { if (mine === seq) local = null; })
        .finally(() => { if (mine === seq) busy = false; });
      if (advanced) {
        api.federatedSearch(query)
          .then((r: FederatedSearchResult) => { if (mine === seq) fed = r.services ?? {}; })
          .catch(() => { if (mine === seq) fed = {}; });
      } else {
        fed = {};
      }
    }, 240);
    return () => clearTimeout(t);
  });

  function runAcoustic() {
    const query = q.trim();
    if (!query) return;
    const mine = ++seq;
    busy = true;
    api.searchAcoustic(query, 40)
      .then((r) => { if (mine === seq) acoustic = r; })
      .catch(() => { if (mine === seq) acoustic = null; })
      .finally(() => { if (mine === seq) busy = false; });
  }

  function playTrack(t: Track) {
    const zid = $currentZoneId;
    if (zid == null || t.id == null) return;
    api.play(zid, { track_id: t.id }).catch(() => {});
  }
  function trackRate(t: Track): string {
    if (getQualityTier(t) === 'dsd') return 'DSD';
    return t.sample_rate ? `${Math.round(t.sample_rate / 100) / 10} kHz` : '';
  }

  const localAlbums = $derived(local?.albums ?? []);
  const localTracks = $derived(local?.tracks ?? []);
  const localArtists = $derived(local?.artists ?? []);
  const fedEntries = $derived(Object.entries(fed).filter(([, r]) => (r.albums?.length || r.tracks?.length)));
  const nothing = $derived(
    q.trim().length >= 2 && !busy && !localAlbums.length && !localTracks.length &&
    !localArtists.length && !fedEntries.length && !(acoustic?.tracks.length)
  );
</script>

<section class="v2-search tune-v2">
  <div class="av-tr"><AvatarMenu /></div>

  <header class="top">
    <div class="field">
      <svg class="mag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="search"
        placeholder="Rechercher un album, un titre, un artiste…"
        bind:value={q}
        autofocus
        onkeydown={(e) => { if (e.key === 'Enter' && acousticOn) runAcoustic(); }}
      />
      {#if busy}<span class="spin" aria-hidden="true"></span>{/if}
    </div>

    {#if showExpert && acousticAvailable}
      <button class="acoustic" class:on={acousticOn} onclick={() => { acousticOn = !acousticOn; if (acousticOn) runAcoustic(); else acoustic = null; }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M6 8v8M18 8v8M3 11v2M21 11v2"/></svg>
        Acoustique
      </button>
    {/if}
  </header>

  <div class="scroll">
    {#if q.trim().length < 2}
      <div class="hint">
        <div class="glyph">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        </div>
        <p>Tapez au moins deux caractères pour explorer votre bibliothèque{showAdvanced ? ' et les services' : ''}.</p>
        {#if showExpert && acousticAvailable}<p class="sub">Astuce Expert : activez <b>Acoustique</b> pour chercher par ambiance — « jazz analogique chaleureux », « techno hypnotique ».</p>{/if}
      </div>
    {:else if nothing}
      <div class="hint"><p>Aucun résultat pour « {q.trim()} ».</p></div>
    {:else}
      {#if showExpert && acoustic && acoustic.tracks.length}
        <section class="grp">
          <h2>Ambiance <span class="tag">acoustique</span></h2>
          <div class="list">
            {#each acoustic.tracks as t, i (t.id ?? i)}
              <button class="trk" class:np={t.id != null && t.id === $currentTrackId} onclick={() => playTrack(t)}>
                <span class="cvsm"><AlbumArt coverPath={t.cover_path} albumId={t.album_id ?? null} size={80} alt={t.title} source={t.source} fallbackInitials={t.title?.slice(0,1)} /></span>
                <span class="ti">{t.title}<em>{t.artist_name ?? ''}</em></span>
                {#if t.similarity != null}<span class="sim">{Math.round(t.similarity * 100)}%</span>{/if}
                <span class="dur">{formatDuration(t.duration_ms ?? 0)}</span>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if showAdvanced && localArtists.length}
        <section class="grp">
          <h2>Artistes</h2>
          <div class="arow">
            {#each localArtists.slice(0, 12) as ar (ar.id ?? ar.name)}
              <button class="artile" onclick={() => (q = ar.name)}>
                <span class="acv"><AlbumArt coverPath={ar.image_path ?? null} albumId={null} size={140} alt={ar.name} fallbackInitials={ar.name?.slice(0,1)} /></span>
                <span class="an">{ar.name}</span>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if localAlbums.length}
        <section class="grp">
          <h2>Albums</h2>
          <div class="grid">
            {#each localAlbums as a (a.id)}
              <button class="card" onclick={() => (opened = a)}>
                <span class="cv"><AlbumArt coverPath={a.cover_path} albumId={a.id} size={220} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} /></span>
                <span class="ct">{a.title}</span>
                <span class="ca">{a.artist_name ?? ''}</span>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if localTracks.length}
        <section class="grp">
          <h2>Titres</h2>
          <div class="list">
            {#each localTracks.slice(0, 30) as t, i (t.id ?? i)}
              <button class="trk" class:np={t.id != null && t.id === $currentTrackId} onclick={() => playTrack(t)}>
                <span class="cvsm"><AlbumArt coverPath={t.cover_path} albumId={t.album_id ?? null} size={80} alt={t.title} source={t.source} fallbackInitials={t.title?.slice(0,1)} /></span>
                <span class="ti">{t.title}<em>{t.artist_name ?? ''}{t.album_title ? ' · ' + t.album_title : ''}</em></span>
                {#if showExpert && trackRate(t)}<span class="tk">{trackRate(t)}</span>{/if}
                <span class="dur">{formatDuration(t.duration_ms ?? 0)}</span>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if showAdvanced && fedEntries.length}
        <section class="grp">
          <h2>Sur les services</h2>
          {#each fedEntries as [svc, r] (svc)}
            {#if r.albums?.length}
              <div class="svc"><span class="svcn">{svc}</span></div>
              <div class="grid">
                {#each r.albums.slice(0, 12) as a (a.source_id ?? a.id)}
                  <div class="card static">
                    <span class="cv"><AlbumArt coverPath={a.cover_path} albumId={null} size={220} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} /></span>
                    <span class="ct">{a.title}</span>
                    <span class="ca">{a.artist_name ?? ''}</span>
                  </div>
                {/each}
              </div>
            {/if}
          {/each}
        </section>
      {/if}
    {/if}
  </div>

  {#if opened}
    <AlbumDetailV2 album={opened} onClose={() => (opened = null)} />
  {/if}
</section>

<style>
  .v2-search{position:relative; display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .av-tr{position:absolute; top:20px; right:30px; z-index:50}

  .top{display:flex; align-items:center; gap:14px; padding:24px 30px 12px; padding-right:96px}
  .field{position:relative; flex:1; max-width:640px; display:flex; align-items:center}
  .field .mag{position:absolute; left:16px; width:19px; height:19px; color:var(--v2-txt3); pointer-events:none}
  .field input{width:100%; height:50px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:15px var(--v2-sans); padding:0 18px 0 46px; outline:none}
  .field input::placeholder{color:var(--v2-txt3)}
  .field input:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px rgba(0,188,212,.12)}
  .field input::-webkit-search-cancel-button{-webkit-appearance:none}
  .spin{position:absolute; right:16px; width:15px; height:15px; border:2px solid var(--v2-line2);
    border-top-color:var(--v2-acc1); border-radius:50%; animation:sp .7s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}

  .acoustic{display:inline-flex; align-items:center; gap:8px; height:44px; padding:0 16px; border-radius:var(--v2-r-pill);
    border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); font:600 13px var(--v2-sans); cursor:pointer}
  .acoustic svg{width:16px; height:16px}
  .acoustic:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .acoustic.on{color:#04121a; border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}

  .scroll{flex:1; overflow-y:auto; padding:8px 0 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}

  .hint{display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; text-align:center;
    padding:70px 30px; color:var(--v2-txt2)}
  .hint .glyph{width:64px; height:64px; border-radius:20px; display:grid; place-items:center; color:var(--v2-txt3);
    border:1px solid var(--v2-line); background:var(--v2-surface2)}
  .hint .glyph svg{width:28px; height:28px}
  .hint p{max-width:440px; font-size:15px; line-height:1.5}
  .hint .sub{font-size:13px; color:var(--v2-txt3)}
  .hint b{color:var(--v2-acc-tint); font-weight:700}

  .grp{padding:14px 30px 8px}
  .grp h2{font-size:18px; font-weight:700; padding-bottom:12px; display:flex; align-items:center; gap:10px}
  .grp h2 .tag{font:600 10px var(--v2-mono); letter-spacing:.12em; text-transform:uppercase; color:var(--v2-acc-tint);
    border:1px solid var(--v2-acc2); border-radius:999px; padding:3px 9px}

  .arow{display:flex; gap:22px; overflow-x:auto; padding-bottom:8px; scrollbar-width:none}
  .arow::-webkit-scrollbar{display:none}
  .artile{flex:0 0 auto; width:112px; border:0; background:transparent; color:inherit; cursor:pointer; text-align:center; padding:0}
  .acv{display:block; width:112px; height:112px; border-radius:50%; overflow:hidden; box-shadow:0 6px 16px rgba(0,0,0,.35)}
  .artile .an{display:block; margin-top:9px; font:600 13px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .artile:hover .an{color:var(--v2-acc-tint)}

  .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:20px}
  .card{border:0; background:transparent; color:inherit; cursor:pointer; text-align:left; padding:0; display:flex; flex-direction:column}
  .card.static{cursor:default}
  .cv{display:block; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden; box-shadow:0 6px 16px rgba(0,0,0,.35); transition:.18s}
  .card:not(.static):hover .cv{box-shadow:0 10px 24px rgba(0,212,170,.22)}
  .ct{margin-top:9px; font:600 13px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{margin-top:2px; font:11px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}

  .svc{padding:6px 0 4px}
  .svcn{font:600 11px var(--v2-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--v2-txt3)}

  .list{display:flex; flex-direction:column; gap:1px}
  .trk{display:grid; grid-template-columns:44px 1fr auto auto; align-items:center; gap:14px; width:100%;
    padding:8px 10px; border:0; background:transparent; color:var(--v2-txt2); cursor:pointer; text-align:left; border-radius:8px}
  .trk:hover{background:var(--v2-surface2); color:var(--v2-txt)}
  .trk.np{color:var(--v2-acc1)}
  .cvsm{width:44px; height:44px; border-radius:6px; overflow:hidden}
  .trk .ti{min-width:0; font-size:14px; font-weight:500; display:flex; flex-direction:column; gap:2px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .trk .ti em{font:11px var(--v2-sans); font-style:normal; color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis}
  .trk .tk{font:10px var(--v2-mono); color:var(--v2-acc2)}
  .trk .sim{font:11px var(--v2-mono); color:var(--v2-acc-tint)}
  .trk .dur{font:12px var(--v2-mono); color:var(--v2-txt3)}
</style>
