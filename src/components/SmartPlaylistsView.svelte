<script lang="ts">
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import * as api from '../lib/api';
  import { formatTime, formatAudioBadge } from '../lib/utils';
  import type { Track } from '../lib/types';
  import { t as tr } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import AlbumArt from './AlbumArt.svelte';

  let zone = $derived($currentZone);

  interface SmartPlaylist {
    id: number;
    name: string;
    description: string | null;
    rules: string;
    match_mode: string;
    sort_by: string;
    sort_order: string;
    max_tracks: number;
  }

  interface Rule {
    field: string;
    operator: string;
    value: string;
  }

  let smartPlaylists: SmartPlaylist[] = $state([]);
  let selectedSp: SmartPlaylist | null = $state(null);
  let spTracks: Track[] = $state([]);
  let loading = $state(false);
  let showCreate = $state(false);

  // Create form
  let newName = $state('');
  let newDescription = $state('');
  let newMatchMode = $state('all');
  let newSortBy = $state('title');
  let newSortOrder = $state('asc');
  let newMaxTracks = $state(200);
  let newRules: Rule[] = $state([{ field: 'genre', operator: 'contains', value: '' }]);

  const FIELDS = [
    { value: 'title', label: 'Titre' },
    { value: 'artist', label: 'Artiste' },
    { value: 'album', label: 'Album' },
    { value: 'genre', label: 'Genre' },
    { value: 'year', label: 'Annee' },
    { value: 'format', label: 'Format' },
    { value: 'sample_rate', label: 'Freq. (Hz)' },
    { value: 'bit_depth', label: 'Bits' },
    { value: 'source', label: 'Source' },
    { value: 'composer', label: 'Compositeur' },
  ];

  const OPERATORS = [
    { value: 'contains', label: 'contient' },
    { value: 'equals', label: '=' },
    { value: 'not_equals', label: '!=' },
    { value: 'starts_with', label: 'commence par' },
    { value: 'greater_than', label: '>' },
    { value: 'less_than', label: '<' },
  ];

  const SORT_OPTIONS = [
    { value: 'title', label: 'Titre' },
    { value: 'artist', label: 'Artiste' },
    { value: 'album', label: 'Album' },
    { value: 'year', label: 'Annee' },
    { value: 'duration', label: 'Duree' },
    { value: 'random', label: 'Aleatoire' },
  ];

  async function loadSmartPlaylists() {
    try {
      smartPlaylists = await api.getSmartPlaylists();
    } catch (e) {
      console.error('Load smart playlists error:', e);
    }
  }

  async function selectSp(sp: SmartPlaylist) {
    selectedSp = sp;
    loading = true;
    try {
      spTracks = await api.getSmartPlaylistTracks(sp.id);
    } catch (e) {
      console.error('Load smart playlist tracks error:', e);
      spTracks = [];
    }
    loading = false;
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const result = await api.createSmartPlaylist({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        rules: newRules.filter(r => r.value.trim()),
        match_mode: newMatchMode,
        sort_by: newSortBy,
        sort_order: newSortOrder,
        max_tracks: newMaxTracks,
      });
      notifications.success(`Smart playlist "${newName}" creee`);
      showCreate = false;
      newName = '';
      newDescription = '';
      newRules = [{ field: 'genre', operator: 'contains', value: '' }];
      await loadSmartPlaylists();
      // Auto-select the new one
      const created = smartPlaylists.find(sp => sp.id === result.id);
      if (created) selectSp(created);
    } catch (e: any) {
      notifications.error(e?.message || 'Erreur');
    }
  }

  async function handleDelete(sp: SmartPlaylist) {
    try {
      await api.deleteSmartPlaylist(sp.id);
      smartPlaylists = smartPlaylists.filter(s => s.id !== sp.id);
      if (selectedSp?.id === sp.id) {
        selectedSp = null;
        spTracks = [];
      }
      notifications.success(`"${sp.name}" supprimee`);
    } catch (e: any) {
      notifications.error(e?.message || 'Erreur');
    }
  }

  async function playAll() {
    if (!zone?.id || spTracks.length === 0) return;
    const ids = spTracks.map(t => t.id).filter(Boolean) as number[];
    if (ids.length > 0) {
      await playAndSync(zone.id, { track_ids: ids });
    }
  }

  async function playTrack(trackId: number) {
    if (!zone?.id) return;
    await playAndSync(zone.id, { track_id: trackId });
  }

  function addRule() {
    newRules = [...newRules, { field: 'genre', operator: 'contains', value: '' }];
  }

  function removeRule(index: number) {
    newRules = newRules.filter((_, i) => i !== index);
  }

  function parseRules(sp: SmartPlaylist): Rule[] {
    try { return JSON.parse(sp.rules || '[]'); } catch { return []; }
  }

  $effect(() => { loadSmartPlaylists(); });
