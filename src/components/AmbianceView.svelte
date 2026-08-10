<script lang="ts">
  import { onMount } from 'svelte';
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import { notifications } from '../lib/stores/notifications';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import HeartButton from './HeartButton.svelte';
  import { formatTime } from '../lib/utils';
  import type { Track } from '../lib/types';
  import { acousticStatus, acousticEnabled, refreshAcousticStatus } from '../lib/stores/acoustic';
  import { t } from '../lib/i18n';

  let loading = $state(false);
  let tracks = $state<(Track & { similarity?: number })[]>([]);
  let prompt = $state('');
  let lastQuery = $state('');
  let error = $state('');
  let premiumBlocked = $state(false);
  let searched = $state(false);
  let playingIndex = $state<number | null>(null);
  let enabling = $state(false);

  // L'état est chargé au démarrage par la navigation, mais l'analyse progresse
  // pendant la session : on le rafraîchit à l'ouverture pour que l'encart dise
  // vrai plutôt que de figer un « 0 titre analysé » périmé.
  onMount(() => { refreshAcousticStatus(); });

  // L'écran explique son propre prérequis au lieu de disparaître de la
  // navigation : l'entrée reste visible, et l'action est offerte ici même
  // plutôt que renvoyée vers les Paramètres (retours Fabien, Philippe).
  let analysed = $derived($acousticStatus?.analysed_tracks ?? 0);

  async function enableAcoustic() {
    enabling = true;
    try {
      await api.updateConfig({ audio_embedding_enabled: true });
      await refreshAcousticStatus();
      notifications.success(
        "Analyse acoustique activée. Elle démarre en tâche de fond ; la recherche par ambiance donnera des résultats à mesure que les titres seront analysés.",
      );
    } catch (e: any) {
      notifications.error(e?.message || "Impossible d'activer l'analyse acoustique");
    }
    enabling = false;
  }

  let zone = $derived($currentZone);

  // Mood presets: French labels over English queries — the CLAP text tower is
  // English-trained, so English phrasing gives the strongest acoustic recall.
  const presets = [
    { label: 'Jazz feutré', query: 'warm intimate late-night jazz' },
    { label: 'Techno nocturne', query: 'driving dark hypnotic techno' },
    { label: 'Chaud analogique', query: 'warm analog vintage recording' },
    { label: 'Piano solo', query: 'intimate solo acoustic piano' },
    { label: 'Électro ambient', query: 'atmospheric ambient electronic' },
    { label: 'Rock live', query: 'raw energetic live rock' },
    { label: 'Acoustique doux', query: 'gentle acoustic folk fingerpicking' },
    { label: 'Groove funk', query: 'funky syncopated groove bass' },
  ];

  async function runQuery(q: string) {
    const query = q.trim();
    if (!query) return;
    loading = true;
    error = '';
    premiumBlocked = false;
    searched = true;
    lastQuery = query;
    try {
      const res = await api.searchAcoustic(query, 50);
      // The endpoint returns 200 with an `error` flag when Premium is required.
      if ((res as any)?.error === 'premium_required') {
        premiumBlocked = true;
        tracks = [];
      } else if ((res as any)?.reason === 'library_not_analysed') {
        // Une liste vide couvrait deux situations opposées : bibliothèque pas
        // encore analysée, ou requête sans correspondance. Le serveur les
        // distingue désormais — on ne laisse plus l'utilisateur reformuler une
        // requête qui ne pouvait pas aboutir (retour Fabien).
        error =
          "Aucun titre de ta bibliothèque n'a encore été analysé acoustiquement — la recherche par ambiance ne peut donc rien trouver, quelle que soit la requête. L'analyse tourne en tâche de fond une fois activée sur le serveur (réglage « audio_embedding_enabled »), et n'est pas encore réglable depuis cette interface : contacte le support.";
        tracks = [];
      } else {
        tracks = res.tracks ?? [];
      }
    } catch (e: any) {
      // The server self-provisions the acoustic model (CLAP text tower) on first
      // use. A failure here means it couldn't be downloaded (server offline) or
      // this build lacks the audio-embedding feature — show a clear message
      // instead of a raw "503" (#1288/Fabien: "Menu Ambiance : erreur 503").
      const msg = String(e?.message ?? '');
      if (/\b503\b|model|acoustic|unavailable|provision/i.test(msg)) {
        error =
          "La recherche par ambiance prépare son modèle acoustique (téléchargement au premier usage). Réessaie dans un instant — si le problème persiste, vérifie la connexion Internet du serveur.";
      } else {
        error = e?.message || 'Recherche par ambiance indisponible';
      }
      tracks = [];
    }
    loading = false;
  }

  function handlePromptKey(e: KeyboardEvent) {
    if (e.key === 'Enter') runQuery(prompt);
  }

  function usePreset(p: { label: string; query: string }) {
    prompt = p.label;
    runQuery(p.query);
  }

  async function playTrack(track: Track, index: number) {
    if (!zone?.id) {
      notifications.error('Aucune zone sélectionnée');
      return;
    }
    playingIndex = index;
    try {
      if (track.id) await playAndSync(zone.id, { track_id: track.id });
    } catch {
      notifications.error('Erreur de lecture');
    }
    playingIndex = null;
  }

  function trackIds(): number[] {
    return tracks.map((t) => t.id).filter((id): id is number => id != null && id > 0);
  }

  async function playAll(shuffle = false) {
    if (!zone?.id) {
      notifications.error('Aucune zone sélectionnée');
      return;
    }
    let ids = trackIds();
    if (ids.length === 0) return;
    if (shuffle) {
      // Fisher–Yates so "Aléatoire" doesn't just replay the ranked order.
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
    }
    try {
      await playAndSync(zone.id, { track_ids: ids });
      notifications.success(`Lecture de ${ids.length} titres`);
    } catch {
      notifications.error('Erreur de lecture');
    }
  }

  async function saveAsPlaylist() {
    const ids = trackIds();
    if (ids.length === 0 || !lastQuery) return;
    const name = `Ambiance · ${lastQuery}`;
    try {
      const created = await api.createPlaylist(name);
      if (created.id) {
        await api.addPlaylistTracks(created.id, ids);
        notifications.success(`Playlist « ${name} » sauvegardée (${ids.length} titres)`);
      }
    } catch (e: any) {
      notifications.error(e?.message || 'Erreur de sauvegarde');
    }
  }
