<script lang="ts">
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import { t } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import HeartButton from './HeartButton.svelte';
  import { formatTime } from '../lib/utils';
  import type { Track } from '../lib/types';

  let loading = $state(false);
  let tracks = $state<Track[]>([]);
  let playlistName = $state('');
  let selectedMood = $state<string | null>(null);
  let prompt = $state('');
  let bpmTarget = $state(120);
  let error = $state('');
  let playingIndex = $state<number | null>(null);
  let activeSection = $state<string | null>(null);

  let zone = $derived($currentZone);

  // `id` est la valeur ENVOYÉE au serveur (`POST /smart-ai/mood`, filtrée par un
  // `match` sur ces sept chaînes dans routes/smart_ai.rs) : elle ne se traduit
  // pas. Seul `labelKey` est vu par l'utilisateur.
  const moods = [
    { id: 'happy', emoji: '\u{1F60A}', labelKey: 'smartai.moodHappy', color: '#FF9800' },
    { id: 'sad', emoji: '\u{1F622}', labelKey: 'smartai.moodSad', color: '#2196F3' },
    { id: 'energetic', emoji: '\u{26A1}', labelKey: 'smartai.moodEnergetic', color: '#F44336' },
    { id: 'calm', emoji: '\u{1F9D8}', labelKey: 'smartai.moodCalm', color: '#4CAF50' },
    { id: 'focus', emoji: '\u{1F3AF}', labelKey: 'smartai.moodFocus', color: '#9C27B0' },
    { id: 'romantic', emoji: '\u{1F495}', labelKey: 'smartai.moodRomantic', color: '#E91E63' },
  ];

  /**
   * Le VOCABULAIRE du moteur, pas de la prose (#1360).
   *
   * `generate_smart_playlist` ne comprend pas de phrase : il teste
   * `prompt.contains(...)` contre une liste FIGÉE — 22 genres, cinq familles
   * d'ambiance, quatre décennies, « hi-res », plus le nom d'artiste le plus long
   * trouvé dans la chaîne. Tout le reste est ignoré en silence, et un texte dont
   * aucun mot n'est reconnu retombe sur `ORDER BY RANDOM()`.
   *
   * Les exemples précédents le laissaient croire l'inverse : « upbeat funk
   * 120bpm » (aucune lecture de BPM ici — c'est Tempo qui la fait) et « piano
   * music for studying » (« piano » n'est pas un genre connu) promettaient une
   * compréhension qui n'existe pas.
   *
   * Ces jetons ne sont donc PAS traduits : ce sont les mots que le moteur
   * connaît réellement, tels qu'il les compare. Le libellé qui les introduit,
   * lui, l'est.
   */
  const examplePrompts = [
    'jazz',
    'calm',
    'funk 80s',
    'rock 90s',
    'electronic',
    'hi-res',
  ];

  async function generateMood(mood: typeof moods[0]) {
    loading = true;
    selectedMood = mood.id;
    activeSection = 'mood';
    error = '';
    try {
      const data = await api.smartAIMood({ mood: mood.id, limit: 25 });
      tracks = data.tracks || [];
      playlistName = $t('smartai.nameMoodMix').replace('{mood}', $t(mood.labelKey));
    } catch (e: any) {
      error = e.message || $t('smartai.generateFailed');
      tracks = [];
    }
    loading = false;
  }

  async function generateFromPrompt() {
    if (!prompt.trim()) return;
    loading = true;
    activeSection = 'prompt';
    error = '';
    try {
      const data = await api.smartAIGenerate({ prompt, limit: 25 });
      tracks = data.tracks || [];
      playlistName = prompt;
    } catch (e: any) {
      error = e.message || $t('smartai.generateFailed');
      tracks = [];
    }
    loading = false;
  }

  async function generateHistoryBased() {
    loading = true;
    activeSection = 'history';
    error = '';
    try {
      const data = await api.smartAIHistoryBased({ limit: 25, days: 30 });
      tracks = data.tracks || [];
      playlistName = $t('smartai.nameMyMix');
    } catch (e: any) {
      error = e.message || $t('smartai.generateFailed');
      tracks = [];
    }
    loading = false;
  }

  async function generateDiscovery() {
    loading = true;
    activeSection = 'discovery';
    error = '';
    try {
      const data = await api.smartAIDiscovery({ limit: 25 });
      tracks = data.tracks || [];
      playlistName = $t('smartai.nameDiscoveryMix');
    } catch (e: any) {
      error = e.message || $t('smartai.generateFailed');
      tracks = [];
    }
    loading = false;
  }

  async function generateTempo() {
    loading = true;
    activeSection = 'tempo';
    error = '';
    try {
      const data = await api.smartAITempoMatch({ target_bpm: bpmTarget, tolerance: 15, limit: 25 });
      tracks = data.tracks || [];
      playlistName = $t('smartai.nameTempoMix').replace('{bpm}', String(bpmTarget));
    } catch (e: any) {
      error = e.message || $t('smartai.generateFailed');
      tracks = [];
    }
    loading = false;
  }

  async function playTrack(track: Track, index: number) {
    if (!zone?.id) {
      notifications.error($t('queue.noZoneSelected'));
      return;
    }
    playingIndex = index;
    try {
      if (track.id) {
        await playAndSync(zone.id, { track_id: track.id });
      } else if (track.source && track.source !== 'local' && track.source_id) {
        await playAndSync(zone.id, { source: track.source, source_id: track.source_id });
      }
    } catch (e) {
      notifications.error($t('smartai.playError'));
    }
    playingIndex = null;
  }

  async function playAll() {
    if (!zone?.id || tracks.length === 0) {
      notifications.error($t('smartai.noZoneOrTracks' as any));
      return;
    }
    const ids = tracks.map(t => t.id).filter((id): id is number => id != null && id > 0);
    if (ids.length > 0) {
      try {
        await playAndSync(zone.id, { track_ids: ids });
        notifications.success($t('smartai.playingCount').replace('{count}', String(ids.length)));
      } catch {
        notifications.error($t('smartai.playError'));
      }
    }
  }

  async function saveAsPlaylist() {
    if (!playlistName.trim() || tracks.length === 0) return;
    const ids = tracks.map(t => t.id).filter((id): id is number => id != null && id > 0);
    if (ids.length === 0) return;
    try {
      const created = await api.createPlaylist(playlistName);
      if (created.id) {
        await api.addPlaylistTracks(created.id, ids);
        notifications.success(
          $t('smartai.savedPlaylist')
            .replace('{name}', playlistName)
            .replace('{count}', String(ids.length)),
        );
      }
    } catch (e: any) {
      notifications.error(e.message || $t('smartai.saveError'));
    }
  }

  function handlePromptKey(e: KeyboardEvent) {
    if (e.key === 'Enter') generateFromPrompt();
  }

  function useExample(ex: string) {
    prompt = ex;
    generateFromPrompt();
  }
