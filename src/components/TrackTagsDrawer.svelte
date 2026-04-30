<script lang="ts">
  import * as api from '../lib/api';
  import type { TrackAllTags } from '../lib/api';
  import { notifications } from '../lib/stores/notifications';

  interface Props {
    trackId: number;
    onClose: () => void;
  }
  let { trackId, onClose }: Props = $props();

  let data = $state<TrackAllTags | null>(null);
  let loading = $state(true);
  let saving = $state(false);

  // DB-level edits — only canonical fields the route accepts.
  let dbEdits = $state<Record<string, any>>({});
  let originalDb = $state<Record<string, any>>({});

  async function load() {
    loading = true;
    try {
      data = await api.getTrackAllTags(trackId);
      originalDb = { ...(data.db_fields ?? {}) };
      dbEdits = { ...originalDb };
    } catch (e: any) {
      notifications.error(`Erreur chargement : ${e?.message || e}`);
    }
    loading = false;
  }

  // Fields the PUT /tracks/{id} route accepts (writable).
  const WRITABLE_DB = new Set([
    'title', 'artist_id', 'album_id', 'track_number', 'disc_number',
    'composer', 'genre', 'year', 'bpm', 'label', 'comment',
    'custom_tags',
  ]);

  let dirtyFields = $derived.by(() => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(dbEdits)) {
      if (!WRITABLE_DB.has(k)) continue;
      if (v !== originalDb[k] && !(v == null && originalDb[k] == null)) {
        out[k] = v === '' ? null : v;
      }
    }
    return out;
  });

  async function save() {
    if (Object.keys(dirtyFields).length === 0) return;
    saving = true;
    try {
      await api.updateTrackMetadata(trackId, dirtyFields);
      notifications.success(`Piste mise à jour (${Object.keys(dirtyFields).length} champs).`);
      // Refresh
      await load();
    } catch (e: any) {
      notifications.error(`Erreur sauvegarde : ${e?.message || e}`);
    }
    saving = false;
  }

  async function writeTagsToFile() {
    saving = true;
    try {
      const r = await api.writeTrackTags(trackId);
      notifications.success(`Tags gravés dans le fichier${r?.message ? ' : ' + r.message : ''}.`);
    } catch (e: any) {
      notifications.error(`Erreur gravure : ${e?.message || e}`);
    }
    saving = false;
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  $effect(() => { load(); });

  // Group DB fields for nicer rendering: Identification / Classique / Audio / Système.
  const FIELD_GROUPS: Record<string, string[]> = {
    'Identification': ['title', 'artist_name', 'album_title', 'track_number', 'disc_number'],
    'Classique / crédits': ['composer', 'genre', 'year', 'label', 'comment', 'custom_tags', 'bpm'],
    'Audio': ['format', 'sample_rate', 'bit_depth', 'channels', 'duration_ms', 'file_path'],
    'Système': ['id', 'album_id', 'artist_id', 'source', 'source_id', 'audio_hash',
                'mtime', 'created_at', 'updated_at',
                'mb_recording_id', 'acoustid', 'waveform_data', 'waveform_generated_at',
                'cover_path'],
  };

  function visibleDbFields(group: string): string[] {
    if (!data?.db_fields) return [];
    return FIELD_GROUPS[group].filter(k => k in data!.db_fields);
  }

  function isWritable(field: string): boolean {
    return WRITABLE_DB.has(field);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdropClick} onkeydown={handleKeydown}>
  <div class="drawer">
    <div class="drawer-header">
      <h3>Tous les champs piste</h3>
      <button class="close-btn" onclick={onClose} title="Fermer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>

    {#if loading}
      <div class="state">Chargement…</div>
    {:else if !data}
      <div class="state err">Erreur de chargement</div>
    {:else}
      <div class="drawer-body">
        <!-- DB fields, grouped -->
        {#each Object.keys(FIELD_GROUPS) as group}
          {@const fields = visibleDbFields(group)}
          {#if fields.length > 0}
            <div class="group">
              <h4>{group}</h4>
              <div class="kv">
                {#each fields as field}
                  <div class="row">
                    <span class="key">{field}</span>
                    {#if isWritable(field) && (field === 'comment' || field === 'custom_tags')}
                      <textarea class="val val-text" bind:value={dbEdits[field]} rows="2"></textarea>
                    {:else if isWritable(field) && (field === 'year' || field === 'bpm' || field === 'track_number' || field === 'disc_number')}
                      <input type="number" class="val val-num" bind:value={dbEdits[field]} />
                    {:else if isWritable(field)}
                      <input type="text" class="val" bind:value={dbEdits[field]} />
                    {:else}
                      <span class="val val-readonly">{data.db_fields[field] ?? '—'}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        {/each}

        <!-- Track credits -->
        {#if data.db_credits?.length}
          <div class="group">
            <h4>Crédits piste ({data.db_credits.length})</h4>
            <div class="kv">
              {#each data.db_credits as c}
                <div class="row">
                  <span class="key">{c.role ?? 'performer'}{c.instrument ? ` (${c.instrument})` : ''}</span>
                  <span class="val val-readonly">{c.artist_name ?? '?'}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Audio info -->
        {#if Object.keys(data.audio_info ?? {}).length}
          <div class="group">
            <h4>Audio info (depuis le fichier)</h4>
            <div class="kv">
              {#each Object.entries(data.audio_info) as [k, v]}
                <div class="row">
                  <span class="key">{k}</span>
                  <span class="val val-readonly">{v}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Raw file tags -->
        <div class="group">
          <h4>
            Tags bruts du fichier ({Object.keys(data.file_tags ?? {}).length})
            {#if !data.file_exists}<span class="badge-warn">Fichier absent</span>{/if}
          </h4>
          {#if Object.keys(data.file_tags ?? {}).length === 0}
            <div class="state-small">Aucun tag lisible dans le fichier (ou pas de tags).</div>
          {:else}
            <div class="kv">
              {#each Object.entries(data.file_tags) as [k, vals]}
                <div class="row">
                  <span class="key key-tag">{k}</span>
                  <span class="val val-readonly">{vals.join(' / ')}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <div class="drawer-footer">
        <button class="btn-cancel" onclick={onClose}>Fermer</button>
        <button class="btn-write-tags" onclick={writeTagsToFile} disabled={saving}>Graver tags</button>
        <button class="btn-save" onclick={save} disabled={saving || Object.keys(dirtyFields).length === 0}>
          {saving ? 'Enregistre…' : `Enregistrer${Object.keys(dirtyFields).length ? ` (${Object.keys(dirtyFields).length})` : ''}`}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex; justify-content: flex-end;
    z-index: 220;
    animation: fade 0.15s ease-out;
  }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }

  .drawer {
    background: var(--tune-surface);
    border-left: 1px solid var(--tune-border);
    width: 480px; max-width: 96vw; height: 100vh;
    display: flex; flex-direction: column;
    animation: slideR 0.22s cubic-bezier(0.2, 0.7, 0.2, 1);
    box-shadow: -8px 0 32px rgba(0, 0, 0, 0.25);
  }
  @keyframes slideR { from { transform: translateX(100%); } to { transform: translateX(0); } }

  .drawer-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--tune-border);
  }
  .drawer-header h3 { font-size: 16px; font-weight: 600; margin: 0; }
  .close-btn {
    background: none; border: none; color: var(--tune-text-muted);
    cursor: pointer; padding: 4px; display: inline-flex;
  }
  .close-btn:hover { color: var(--tune-text); }

  .drawer-body {
    flex: 1; overflow-y: auto; padding: 12px 20px 16px;
    display: flex; flex-direction: column; gap: 18px;
  }

  .group h4 {
    margin: 0 0 6px;
    font-family: var(--font-label);
    font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--tune-text-muted);
    display: flex; align-items: center; gap: 8px;
  }
  .badge-warn {
    background: rgba(220,38,38,0.15);
    color: #f87171; padding: 1px 6px;
    border-radius: 6px; font-size: 9px;
    text-transform: none; letter-spacing: 0;
  }

  .kv { display: flex; flex-direction: column; gap: 4px; }
  .row {
    display: grid; grid-template-columns: 140px 1fr;
    align-items: center; gap: 8px;
    padding: 4px 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  .key {
    font-family: var(--font-label);
    font-size: 11px; color: var(--tune-text-muted);
    text-overflow: ellipsis; overflow: hidden; white-space: nowrap;
  }
  .key-tag {
    font-family: monospace; font-size: 10px;
    color: var(--tune-accent);
  }
  .val {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: 6px;
    padding: 4px 8px;
    color: var(--tune-text);
    font-size: 12px;
    min-width: 0;
  }
  .val:focus { border-color: var(--tune-accent); outline: none; }
  .val-text { resize: vertical; min-height: 32px; font-family: inherit; }
  .val-num { width: 100px; }
  .val-readonly {
    background: transparent;
    border: none;
    padding: 4px 0;
    color: var(--tune-text);
    word-break: break-word;
  }

  .drawer-footer {
    display: flex; gap: 8px; padding: 12px 20px;
    border-top: 1px solid var(--tune-border);
  }
  .btn-cancel, .btn-save, .btn-write-tags {
    padding: 8px 14px;
    border-radius: 6px;
    font-family: var(--font-label);
    font-size: 12px; font-weight: 600;
    cursor: pointer;
  }
  .btn-cancel {
    background: transparent;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-muted);
  }
  .btn-write-tags {
    background: rgba(var(--tune-accent-rgb,99,102,241),0.15);
    border: 1px solid rgba(var(--tune-accent-rgb,99,102,241),0.3);
    color: var(--tune-accent);
  }
  .btn-save {
    background: var(--tune-accent);
    border: none;
    color: white;
    margin-left: auto;
  }
  .btn-save:disabled { opacity: 0.4; cursor: default; }

  .state, .state-small {
    padding: 12px;
    color: var(--tune-text-muted);
    font-size: 13px; text-align: center;
  }
  .state.err { color: #ef4444; }
</style>
