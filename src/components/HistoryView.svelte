<script lang="ts">
  import { playbackHistory, type HistoryEntry } from '../lib/stores/history';
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import { formatTime, formatAudioBadge } from '../lib/utils';
  import { t } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import { tip } from '../lib/tooltip';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import MetadataChips from './MetadataChips.svelte';
  import { displayFields } from '../lib/stores/displayFields';
  import { rememberRadioFavListenAt, forgetRadioFavListenAt } from '../lib/radioFavListenAt';

  let playingIndex = $state<number | null>(null);
  let serverHistory = $state<HistoryEntry[]>([]);
  let radioFavKeys = $state(new Set<string>());
  let favBusyKey = $state<string | null>(null);

  let zone = $derived($currentZone);

  // Merge local + server history
  let mergedHistory = $derived.by(() => {
    const local = $playbackHistory;
    let combined: HistoryEntry[];
    if (serverHistory.length === 0) combined = local;
    else if (local.length === 0) combined = serverHistory;
    else {
      // Merge: local first (most recent), then server entries not in local
      const localTitles = new Set(local.map(e => e.track.title + e.playedAt));
      const extra = serverHistory.filter(e => !localTitles.has(e.track.title + e.playedAt));
      combined = [...local, ...extra];
    }
    // Show each track only once — its most recent listen (Elie). The list is
    // ordered most-recent-first, so keep the first occurrence per track.
    const seen = new Set<string>();
    const deduped: HistoryEntry[] = [];
    for (const e of combined) {
      const t = e.track;
      const key = t.id != null
        ? `id:${t.id}`
        : `s:${t.source ?? ''}:${t.source_id ?? ''}:${(t.title || '').toLowerCase()}:${(t.artist_name || '').toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(e);
    }
    return deduped.slice(0, 200);
  });

  // Load server history on mount
  $effect(() => {
    api.getPlaybackHistory(100).then(res => {
      const entries = res?.items ?? [];
      serverHistory = entries.map((e: any) => ({
        track: {
          id: e.track_id,
          title: e.title,
          artist_name: e.artist_name,
          album_title: e.album_title,
          duration_ms: e.duration_ms,
          source: e.source,
          source_id: e.source_id,
          album_id: e.album_id ?? null,
          cover_path: e.cover_url ?? null,
        },
        playedAt: e.listened_at,
        zoneName: `Zone ${e.zone_id ?? '?'}`,
      }));
    }).catch((err) => { console.error('HistoryView: fetch error', err); });
    api.apiFetch('/radio-favorites?limit=500').then((favs: any[]) => {
      radioFavKeys = new Set((favs ?? []).map((f: any) => radioFavKey(f.title, f.artist)));
    }).catch(() => { radioFavKeys = new Set(); });
  });

  function radioFavKey(title: string | null | undefined, artist: string | null | undefined): string {
    return `${title ?? ''}\n${artist ?? ''}`;
  }

  /** Snapshot usable as a radio-favourite song (not the station name, not the
   *  orchestrator "Episode" fallback). */
  function isSavableRadio(track: HistoryEntry['track']): boolean {
    if (track.source !== 'radio') return false;
    const title = (track.title || '').trim();
    if (!title) return false;
    if (title.toLowerCase() === 'episode') return false;
    const station = (track.album_title || '').trim();
    const artist = (track.artist_name || '').trim();
    if (station && title.toLowerCase() === station.toLowerCase() && !artist) return false;
    return true;
  }

  function isRadioFav(track: HistoryEntry['track']): boolean {
    return radioFavKeys.has(radioFavKey(track.title, track.artist_name));
  }

  async function toggleRadioFav(entry: HistoryEntry, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    const track = entry.track;
    if (!isSavableRadio(track)) return;
    const key = radioFavKey(track.title, track.artist_name);
    if (favBusyKey) return;
    favBusyKey = key;
    try {
      if (radioFavKeys.has(key)) {
        const favs = await api.apiFetch('/radio-favorites?limit=500');
        const match = (favs ?? []).find(
          (f: any) => f.title === track.title && (f.artist ?? '') === (track.artist_name ?? ''),
        );
        if (match) await api.apiDelete(`/radio-favorites/${match.id}`);
        forgetRadioFavListenAt(track.title, track.artist_name);
        const next = new Set(radioFavKeys);
        next.delete(key);
        radioFavKeys = next;
        notifications.success($t('history.radioFavRemoved'));
      } else {
        const sourceId = track.source_id ?? '';
        await api.apiPost('/radio-favorites', {
          title: track.title,
          artist: track.artist_name ?? '',
          station_name: track.album_title ?? '',
          cover_url: track.cover_path ?? null,
          stream_url: /^https?:\/\//i.test(sourceId) ? sourceId : null,
          saved_at: entry.playedAt || undefined,
        });
        rememberRadioFavListenAt(track.title, track.artist_name, entry.playedAt);
        const next = new Set(radioFavKeys);
        next.add(key);
        radioFavKeys = next;
        notifications.success($t('history.radioFavAdded'));
      }
    } catch (e) {
      console.error('HistoryView: radio fav error', e);
      notifications.error($t('history.radioFavError'));
    }
    favBusyKey = null;
  }

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "a l'instant";
    if (minutes < 60) return `il y a ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    return `il y a ${days}j`;
  }

  async function clearHistory() {
    try {
      await api.clearPlaybackHistory();
      playbackHistory.clear();
      serverHistory = [];
      notifications.success($t('history.cleared'));
    } catch (e) {
      console.error('Clear history error:', e);
      notifications.error($t('settings.deletionError'));
    }
  }

  function replayMeta(track: HistoryEntry['track']) {
    return {
      ...(track.title ? { title: track.title } : {}),
      ...(track.artist_name ? { artist_name: track.artist_name } : {}),
      ...(track.album_title ? { album_title: track.album_title } : {}),
      ...(track.cover_path ? { cover_path: track.cover_path } : {}),
      ...(track.duration_ms ? { duration_ms: track.duration_ms } : {}),
    };
  }

  async function replay(entry: HistoryEntry, index: number) {
    if (!zone?.id) {
      notifications.error($t('queue.noZoneSelected'));
      return;
    }
    playingIndex = index;
    try {
      if (entry.track.source === 'radio' && entry.track.source_id) {
        const radioId = parseInt(entry.track.source_id, 10);
        // A numeric station id can use /radios/{id}/play; a stream URL (the
        // usual now-playing snapshot) must go through play() WITH the history
        // title/artist/cover, otherwise the orchestrator defaults to "Episode"
        // and drops the artwork the list is already showing.
        if (!isNaN(radioId) && String(radioId) === entry.track.source_id) {
          await api.playRadio(radioId, zone.id);
          notifications.success(`Radio : ${entry.track.album_title || entry.track.title}`);
        } else {
          await playAndSync(zone.id, {
            source: 'radio',
            source_id: entry.track.source_id,
            ...replayMeta(entry.track),
          });
          notifications.success(`Radio : ${entry.track.album_title || entry.track.title}`);
        }
      } else if (entry.track.id) {
        await playAndSync(zone.id, { track_id: entry.track.id });
        notifications.success(`Lecture : ${entry.track.title}`);
      } else if (entry.track.source && entry.track.source !== 'local' && entry.track.source_id) {
        await playAndSync(zone.id, {
          source: entry.track.source,
          source_id: entry.track.source_id,
          ...replayMeta(entry.track),
        });
        notifications.success(`Lecture : ${entry.track.title}`);
      } else {
        const title = entry.track.album_title || entry.track.title;
        if (title) {
          const results = await api.searchLibrary(title);
          if (results.tracks && results.tracks.length > 0) {
            const match = results.tracks.find((t: any) => t.album_id);
            if (match?.album_id) {
              await playAndSync(zone.id, { album_id: match.album_id });
              notifications.success(`Lecture : ${title}`);
              return;
            }
            if (results.tracks[0].id) {
              await playAndSync(zone.id, { track_id: results.tracks[0].id });
              notifications.success(`Lecture : ${results.tracks[0].title}`);
              return;
            }
          }
        }
        if (entry.track.file_path) {
          await playAndSync(zone.id, { file_path: entry.track.file_path });
          notifications.success(`Lecture : ${entry.track.title}`);
        } else {
          notifications.error('Impossible de relancer cette piste');
        }
      }
    } catch (e) {
      console.error('Replay error:', e);
      notifications.error('Erreur de lecture');
    }
    playingIndex = null;
  }
</script>

<div class="history-view">
  <div class="history-header">
    <h2>{$t('history.title')}</h2>
    <span class="history-count">{mergedHistory.length} {$t('history.plays')}</span>
    {#if mergedHistory.length > 0}
      <button class="clear-btn" onclick={() => clearHistory()}>{$t('history.clear')}</button>
    {/if}
  </div>

  {#if mergedHistory.length === 0}
    <div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
      <p>{$t('history.noHistory')}</p>
    </div>
  {:else}
    <div class="history-list">
      {#each mergedHistory as entry, i}
        <div class="history-item" class:loading={playingIndex === i}>
          <button type="button" class="history-main" onclick={() => replay(entry, i)}>
            <div class="history-play-icon">
              {#if playingIndex === i}
                <div class="spinner-sm"></div>
              {:else}
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5,3 19,12 5,21" /></svg>
              {/if}
            </div>
            <AlbumArt coverPath={entry.track.cover_path} albumId={entry.track.album_id} size={44} alt={entry.track.title} />
            <div class="history-info">
              <span class="history-title truncate">{entry.track.title}</span>
              <span class="history-artist truncate">{entry.track.artist_name ?? ''}</span>
              <MetadataChips track={entry.track} fields={$displayFields} />
            </div>
            <div class="history-meta">
              <span class="history-zone truncate">{entry.zoneName}</span>
              <span class="history-time">{relativeTime(entry.playedAt)}</span>
            </div>
            {#if entry.track.format}<span class="audio-format">{formatAudioBadge(entry.track)}</span>{/if}
            <span class="history-duration">{formatTime(entry.track.duration_ms)}</span>
          </button>
          {#if isSavableRadio(entry.track)}
            <button
              type="button"
              class="history-fav-btn"
              class:is-fav={isRadioFav(entry.track)}
              disabled={favBusyKey === radioFavKey(entry.track.title, entry.track.artist_name)}
              onclick={(e) => toggleRadioFav(entry, e)}
              use:tip={isRadioFav(entry.track) ? 'history.removeRadioFav' : 'history.saveRadioFav'}
            >
              <svg viewBox="0 0 24 24" fill={isRadioFav(entry.track) ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .history-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
  }

  .history-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .history-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  .history-count {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    flex: 1;
  }

  .clear-btn {
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 12px;
    transition: all 0.12s ease-out;
  }

  .clear-btn:hover {
    border-color: var(--tune-warning);
    color: var(--tune-warning);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-2xl);
    color: var(--tune-text-muted);
    text-align: center;
  }

  .empty svg {
    opacity: 0.3;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    overflow-y: auto;
  }

  .history-item {
    display: flex;
    align-items: center;
    border-radius: 0;
    color: var(--tune-text);
    transition: background 0.12s ease-out;
  }

  .history-item:hover {
    background: var(--tune-surface-hover);
  }

  .history-main {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex: 1;
    min-width: 0;
    padding: 8px 12px 8px 24px;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }

  .history-item.loading .history-main {
    opacity: 0.6;
    pointer-events: none;
  }

  .history-fav-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    cursor: pointer;
    padding: 8px 20px 8px 4px;
    color: var(--tune-text-muted);
    opacity: 0;
    transition: color 0.15s, opacity 0.12s, transform 0.15s;
  }

  .history-item:hover .history-fav-btn,
  .history-fav-btn.is-fav {
    opacity: 1;
  }

  .history-fav-btn:hover {
    color: var(--tune-text);
    transform: scale(1.15);
  }

  .history-fav-btn.is-fav {
    color: #e74c6f;
  }

  .history-fav-btn:disabled {
    cursor: default;
  }

  .history-play-icon {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--tune-text-muted);
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.12s;
  }

  .history-item:hover .history-play-icon {
    opacity: 1;
    color: var(--tune-accent);
  }

  .history-item.loading .history-play-icon {
    opacity: 1;
  }

  .spinner-sm {
    width: 14px; height: 14px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .history-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .history-title {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
  }

  .history-artist {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
  }

  .history-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }

  .history-zone {
    font-family: var(--font-label);
    font-size: 10px;
    color: var(--tune-text-muted);
    max-width: 100px;
  }

  .history-time {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
  }

  .history-duration {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
    min-width: 36px;
    text-align: right;
  }

  .audio-format {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-text-muted);
    letter-spacing: 0.3px;
    flex-shrink: 0;
  }
</style>
