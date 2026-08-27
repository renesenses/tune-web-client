<script lang="ts">
  /**
   * Barre de lecture du nouveau client (direction Levente).
   *
   * Lit la lecture en cours réelle (`currentTrack`, `playbackState`). Le badge
   * qualité et le détail technique sortent de `getQualityTier` — comme la
   * grille. Le détail technique du badge suit le niveau d'interface : à
   * l'Expert, on montre la fréquence/profondeur exactes.
   */
  import { currentTrack, playbackState } from '../../lib/stores/nowPlaying';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { getQualityTier, formatTime } from '../../lib/utils';
  import AlbumArt from '../AlbumArt.svelte';
  import '../../styles/tune-v2.css';

  const t = $derived($currentTrack);
  const playing = $derived($playbackState === 'playing');
  const showExpert = $derived(atLeast($preferences.settingsLevel, 'expert'));

  const qLabel = $derived.by(() => {
    if (!t) return '';
    const tier = getQualityTier(t as any);
    const depth = (t as any).bit_depth ?? 24;
    const rate = (t as any).sample_rate ? Math.round(((t as any).sample_rate as number) / 100) / 10 : null;
    if (tier === 'dsd') return 'DSD';
    if (showExpert && rate) return `${rate} kHz · ${depth}-bit`;
    if (tier === 'hires' || tier === 'hires_max') return `STUDIO ${depth}-BIT`;
    return (t as any).format?.toUpperCase() ?? 'CD';
  });
  const bitPerfect = $derived(t ? ['dsd', 'hires', 'hires_max'].includes(getQualityTier(t as any)) : false);

  const WAVE = [6, 10, 14, 18, 13, 8, 5, 9, 13, 7, 4];
</script>

<div class="v2-player tune-v2">
  <div class="np">
    <div class="cv"><AlbumArt coverPath={(t as any)?.cover_path ?? null} albumId={(t as any)?.album_id ?? null} size={112} alt={t?.title ?? ''} /></div>
    <div class="meta">
      <div class="ti">{t?.title ?? '—'}
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.35-9.5-8.5C.5 9 2.5 5.5 6 5.5c2 0 3.2 1.1 4 2 .8-.9 2-2 4-2 3.5 0 5.5 3.5 3.5 7C19 16.65 12 21 12 21z"/></svg>
      </div>
      <div class="ar">{(t as any)?.artist_name ?? ''}</div>
    </div>
    {#if playing}<div class="wave">{#each WAVE as h}<i style="height:{h}px"></i>{/each}</div>{/if}
  </div>

  <div class="center">
    <div class="ctrls">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3l5 5-5 5M3 8h18M8 21l-5-5 5-5M21 16H3"/></svg>
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5v14M19 5l-9 7 9 7V5z"/></svg>
      <button class="play">
        {#if playing}<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4h4v16H7zM13 4h4v16h-4z"/></svg>
        {:else}<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8V4z"/></svg>{/if}
      </button>
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 5v14M5 5l9 7-9 7V5z"/></svg>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 2l4 4-4 4M7 22l-4-4 4-4M21 6H8a5 5 0 0 0-5 5M3 18h13a5 5 0 0 0 5-5"/></svg>
    </div>
    <div class="prog">
      <span class="tm">{formatTime((t as any)?.position_ms ?? 0)}</span>
      <div class="track"><div class="fill"></div><div class="knob"></div></div>
      <span class="tm">{formatTime((t as any)?.duration_ms ?? 0)}</span>
    </div>
  </div>

  <div class="right">
    {#if bitPerfect}<span class="bperf" title="Bit-perfect"></span>{/if}
    {#if qLabel}<div class="qbadge">{qLabel}</div>{/if}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/></svg>
    {#if showExpert}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3.5"/></svg>{/if}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h10"/></svg>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/></svg>
  </div>
</div>

<style>
  .v2-player{height:88px; background:linear-gradient(180deg,var(--v2-player1),var(--v2-player2)); border-top:1px solid var(--v2-line);
    display:grid; grid-template-columns:300px 1fr 340px; align-items:center; gap:18px; padding:0 24px;
    font-family:var(--v2-sans); color:var(--v2-txt); box-sizing:border-box}
  .np{display:flex; align-items:center; gap:14px; min-width:0}
  .cv{width:56px; height:56px; border-radius:8px; overflow:hidden; flex:0 0 auto; box-shadow:0 4px 12px var(--v2-sh-sm)}
  .ti{display:flex; align-items:center; gap:9px; font-weight:700; font-size:15px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ti svg{width:16px; height:16px; color:var(--v2-acc1); flex:0 0 auto}
  .ar{font:12px var(--v2-mono); color:var(--v2-txt2); margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .wave{display:flex; align-items:flex-end; gap:2px; height:22px; margin-left:2px}
  .wave i{width:2.5px; border-radius:2px; background:linear-gradient(180deg,var(--v2-acc1),var(--v2-acc2))}
  .center{display:flex; flex-direction:column; align-items:center; gap:9px}
  .ctrls{display:flex; align-items:center; gap:20px}
  .ctrls svg{width:20px; height:20px; color:var(--v2-txt2); cursor:pointer}
  .ctrls svg:hover{color:var(--v2-txt)}
  .ctrls .play{width:46px; height:46px; border-radius:50%; border:0; cursor:pointer;
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); display:grid; place-items:center}
  .ctrls .play svg{width:19px; height:19px; color:var(--v2-on-acc)}
  .prog{display:flex; align-items:center; gap:11px; width:100%; max-width:520px}
  .tm{font:11px var(--v2-mono); color:var(--v2-txt3); min-width:36px}
  .track{flex:1; height:4px; border-radius:3px; background:var(--v2-line2); position:relative}
  .track .fill{position:absolute; left:0; top:0; bottom:0; width:33%; border-radius:3px; background:linear-gradient(90deg,var(--v2-acc1),var(--v2-acc2))}
  .track .knob{position:absolute; left:33%; top:50%; transform:translate(-50%,-50%); width:11px; height:11px; border-radius:50%; background:var(--v2-knob)}
  .right{display:flex; align-items:center; justify-content:flex-end; gap:16px}
  .right svg{width:19px; height:19px; color:var(--v2-txt2); cursor:pointer}
  .right svg:hover{color:var(--v2-txt)}
  .qbadge{font:700 11px var(--v2-mono); letter-spacing:.04em; padding:6px 10px; border-radius:8px;
    color:var(--v2-acc-tint); border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .bperf{width:8px; height:8px; border-radius:50%; background:var(--v2-acc1); box-shadow:0 0 8px var(--v2-acc1)}
</style>
