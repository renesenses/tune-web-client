<script lang="ts">
  import { playbackHistory, type HistoryEntry } from '../lib/stores/history';
  import { currentZone } from '../lib/stores/zones';
  import { formatTime, formatAudioBadge } from '../lib/utils';
  import { t } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import { tip } from '../lib/tooltip';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import MetadataChips from './MetadataChips.svelte';
  import { displayFields } from '../lib/stores/displayFields';
  // Fusion, déduplication et rejeu vivent dans `lib/historiqueLecture` depuis
  // le 05/09/2026 : le nouveau client a son propre écran d'historique, et deux
  // copies de ce rejeu à quatre chemins auraient divergé à la première
  // correction.
  import {
    entreesDepuisServeur,
    fusionnerHistorique,
    estRadioEnregistrable,
    rejouerEntree,
    cleFavoriRadio,
    chargerFavorisRadio,
    basculerFavoriRadio,
  } from '../lib/historiqueLecture';

  let playingIndex = $state<number | null>(null);
  let serverHistory = $state<HistoryEntry[]>([]);
  let radioFavKeys = $state(new Set<string>());
  let favBusyKey = $state<string | null>(null);

  let zone = $derived($currentZone);

  // Merge local + server history
  let mergedHistory = $derived(fusionnerHistorique($playbackHistory, serverHistory));

  // Load server history on mount
  $effect(() => {
    api.getPlaybackHistory(100).then(res => {
      serverHistory = entreesDepuisServeur(res?.items ?? []);
    }).catch((err) => { console.error('HistoryView: fetch error', err); });
    chargerFavorisRadio().then((s) => { radioFavKeys = s; });
  });

  const radioFavKey = cleFavoriRadio;

  const isSavableRadio = estRadioEnregistrable;

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
      const desormais = await basculerFavoriRadio(entry, radioFavKeys.has(key));
      const next = new Set(radioFavKeys);
      if (desormais) next.add(key); else next.delete(key);
      radioFavKeys = next;
      notifications.success($t(desormais ? 'history.radioFavAdded' : 'history.radioFavRemoved'));
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

  async function replay(entry: HistoryEntry, index: number) {
    if (!zone?.id) {
      notifications.error($t('queue.noZoneSelected'));
      return;
    }
    playingIndex = index;
    try {
      const fait = await rejouerEntree(zone.id, entry);
      notifications.success(`${fait.genre === 'radio' ? 'Radio' : 'Lecture'} : ${fait.libelle}`);
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