</script>

<div class="ambiance-view">
  <div class="view-header">
    <h2>Ambiance</h2>
    <span class="subtitle">{$t('ambiance.subtitle')}</span>
  </div>

  <!-- Free-text query -->
  <section class="section">
    <div class="prompt-box">
      <div class="prompt-input-row">
        <input
          type="text"
          bind:value={prompt}
          onkeydown={handlePromptKey}
          placeholder="ex. « warm analog jazz », « driving late-night techno »…"
          class="prompt-input"
          disabled={loading}
        />
        <button
          class="prompt-btn"
          onclick={() => runQuery(prompt)}
          disabled={loading || !prompt.trim()}
        >
          {#if loading}
            <div class="spinner-sm"></div>
          {:else}
            Rechercher
          {/if}
        </button>
      </div>
      <div class="example-chips">
        {#each presets as p}
          <button class="chip" onclick={() => usePreset(p)} disabled={loading}>{p.label}</button>
        {/each}
      </div>
    </div>
  </section>

  {#if !$acousticEnabled}
    <!-- Analyse éteinte : on dit pourquoi, et on propose le geste sur place. -->
    <div class="acoustic-notice">
      <p class="acoustic-notice-title">{$t('ambiance.needsAnalysisTitle')}</p>
      <p class="acoustic-notice-body">
        Elle compare le <em>son</em> de vos morceaux, pas leurs étiquettes : chaque titre doit d'abord
        être analysé. L'analyse tourne en tâche de fond, sans bloquer la lecture. Le modèle est
        téléchargé au premier usage, et le calcul est long et gourmand en processeur sur une grande
        bibliothèque.
      </p>
      <button class="acoustic-notice-btn" onclick={enableAcoustic} disabled={enabling}>
        {enabling ? 'Activation…' : "Activer l'analyse acoustique"}
      </button>
    </div>
  {:else if analysed === 0}
    <div class="acoustic-notice">
      <p class="acoustic-notice-title">Analyse acoustique en cours</p>
      <p class="acoustic-notice-body">
        Aucun titre n'a encore été analysé. La recherche donnera des résultats à mesure que
        l'analyse progresse — inutile de rester sur cet écran, elle continue en tâche de fond.
      </p>
    </div>
  {/if}

  {#if error}
    <div class="error-banner">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
      {error}
    </div>
  {/if}

  {#if premiumBlocked}
    <div class="premium-banner">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.5 5.8 21 7 14 2 9.3 9 8.5 12 2" /></svg>
      La recherche par ambiance nécessite une licence Premium.
    </div>
  {/if}

  {#if loading && tracks.length === 0}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Analyse acoustique en cours…</p>
    </div>
  {/if}

  {#if !loading && searched && !error && !premiumBlocked && tracks.length === 0}
    <div class="empty-state">
      <p>Aucun titre trouvé pour « {lastQuery} ».</p>
      <span>{$t('ambiance.notAnalysed')}</span>
    </div>
  {/if}

  {#if tracks.length > 0}
    <section class="section results-section">
      <div class="results-header">
        <h3 class="section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
          {lastQuery}
        </h3>
        <span class="track-count">{tracks.length} titres</span>
        <div class="results-actions">
          <button class="action-btn play-all-btn" onclick={() => playAll(false)}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><polygon points="5,3 19,12 5,21" /></svg>
            Tout lire
          </button>
          <button class="action-btn" onclick={() => playAll(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>
            Aléatoire
          </button>
          <button class="action-btn save-btn" onclick={saveAsPlaylist}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
            Sauvegarder
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
            {#if track.similarity != null}
              <span class="match-badge" title="Similarité acoustique">{track.similarity.toFixed(2)}</span>
            {/if}
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
  .ambiance-view {
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
    flex-wrap: wrap;
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

  /* Banners */
  .error-banner,
  .premium-banner {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md);
    border-radius: var(--radius-lg);
    font-family: var(--font-body);
    font-size: 13px;
  }

  .acoustic-notice {
    background: var(--surface, #1c1c22);
    border: 1px solid var(--border, #33333a);
    border-left: 3px solid var(--tune-accent, #6c5ce7);
    border-radius: 8px;
    padding: 1rem 1.25rem;
    margin-bottom: 1rem;
  }
  .acoustic-notice-title {
    margin: 0 0 0.4rem;
    font-weight: 600;
  }
  .acoustic-notice-body {
    margin: 0;
    font-size: 0.9rem;
    color: var(--text-muted, #a0a0a8);
    max-width: 70ch;
  }
  .acoustic-notice-btn {
    margin-top: 0.9rem;
    background: var(--tune-accent, #6c5ce7);
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .acoustic-notice-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .error-banner {
    background: color-mix(in srgb, var(--tune-warning) 15%, var(--tune-surface));
    border: 1px solid var(--tune-warning);
    color: var(--tune-warning);
  }

  .premium-banner {
    background: color-mix(in srgb, var(--tune-accent) 12%, var(--tune-surface));
    border: 1px solid var(--tune-accent);
    color: var(--tune-text);
  }

  /* Loading / empty */
  .loading-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-2xl);
    color: var(--tune-text-muted);
    text-align: center;
  }

  .empty-state span {
    font-size: 12px;
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
    flex-wrap: wrap;
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

  .match-badge {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
    padding: 2px 6px;
    border: 1px solid var(--tune-border);
    border-radius: 10px;
    flex-shrink: 0;
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

  @media (max-width: 768px) {
    .ambiance-view {
      padding: var(--space-md) var(--space-md);
      padding-bottom: 100px;
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
