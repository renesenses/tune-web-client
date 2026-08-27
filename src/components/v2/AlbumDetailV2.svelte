<script lang="ts">
  /**
   * Fiche album du nouveau client (direction Levente). Ouvre par-dessus la
   * grille : pochette + métadonnées + liste de pistes jouables. Détail
   * technique (fréquence/profondeur) à l'Expert, comme partout ailleurs.
   */
  import * as api from '../../lib/api';
  import { currentZoneId } from '../../lib/stores/zones';
  import { currentTrackId } from '../../lib/stores/nowPlaying';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { getQualityTier, formatDuration, formatAlbumYear, errText } from '../../lib/utils';
  import type { Album, Track } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';

  let { album, onClose }: { album: Album; onClose: () => void } = $props();

  let tracks = $state<Track[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  const showExpert = $derived(atLeast($preferences.settingsLevel, 'expert'));

  $effect(() => {
    const id = album.id;
    if (id == null) return;
    loading = true; error = null;
    api.getAlbumTracks(id)
      .then((t) => { tracks = t; })
      .catch((e) => { error = errText(e) ?? 'Chargement impossible'; })
      .finally(() => { loading = false; });
  });

  const totalMs = $derived(tracks.reduce((s, t) => s + (t.duration_ms ?? 0), 0));
  const tier = $derived(getQualityTier(album));
  const qLabel = $derived.by(() => {
    if (tier === 'dsd') return 'DSD';
    const rate = album.sample_rate ? Math.round(album.sample_rate / 100) / 10 : null;
    const depth = album.bit_depth ?? 24;
    if ((tier === 'hires' || tier === 'hires_max') && rate) return `${rate} kHz · ${depth}-bit`;
    return album.format?.toUpperCase() ?? 'CD';
  });

  function playAlbum(startIndex = 0) {
    const zid = $currentZoneId;
    if (zid == null || album.id == null) return;
    api.play(zid, { album_id: album.id, start_index: startIndex }).catch(() => {});
  }
  function shuffle() {
    const zid = $currentZoneId;
    if (zid == null || album.id == null) return;
    const ids = tracks.map((t) => t.id).filter((x): x is number => x != null);
    for (let i = ids.length - 1; i > 0; i--) { const j = (i * 7 + 3) % (i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    api.play(zid, { track_ids: ids }).catch(() => {});
  }
  function addQueue() {
    const zid = $currentZoneId;
    if (zid == null || album.id == null) return;
    api.addToQueue(zid, { album_id: album.id }).catch(() => {});
  }
  function trackTech(t: Track): string {
    const rate = t.sample_rate ? `${Math.round(t.sample_rate / 100) / 10} kHz` : '';
    const depth = t.bit_depth ? `${t.bit_depth}-bit` : '';
    return [t.format?.toUpperCase(), rate, depth].filter(Boolean).join(' · ');
  }
</script>

<div class="v2-detail tune-v2">
  <button class="close" onclick={onClose} aria-label="Fermer">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
  </button>

  <div class="head">
    <div class="art"><AlbumArt coverPath={album.cover_path} albumId={album.id} size={400} alt={album.title} source={album.source} fallbackInitials={album.title?.slice(0,1)} /></div>
    <div class="meta">
      <div class="qbadge">{qLabel}</div>
      <h1>{album.title}</h1>
      <div class="artist">{album.artist_name ?? ''}</div>
      <div class="facts">
        {#if formatAlbumYear(album)}<span>{formatAlbumYear(album)}</span>{/if}
        <span>{tracks.length} titre{tracks.length > 1 ? 's' : ''}</span>
        {#if totalMs}<span>{formatDuration(totalMs)}</span>{/if}
      </div>
      <div class="actions">
        <button class="play" onclick={() => playAlbum(0)}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8V4z"/></svg>Lire
        </button>
        <button class="ghost" onclick={shuffle}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3l5 5-5 5M3 8h18M8 21l-5-5 5-5M21 16H3"/></svg>Aléatoire
        </button>
        <button class="ghost" onclick={addQueue}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h13M4 11h13M4 16h8M18 15l3 2-3 2z"/></svg>Ajouter à la file
        </button>
      </div>
    </div>
  </div>

  <div class="tracks">
    {#if loading}
      <div class="state">Chargement des pistes…</div>
    {:else if error}
      <div class="state err">{error}</div>
    {:else}
      {#each tracks as t, i (t.id ?? i)}
        <button class="trk" class:np={t.id != null && t.id === $currentTrackId} onclick={() => playAlbum(i)}>
          <span class="n">{t.track_number || i + 1}</span>
          <span class="ti">{t.title}</span>
          {#if showExpert}<span class="tk">{trackTech(t)}</span>{/if}
          <span class="dur">{formatDuration(t.duration_ms ?? 0)}</span>
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .v2-detail{position:absolute; inset:0; z-index:30; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow-y:auto; padding:26px 34px 40px}
  .close{position:sticky; top:0; margin-bottom:8px; width:40px; height:40px; border-radius:12px; cursor:pointer;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt2); display:grid; place-items:center}
  .close:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .close svg{width:18px; height:18px}

  .head{display:flex; gap:30px; padding:6px 0 26px}
  .art{width:240px; height:240px; border-radius:8px; overflow:hidden; flex:0 0 auto; box-shadow:var(--v2-sh-lg)}
  .meta{display:flex; flex-direction:column; gap:12px; padding-top:8px}
  .qbadge{align-self:flex-start; font:700 11px var(--v2-mono); letter-spacing:.04em; padding:6px 10px; border-radius:8px;
    color:var(--v2-acc-tint); border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .meta h1{font-size:38px; font-weight:800; letter-spacing:-.01em; line-height:1.05}
  .artist{font-size:18px; color:var(--v2-txt2)}
  .facts{display:flex; gap:16px; font:12px var(--v2-mono); color:var(--v2-txt3)}
  .actions{display:flex; gap:12px; margin-top:8px}
  .play,.ghost{display:inline-flex; align-items:center; gap:9px; height:44px; padding:0 20px; border-radius:var(--v2-r-pill);
    font:700 14px var(--v2-sans); cursor:pointer; border:0}
  .play{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); box-shadow:0 6px 18px var(--v2-glow-strong)}
  .ghost{color:var(--v2-txt); background:transparent; border:1px solid var(--v2-line2)}
  .ghost:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .play svg,.ghost svg{width:16px; height:16px}

  .tracks{display:flex; flex-direction:column; gap:1px}
  .state{padding:24px 6px; color:var(--v2-txt3)} .state.err{color:var(--v2-danger)}
  .trk{display:grid; grid-template-columns:34px 1fr auto auto; align-items:center; gap:14px; width:100%;
    padding:11px 12px; border:0; background:transparent; color:var(--v2-txt2); cursor:pointer; text-align:left; border-radius:8px}
  .trk:hover{background:var(--v2-surface2); color:var(--v2-txt)}
  .trk.np{color:var(--v2-acc1)}
  .trk .n{font:12px var(--v2-mono); color:var(--v2-txt3); text-align:right}
  .trk.np .n{color:var(--v2-acc1)}
  .trk .ti{font-size:14px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .trk .tk{font:10px var(--v2-mono); color:var(--v2-acc2); letter-spacing:.02em}
  .trk .dur{font:12px var(--v2-mono); color:var(--v2-txt3)}
</style>