</script>

<div class="sp-view">
  {#if selectedSp}
    <!-- Detail view -->
    <div class="sp-header">
      <button class="back-btn" onclick={() => { selectedSp = null; spTracks = []; }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        {$tr('common.back')}
      </button>
    </div>

    <div class="sp-detail">
      <div class="sp-detail-header">
        <div class="sp-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
        </div>
        <div class="sp-detail-info">
          <h2>{selectedSp.name}</h2>
          {#if selectedSp.description}<p class="sp-desc">{selectedSp.description}</p>{/if}
          <p class="sp-meta">{spTracks.length} pistes</p>
          <div class="sp-rules-display">
            {#each parseRules(selectedSp) as rule}
              <span class="sp-rule-chip">{rule.field} {rule.operator} "{rule.value}"</span>
            {/each}
          </div>
        </div>
      </div>

      <button class="play-all-btn" onclick={playAll} disabled={spTracks.length === 0}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z" /></svg>
        Lire tout ({spTracks.length})
      </button>

      {#if loading}
        <div class="loading"><div class="spinner"></div></div>
      {:else}
        <div class="sp-tracks">
          {#each spTracks as t, i}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="sp-track-row" onclick={() => t.id && playTrack(t.id)}>
              <span class="sp-track-num">{i + 1}</span>
              <div class="sp-track-art"><AlbumArt coverPath={t.cover_path} size={40} alt={t.title} /></div>
              <div class="sp-track-info">
                <span class="sp-track-title truncate">{t.title}</span>
                <span class="sp-track-artist truncate">{t.artist_name ?? ''}</span>
              </div>
              {#if t.format}<span class="audio-format">{formatAudioBadge(t)}</span>{/if}
              <span class="sp-track-duration">{formatTime(t.duration_ms)}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  {:else}
    <!-- List view -->
    <div class="sp-list-header">
      <h2>Smart Playlists</h2>
      <button class="create-btn" onclick={() => showCreate = !showCreate}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        Creer
      </button>
    </div>

    {#if showCreate}
      <div class="sp-create-form">
        <input type="text" placeholder="Nom" bind:value={newName} class="sp-input" />
        <input type="text" placeholder="Description (optionnel)" bind:value={newDescription} class="sp-input" />

        <div class="sp-rules-builder">
          <h4>Regles</h4>
          {#each newRules as rule, i}
            <div class="sp-rule-row">
              <select bind:value={rule.field} class="sp-select">
                {#each FIELDS as f}<option value={f.value}>{f.label}</option>{/each}
              </select>
              <select bind:value={rule.operator} class="sp-select">
                {#each OPERATORS as op}<option value={op.value}>{op.label}</option>{/each}
              </select>
              <input type="text" placeholder="Valeur" bind:value={rule.value} class="sp-input sp-input-sm" />
              <button class="sp-remove-rule" onclick={() => removeRule(i)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          {/each}
          <button class="sp-add-rule" onclick={addRule}>+ Ajouter une regle</button>
        </div>

        <div class="sp-options">
          <label>
            Correspondance :
            <select bind:value={newMatchMode} class="sp-select">
              <option value="all">Toutes (ET)</option>
              <option value="any">Au moins une (OU)</option>
            </select>
          </label>
          <label>
            Tri :
            <select bind:value={newSortBy} class="sp-select">
              {#each SORT_OPTIONS as s}<option value={s.value}>{s.label}</option>{/each}
            </select>
          </label>
          <label>
            Ordre :
            <select bind:value={newSortOrder} class="sp-select">
              <option value="asc">Croissant</option>
              <option value="desc">Decroissant</option>
            </select>
          </label>
          <label>
            Max :
            <input type="number" bind:value={newMaxTracks} min="1" max="1000" class="sp-input sp-input-num" />
          </label>
        </div>

        <div class="sp-form-actions">
          <button class="play-all-btn" onclick={handleCreate} disabled={!newName.trim()}>Creer</button>
          <button class="cancel-btn" onclick={() => showCreate = false}>Annuler</button>
        </div>
      </div>
    {/if}

    <div class="sp-list">
      {#each smartPlaylists as sp}
        <div class="sp-card">
          <button class="sp-card-main" onclick={() => selectSp(sp)}>
            <div class="sp-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
            </div>
            <div class="sp-card-info">
              <span class="sp-card-name">{sp.name}</span>
              {#if sp.description}<span class="sp-card-desc">{sp.description}</span>{/if}
              <div class="sp-card-rules">
                {#each parseRules(sp) as rule}
                  <span class="sp-rule-mini">{rule.field}: {rule.value}</span>
                {/each}
              </div>
            </div>
          </button>
          <button class="sp-delete-btn" onclick={() => handleDelete(sp)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </button>
        </div>
      {/each}
      {#if smartPlaylists.length === 0 && !showCreate}
        <p class="sp-empty">Aucune smart playlist. Cliquez "Creer" pour commencer.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .sp-view { padding: var(--space-lg) 28px; overflow-y: auto; height: 100%; }
  .sp-list-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-lg); }
  .sp-list-header h2 { font-family: var(--font-display); font-size: 28px; font-weight: 600; color: var(--tune-text); margin: 0; }
  .create-btn { display: flex; align-items: center; gap: var(--space-xs); padding: var(--space-sm) var(--space-md); background: var(--tune-accent); color: white; border: none; border-radius: var(--radius-md); cursor: pointer; font-family: var(--font-label); font-size: 13px; font-weight: 600; transition: opacity 0.12s; }
  .create-btn:hover { opacity: 0.85; }

  /* Create form */
  .sp-create-form { background: var(--tune-surface); border: 1px solid var(--tune-border); border-radius: var(--radius-lg); padding: var(--space-lg); margin-bottom: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-md); }
  .sp-input { background: var(--tune-bg); border: 1px solid var(--tune-border); border-radius: var(--radius-md); padding: var(--space-sm) var(--space-md); color: var(--tune-text); font-family: var(--font-body); font-size: 14px; outline: none; }
  .sp-input:focus { border-color: var(--tune-accent); }
  .sp-input-sm { flex: 1; min-width: 100px; }
  .sp-input-num { width: 80px; }
  .sp-select { background: var(--tune-bg); border: 1px solid var(--tune-border); border-radius: var(--radius-md); padding: var(--space-xs) var(--space-sm); color: var(--tune-text); font-family: var(--font-body); font-size: 13px; outline: none; }
  .sp-rules-builder h4 { font-family: var(--font-label); font-size: 12px; font-weight: 600; color: var(--tune-text-secondary); margin: 0; }
  .sp-rule-row { display: flex; align-items: center; gap: var(--space-sm); margin-top: var(--space-xs); }
  .sp-remove-rule { background: none; border: none; color: var(--tune-text-muted); cursor: pointer; padding: 2px; }
  .sp-remove-rule:hover { color: #ef4444; }
  .sp-add-rule { background: none; border: none; color: var(--tune-accent); cursor: pointer; font-family: var(--font-body); font-size: 13px; padding: var(--space-xs) 0; }
  .sp-options { display: flex; flex-wrap: wrap; gap: var(--space-md); }
  .sp-options label { display: flex; align-items: center; gap: var(--space-xs); font-family: var(--font-body); font-size: 13px; color: var(--tune-text-secondary); }
  .sp-form-actions { display: flex; gap: var(--space-sm); }
  .cancel-btn { background: none; border: 1px solid var(--tune-border); border-radius: var(--radius-md); padding: var(--space-sm) var(--space-md); color: var(--tune-text-secondary); cursor: pointer; font-family: var(--font-label); font-size: 13px; }

  /* List */
  .sp-list { display: flex; flex-direction: column; gap: var(--space-sm); }
  .sp-card { display: flex; align-items: center; background: var(--tune-surface); border: 1px solid var(--tune-border); border-radius: var(--radius-lg); transition: all 0.12s; }
  .sp-card:hover { border-color: var(--tune-accent); }
  .sp-card-main { flex: 1; display: flex; align-items: center; gap: var(--space-md); padding: var(--space-md); background: none; border: none; cursor: pointer; color: var(--tune-text); text-align: left; }
  .sp-card-icon { color: var(--tune-accent); flex-shrink: 0; }
  .sp-card-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .sp-card-name { font-family: var(--font-body); font-size: 14px; font-weight: 600; }
  .sp-card-desc { font-family: var(--font-body); font-size: 12px; color: var(--tune-text-secondary); }
  .sp-card-rules { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
  .sp-rule-mini { font-size: 10px; padding: 1px 6px; border-radius: 8px; background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.08); color: var(--tune-text-muted); }
  .sp-delete-btn { background: none; border: none; color: var(--tune-text-muted); cursor: pointer; padding: var(--space-md); }
  .sp-delete-btn:hover { color: #ef4444; }
  .sp-empty { font-family: var(--font-body); font-size: 14px; color: var(--tune-text-muted); text-align: center; padding: var(--space-2xl); }

  /* Detail */
  .sp-header { margin-bottom: var(--space-md); }
  .back-btn { display: flex; align-items: center; gap: var(--space-xs); background: none; border: none; color: var(--tune-text-secondary); cursor: pointer; font-family: var(--font-body); font-size: 13px; padding: 0; }
  .back-btn:hover { color: var(--tune-accent); }
  .sp-detail-header { display: flex; align-items: flex-start; gap: var(--space-lg); margin-bottom: var(--space-md); }
  .sp-icon { color: var(--tune-accent); padding: var(--space-md); background: var(--tune-surface); border-radius: var(--radius-lg); }
  .sp-detail-info h2 { font-family: var(--font-display); font-size: 24px; font-weight: 600; color: var(--tune-text); margin: 0; }
  .sp-desc { font-family: var(--font-body); font-size: 13px; color: var(--tune-text-secondary); margin: 2px 0; }
  .sp-meta { font-family: var(--font-body); font-size: 12px; color: var(--tune-text-muted); margin: 0; }
  .sp-rules-display { display: flex; flex-wrap: wrap; gap: 4px; margin-top: var(--space-xs); }
  .sp-rule-chip { font-family: var(--font-body); font-size: 11px; padding: 2px 8px; border-radius: 10px; background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.1); color: var(--tune-accent); }
  .play-all-btn { display: flex; align-items: center; gap: var(--space-xs); padding: var(--space-sm) var(--space-lg); background: var(--tune-accent); color: white; border: none; border-radius: var(--radius-md); cursor: pointer; font-family: var(--font-label); font-size: 13px; font-weight: 600; margin-bottom: var(--space-md); }
  .play-all-btn:disabled { opacity: 0.5; cursor: default; }

  /* Tracks list */
  .sp-tracks { display: flex; flex-direction: column; }
  .sp-track-row { display: flex; align-items: center; gap: var(--space-md); padding: 8px 0; cursor: pointer; transition: background 0.12s; border-radius: var(--radius-sm); }
  .sp-track-row:hover { background: var(--tune-surface-hover); }
  .sp-track-num { font-family: var(--font-label); font-size: 13px; color: var(--tune-text-muted); min-width: 28px; text-align: right; }
  .sp-track-art { flex-shrink: 0; }
  .sp-track-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .sp-track-title { font-family: var(--font-body); font-size: 14px; font-weight: 600; color: var(--tune-text); }
  .sp-track-artist { font-family: var(--font-body); font-size: 12px; color: var(--tune-text-secondary); }
  .sp-track-duration { font-family: var(--font-label); font-size: 12px; color: var(--tune-text-muted); }
  .audio-format { font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 8px; background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.1); color: var(--tune-accent); }
  .loading { display: flex; justify-content: center; padding: var(--space-xl); }
</style>
