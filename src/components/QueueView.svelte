<script lang="ts">
  import { queueTracks, queuePosition, queueLength } from '../lib/stores/queue';
  import { currentZone, currentZoneId, zones, playAndSync } from '../lib/stores/zones';
  import { currentTrack, seekPositionMs, stopSeekTimer } from '../lib/stores/nowPlaying';
  import * as api from '../lib/api';
  import { formatTime, formatCompactQuality, getQualityTier, getQualityTierColor, formatQualityTooltip } from '../lib/utils';
  import { t } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import AlbumArt from './AlbumArt.svelte';
  import ServiceBadge from './ServiceBadge.svelte';
  import MetadataChips from './MetadataChips.svelte';

  const DISPLAY_FIELDS_KEY = 'tune_metadata_fields';
  const DISPLAY_FIELDS_DEFAULT = ['format', 'genre', 'year'];
  function getDisplayFields(): string[] {
    try {
      const raw = localStorage.getItem(DISPLAY_FIELDS_KEY);
      if (raw) return JSON.parse(raw) as string[];
    } catch {}
    return DISPLAY_FIELDS_DEFAULT;
  }
  let displayFields = $state<string[]>(getDisplayFields());

  interface Props {
    onAddToPlaylist?: (track: import('../lib/types').Track) => void;
  }
  let { onAddToPlaylist }: Props = $props();

  let zone = $derived($currentZone);
  let track = $derived($currentTrack);

  // Refresh queue when view mounts or zone changes — the queue may have been
  // populated by a play action without a queue_changed WS event, leaving the
  // store stale or empty.  Use $currentZoneId (primitive number) as dependency
  // to avoid re-fetching on every zone state update (position, volume, etc.).
  $effect(() => {
    const zid = $currentZoneId;
    if (zid == null) return;
    api.getQueue(zid).then((qs) => {
      queueTracks.set(qs.tracks);
      queuePosition.set(qs.position);
      queueLength.set(qs.length);
    }).catch((e) => {
      console.error('QueueView: fetch queue error:', e);
    });
  });

  // Drag state
  let dragIndex = $state<number | null>(null);
  let dropIndex = $state<number | null>(null);

  function isCurrent(index: number): boolean {
    return index === $queuePosition;
  }

  async function playFromPosition(index: number) {
    if (!zone?.id) return;
    try {
      await api.jumpInQueue(zone.id, index);
    } catch (e) {
      console.error('Jump in queue error:', e);
    }
  }

  async function removeFromQueue(index: number) {
    if (!zone?.id) return;
    try {
      await api.removeFromQueue(zone.id, index);
    } catch (e) {
      console.error('Remove from queue error:', e);
    }
  }

  function handleDragStart(e: DragEvent, index: number) {
    dragIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    }
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    if (dragIndex !== null && index !== dragIndex) {
      dropIndex = index;
    }
  }

  function handleDragLeave() {
    dropIndex = null;
  }

  async function handleDrop(e: DragEvent, toIndex: number) {
    e.preventDefault();
    const fromIndex = dragIndex;
    dragIndex = null;
    dropIndex = null;

    if (fromIndex === null || fromIndex === toIndex || !zone?.id) return;

    // Optimistic update
    const tracks = [...$queueTracks];
    const [moved] = tracks.splice(fromIndex, 1);
    tracks.splice(toIndex, 0, moved);
    queueTracks.set(tracks);

    // Adjust queue position optimistically
    const pos = $queuePosition;
    let newPos = pos;
    if (fromIndex === pos) {
      newPos = toIndex;
    } else if (fromIndex < pos && toIndex >= pos) {
      newPos = pos - 1;
    } else if (fromIndex > pos && toIndex <= pos) {
      newPos = pos + 1;
    }
    if (newPos !== pos) queuePosition.set(newPos);

    try {
      await api.moveInQueue(zone.id, fromIndex, toIndex);
    } catch (e) {
      console.error('Move in queue error:', e);
      // Refresh on error
      try {
        const qs = await api.getQueue(zone.id);
        queueTracks.set(qs.tracks);
        queuePosition.set(qs.position);
      } catch {}
    }
  }

  function handleDragEnd() {
    dragIndex = null;
    dropIndex = null;
  }

  let clearingQueue = $state(false);

  async function handleClearQueue() {
    if (!zone?.id || $queueTracks.length === 0) return;
    clearingQueue = true;
    try {
      await api.clearQueue(zone.id);
      queueTracks.set([]);
      queuePosition.set(0);
      // Clear current track so Now Playing bar/screen no longer shows stale info
      const zoneId = zone.id;
      zones.update((zs) =>
        zs.map((z) => {
          if (z.id !== zoneId) return z;
          return { ...z, current_track: null, state: 'stopped' as const, position_ms: 0 };
        })
      );
      stopSeekTimer();
      seekPositionMs.set(0);
    } catch (e) {
      console.error('Clear queue error:', e);
      notifications.error('Erreur lors du vidage');
    }
    clearingQueue = false;
  }

  let savingQueue = $state(false);

  async function handleSaveAsPlaylist() {
    if (!zone?.id) return;
    const name = prompt('Nom de la playlist :');
    if (!name?.trim()) return;
    savingQueue = true;
    try {
      await api.saveQueueAsPlaylist(zone.id, name.trim());
      notifications.success(`Playlist "${name.trim()}" créée`);
    } catch (e) {
      console.error('Save queue as playlist error:', e);
      notifications.error('Erreur lors de la sauvegarde');
    }
    savingQueue = false;
  }

  // --- Smart AutoPlay / Mood ---
  const AUTOPLAY_KEY = 'tune_autoplay_enabled';
  let autoPlayEnabled = $state(localStorage.getItem(AUTOPLAY_KEY) === 'true');
  let moodLoading = $state<string | null>(null);

  function toggleAutoPlay() {
    autoPlayEnabled = !autoPlayEnabled;
    localStorage.setItem(AUTOPLAY_KEY, String(autoPlayEnabled));
    if (autoPlayEnabled) {
      notifications.success('AutoPlay activé');
    }
  }

  const moods = [
    { id: 'calm', emoji: '\u{1F319}', label: 'Chill', color: '#6366f1' },
    { id: 'happy', emoji: '\u{1F389}', label: 'Party', color: '#f59e0b' },
    { id: 'focus', emoji: '\u{1F3AF}', label: 'Focus', color: '#8b5cf6' },
    { id: 'energetic', emoji: '\u{26A1}', label: 'Energetic', color: '#ef4444' },
  ] as const;

  /** True when the queue is empty or near the end (2 tracks or fewer remaining) */
  let showMoodSelector = $derived(
    $queueTracks.length === 0 ||
    ($queueTracks.length - $queuePosition) <= 2
  );

  async function handleMoodSelect(mood: typeof moods[number]) {
    if (!zone?.id) {
      notifications.error('Aucune zone sélectionnée');
      return;
    }
    moodLoading = mood.id;
    try {
      const data = await api.smartAIMood({ mood: mood.id, limit: 20 });
      const tracks = data.tracks || [];
      if (tracks.length === 0) {
        notifications.error('Aucun titre trouvé pour cette ambiance');
        moodLoading = null;
        return;
      }
      const ids = tracks.map(t => t.id).filter((id): id is number => id != null && id > 0);
      if (ids.length === 0) {
        notifications.error('Aucun titre local pour cette ambiance');
        moodLoading = null;
        return;
      }
      // If queue is empty, play directly; otherwise add to queue
      if ($queueTracks.length === 0) {
        await playAndSync(zone.id, { track_ids: ids });
        notifications.success(`${mood.label} Mix : ${ids.length} titres en lecture`);
      } else {
        await api.addToQueue(zone.id, { track_ids: ids });
        notifications.success(`${mood.label} Mix : ${ids.length} titres ajoutés`);
      }
      // Refresh queue
      const qs = await api.getQueue(zone.id);
      queueTracks.set(qs.tracks);
      queuePosition.set(qs.position);
      queueLength.set(qs.length);
    } catch (e) {
      console.error('Mood AutoPlay error:', e);
      notifications.error('Erreur lors de la génération');
    }
    moodLoading = null;
  }
