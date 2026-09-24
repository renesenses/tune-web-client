<script lang="ts">
  import * as api from '../../lib/api';
  import { tip } from '../../lib/tooltip';
  import type { Track, StreamingTrackInfo } from '../../lib/types';
  import { t } from '../../lib/i18n';
  import { serviceDePlaylist } from '../../lib/playlistService';
  import { estPisteLocale, rangeableEnPlaylist } from '../../lib/pisteFile';

  interface Props {
    track: Track;
    onClose: () => void;
  }
  let { track, onClose }: Props = $props();

  /**
   * OÙ PEUT ALLER CETTE PISTE — #1268, puis #4889.
   *
   * #1268 (19/09/2026) : une piste de SERVICE n'allait que dans une playlist
   * DE SON SERVICE, parce qu'une playlist Tune ne pouvait pas la porter
   * (tune-server-rust#1848).
   *
   * 🔄 #4889 (24/09/2026) : le serveur ENREGISTRE désormais un titre de
   * service dans une playlist Tune (`POST /playlists/{id}/tracks` avec
   * `streaming_tracks`). La fenêtre propose donc DEUX groupes, titrés :
   *
   *   - « Playlists Tune » — pour toute piste désignable
   *     (`rangeableEnPlaylist`), Bandcamp et YouTube compris ;
   *   - « Vos playlists <Service> » — en plus, quand le service sait écrire
   *     ses playlists (`serviceDePlaylist` : Qobuz, Tidal, Deezer, Spotify).
   *
   * Pour une piste de la bibliothèque, rien ne change : les playlists Tune,
   * sans titre de groupe.
   */
  const service = $derived(serviceDePlaylist(track));
  const deService = $derived(!estPisteLocale(track));
  const versTune = $derived(rangeableEnPlaylist(track));
  const nomService = $derived(service ? service.charAt(0).toUpperCase() + service.slice(1) : '');

  /** Une destination : chez Tune (`cle` = id numérique) ou chez le service (`cle` = son `source_id`). */
  type Ou = 'tune' | 'service';
  interface Cible { ou: Ou; cle: string; nom: string; n: number }

  let ciblesTune = $state<Cible[]>([]);
  let ciblesService = $state<Cible[]>([]);
  let loading = $state(true);
  /** `${ou}:${cle}` de la destination en cours d'écriture. */
  let adding = $state<string | null>(null);
  let showCreate = $state(false);
  let newName = $state('');
  /** Où créer une nouvelle playlist : chez Tune par défaut. */
  let ouCreer = $state<Ou>('tune');
  let success = $state<string | null>(null);
  /** Un échec d'écriture se DIT, et dit OÙ : le service peut refuser (playlist
   *  suivie, pas possédée) ; Tune peut refuser un titre incomplet (422). */
  let echec = $state<Ou | null>(null);

  const cleDe = (c: Cible) => `${c.ou}:${c.cle}`;

  /**
   * Les deux listes se chargent INDÉPENDAMMENT : un service qui ne répond pas
   * ne doit pas cacher les playlists Tune, ni l'inverse.
   */
  async function loadPlaylists() {
    loading = true;
    const [tune, svc] = await Promise.all([
      versTune
        ? api.getPlaylists()
            .then((l) => (l ?? []).filter((p) => p.id != null)
              .map((p): Cible => ({ ou: 'tune', cle: String(p.id), nom: p.name, n: p.track_count ?? 0 })))
            .catch((e) => { console.error('Load playlists error:', e); return [] as Cible[]; })
        : Promise.resolve([] as Cible[]),
      service
        ? api.getStreamingPlaylists(service)
            .then((l) => (l ?? []).map((p): Cible => ({ ou: 'service', cle: String(p.source_id), nom: p.name, n: p.track_count ?? 0 })))
            .catch((e) => { console.error('Load service playlists error:', e); return [] as Cible[]; })
        : Promise.resolve([] as Cible[]),
    ]);
    ciblesTune = tune;
    ciblesService = svc;
    loading = false;
  }

  /**
   * 🔴 La BIBLIOTHÈQUE se reconnaît par `estPisteLocale`, jamais par
   * `source === 'local'`.
   *
   * Une piste déposée par un serveur UPnP intégré (#4201) porte
   * `source: 'upnp'` — sa PROVENANCE — et un `id` de bibliothèque bien réel.
   * Le test par chaîne l'envoyait donc dans la branche « service » :
   * `{ track_ids: [], streaming_tracks: [{ source: 'upnp', source_id:
   * '<udn>|<hash>' }] }`. Le serveur refuse cette forme par un 422
   * (`tune-server/src/routes/playlists.rs`, `add_tracks` : une ligne de
   * playlist locale ne peut porter qu'un `tracks.id`) — une piste UPnP
   * n'entrait dans AUCUNE playlist par cette fenêtre.
   *
   * `estPisteLocale` est le prédicat partagé (`lib/pisteFile.ts`), celui-là
   * même dont `serviceDePlaylist` se sert déjà en amont pour décider quelles
   * playlists lister : les deux décisions de cette fenêtre parlent enfin de la
   * même règle.
   */
  function buildAddArgs(): { trackIds: number[]; streamingTracks: StreamingTrackInfo[] | undefined } {
    if (estPisteLocale(track)) {
      return { trackIds: [track.id!], streamingTracks: undefined };
    }
    // Streaming track — send as streaming_tracks
    const st: StreamingTrackInfo = {
      source: track.source!,
      source_id: track.source_id!,
      title: track.title,
      artist_name: track.artist_name,
      album_title: track.album_title,
      duration_ms: track.duration_ms,
      format: track.format,
      sample_rate: track.sample_rate,
      bit_depth: track.bit_depth,
      channels: track.channels,
      cover_path: track.cover_path,
      // #4889 — l'album CHEZ LE SERVICE, pour rouvrir l'album depuis la
      // playlist. Une piste de service porte son id d'album dans `album_id`
      // (chaîne à l'exécution) ou dans `album_id_service` (Historique).
      album_id: track.album_id_service ?? (track.album_id != null ? String(track.album_id) : null),
    };
    return { trackIds: [], streamingTracks: [st] };
  }

  /** Écrit la piste dans la destination — chez le service, ou chez Tune. */
  async function ecrire(ou: Ou, cle: string) {
    if (ou === 'service' && service) {
      await api.addStreamingPlaylistTracks(service, cle, [String(track.source_id)]);
    } else {
      const { trackIds, streamingTracks } = buildAddArgs();
      await api.addPlaylistTracks(Number(cle), trackIds, undefined, streamingTracks);
    }
  }

  async function addToPlaylist(c: Cible) {
    adding = cleDe(c);
    echec = null;
    try {
      await ecrire(c.ou, c.cle);
      success = c.nom;
      setTimeout(() => onClose(), 800);
    } catch (e) {
      console.error('Add to playlist error:', e);
      adding = null;
      echec = c.ou;
    }
  }

  async function createAndAdd() {
    if (!newName.trim()) return;
    const ou: Ou = ouCreer === 'service' && service ? 'service' : 'tune';
    echec = null;
    try {
      const nom = newName.trim();
      const cle = ou === 'service'
        ? (await api.createStreamingPlaylist(service!, nom)).id
        : (await api.createPlaylist(nom)).id;
      if (cle != null && String(cle) !== '') {
        await ecrire(ou, String(cle));
        success = nom;
        setTimeout(() => onClose(), 800);
      }
    } catch (e) {
      console.error('Create playlist error:', e);
      echec = ou;
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  $effect(() => {
    loadPlaylists();
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdropClick} onkeydown={handleKeydown}>
  <div class="modal">
    {#if success}
      <div class="success-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><polyline points="20 6 9 17 4 12" /></svg>
        <p>{@html $t('playlist.addedTo').replace('{name}', success)}</p>
      </div>
    {:else}
      <div class="modal-header">
        <h3>{$t('playlist.addToPlaylist')}</h3>
        <button class="close-btn" onclick={onClose} use:tip={'common.close'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <div class="modal-body">
        {#if loading}
          <div class="loading"><div class="spinner"></div></div>
        {:else}
          <!-- #4889 — deux groupes pour une piste de SERVICE : Tune, puis son
               service s'il sait écrire. Une piste de la bibliothèque n'a que
               le premier, sans titre : rien ne change pour elle. -->
          <div class="playlist-list">
            {#if versTune}
              {#if deService}<h4 class="pl-groupe" data-groupe="tune">{$t('playlist.groupTune')}</h4>{/if}
              {#each ciblesTune as pl (cleDe(pl))}
                {@render option(pl)}
              {/each}
              {#if ciblesTune.length === 0}
                <p class="empty-hint">{$t('playlist.noExisting')}</p>
              {/if}
            {/if}
            {#if service}
              <h4 class="pl-groupe" data-groupe="service">{$t('playlist.servicePlaylistsOf').replace('{service}', nomService)}</h4>
              {#each ciblesService as pl (cleDe(pl))}
                {@render option(pl)}
              {/each}
              {#if ciblesService.length === 0}
                <p class="empty-hint">{$t('playlist.noExisting')}</p>
              {/if}
            {/if}
          </div>

          {#if echec === 'service'}
            <p class="empty-hint echec" role="alert">{$t('playlist.addFailed')}</p>
          {:else if echec === 'tune'}
            <p class="empty-hint echec" role="alert">{$t('v2.ms.addFailed' as any)}</p>
          {/if}
        {/if}
      </div>

      {#snippet option(pl: Cible)}
        <button
          class="playlist-option"
          data-ou={pl.ou}
          disabled={adding !== null}
          onclick={() => addToPlaylist(pl)}
        >
          <div class="pl-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><path d="M9 18V5l12-2v13M9 18c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
          </div>
          <div class="pl-info">
            <span class="pl-name">{pl.nom}</span>
            <span class="pl-count">{pl.n} {$t('common.tracks')}</span>
          </div>
          {#if adding === cleDe(pl)}
            <div class="spinner small"></div>
          {/if}
        </button>
      {/snippet}

      <div class="modal-footer">
        {#if showCreate}
          <!-- #4889 — créer OÙ : chez Tune par défaut, chez le service s'il
               sait écrire. Sans service, pas de choix à faire. -->
          {#if service && versTune}
            <div class="create-ou" role="radiogroup" aria-label={$t('playlist.createIn')}>
              <span>{$t('playlist.createIn')}</span>
              <button type="button" role="radio" aria-checked={ouCreer === 'tune'} class:on={ouCreer === 'tune'}
                onclick={() => (ouCreer = 'tune')}>Tune</button>
              <button type="button" role="radio" aria-checked={ouCreer === 'service'} class:on={ouCreer === 'service'}
                onclick={() => (ouCreer = 'service')}>{nomService}</button>
            </div>
          {/if}
          <div class="create-row">
            <input
              type="text"
              placeholder={$t('playlist.namePlaceholder')}
              bind:value={newName}
              onkeydown={(e) => e.key === 'Enter' && createAndAdd()}
            />
            <button class="create-confirm" onclick={createAndAdd} disabled={!newName.trim()}>{$t('common.create')}</button>
            <button class="create-cancel" onclick={() => { showCreate = false; newName = ''; }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        {:else}
          <button class="new-playlist-btn" onclick={() => showCreate = true}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            {$t('playlist.newPlaylist')}
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    width: 360px;
    max-height: 480px;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.2s ease-out;
    overflow: hidden;
  }

  @keyframes slideUp {
    from { transform: translateY(16px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--tune-border);
  }

  .modal-header h3 {
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
  }

  .close-btn:hover {
    color: var(--tune-text);
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .playlist-list {
    display: flex;
    flex-direction: column;
  }

  .playlist-option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s;
    width: 100%;
  }

  .playlist-option:hover:not(:disabled) {
    background: var(--tune-surface-hover);
  }

  .playlist-option:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .pl-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tune-grey2);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    color: var(--tune-text-muted);
  }

  .pl-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .pl-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
  }

  .pl-count {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .empty-hint {
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 13px;
    text-align: center;
    padding: 16px;
  }
  .empty-hint.echec {
    color: var(--tune-error, #e5484d);
    padding-top: 0;
  }
  .pl-groupe {
    margin: 8px 20px 4px;
    color: var(--tune-text-muted);
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .pl-groupe + .empty-hint {
    padding: 4px 20px 8px;
    text-align: left;
  }
  .create-ou {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }
  .create-ou button {
    padding: 3px 10px;
    background: none;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    color: var(--tune-text-secondary);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 12px;
  }
  .create-ou button.on {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .modal-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--tune-border);
  }

  .new-playlist-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    background: none;
    border: 1px dashed var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text-secondary);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s;
  }

  .new-playlist-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .create-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .create-row input {
    flex: 1;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 6px 10px;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    outline: none;
  }

  .create-row input:focus {
    border-color: var(--tune-accent);
  }

  .create-confirm {
    padding: 6px 12px;
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }

  .create-confirm:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .create-cancel {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
  }

  .success-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 40px 20px;
    color: var(--tune-success, #4ade80);
  }

  .success-state p {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text);
  }

  .loading {
    display: flex;
    justify-content: center;
    padding: 24px;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner.small {
    width: 14px;
    height: 14px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
