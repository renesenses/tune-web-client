<script lang="ts">
  import * as api from '../lib/api';
  import type { SmartRule, SmartCollection } from '../lib/types';

  // Editor for one Smart Collection: name + rules + match_mode + sort.
  // Live preview count via POST /library/smart-collections/preview as
  // the user edits (debounced 300 ms).
  let { collection = null, onSave, onCancel } = $props<{
    collection?: SmartCollection | null;
    onSave: (created: SmartCollection) => void;
    onCancel: () => void;
  }>();

  let name = $state(collection?.name ?? '');
  let description = $state(collection?.description ?? '');
  let icon = $state(collection?.icon ?? 'folder');
  let color = $state(collection?.color ?? '#6366f1');
  let matchMode = $state<'all' | 'any'>(collection?.match_mode ?? 'all');
  let sortBy = $state(collection?.sort_by ?? 'added_at');
  let sortOrder = $state<'asc' | 'desc'>(collection?.sort_order ?? 'desc');
  let maxAlbums = $state(collection?.max_albums ?? 500);

  // Parse the JSON-encoded rules (server stores as text); fall back
  // to a single empty rule for the create flow.
  let rules = $state<SmartRule[]>(
    collection?.rules
      ? (() => {
          try { return JSON.parse(collection.rules); }
          catch { return []; }
        })()
      : [{ field: 'sample_rate', op: '>=', value: 96000 }]
  );

  let preview = $state<{ count: number; loading: boolean; error: string | null }>({
    count: 0, loading: false, error: null,
  });
  let saving = $state(false);

  // Field grammar mirrors tune_server.library.smart_collection field
  // whitelist. Keep this in sync with the server compiler.
  const FIELDS = [
    { value: 'sample_rate', label: 'Sample rate (Hz)', type: 'int' },
    { value: 'bit_depth',   label: 'Bit depth',         type: 'int' },
    { value: 'year',        label: 'Année',             type: 'int' },
    { value: 'track_count', label: 'Nb pistes',         type: 'int' },
    { value: 'format',      label: 'Format',            type: 'text' },
    { value: 'genre',       label: 'Genre',             type: 'text' },
    { value: 'label',       label: 'Label',             type: 'text' },
    { value: 'artist_name', label: 'Artiste',           type: 'text' },
    { value: 'title',       label: "Titre d'album",     type: 'text' },
    { value: 'source',      label: 'Source',            type: 'text' },
    { value: 'cover_path',  label: 'Pochette',          type: 'nullable' },
    { value: 'added_at',    label: 'Date d\'ajout',     type: 'timestamp' },
    { value: 'credit',      label: 'Crédit (engineer/performer/...)', type: 'credit' },
    { value: 'play_count',  label: 'Nb de lectures',    type: 'count' },
    { value: 'last_played_at', label: 'Dernière lecture', type: 'timestamp' },
  ];

  const OPS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
    int: [
      { value: '=', label: '=' }, { value: '!=', label: '≠' },
      { value: '>=', label: '≥' }, { value: '>', label: '>' },
      { value: '<=', label: '≤' }, { value: '<', label: '<' },
      { value: 'between', label: 'entre' },
    ],
    text: [
      { value: '=', label: '=' }, { value: '!=', label: '≠' },
      { value: 'contains', label: 'contient' },
      { value: 'starts_with', label: 'commence par' },
      { value: 'in', label: 'parmi' },
      { value: 'is_null', label: 'est vide' },
      { value: 'is_not_null', label: "n'est pas vide" },
    ],
    nullable: [
      { value: 'is_null', label: 'est vide' },
      { value: 'is_not_null', label: "n'est pas vide" },
    ],
    timestamp: [
      { value: '>', label: 'après' }, { value: '<', label: 'avant' },
      { value: 'between', label: 'entre' },
      { value: 'is_null', label: 'jamais' },
    ],
    credit: [{ value: 'has', label: 'contient' }],
    count: [
      { value: '>=', label: '≥' }, { value: '>', label: '>' },
      { value: '<', label: '<' }, { value: '=', label: '=' },
      { value: 'between', label: 'entre' },
    ],
  };

  function fieldType(field: string): string {
    return FIELDS.find(f => f.value === field)?.type ?? 'text';
  }

  function addRule() {
    rules = [...rules, { field: 'genre', op: 'contains', value: '' }];
  }
  function removeRule(idx: number) {
    rules = rules.filter((_, i) => i !== idx);
  }
  function updateRule(idx: number, patch: Partial<SmartRule>) {
    rules = rules.map((r, i) => i === idx ? { ...r, ...patch } : r);
  }

  // Debounced live preview.
  let previewTimer: any = null;
  $effect(() => {
    void rules; void matchMode;
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, 300);
  });

  async function refreshPreview() {
    preview = { ...preview, loading: true, error: null };
    try {
      const res = await api.previewSmartCollection({
        rules, match_mode: matchMode, max_albums: 1,
      });
      preview = { count: res.count, loading: false, error: null };
    } catch (e: any) {
      preview = { count: 0, loading: false, error: e?.message ?? 'preview failed' };
    }
  }

  async function save() {
    saving = true;
    try {
      const payload = {
        name: name.trim() || 'Smart Collection',
        description, icon, color,
        rules, match_mode: matchMode,
        sort_by: sortBy, sort_order: sortOrder,
        max_albums: maxAlbums,
      };
      let saved: SmartCollection;
      if (collection?.id) {
        saved = await api.updateSmartCollection(collection.id, payload);
      } else {
        saved = await api.createSmartCollection(payload);
      }
      onSave(saved);
    } catch (e) {
      console.error('save smart collection error', e);
    } finally {
      saving = false;
    }
  }
