<script lang="ts">
  import { currentZone } from '../lib/stores/zones';
  import { t } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import { formatTime } from '../lib/utils';

  // Real waveform data from server API
  let waveformA = $state<number[]>([]);
  let waveformB = $state<number[]>([]);
  let bpmA = $state<number | null>(null);
  let bpmB = $state<number | null>(null);
  let waveCanvasA = $state<HTMLCanvasElement | null>(null);
  let waveCanvasB = $state<HTMLCanvasElement | null>(null);

  function drawWaveform(canvas: HTMLCanvasElement, data: number[], progress: number, color: string) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = canvas.offsetHeight * 2;
    ctx.clearRect(0, 0, w, h);
    if (data.length === 0) return;
    const barW = w / data.length;
    const mid = h / 2;
    for (let i = 0; i < data.length; i++) {
      const amp = data[i];
      const barH = amp * mid * 0.9;
      const x = i * barW;
      const played = i / data.length <= progress;
      ctx.fillStyle = played ? color : 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, mid - barH, Math.max(1, barW - 1), barH * 2);
    }
  }

  async function loadWaveform(trackId: number, deck: 'a' | 'b') {
    try {
      const r = await api.getWaveform(trackId);
      if (deck === 'a') { waveformA = r.waveform || []; bpmA = r.bpm; }
      else { waveformB = r.waveform || []; bpmB = r.bpm; }
    } catch { /* waveform not available yet */ }
  }

  // Load waveforms when decks change
  $effect(() => {
    if (deckA?.track_id) loadWaveform(deckA.track_id, 'a');
    else waveformA = [];
  });
  $effect(() => {
    if (deckB?.track_id) loadWaveform(deckB.track_id, 'b');
    else waveformB = [];
  });

  // Redraw waveforms on position change
  $effect(() => {
    if (waveCanvasA && waveformA.length > 0) {
      const progress = deckA?.duration_ms ? (deckA.position_ms || 0) / deckA.duration_ms : 0;
      drawWaveform(waveCanvasA, waveformA, progress, 'rgba(99, 102, 241, 0.8)');
    }
  });
  $effect(() => {
    if (waveCanvasB && waveformB.length > 0) {
      const progress = deckB?.duration_ms ? (deckB.position_ms || 0) / deckB.duration_ms : 0;
      drawWaveform(waveCanvasB, waveformB, progress, 'rgba(99, 102, 241, 0.8)');
    }
  });

  async function doSyncTempo() {
    if (!zone?.id) return;
    try {
      const r = await api.syncTempo(zone.id);
      notifications.success(`Tempo sync: ${r.source_bpm} → ${r.target_bpm} BPM (x${r.ratio})`);
    } catch (e: any) {
      notifications.error(e?.message || 'Sync tempo failed');
    }
  }

  let djEnabled = $state(false);
  let activeDeck = $state<'a' | 'b'>('a');
  let deckA = $state<any>(null);
  let deckB = $state<any>(null);
  let crossfading = $state(false);
  let crossfadeDuration = $state(5);
  let autoCrossfade = $state(false);
  let autoCrossfadeBeforeEnd = $state(10);
  let gainA = $state(1);
  let gainB = $state(0);
  let mixing = $state(false);
  let crossfaderPos = $state(0);
  let loading = $state(false);

  // Search for loading tracks
  let searchQuery = $state('');
  let searchResults = $state<any[]>([]);
  let searchLoading = $state(false);
  let loadTarget = $state<'a' | 'b' | null>(null);

  let zone = $derived($currentZone);

  async function refreshStatus() {
    if (!zone?.id) return;
    try {
      const s = await api.getDJStatus(zone.id);
      djEnabled = s.enabled;
      activeDeck = s.active_deck;
      deckA = s.deck_a;
      deckB = s.deck_b;
      crossfading = s.crossfading;
      if (s.crossfade_duration) crossfadeDuration = s.crossfade_duration;
      autoCrossfade = s.auto_crossfade;
      gainA = s.gain_a ?? 1;
      gainB = s.gain_b ?? 0;
      mixing = s.mixing ?? false;
    } catch { /* ignore */ }
  }

  $effect(() => {
    if (zone?.id) refreshStatus();
  });

  // Poll status when DJ is enabled
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
    if (djEnabled && zone?.id) {
      pollInterval = setInterval(refreshStatus, 2000);
    }
    return () => { if (pollInterval) clearInterval(pollInterval); };
  });

  async function toggleDJ() {
    if (!zone?.id) return;
    loading = true;
    try {
      if (djEnabled) {
        await api.disableDJ(zone.id);
        djEnabled = false;
        deckA = null;
        deckB = null;
        notifications.success('Mode DJ desactive');
      } else {
        const r = await api.enableDJ(zone.id);
        djEnabled = r.enabled;
        deckA = r.deck_a;
        activeDeck = 'a';
        notifications.success('Mode DJ active !');
      }
    } catch (e) {
      notifications.error('Erreur DJ');
    }
    loading = false;
  }

  async function searchTracks() {
    if (!searchQuery.trim()) return;
    searchLoading = true;
    try {
      const r = await api.searchLibrary(searchQuery, 20);
      searchResults = r.tracks || [];
    } catch { searchResults = []; }
    searchLoading = false;
  }

  async function loadTrackOnDeck(trackId: number) {
    if (!zone?.id || !loadTarget) return;
    try {
      const r = await api.loadDeck(zone.id, loadTarget, { track_id: trackId });
      if (loadTarget === 'a') deckA = r.loaded;
      else deckB = r.loaded;
      notifications.success(`Deck ${loadTarget.toUpperCase()} chargee`);
      loadTarget = null;
      searchQuery = '';
      searchResults = [];
    } catch (e) {
      notifications.error('Erreur chargement deck');
    }
  }

  async function doCrossfade() {
    if (!zone?.id) return;
    try {
      await api.startCrossfade(zone.id, crossfadeDuration);
      crossfading = true;
      notifications.success('Crossfade en cours...');
    } catch (e) {
      notifications.error('Erreur crossfade');
    }
  }

  async function toggleAuto() {
    if (!zone?.id) return;
    try {
      const r = await api.toggleAutoCrossfade(zone.id, !autoCrossfade, autoCrossfadeBeforeEnd);
      autoCrossfade = r.auto_crossfade;
    } catch { /* ignore */ }
  }

  async function setVolume(deck: 'a' | 'b', vol: number) {
    if (!zone?.id) return;
    try {
      await api.setDeckVolume(zone.id, deck, vol);
    } catch { /* ignore */ }
  }

  async function togglePlayDeck(deck: 'a' | 'b') {
    if (!zone?.id) return;
    const d = deck === 'a' ? deckA : deckB;
    if (!d) return;
    try {
      if (d.playing) {
        await api.pauseDeck(zone.id, deck);
      } else {
        await api.playDeck(zone.id, deck);
      }
      refreshStatus();
    } catch (e) {
      notifications.error('Erreur play/pause deck');
    }
  }

  async function handleCrossfader(val: number) {
    if (!zone?.id) return;
    crossfaderPos = val;
    try {
      const r = await api.setCrossfader(zone.id, val);
      gainA = r.gain_a;
      gainB = r.gain_b;
    } catch { /* ignore */ }
  }
