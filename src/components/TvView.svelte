<script lang="ts">
  // Mode « Grand écran » façon tvOS : afficheur plein viewport (pochette géante,
  // typo XXL lisible à 3 m, paroles synchronisées), AUCUN contrôle de lecture —
  // on pilote depuis un autre appareil. Échap ou clic = retour à l'app.
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { currentZone } from '../lib/stores/zones';
  import { currentTrack, currentTrackId, seekPositionMs, playbackState } from '../lib/stores/nowPlaying';
  import { activeView, previousView } from '../lib/stores/navigation';
  import {
    fetchTrackLyrics,
    fetchLyricsByMeta,
    metaLyricsQuery,
    radioAnchorFrom,
    type LyricsData,
  } from '../lib/lyrics';
  import { formatTime } from '../lib/utils';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import QualityBadge from './QualityBadge.svelte';
  import TvVuMeters from './TvVuMeters.svelte';
  import { t } from '../lib/i18n';

  let track = $derived($currentTrack);
  let zone = $derived($currentZone);
  let isPlaying = $derived($playbackState === 'playing');
  let durationMs = $derived(track?.duration_ms ?? 0);
  let isRadio = $derived(track?.source === 'radio');

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // ─── Réglages persistés (P2) ────────────────────────────────────────────
  type TvSize = 'S' | 'M' | 'L';
  interface TvSettings { lyrics: boolean; size: TvSize; theme: 'dark' | 'light' }
  const TV_SETTINGS_KEY = 'tune_tv_settings';
  function loadTvSettings(): TvSettings {
    try {
      const raw = localStorage.getItem(TV_SETTINGS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        return {
          lyrics: p.lyrics !== false,
          size: p.size === 'S' || p.size === 'L' ? p.size : 'M',
          theme: p.theme === 'light' ? 'light' : 'dark',
        };
      }
    } catch {}
    return { lyrics: true, size: 'M', theme: 'dark' };
  }
  let settings = $state<TvSettings>(loadTvSettings());
  $effect(() => {
    try { localStorage.setItem(TV_SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  });
  const SIZE_SCALE: Record<TvSize, number> = { S: 0.85, M: 1, L: 1.2 };
  const TV_SIZES: TvSize[] = ['S', 'M', 'L'];

  // ─── Fond flou (même pattern que NowPlaying) ────────────────────────────
  let resolvedCoverUrl = $state('');
  $effect(() => {
    if (track?.cover_path) {
      resolvedCoverUrl = api.artworkUrl(track.cover_path);
    } else {
      resolvedCoverUrl = '';
    }
  });

  // ─── Curseur auto-masqué après 3 s d'inactivité ─────────────────────────
  let cursorVisible = $state(true);
  let cursorTimer: ReturnType<typeof setTimeout> | null = null;
  function pokeCursor() {
    cursorVisible = true;
    if (cursorTimer) clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => { cursorVisible = false; }, 3000);
  }

  // ─── Wake lock (silencieux si non supporté) ─────────────────────────────
  let wakeLock: { release(): Promise<void> } | null = null;
  async function acquireWakeLock() {
    try {
      wakeLock = (await (navigator as any).wakeLock?.request('screen')) ?? null;
    } catch {
      wakeLock = null;
    }
  }
  function handleVisibility() {
    if (document.visibilityState === 'visible') acquireWakeLock();
  }

  // ─── Sortie : Échap ou clic ─────────────────────────────────────────────
  function exitTv() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    const prev = get(previousView);
    activeView.set(prev && prev !== 'tv' ? prev : 'nowplaying');
  }
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); exitTv(); }
  }

  // ─── Position interpolée ────────────────────────────────────────────────
  // `seekPositionMs` avance par pas de 200 ms (timer du store) et est recalé
  // par le serveur (poll / WS, filtre de dérive > 2 s). On extrapole entre
  // deux pas avec requestAnimationFrame : position affichée = dernière valeur
  // du store + temps écoulé depuis sa réception (si lecture en cours). Barre
  // de progression et ligne active avancent donc de façon continue.
  let basePos = 0;
  let baseTs = 0;
  let smoothPos = $state(0);
  $effect(() => {
    basePos = $seekPositionMs ?? 0;
    baseTs = performance.now();
    if (!isPlaying) smoothPos = basePos;
  });
  // Requête paroles-par-métadonnées si la piste n'a pas d'id de bibliothèque
  // (radio OU streaming Qobuz/Tidal). `null` sinon.
  let metaQuery = $derived($currentTrackId == null ? metaLyricsQuery(track) : null);

  // ─── Ancrage temporel radio ─────────────────────────────────────────────
  // Une radio n'a ni durée ni position : la « position » des paroles est le
  // temps écoulé depuis l'instant où le SERVEUR a détecté le changement de
  // métadonnée du flux (début du morceau). Le serveur fournit
  // `metadata_age_ms` (âge calculé sur son horloge) dans current_track : on
  // pose l'ancrage local `performance.now() − âge`, recalé à chaque
  // rafraîchissement de zone. Précision attendue : ±5-15 s (latence de la
  // détection ICY/livemeta) — l'affichage doit rester lisible malgré cela.
  // (Le streaming, lui, s'appuie sur la position de lecture réelle.)
  let radioAnchor = 0;
  $effect(() => {
    if (!isRadio || !track) return;
    radioAnchor = radioAnchorFrom(track.metadata_age_ms, performance.now());
  });
  let radioPos = $state(0);

  let rafId = 0;
  function rafTick() {
    if (isPlaying) {
      const extrapolated = basePos + (performance.now() - baseTs);
      smoothPos = durationMs > 0 ? Math.min(extrapolated, durationMs) : extrapolated;
    }
    if (isRadio) radioPos = Math.max(0, performance.now() - radioAnchor);
    rafId = requestAnimationFrame(rafTick);
  }

  let progress = $derived(durationMs > 0 ? Math.min(smoothPos / durationMs, 1) : 0);

  // ─── Paroles ────────────────────────────────────────────────────────────
  // Piste de bibliothèque → par track id ; sinon (radio ou streaming) → par
  // métadonnées (endpoint /lyrics/by-meta). Pas de métadonnée exploitable ou
  // 404 → rien (comportement antérieur).
  let lyrics = $state<LyricsData | null>(null);
  let lyricsKey: string | null = null;
  $effect(() => {
    const id = $currentTrackId;
    const q = metaQuery;
    const key = id != null ? `id:${id}` : q ? `meta:${q.artist}|${q.title}|${q.album ?? ''}` : null;
    if (key === lyricsKey) return;
    lyricsKey = key;
    lyrics = null;
    if (key == null) return;
    const pending = id != null ? fetchTrackLyrics(id) : fetchLyricsByMeta(q!);
    pending.then((data) => {
      // Garde anti-course : n'applique que si la piste n'a pas changé entre-temps.
      if (lyricsKey === key) lyrics = data;
    });
  });
  let showLyrics = $derived(settings.lyrics && lyrics !== null && lyrics.lines.length > 0);

  // Position servant à la synchro des paroles :
  //  - radio (durée inconnue) : ancrage large = maintenant − metadata_age ;
  //  - tout le reste (local, streaming Qobuz/Tidal) : position de lecture
  //    réelle et interpolée → synchro exacte, pas de tolérance élargie.
  let useRadioAnchor = $derived(isRadio && durationMs <= 0);
  // Décalage réglé sur la zone (#1328). Le serveur sait quand le morceau a
  // changé AVANT que l'auditeur ne l'entende — le son traverse encore le
  // tampon de Tune puis celui du renderer. Retrancher le décalage recule les
  // paroles d'autant. Positif = paroles retardées ; 0 = comportement d'avant.
  let lyricsOffsetMs = $derived(zone?.lyrics_offset_ms ?? 0);
  let syncPos = $derived(
    Math.max(0, (useRadioAnchor ? radioPos : smoothPos) - lyricsOffsetMs)
  );

  // Ligne active (paroles synchronisées) : dernière ligne dont t_ms <= position.
  let activeLine = $derived.by(() => {
    if (!lyrics?.synced) return -1;
    const pos = syncPos;
    let idx = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      const t_ms = lyrics.lines[i].t_ms;
      if (t_ms != null && t_ms <= pos) idx = i;
      else if (t_ms != null && t_ms > pos) break;
    }
    return idx;
  });

  // ─── Défilement des paroles ─────────────────────────────────────────────
  let lyricsEl = $state<HTMLElement | null>(null);
  // Pause du défilement auto quand l'utilisateur scrolle, reprise après 5 s.
  let userScrollUntil = 0;
  function pokeUserScroll() { userScrollUntil = performance.now() + 5000; }

  // (a) Synchronisé : centre la ligne active, défilement doux.
  $effect(() => {
    const idx = activeLine;
    const el = lyricsEl;
    if (idx < 0 || !el || !lyrics?.synced) return;
    if (performance.now() < userScrollUntil) return;
    const lineEl = el.children[idx] as HTMLElement | undefined;
    if (!lineEl) return;
    const target = lineEl.offsetTop - el.clientHeight / 2 + lineEl.clientHeight / 2;
    el.scrollTo({ top: Math.max(0, target), behavior: reducedMotion ? 'auto' : 'smooth' });
  });

  // (b) Non synchronisé : défilement lent calé sur la durée de la piste.
  // Radio (durée inconnue) : défilement doux calé sur le temps écoulé depuis
  // l'ancrage de métadonnée, avec une fenêtre forfaitaire de 4 min.
  const RADIO_SCROLL_WINDOW_MS = 240_000;
  $effect(() => {
    const el = lyricsEl;
    if (!el || !lyrics || lyrics.synced) return;
    if (performance.now() < userScrollUntil) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return;
    if (isRadio) {
      el.scrollTop = Math.min(radioPos / RADIO_SCROLL_WINDOW_MS, 1) * max;
    } else if (durationMs > 0) {
      el.scrollTop = progress * max;
    }
  });

  onMount(() => {
    pokeCursor();
    acquireWakeLock();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('keydown', handleKeydown, true);
    rafId = requestAnimationFrame(rafTick);
  });

  onDestroy(() => {
    if (cursorTimer) clearTimeout(cursorTimer);
    cancelAnimationFrame(rafId);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('keydown', handleKeydown, true);
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="tv-root"
  class:light={settings.theme === 'light'}
  class:hide-cursor={!cursorVisible}
  style="--tv-scale: {SIZE_SCALE[settings.size]}"
  onmousemove={pokeCursor}
  onpointerdown={pokeCursor}
  onclick={exitTv}
>
  {#if resolvedCoverUrl}
    <div class="tv-bg-blur" style="background-image: url({resolvedCoverUrl})"></div>
  {/if}
  <div class="tv-veil"></div>

  {#if track}
    <div class="tv-content" class:with-lyrics={showLyrics}>
      <div class="tv-main">
        <div class="tv-artwork">
          <AlbumArt coverPath={track.cover_path} size={0} alt={track.title} />
        </div>
        <div class="tv-meta">
          <h1 class="tv-title">{track.title}</h1>
          {#if track.artist_name}
            <p class="tv-artist">{track.artist_name}</p>
          {/if}
          {#if track.album_title && track.album_title !== track.artist_name}
            <p class="tv-album">{track.album_title}</p>
          {/if}
          {#if track.format || track.sample_rate || track.bit_depth}
            <div class="tv-quality">
              <QualityBadge format={track.format} sampleRate={track.sample_rate} bitDepth={track.bit_depth} source={track.source} />
            </div>
          {/if}
          {#if !isRadio && durationMs > 0}
            <div class="tv-progress-row">
              <span class="tv-time">{formatTime(smoothPos)}</span>
              <div class="tv-progress"><div class="tv-progress-fill" style="width: {progress * 100}%"></div></div>
              <span class="tv-time">{formatTime(durationMs)}</span>
            </div>
          {/if}
          <!-- Deux VU-mètres analogiques à aiguille (façon appli tvOS),
               nourris par les événements audio_levels du serveur. -->
          <div class="tv-visualizer">
            <TvVuMeters playing={isPlaying} width={560} />
          </div>
        </div>
      </div>

      {#if showLyrics && lyrics}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="tv-lyrics"
          class:synced={lyrics.synced}
          bind:this={lyricsEl}
          onclick={(e) => e.stopPropagation()}
          onwheel={pokeUserScroll}
          ontouchstart={pokeUserScroll}
        >
          {#each lyrics.lines as line, i}
            <p
              class="tv-line"
              class:active={lyrics.synced && i === activeLine}
              class:past={lyrics.synced && activeLine >= 0 && i < activeLine}
            >
              {line.text || '♪'}
            </p>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <div class="tv-idle">
      <p class="tv-idle-zone">{zone?.name ?? 'Tune'}</p>
    </div>
  {/if}

  <!-- Mini-panneau de réglages : apparaît avec le curseur (P2) -->
  {#if cursorVisible}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="tv-panel" onclick={(e) => e.stopPropagation()}>
      <label class="tv-panel-item">
        <input type="checkbox" checked={settings.lyrics} onchange={(e) => { settings = { ...settings, lyrics: (e.target as HTMLInputElement).checked }; }} />
        {$t('tv.lyrics')}
      </label>
      <div class="tv-panel-item tv-panel-sizes" role="group" aria-label={$t('tv.size')}>
        {#each TV_SIZES as s}
          <button class="tv-size-btn" class:active={settings.size === s} onclick={() => { settings = { ...settings, size: s }; }}>{s}</button>
        {/each}
      </div>
      <button
        class="tv-panel-item tv-theme-btn"
        onclick={() => { settings = { ...settings, theme: settings.theme === 'dark' ? 'light' : 'dark' }; }}
      >
        {settings.theme === 'dark' ? $t('tv.themeLight') : $t('tv.themeDark')}
      </button>
      <span class="tv-exit-hint">{$t('tv.exitHint')}</span>
    </div>
  {/if}
</div>

<style>
  .tv-root {
    position: fixed;
    inset: 0;
    z-index: 2000;
    background: #000;
    color: #fff;
    overflow: hidden;
    user-select: none;
  }
  .tv-root.hide-cursor {
    cursor: none;
  }
  .tv-root.light {
    background: #f4f4f6;
    color: #17181c;
  }

  .tv-bg-blur {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    filter: blur(70px) brightness(0.3);
    transform: scale(1.2);
    transition: background-image 1s ease-in-out;
  }
  .light .tv-bg-blur {
    filter: blur(70px) brightness(1.15) saturate(0.7);
    opacity: 0.5;
  }
  .tv-veil {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0.55));
  }
  .light .tv-veil {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0.65));
  }

  .tv-content {
    position: relative;
    z-index: 1;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5vw;
    padding: 5vh 5vw;
    box-sizing: border-box;
  }

  .tv-main {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3.5vh;
    min-width: 0;
    max-width: 90vw;
  }
  .tv-content.with-lyrics .tv-main {
    flex: 0 0 auto;
    max-width: 46vw;
  }

  .tv-artwork {
    width: min(52vh, 38vw);
    aspect-ratio: 1;
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
  }
  .tv-artwork :global(.album-art) {
    width: 100%;
    height: 100%;
  }
  .light .tv-artwork {
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.25);
  }

  .tv-meta {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 1vh;
    min-width: 0;
    width: 100%;
  }
  /* Typo XXL lisible à 3 m */
  .tv-title {
    font-family: var(--font-display, inherit);
    font-size: calc(clamp(30px, 3.6vw, 62px) * var(--tv-scale));
    font-weight: 700;
    line-height: 1.15;
    margin: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .tv-artist {
    font-size: calc(clamp(20px, 2.2vw, 40px) * var(--tv-scale));
    font-weight: 500;
    margin: 0;
    opacity: 0.9;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .tv-album {
    font-size: calc(clamp(16px, 1.5vw, 28px) * var(--tv-scale));
    margin: 0;
    opacity: 0.6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .tv-visualizer {
    margin-top: 1.2vh;
    /* Le terme vh borne la hauteur des cadrans (h = 0.34 × largeur) pour que
       la colonne tienne dans l'écran, y compris en 1080p. */
    width: min(38vw, 38vh, 560px);
    opacity: 0.9;
  }

  .tv-quality {
    transform: scale(calc(1.35 * var(--tv-scale)));
    transform-origin: center;
    margin-top: 0.6vh;
  }

  /* Barre de progression fine */
  .tv-progress-row {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    max-width: min(52vh, 38vw);
    margin-top: 1vh;
  }
  .tv-progress {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.2);
    overflow: hidden;
  }
  .light .tv-progress {
    background: rgba(0, 0, 0, 0.15);
  }
  .tv-progress-fill {
    height: 100%;
    border-radius: 2px;
    background: var(--tune-accent, #00bcd4);
  }
  .tv-time {
    font-size: clamp(13px, 1.1vw, 20px);
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }

  /* Colonne paroles (à droite en paysage) */
  .tv-lyrics {
    flex: 1 1 0;
    min-width: 0;
    max-width: 42vw;
    height: 76vh;
    overflow-y: auto;
    scrollbar-width: none;
    -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 12%, #000 88%, transparent 100%);
    mask-image: linear-gradient(180deg, transparent 0, #000 12%, #000 88%, transparent 100%);
    padding: 34vh 8px;
    box-sizing: border-box;
  }
  .tv-lyrics::-webkit-scrollbar {
    display: none;
  }
  .tv-line {
    font-family: var(--font-display, inherit);
    font-size: calc(clamp(20px, 2vw, 38px) * var(--tv-scale));
    line-height: 1.5;
    font-weight: 600;
    margin: 0 0 1.4vh;
    color: currentColor;
    opacity: 0.35;
    transition: opacity 0.35s ease-out, transform 0.35s ease-out;
    transform-origin: left center;
  }
  .tv-lyrics:not(.synced) .tv-line {
    opacity: 0.85;
    font-weight: 500;
  }
  .tv-line.active {
    opacity: 1;
    transform: scale(1.06);
    color: var(--tune-accent, #00bcd4);
    text-shadow: 0 0 30px rgba(0, 188, 212, 0.35);
  }
  .light .tv-line.active {
    text-shadow: none;
  }
  .tv-line.past {
    opacity: 0.55;
  }
  @media (prefers-reduced-motion: reduce) {
    .tv-line {
      transition: none;
    }
    .tv-line.active {
      transform: none;
    }
  }

  /* Portrait : paroles sous la pochette */
  @media (orientation: portrait) {
    .tv-content {
      flex-direction: column;
      gap: 3vh;
    }
    .tv-content.with-lyrics .tv-main {
      max-width: 90vw;
    }
    .tv-content.with-lyrics .tv-artwork {
      width: min(34vh, 70vw);
    }
    .tv-lyrics {
      max-width: 90vw;
      width: 90vw;
      height: auto;
      flex: 1 1 0;
      padding: 12vh 8px;
    }
  }

  .tv-idle {
    position: relative;
    z-index: 1;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tv-idle-zone {
    font-size: clamp(28px, 3vw, 54px);
    font-weight: 600;
    opacity: 0.5;
  }

  /* Mini-panneau de réglages (apparaît avec le curseur) */
  .tv-panel {
    position: absolute;
    z-index: 2;
    bottom: 22px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 10px 18px;
    border-radius: 24px;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(12px);
    font-size: 14px;
    color: #fff;
    animation: tv-panel-in 0.2s ease-out;
  }
  .light .tv-panel {
    background: rgba(255, 255, 255, 0.65);
    color: #17181c;
  }
  @keyframes tv-panel-in {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .tv-panel { animation: none; }
  }
  .tv-panel-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    white-space: nowrap;
  }
  .tv-panel-sizes {
    gap: 4px;
  }
  .tv-size-btn,
  .tv-theme-btn {
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid transparent;
    border-radius: 14px;
    color: inherit;
    font-size: 13px;
    padding: 3px 10px;
    cursor: pointer;
  }
  .light .tv-size-btn,
  .light .tv-theme-btn {
    background: rgba(0, 0, 0, 0.08);
  }
  .tv-size-btn.active {
    border-color: var(--tune-accent, #00bcd4);
    color: var(--tune-accent, #00bcd4);
  }
  .tv-exit-hint {
    opacity: 0.55;
    font-size: 12px;
    white-space: nowrap;
  }
</style>