</script>

<div class="overlay" role="dialog" aria-modal="true">
  <div class="modal" role="presentation">
    <header>
      <h2>{collection ? 'Modifier' : 'Nouvelle'} Smart Collection</h2>
      <button class="close" onclick={onCancel}>✕</button>
    </header>

    <div class="meta">
      <input class="name" placeholder="Nom" bind:value={name} />
      <input class="color" type="color" bind:value={color} />
      <select bind:value={matchMode}>
        <option value="all">Toutes les règles</option>
        <option value="any">Au moins une règle</option>
      </select>
    </div>
    <textarea class="desc" placeholder="Description (optionnel)" bind:value={description}></textarea>

    <div class="rules">
      {#each rules as rule, i (i)}
        <div class="rule">
          <select
            value={rule.field}
            onchange={(e) => {
              const newField = (e.target as HTMLSelectElement).value;
              const allowed = OPS_BY_TYPE[fieldType(newField)] ?? [];
              const op = allowed[0]?.value ?? '=';
              updateRule(i, { field: newField, op, value: '' });
            }}
          >
            {#each FIELDS as f}<option value={f.value}>{f.label}</option>{/each}
          </select>

          <select value={rule.op} onchange={(e) => updateRule(i, { op: (e.target as HTMLSelectElement).value, value: rule.value })}>
            {#each OPS_BY_TYPE[fieldType(rule.field)] ?? [] as op}
              <option value={op.value}>{op.label}</option>
            {/each}
          </select>

          {#if rule.op === 'is_null' || rule.op === 'is_not_null'}
            <span class="value-na">—</span>
          {:else if rule.field === 'credit'}
            <span class="credit-grid">
              <input
                placeholder="rôle (engineer, performer, …)"
                value={rule.value?.role ?? ''}
                oninput={(e) => updateRule(i, { value: { ...rule.value, role: (e.target as HTMLInputElement).value || undefined } })}
              />
              <input
                placeholder="artiste (Rudy Van Gelder, …)"
                value={rule.value?.artist_name ?? ''}
                oninput={(e) => updateRule(i, { value: { ...rule.value, artist_name: (e.target as HTMLInputElement).value || undefined } })}
              />
              <input
                placeholder="instrument (Piano, …) — optionnel"
                value={rule.value?.instrument ?? ''}
                oninput={(e) => updateRule(i, { value: { ...rule.value, instrument: (e.target as HTMLInputElement).value || undefined } })}
              />
            </span>
          {:else if rule.op === 'between'}
            <input
              class="value"
              placeholder="min"
              value={rule.value?.[0] ?? ''}
              oninput={(e) => updateRule(i, { value: [coerce((e.target as HTMLInputElement).value, fieldType(rule.field)), rule.value?.[1] ?? ''] })}
            />
            <input
              class="value"
              placeholder="max"
              value={rule.value?.[1] ?? ''}
              oninput={(e) => updateRule(i, { value: [rule.value?.[0] ?? '', coerce((e.target as HTMLInputElement).value, fieldType(rule.field))] })}
            />
          {:else if rule.op === 'in'}
            <input
              class="value"
              placeholder="valeurs séparées par des virgules"
              value={Array.isArray(rule.value) ? rule.value.join(',') : ''}
              oninput={(e) => updateRule(i, { value: (e.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean) })}
            />
          {:else}
            <input
              class="value"
              placeholder={fieldType(rule.field) === 'timestamp' ? 'now-30d ou 2024-01-01' : 'valeur'}
              value={rule.value ?? ''}
              oninput={(e) => updateRule(i, { value: coerce((e.target as HTMLInputElement).value, fieldType(rule.field)) })}
            />
          {/if}

          <button class="rm" onclick={() => removeRule(i)} title="Supprimer la règle">×</button>
        </div>
      {/each}
      <button class="add" onclick={addRule}>+ Ajouter une règle</button>
    </div>

    <div class="sort">
      <label>Tri :</label>
      <select bind:value={sortBy}>
        <option value="added_at">Date d'ajout</option>
        <option value="title">Titre</option>
        <option value="artist_name">Artiste</option>
        <option value="year">Année</option>
        <option value="label">Label</option>
        <option value="sample_rate">Sample rate</option>
      </select>
      <select bind:value={sortOrder}>
        <option value="desc">↓ desc</option>
        <option value="asc">↑ asc</option>
      </select>
      <label class="max">
        Max:
        <input type="number" min="1" max="5000" bind:value={maxAlbums} />
      </label>
    </div>

    <footer>
      <div class="preview">
        {#if preview.error}
          <span class="err">⚠ {preview.error}</span>
        {:else if preview.loading}
          <span class="muted">…</span>
        {:else}
          <span class="count">{preview.count}</span> album{preview.count > 1 ? 's' : ''} correspondant{preview.count > 1 ? 's' : ''}
        {/if}
      </div>
      <div class="actions">
        <button class="cancel" onclick={onCancel}>Annuler</button>
        <button class="save" onclick={save} disabled={saving || !!preview.error}>
          {saving ? 'Enregistrement…' : (collection ? 'Mettre à jour' : 'Créer')}
        </button>
      </div>
    </footer>
  </div>
</div>

<script context="module" lang="ts">
  // Coerce text input to the right primitive based on field type. Keeps
  // the request payload sensible (int rules submit ints, timestamp rules
  // submit strings, etc.).
  export function coerce(raw: string, type: string): any {
    if (type === 'int' || type === 'count') {
      const n = parseInt(raw, 10);
      return isNaN(n) ? raw : n;
    }
    return raw;
  }
</script>

<style>
  .overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000;
  }
  .modal {
    background: var(--tune-bg, #1a1a1a); color: var(--tune-text);
    border-radius: 14px; padding: 1.4rem;
    width: min(900px, 95vw); max-height: 90vh; overflow: auto;
    border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.3);
  }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.8rem; }
  header h2 { margin: 0; font-size: 1.15rem; }
  .close { background: transparent; border: none; color: var(--tune-text); cursor: pointer; font-size: 1.2rem; }
  .meta { display: grid; grid-template-columns: 1fr 50px 200px; gap: 0.5rem; margin-bottom: 0.5rem; }
  .meta input.name { padding: 0.5rem 0.7rem; background: transparent; border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.4); color: var(--tune-text); border-radius: 6px; }
  .meta input.color { width: 50px; height: 38px; border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.4); border-radius: 6px; padding: 2px; cursor: pointer; }
  .meta select { padding: 0.5rem; background: transparent; border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.4); color: var(--tune-text); border-radius: 6px; }
  .desc { width: 100%; min-height: 40px; padding: 0.5rem 0.7rem; background: transparent; border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.4); color: var(--tune-text); border-radius: 6px; resize: vertical; box-sizing: border-box; margin-bottom: 0.8rem; font-family: inherit; }

  .rules { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.8rem; }
  .rule { display: grid; grid-template-columns: 200px 130px 1fr auto; gap: 0.4rem; align-items: center; padding: 0.4rem; border: 1px dashed rgba(var(--tune-accent-rgb, 99, 102, 241), 0.25); border-radius: 8px; }
  .rule select, .rule input { padding: 0.35rem 0.5rem; background: transparent; border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.3); color: var(--tune-text); border-radius: 4px; font-size: 0.85rem; }
  .rule .rm { background: transparent; border: none; color: #dc2626; font-size: 1.1rem; cursor: pointer; padding: 0 0.3rem; }
  .credit-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.3rem; }
  .value-na { color: var(--tune-text-muted); padding: 0 0.5rem; }
  .add { padding: 0.4rem 0.8rem; background: transparent; border: 1px dashed rgba(var(--tune-accent-rgb, 99, 102, 241), 0.4); border-radius: 6px; color: var(--tune-text); cursor: pointer; }
  .add:hover { border-style: solid; }

  .sort { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0; border-top: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.15); border-bottom: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.15); margin-bottom: 0.8rem; font-size: 0.85rem; }
  .sort label { color: var(--tune-text-muted); }
  .sort select, .sort input { padding: 0.3rem 0.4rem; background: transparent; border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.3); color: var(--tune-text); border-radius: 4px; }
  .sort .max { display: flex; align-items: center; gap: 0.3rem; margin-left: auto; }
  .sort .max input { width: 70px; }

  footer { display: flex; align-items: center; justify-content: space-between; }
  .preview { font-size: 0.95rem; }
  .preview .count { font-weight: 700; color: var(--tune-accent, #6366f1); font-size: 1.2rem; }
  .preview .err { color: #dc2626; font-size: 0.85rem; }
  .preview .muted { color: var(--tune-text-muted); }
  .actions { display: flex; gap: 0.5rem; }
  .actions button { padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-size: 0.9rem; }
  .cancel { background: transparent; border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.4); color: var(--tune-text); }
  .save { background: var(--tune-accent, #6366f1); color: white; border: none; }
  .save:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