</script>

<div class="smart-ai-view">
  <!-- Header -->
  <div class="view-header">
    <h2>{$t('smartai.title')}</h2>
    <span class="subtitle">{$t('smartai.subtitle')}</span>
  </div>

  <!-- Section 1: Mood Selector -->
  <section class="section">
    <h3 class="section-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
      {$t('smartai.sectionMood')}
    </h3>
    <div class="mood-grid">
      {#each moods as mood}
        <button
          class="mood-card"
          class:active={selectedMood === mood.id && activeSection === 'mood'}
          class:loading={loading && selectedMood === mood.id && activeSection === 'mood'}
          style="--mood-color: {mood.color}"
          onclick={() => generateMood(mood)}
          disabled={loading}
        >
          <span class="mood-emoji">{mood.emoji}</span>
          <span class="mood-label">{$t(mood.labelKey)}</span>
          {#if loading && selectedMood === mood.id && activeSection === 'mood'}
            <div class="mood-spinner"></div>
          {/if}
        </button>
      {/each}
    </div>
  </section>

  <!-- Section 2: Quick Actions -->
  <section class="section">
    <h3 class="section-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
      {$t('smartai.sectionQuick')}
    </h3>
    <div class="quick-actions">
      <button
        class="action-card"
        class:active={activeSection === 'history'}
        onclick={generateHistoryBased}
        disabled={loading}
      >
        <div class="action-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
        </div>
        <div class="action-text">
          <span class="action-title">{$t('smartai.actionHistory')}</span>
          <span class="action-desc">{$t('smartai.basedOnHistory')}</span>
        </div>
      </button>

      <button
        class="action-card"
        class:active={activeSection === 'discovery'}
        onclick={generateDiscovery}
        disabled={loading}
      >
        <div class="action-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
        </div>
        <div class="action-text">
          <span class="action-title">{$t('smartai.actionDiscovery')}</span>
          <span class="action-desc">{$t('smartai.discoveryDesc')}</span>
        </div>
      </button>

      <div class="action-card tempo-card">
        <div class="action-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-5.07l-2.83 2.83M9.76 14.24l-2.83 2.83m11.14 0l-2.83-2.83M9.76 9.76L6.93 6.93" /></svg>
        </div>
        <div class="action-text">
          <span class="action-title">{$t('smartai.actionTempo')}</span>
          <span class="action-desc">{bpmTarget} BPM</span>
        </div>
        <div class="tempo-controls">
          <input
            type="range"
            min="60"
            max="200"
            step="5"
            bind:value={bpmTarget}
            class="tempo-slider"
          />
          <button
            class="tempo-go"
            onclick={generateTempo}
            disabled={loading}
          >{$t('smartai.go')}</button>
        </div>
      </div>
    </div>
  </section>

  <!--
    Section 3 : MOTS-CLÉS, et non « prompt » (#1360).

    Ce champ n'est pas une invite adressée à un modèle : le serveur y cherche des
    mots d'une liste figée et en tire des conditions SQL. L'appeler « Prompt »,
    juste à côté d'un bouton « Tune AI » qui appelle vraiment Claude, promettait
    une compréhension du langage naturel qui n'existe nulle part dans
    `routes/smart_ai.rs`.
  -->
  <section class="section">
    <h3 class="section-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
      {$t('smartai.sectionKeywords')}
    </h3>
    <div class="prompt-box">
      <div class="prompt-input-row">
        <input
          type="text"
          bind:value={prompt}
          onkeydown={handlePromptKey}
          placeholder={$t('smartai.keywordsPlaceholder')}
          class="prompt-input"
          disabled={loading}
        />
        <button
          class="prompt-btn"
          onclick={generateFromPrompt}
          disabled={loading || !prompt.trim()}
        >
          {#if loading && activeSection === 'prompt'}
            <div class="spinner-sm"></div>
          {:else}
            {$t('smartai.generate')}
          {/if}
        </button>
      </div>
      <p class="keywords-help">{$t('smartai.keywordsHelp')}</p>
      <div class="example-chips">
        {#each examplePrompts as ex}
          <button class="chip" onclick={() => useExample(ex)} disabled={loading}>{ex}</button>
        {/each}
      </div>
    </div>
  </section>

  <!-- Section 4: Generated Playlist Result -->
  {#if error}
    <div class="error-banner">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
      {error}
    </div>
  {/if}

  {#if loading && tracks.length === 0}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>{$t('smartai.generating')}</p>
    </div>
  {/if}

  {#if tracks.length > 0}
    <section class="section results-section">
      <div class="results-header">
        <h3 class="section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
          {playlistName}
        </h3>
        <span class="track-count">{$t('smartai.trackCount').replace('{count}', String(tracks.length))}</span>
        <div class="results-actions">
          <button class="action-btn play-all-btn" onclick={playAll}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><polygon points="5,3 19,12 5,21" /></svg>
            {$t('smartai.playAll')}
          </button>
          <button class="action-btn save-btn" onclick={saveAsPlaylist}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
            {$t('smartai.save')}
          </button>
        </div>
      </div>

      <div class="track-list">
        {#each tracks as track, i}
          <div
            class="track-row"
            class:loading={playingIndex === i}
            role="button"
            tabindex="0"
            onclick={() => playTrack(track, i)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playTrack(track, i); } }}
          >
            <span class="track-index">{i + 1}</span>
            <div class="track-play-icon">
              {#if playingIndex === i}
                <div class="spinner-sm"></div>
              {:else}
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5,3 19,12 5,21" /></svg>
              {/if}
            </div>
            <AlbumArt coverPath={track.cover_path} albumId={track.album_id} size={40} alt={track.title} />
            <div class="track-info">
              <span class="track-title truncate">{track.title}</span>
              <span class="track-artist truncate">{track.artist_name ?? ''}</span>
            </div>
            <span class="track-duration">{formatTime(track.duration_ms)}</span>
            <span class="track-heart" onclick={(e) => e.stopPropagation()}>
              {#if track.id}<HeartButton trackId={track.id} size={14} />{/if}
            </span>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .smart-ai-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    padding-bottom: 80px;
    overflow-y: auto;
    gap: var(--space-xl);
  }

  .view-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-md);
  }

  .view-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  .subtitle {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
  }

  /* Sections */
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .section-title {
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    letter-spacing: -0.3px;
  }

  /* Mood Grid */
  .mood-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: var(--space-md);
  }

  .mood-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: var(--space-lg) var(--space-md);
    min-height: 120px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--mood-color) 25%, var(--tune-surface)), color-mix(in srgb, var(--mood-color) 8%, var(--tune-surface)));
    border: 1px solid color-mix(in srgb, var(--mood-color) 30%, transparent);
    border-radius: var(--radius-xl);
    color: var(--tune-text);
    cursor: pointer;
    transition: all 0.2s ease-out;
    overflow: hidden;
  }

  .mood-card:hover:not(:disabled) {
    transform: scale(1.04);
    border-color: color-mix(in srgb, var(--mood-color) 60%, transparent);
    box-shadow: 0 8px 24px color-mix(in srgb, var(--mood-color) 20%, transparent);
  }

  .mood-card.active {
    border-color: var(--mood-color);
    box-shadow: 0 0 20px color-mix(in srgb, var(--mood-color) 30%, transparent);
  }

  .mood-card:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .mood-emoji {
    font-size: 36px;
    line-height: 1;
  }

  .mood-label {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  .mood-spinner {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.2);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  /* Quick Actions */
  .quick-actions {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-md);
  }

  .action-card {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-xl);
    color: var(--tune-text);
    cursor: pointer;
    transition: all 0.15s ease-out;
    text-align: left;
  }

  .action-card:hover:not(:disabled) {
    background: var(--tune-surface-hover);
    border-color: var(--tune-accent);
  }

  .action-card.active {
    border-color: var(--tune-accent);
  }

  .action-card:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-lg);
    background: var(--tune-grey2);
    color: var(--tune-accent);
    flex-shrink: 0;
  }

  .action-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .action-title {
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
  }

  .action-desc {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  /* Tempo card */
  .tempo-card {
    cursor: default;
  }

  .tempo-controls {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
  }

  .tempo-slider {
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--tune-grey2);
    border-radius: 2px;
    outline: none;
  }

  .tempo-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--tune-accent);
    cursor: pointer;
    border: none;
  }

  .tempo-go {
    padding: var(--space-xs) var(--space-md);
    background: var(--tune-accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s;
    flex-shrink: 0;
  }

  .tempo-go:hover:not(:disabled) {
    background: var(--tune-accent-hover);
  }

  .tempo-go:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Prompt */
  .prompt-box {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .prompt-input-row {
    display: flex;
    gap: var(--space-sm);
  }

  .prompt-input {
    flex: 1;
    padding: 12px var(--space-md);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
    outline: none;
    transition: border-color 0.12s;
  }

  .prompt-input:focus {
    border-color: var(--tune-accent);
  }

  .prompt-input::placeholder {
    color: var(--tune-text-muted);
  }

  .prompt-btn {
    padding: 12px var(--space-xl);
    background: var(--tune-accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-lg);
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-shrink: 0;
  }

  .prompt-btn:hover:not(:disabled) {
    background: var(--tune-accent-hover);
  }

  .prompt-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .keywords-help {
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.5;
    color: var(--tune-text-muted);
    margin: 0;
  }

  .example-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .chip {
    padding: 6px 14px;
    background: var(--tune-grey2);
    border: 1px solid var(--tune-border);
    border-radius: 20px;
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .chip:hover:not(:disabled) {
    background: var(--tune-surface-hover);
    border-color: var(--tune-accent);
    color: var(--tune-text);
  }

  .chip:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Error */
  .error-banner {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md);
    background: color-mix(in srgb, var(--tune-warning) 15%, var(--tune-surface));
    border: 1px solid var(--tune-warning);
    border-radius: var(--radius-lg);
    color: var(--tune-warning);
    font-family: var(--font-body);
    font-size: 13px;
  }

  /* Loading */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-2xl);
    color: var(--tune-text-muted);
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  /* Results */
  .results-section {
    border-top: 1px solid var(--tune-border);
    padding-top: var(--space-lg);
  }

  .results-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .track-count {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    flex: 1;
  }

  .results-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    background: none;
    color: var(--tune-text-secondary);
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s;
  }

  .action-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-text);
  }

  .play-all-btn:hover {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: #fff;
  }

  /* Track list */
  .track-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .track-row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 8px 12px;
    background: none;
    border: none;
    border-radius: var(--radius-md);
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease-out;
  }

  .track-row:hover {
    background: var(--tune-surface-hover);
  }

  .track-row.loading {
    opacity: 0.6;
    pointer-events: none;
  }

  .track-index {
    width: 24px;
    text-align: right;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .track-row:hover .track-index {
    display: none;
  }

  .track-play-icon {
    width: 24px;
    height: 24px;
    display: none;
    align-items: center;
    justify-content: center;
    color: var(--tune-accent);
    flex-shrink: 0;
  }

  .track-row:hover .track-play-icon {
    display: flex;
  }

  .track-row.loading .track-index {
    display: none;
  }

  .track-row.loading .track-play-icon {
    display: flex;
  }

  .track-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .track-title {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
  }

  .track-artist {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
  }

  .track-duration {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
    min-width: 36px;
    text-align: right;
    flex-shrink: 0;
  }

  .spinner-sm {
    width: 14px;
    height: 14px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Responsive */
  @media (max-width: 1200px) {
    .mood-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (max-width: 900px) {
    .quick-actions {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .smart-ai-view {
      padding: var(--space-md) var(--space-md);
      padding-bottom: 100px;
    }

    .mood-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .mood-card {
      min-height: 90px;
      padding: var(--space-md);
    }

    .mood-emoji {
      font-size: 28px;
    }

    .quick-actions {
      grid-template-columns: 1fr;
    }

    .prompt-input-row {
      flex-direction: column;
    }

    .prompt-btn {
      width: 100%;
      justify-content: center;
    }

    .results-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .results-actions {
      width: 100%;
    }

    .action-btn {
      flex: 1;
      justify-content: center;
    }
  }
</style>