</script>

<div class="queue-view">
  <div class="queue-header">
    <h2>{$t('queue.title')}</h2>
    {#if zone}
      <span class="queue-zone">{zone.name}</span>
    {/if}
    <span class="queue-count">{$queueTracks.length} {$t('common.tracks')}</span>
    <!-- AutoPlay toggle -->
    <button
      class="autoplay-toggle"
      class:active={autoPlayEnabled}
      onclick={toggleAutoPlay}
      title={autoPlayEnabled ? 'AutoPlay activé' : 'AutoPlay désactivé'}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
      </svg>
      AutoPlay
    </button>
    {#if $queueTracks.length > 0}
      <button class="save-queue-btn" onclick={handleSaveAsPlaylist} disabled={savingQueue}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /></svg>
        {savingQueue ? 'Sauvegarde...' : 'Sauver en playlist'}
      </button>
      <button class="clear-queue-btn" onclick={handleClearQueue} disabled={clearingQueue} title="Vider la file d'attente">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
      </button>
    {/if}
  </div>

  {#if $queueTracks.length === 0}
    <div class="empty">
      <p>{$t('queue.empty')}</p>
    </div>
    <!-- Mood selector when queue is empty -->
    <div class="mood-section">
      <div class="mood-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </svg>
        <span>Smart AutoPlay</span>
      </div>
      <p class="mood-hint">Choisissez une ambiance pour remplir la file automatiquement</p>
      <div class="mood-grid">
        {#each moods as mood}
          <button
            class="mood-btn"
            style="--mood-color: {mood.color}"
            onclick={() => handleMoodSelect(mood)}
            disabled={moodLoading !== null}
          >
            {#if moodLoading === mood.id}
              <span class="mood-spinner"></span>
            {:else}
              <span class="mood-emoji">{mood.emoji}</span>
            {/if}
            <span class="mood-label">{mood.label}</span>
          </button>
        {/each}
      </div>
    </div>
  {:else}
    <div class="queue-list">
      {#each $queueTracks as queueTrack, index}
        <div
          class="queue-item"
          class:current={isCurrent(index)}
          class:dragging={dragIndex === index}
          class:drop-above={dropIndex === index && dragIndex !== null && dragIndex > index}
          class:drop-below={dropIndex === index && dragIndex !== null && dragIndex < index}
          draggable="true"
          ondragstart={(e) => handleDragStart(e, index)}
          ondragover={(e) => handleDragOver(e, index)}
          ondragleave={handleDragLeave}
          ondrop={(e) => handleDrop(e, index)}
          ondragend={handleDragEnd}
          role="listitem"
        >
          {#if isCurrent(index)}
            <span class="current-bar"></span>
          {/if}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span class="drag-handle" onclick={(e) => e.stopPropagation()}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
              <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
            </svg>
          </span>
          <button class="queue-item-play" onclick={() => playFromPosition(index)}>
            <span class="queue-index">{index + 1}</span>
            {#if queueTrack.cover_path}
              <img src={api.artworkUrl(queueTrack.cover_path)} alt="" width="40" height="40" loading="lazy" style="border-radius:6px;object-fit:cover;flex-shrink:0" />
            {:else}
              <AlbumArt albumId={queueTrack.album_id} size={40} alt={queueTrack.title} />
            {/if}
            <div class="queue-info">
              <span class="queue-title truncate">{queueTrack.title || 'Piste inconnue'}</span>
              {#if queueTrack.artist_name}
                <span class="queue-artist truncate">{queueTrack.artist_name}</span>
              {/if}
              <MetadataChips track={queueTrack} fields={displayFields} />
            </div>
            <ServiceBadge source={queueTrack.source} compact />
            {#if queueTrack.format}
              {@const qTier = getQualityTier(queueTrack)}
              <span
                class="audio-format tier-{getQualityTierColor(qTier)}"
                title={formatQualityTooltip(queueTrack)}
              >{formatCompactQuality(queueTrack)}</span>
            {/if}
            <span class="queue-duration">{formatTime(queueTrack.duration_ms)}</span>
          </button>
          {#if onAddToPlaylist && (queueTrack.id || queueTrack.source_id)}
            <button class="action-btn playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(queueTrack); }} title={$t('queue.addToPlaylist')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
          {/if}
          <button class="action-btn remove-btn" onclick={(e) => { e.stopPropagation(); removeFromQueue(index); }} title={$t('queue.removeFromQueue')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        {#if queueTrack.gapless_next && index < $queueTracks.length - 1}
          <div class="gapless-indicator">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span>{$t('queue.gapless' as any)}</span>
          </div>
        {/if}
      {/each}
    </div>

    <!-- Mood selector at bottom when queue is near the end -->
    {#if showMoodSelector && $queueTracks.length > 0}
      <div class="mood-section mood-section-bottom">
        <div class="mood-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
          </svg>
          <span>Continuer avec...</span>
        </div>
        <div class="mood-grid mood-grid-compact">
          {#each moods as mood}
            <button
              class="mood-btn mood-btn-compact"
              style="--mood-color: {mood.color}"
              onclick={() => handleMoodSelect(mood)}
              disabled={moodLoading !== null}
            >
              {#if moodLoading === mood.id}
                <span class="mood-spinner"></span>
              {:else}
                <span class="mood-emoji">{mood.emoji}</span>
              {/if}
              <span class="mood-label">{mood.label}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .queue-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
  }

  .queue-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .queue-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  .queue-zone {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
  }

  .queue-count {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    margin-left: auto;
  }

  .save-queue-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px solid var(--tune-border);
    border-radius: 8px;
    padding: 4px 12px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    cursor: pointer;
    transition: all 0.12s;
    margin-left: var(--space-sm);
  }

  .save-queue-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .save-queue-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .clear-queue-btn {
    display: inline-flex;
    align-items: center;
    background: none;
    border: 1px solid var(--tune-border);
    border-radius: 8px;
    padding: 4px 8px;
    color: var(--tune-text-secondary);
    cursor: pointer;
    transition: all 0.12s;
    margin-left: 4px;
  }

  .clear-queue-btn:hover {
    border-color: var(--tune-error, #ef4444);
    color: var(--tune-error, #ef4444);
  }

  .clear-queue-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .empty {
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    text-align: center;
    padding: var(--space-2xl);
  }

  .queue-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    overflow-y: auto;
  }

  .queue-item {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0;
    background: none;
    border: none;
    border-radius: 0;
    color: var(--tune-text);
    transition: background 0.12s ease-out;
    position: relative;
  }

  .queue-item:hover {
    background: var(--tune-surface-hover);
  }

  .queue-item.current {
    background: rgba(107, 110, 217, 0.08);
  }

  .queue-item.current:hover {
    background: rgba(107, 110, 217, 0.14);
  }

  .queue-item.dragging {
    opacity: 0.4;
  }

  .queue-item.drop-above {
    box-shadow: inset 0 2px 0 0 var(--tune-accent);
  }

  .queue-item.drop-below {
    box-shadow: inset 0 -2px 0 0 var(--tune-accent);
  }

  .current-bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--tune-accent);
    border-radius: 0 2px 2px 0;
  }

  .drag-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    flex-shrink: 0;
    color: var(--tune-text-muted);
    cursor: grab;
    opacity: 0;
    transition: opacity 0.12s;
    padding: 4px 0 4px 8px;
  }

  .queue-item:hover .drag-handle {
    opacity: 0.6;
  }

  .drag-handle:hover {
    opacity: 1 !important;
    color: var(--tune-text);
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .queue-item-play {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 8px 8px 8px 4px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    min-width: 0;
  }

  .queue-index {
    width: 28px;
    text-align: center;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .queue-item.current .queue-index {
    color: var(--tune-accent);
  }

  .queue-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .queue-title {
    display: block;
    flex-shrink: 0;
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.3;
    color: var(--tune-text);
  }

  .queue-item.current .queue-title {
    color: var(--tune-accent);
  }

  .queue-artist {
    display: block;
    flex-shrink: 0;
    font-family: var(--font-body);
    font-size: 13px;
    line-height: 1.3;
    color: var(--tune-text-secondary);
  }

  .queue-duration {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .audio-format {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.3px;
    flex-shrink: 0;
    padding: 1px 6px;
    border-radius: 3px;
    text-transform: uppercase;
    cursor: default;
  }

  .audio-format.tier-gold-max {
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.12);
  }

  .audio-format.tier-gold {
    color: #a78bfa;
    background: rgba(167, 139, 250, 0.1);
  }

  .audio-format.tier-blue {
    color: #60a5fa;
    background: rgba(96, 165, 250, 0.08);
  }

  .audio-format.tier-green {
    color: #34d399;
    background: rgba(52, 211, 153, 0.08);
  }

  .audio-format.tier-gray {
    color: #f87171;
    background: rgba(248, 113, 113, 0.06);
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all 0.12s ease-out;
    flex-shrink: 0;
  }

  .queue-item:hover .action-btn {
    opacity: 1;
  }

  .action-btn.playlist-btn:hover {
    color: var(--tune-accent);
  }

  .action-btn.remove-btn {
    margin-right: 8px;
  }

  .action-btn.remove-btn:hover {
    color: var(--tune-warning);
  }

  .gapless-indicator {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 1px 0 1px 62px;
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.3px;
    color: #4ade80;
    opacity: 0.7;
  }

  .gapless-indicator svg {
    flex-shrink: 0;
  }

  /* --- AutoPlay toggle --- */
  .autoplay-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px solid var(--tune-border);
    border-radius: 8px;
    padding: 4px 12px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    cursor: pointer;
    transition: all 0.15s;
    margin-left: var(--space-sm);
  }

  .autoplay-toggle:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .autoplay-toggle.active {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
    background: rgba(107, 110, 217, 0.08);
  }

  /* --- Mood / Smart AutoPlay section --- */
  .mood-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-xl) var(--space-lg);
  }

  .mood-section-bottom {
    border-top: 1px solid var(--tune-border);
    margin-top: var(--space-lg);
    padding-top: var(--space-lg);
    padding-bottom: var(--space-md);
  }

  .mood-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-label);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.3px;
    color: var(--tune-text);
  }

  .mood-hint {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    text-align: center;
    margin: 0;
  }

  .mood-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-md);
    width: 100%;
    max-width: 480px;
  }

  .mood-grid-compact {
    max-width: 400px;
    gap: var(--space-sm);
  }

  .mood-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 16px 8px;
    border: 1px solid color-mix(in srgb, var(--mood-color) 30%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--mood-color) 8%, transparent);
    color: var(--tune-text);
    cursor: pointer;
    transition: all 0.15s ease-out;
    font-family: var(--font-body);
  }

  .mood-btn:hover:not(:disabled) {
    border-color: var(--mood-color);
    background: color-mix(in srgb, var(--mood-color) 15%, transparent);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--mood-color) 20%, transparent);
  }

  .mood-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .mood-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .mood-btn-compact {
    padding: 10px 6px;
    border-radius: 10px;
  }

  .mood-emoji {
    font-size: 28px;
    line-height: 1;
  }

  .mood-btn-compact .mood-emoji {
    font-size: 22px;
  }

  .mood-label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.2px;
    color: var(--mood-color);
  }

  .mood-spinner {
    display: inline-block;
    width: 22px;
    height: 22px;
    border: 2px solid color-mix(in srgb, var(--mood-color) 30%, transparent);
    border-top-color: var(--mood-color);
    border-radius: 50%;
    animation: mood-spin 0.6s linear infinite;
  }

  @keyframes mood-spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 480px) {
    .mood-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