</script>

<div class="dj-view">
  <header class="view-header">
    <h2>Mode DJ</h2>
    <div class="header-actions">
      {#if zone}
        <span class="zone-label">Zone : {zone.name}</span>
      {/if}
      <button class="toggle-btn" class:active={djEnabled} onclick={toggleDJ} disabled={loading || !zone}>
        {djEnabled ? 'Desactiver' : 'Activer'} DJ
      </button>
    </div>
  </header>

  {#if !zone}
    <div class="empty">Aucune zone selectionnee</div>
  {:else if !djEnabled}
    <div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="3" />
        <line x1="12" y1="2" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
      <p>Activez le mode DJ pour mixer vos pistes</p>
      <p class="hint">2 platines virtuelles avec crossfade configurable</p>
    </div>
  {:else}
    <div class="decks-container">
      <!-- Deck A -->
      <div class="deck" class:active={activeDeck === 'a'} class:crossfading={crossfading && activeDeck === 'a'}>
        <div class="deck-header">
          <span class="deck-label">DECK A</span>
          {#if activeDeck === 'a'}<span class="deck-active-badge">ACTIVE</span>{/if}
          <div class="gain-bar"><div class="gain-fill" style="width: {gainA * 100}%"></div></div>
        </div>
        <div class="deck-content">
          {#if deckA}
            <div class="deck-track">
              <div class="deck-art">
                <AlbumArt coverPath={deckA.cover} size={120} alt={deckA.title} />
                <div class="vinyl-overlay" class:spinning={deckA.playing}>
                  <div class="vinyl-groove"></div>
                  <div class="vinyl-groove inner"></div>
                  <div class="vinyl-center"></div>
                </div>
              </div>
              <div class="deck-info">
                <span class="deck-title">{deckA.title}</span>
                <span class="deck-artist">{deckA.artist}</span>
                <span class="deck-album">{deckA.album}</span>
                <div class="deck-position-row">
                  {#if deckA.position_ms != null}
                    <span class="deck-position">{formatTime(deckA.position_ms)}</span>
                  {/if}
                  {#if deckA.duration_ms}
                    <span class="deck-duration">/ {formatTime(deckA.duration_ms)}</span>
                  {/if}
                  {#if bpmA}<span class="bpm-badge">{Math.round(bpmA)} BPM</span>{/if}
                </div>
              </div>
            </div>
            <div class="deck-transport">
              <button class="transport-btn" onclick={() => togglePlayDeck('a')}>
                {#if deckA.playing}
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><polygon points="5,3 19,12 5,21" /></svg>
                {/if}
              </button>
            </div>
            <canvas class="waveform" bind:this={waveCanvasA}></canvas>
          {:else}
            <button class="load-btn" onclick={() => { loadTarget = 'a'; }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Charger piste
            </button>
          {/if}
        </div>
        <div class="deck-volume">
          <label>Vol</label>
          <input type="range" min="0" max="1" step="0.01" value="1" oninput={(e) => setVolume('a', parseFloat((e.target as HTMLInputElement).value))} />
        </div>
        {#if deckA}
          <button class="load-small-btn" onclick={() => { loadTarget = 'a'; }}>Changer piste</button>
        {/if}
      </div>

      <!-- Crossfade controls -->
      <div class="crossfade-panel">
        <div class="cf-indicator">
          <span class="cf-label-a" class:active={activeDeck === 'a'}>A</span>
          <div class="cf-bar">
            <div class="cf-fill" style="width: {activeDeck === 'a' ? '25%' : '75%'}; left: {activeDeck === 'a' ? '0' : '25%'}"></div>
          </div>
          <span class="cf-label-b" class:active={activeDeck === 'b'}>B</span>
        </div>
        <button class="cf-btn" onclick={doCrossfade} disabled={crossfading || (!deckA && !deckB)}>
          {#if crossfading}
            <div class="spinner-sm"></div>
            Crossfade...
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M2 12h4l3-9 4 18 3-9h4" />
            </svg>
            Crossfade
          {/if}
        </button>
        {#if bpmA && bpmB}
          <button class="sync-btn" onclick={doSyncTempo}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
            Sync {Math.round(bpmA)} → {Math.round(bpmB)} BPM
          </button>
        {/if}
        <div class="cf-duration">
          <label>Duree</label>
          <input type="range" min="1" max="30" step="0.5" bind:value={crossfadeDuration} />
          <span>{crossfadeDuration}s</span>
        </div>
        <div class="cf-slider">
          <span class="cf-s-label">A</span>
          <input type="range" min="-1" max="1" step="0.05" value={crossfaderPos} oninput={(e) => handleCrossfader(parseFloat((e.target as HTMLInputElement).value))} />
          <span class="cf-s-label">B</span>
        </div>
        <button class="auto-btn" class:active={autoCrossfade} onclick={toggleAuto}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Auto ({autoCrossfadeBeforeEnd}s avant fin)
        </button>
      </div>

      <!-- Deck B -->
      <div class="deck" class:active={activeDeck === 'b'} class:crossfading={crossfading && activeDeck === 'b'}>
        <div class="deck-header">
          <span class="deck-label">DECK B</span>
          {#if activeDeck === 'b'}<span class="deck-active-badge">ACTIVE</span>{/if}
          <div class="gain-bar"><div class="gain-fill" style="width: {gainB * 100}%"></div></div>
        </div>
        <div class="deck-content">
          {#if deckB}
            <div class="deck-track">
              <div class="deck-art">
                <AlbumArt coverPath={deckB.cover} size={120} alt={deckB.title} />
                <div class="vinyl-overlay" class:spinning={deckB.playing}>
                  <div class="vinyl-groove"></div>
                  <div class="vinyl-groove inner"></div>
                  <div class="vinyl-center"></div>
                </div>
              </div>
              <div class="deck-info">
                <span class="deck-title">{deckB.title}</span>
                <span class="deck-artist">{deckB.artist}</span>
                <span class="deck-album">{deckB.album}</span>
                <div class="deck-position-row">
                  {#if deckB.position_ms != null}
                    <span class="deck-position">{formatTime(deckB.position_ms)}</span>
                  {/if}
                  {#if deckB.duration_ms}
                    <span class="deck-duration">/ {formatTime(deckB.duration_ms)}</span>
                  {/if}
                  {#if bpmB}<span class="bpm-badge">{Math.round(bpmB)} BPM</span>{/if}
                </div>
              </div>
            </div>
            <div class="deck-transport">
              <button class="transport-btn" onclick={() => togglePlayDeck('b')}>
                {#if deckB.playing}
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><polygon points="5,3 19,12 5,21" /></svg>
                {/if}
              </button>
            </div>
            <canvas class="waveform" bind:this={waveCanvasB}></canvas>
          {:else}
            <button class="load-btn" onclick={() => { loadTarget = 'b'; }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Charger piste
            </button>
          {/if}
        </div>
        <div class="deck-volume">
          <label>Vol</label>
          <input type="range" min="0" max="1" step="0.01" value="1" oninput={(e) => setVolume('b', parseFloat((e.target as HTMLInputElement).value))} />
        </div>
        {#if deckB}
          <button class="load-small-btn" onclick={() => { loadTarget = 'b'; }}>Changer piste</button>
        {/if}
      </div>
    </div>

    <!-- Search modal for loading tracks -->
    {#if loadTarget}
      <div class="search-overlay" onclick={() => { loadTarget = null; searchResults = []; }}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="search-panel" onclick={(e) => e.stopPropagation()}>
          <h3>Charger sur Deck {loadTarget.toUpperCase()}</h3>
          <div class="search-input-row">
            <input
              type="text"
              placeholder="Rechercher un titre..."
              bind:value={searchQuery}
              onkeydown={(e) => e.key === 'Enter' && searchTracks()}
            />
            <button onclick={searchTracks} disabled={searchLoading}>
              {searchLoading ? '...' : 'Chercher'}
            </button>
          </div>
          <div class="search-results">
            {#each searchResults as track}
              <button class="result-row" onclick={() => loadTrackOnDeck(track.id)}>
                <AlbumArt coverPath={track.cover_path} albumId={track.album_id} size={36} alt={track.title} />
                <div class="result-info">
                  <span class="result-title">{track.title}</span>
                  <span class="result-artist">{track.artist_name} - {track.album_title}</span>
                </div>
                <span class="result-dur">{formatTime(track.duration_ms)}</span>
              </button>
            {/each}
          </div>
          <button class="close-btn" onclick={() => { loadTarget = null; searchResults = []; }}>Fermer</button>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .dj-view { padding: 0 24px 100px; }
  .view-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  .view-header h2 { font-size: 1.4rem; color: var(--tune-text); margin: 0; }
  .header-actions { display: flex; align-items: center; gap: 12px; margin-left: auto; }
  .zone-label { font-size: 0.85rem; color: var(--tune-text-muted); }
  .toggle-btn {
    padding: 8px 20px; border-radius: 20px; border: 1px solid var(--tune-accent);
    background: transparent; color: var(--tune-accent); font-size: 0.9rem; cursor: pointer;
    transition: all 0.15s;
  }
  .toggle-btn.active { background: var(--tune-accent); color: white; }
  .toggle-btn:hover { background: var(--tune-accent); color: white; }

  .empty { text-align: center; padding: 80px 20px; color: var(--tune-text-muted); }
  .empty p { margin: 8px 0; }
  .empty .hint { font-size: 0.85rem; opacity: 0.7; }

  .decks-container {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 16px;
    align-items: start;
  }

  @media (max-width: 900px) {
    .decks-container { grid-template-columns: 1fr; }
  }

  .deck {
    background: var(--tune-surface);
    border: 2px solid var(--tune-border);
    border-radius: 16px;
    padding: 20px;
    transition: all 0.2s;
  }
  .deck.active { border-color: var(--tune-accent); box-shadow: 0 0 20px rgba(99, 102, 241, 0.15); }
  .deck.crossfading { border-color: #f59e0b; }

  .deck-header { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .deck-label { font-family: var(--font-label); font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: var(--tune-text-muted); }
  .deck-active-badge { font-size: 9px; padding: 2px 8px; border-radius: 10px; background: var(--tune-accent); color: white; font-weight: 700; letter-spacing: 0.5px; }

  .deck-content { min-height: 140px; display: flex; align-items: center; justify-content: center; }
  .deck-track { display: flex; gap: 16px; align-items: center; width: 100%; }
  .deck-art { position: relative; width: 120px; height: 120px; flex-shrink: 0; }
  .deck-art :global(.album-art) { border-radius: 50% !important; width: 120px !important; height: 120px !important; }

  .vinyl-overlay {
    position: absolute; inset: 0; border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.1);
    pointer-events: none;
  }
  .vinyl-overlay.spinning { animation: spin 2s linear infinite; }
  .vinyl-groove { position: absolute; inset: 15%; border: 1px solid rgba(255,255,255,0.05); border-radius: 50%; }
  .vinyl-groove.inner { inset: 30%; }
  .vinyl-center { position: absolute; top: 50%; left: 50%; width: 10px; height: 10px; margin: -5px; border-radius: 50%; background: rgba(255,255,255,0.3); }
  @keyframes spin { to { transform: rotate(360deg); } }

  .deck-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .deck-title { font-size: 1rem; font-weight: 600; color: var(--tune-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .deck-artist { font-size: 0.85rem; color: var(--tune-text-secondary); }
  .deck-album { font-size: 0.8rem; color: var(--tune-text-muted); }
  .deck-duration { font-size: 0.75rem; color: var(--tune-accent); font-variant-numeric: tabular-nums; }

  .load-btn {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 24px; border: 2px dashed var(--tune-border); border-radius: 12px;
    background: none; color: var(--tune-text-muted); cursor: pointer;
    font-size: 0.9rem; transition: all 0.15s; width: 100%;
  }
  .load-btn:hover { border-color: var(--tune-accent); color: var(--tune-accent); }

  .load-small-btn {
    margin-top: 8px; background: none; border: 1px solid var(--tune-border);
    border-radius: 8px; padding: 4px 12px; font-size: 0.75rem; color: var(--tune-text-muted);
    cursor: pointer; transition: all 0.12s;
  }
  .load-small-btn:hover { border-color: var(--tune-accent); color: var(--tune-accent); }

  .deck-volume {
    display: flex; align-items: center; gap: 8px; margin-top: 12px;
    font-size: 0.75rem; color: var(--tune-text-muted);
  }
  .deck-volume input[type="range"] { flex: 1; accent-color: var(--tune-accent); }

  /* Crossfade panel */
  .crossfade-panel {
    display: flex; flex-direction: column; align-items: center; gap: 16px;
    padding: 20px 12px; min-width: 160px;
  }

  .cf-indicator { display: flex; align-items: center; gap: 8px; width: 100%; }
  .cf-label-a, .cf-label-b { font-family: var(--font-label); font-size: 13px; font-weight: 700; color: var(--tune-text-muted); }
  .cf-label-a.active, .cf-label-b.active { color: var(--tune-accent); }
  .cf-bar { flex: 1; height: 6px; border-radius: 3px; background: var(--tune-border); position: relative; overflow: hidden; }
  .cf-fill { position: absolute; top: 0; height: 100%; background: var(--tune-accent); border-radius: 3px; transition: all 0.5s; }

  .cf-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 10px 24px; border-radius: 24px; border: 2px solid var(--tune-accent);
    background: transparent; color: var(--tune-accent); font-size: 0.9rem;
    font-weight: 600; cursor: pointer; transition: all 0.15s;
  }
  .cf-btn:hover:not(:disabled) { background: var(--tune-accent); color: white; }
  .cf-btn:disabled { opacity: 0.4; cursor: default; }

  .cf-duration { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--tune-text-muted); width: 100%; }
  .cf-duration input { flex: 1; accent-color: var(--tune-accent); }

  .auto-btn {
    display: flex; align-items: center; gap: 4px;
    padding: 6px 14px; border: 1px solid var(--tune-border); border-radius: 14px;
    background: none; color: var(--tune-text-muted); font-size: 0.75rem; cursor: pointer;
    transition: all 0.12s;
  }
  .auto-btn.active { border-color: var(--tune-accent); color: var(--tune-accent); background: rgba(99, 102, 241, 0.1); }

  .cf-slider { display: flex; align-items: center; gap: 6px; width: 100%; }
  .cf-slider input { flex: 1; accent-color: var(--tune-accent); }
  .cf-s-label { font-family: var(--font-label); font-size: 11px; font-weight: 700; color: var(--tune-text-muted); }

  .gain-bar { flex: 1; height: 4px; border-radius: 2px; background: var(--tune-border); overflow: hidden; margin-left: auto; max-width: 60px; }
  .gain-fill { height: 100%; background: var(--tune-accent); border-radius: 2px; transition: width 0.15s; }

  .deck-transport { display: flex; justify-content: center; margin-top: 12px; }
  .transport-btn {
    width: 44px; height: 44px; border-radius: 50%; border: 2px solid var(--tune-accent);
    background: transparent; color: var(--tune-accent); cursor: pointer;
    display: flex; align-items: center; justify-content: center; transition: all 0.12s;
  }
  .transport-btn:hover { background: var(--tune-accent); color: white; }

  .deck-position-row { display: flex; align-items: baseline; gap: 4px; margin-top: 2px; }
  .deck-position { font-size: 0.85rem; color: var(--tune-accent); font-variant-numeric: tabular-nums; font-weight: 600; }

  .bpm-badge { font-size: 0.7rem; padding: 1px 6px; border-radius: 8px; background: rgba(99, 102, 241, 0.15); color: var(--tune-accent); font-weight: 700; font-variant-numeric: tabular-nums; margin-left: 4px; }

  .sync-btn {
    display: flex; align-items: center; gap: 4px;
    padding: 6px 14px; border: 1px solid var(--tune-accent); border-radius: 14px;
    background: none; color: var(--tune-accent); font-size: 0.75rem; font-weight: 600;
    cursor: pointer; transition: all 0.12s;
  }
  .sync-btn:hover { background: var(--tune-accent); color: white; }

  .waveform { width: 100%; height: 40px; margin-top: 8px; border-radius: 6px; background: rgba(255,255,255,0.03); }

  .spinner-sm { width: 14px; height: 14px; border: 2px solid var(--tune-border); border-top-color: var(--tune-accent); border-radius: 50%; animation: spin 0.8s linear infinite; }

  /* Search overlay */
  .search-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 300;
    display: flex; align-items: center; justify-content: center;
  }
  .search-panel {
    background: var(--tune-surface); border: 1px solid var(--tune-border);
    border-radius: 16px; width: 500px; max-width: 90vw; max-height: 70vh;
    padding: 24px; display: flex; flex-direction: column; gap: 16px;
  }
  .search-panel h3 { margin: 0; font-size: 1.1rem; color: var(--tune-text); }
  .search-input-row { display: flex; gap: 8px; }
  .search-input-row input {
    flex: 1; padding: 8px 14px; border: 1px solid var(--tune-border); border-radius: 8px;
    background: var(--tune-bg); color: var(--tune-text); font-size: 0.9rem; outline: none;
  }
  .search-input-row input:focus { border-color: var(--tune-accent); }
  .search-input-row button {
    padding: 8px 16px; border-radius: 8px; border: none; background: var(--tune-accent);
    color: white; cursor: pointer; font-size: 0.85rem;
  }

  .search-results { display: flex; flex-direction: column; gap: 2px; max-height: 300px; overflow-y: auto; }
  .result-row {
    display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px;
    background: none; border: none; color: var(--tune-text); cursor: pointer; text-align: left;
    transition: background 0.1s;
  }
  .result-row:hover { background: rgba(255,255,255,0.06); }
  .result-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .result-title { font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .result-artist { font-size: 0.75rem; color: var(--tune-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .result-dur { font-size: 0.75rem; color: var(--tune-text-muted); font-variant-numeric: tabular-nums; }

  .close-btn {
    align-self: flex-end; padding: 6px 16px; border: 1px solid var(--tune-border);
    border-radius: 8px; background: none; color: var(--tune-text-muted); cursor: pointer;
    font-size: 0.85rem;
  }
  .close-btn:hover { border-color: var(--tune-text); color: var(--tune-text); }
</style>
