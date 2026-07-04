<script lang="ts">
  import * as api from '../lib/api';
  import type { SmartRule, SmartCollection } from '../lib/types';
  import { t } from '../lib/i18n';

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
      ? (Array.isArray(collection.rules)
          ? collection.rules
          : (() => { try { return JSON.parse(collection.rules); } catch { return []; } })())
      : [{ field: 'sample_rate', op: '>=', value: 96000 }]
  );

  let preview = $state<{ count: number; loading: boolean; error: string | null }>({
    count: 0, loading: false, error: null,
  });
  let saving = $state(false);

  // Field grammar mirrors tune_server.library.smart_collection field
  // whitelist. Keep this in sync with the server compiler.
  const FIELDS = [
    { value: 'artist_name', labelKey: 'smartCollection.fieldArtist',      type: 'text' },
    { value: 'title',       labelKey: 'smartCollection.fieldAlbumTitle',  type: 'text' },
    { value: 'genre',       labelKey: 'smartCollection.fieldGenre',       type: 'text' },
    { value: 'composer',    labelKey: 'smartCollection.fieldComposer',    type: 'text' },
    { value: 'label',       labelKey: 'smartCollection.fieldLabel',       type: 'text' },
    { value: 'format',      labelKey: 'smartCollection.fieldFormat',      type: 'text' },
    { value: 'source',      labelKey: 'smartCollection.fieldSource',      type: 'text' },
    { value: 'year',        labelKey: 'smartCollection.fieldYear',        type: 'int' },
    { value: 'sample_rate', labelKey: 'smartCollection.fieldSampleRate',  type: 'int' },
    { value: 'bit_depth',   labelKey: 'smartCollection.fieldBitDepth',    type: 'int' },
    { value: 'track_count', labelKey: 'smartCollection.fieldTrackCount',  type: 'int' },
    { value: 'duration',    labelKey: 'smartCollection.fieldDuration',    type: 'int' },
    { value: 'track_number', labelKey: 'smartCollection.fieldTrackNumber', type: 'int' },
    { value: 'disc_number', labelKey: 'smartCollection.fieldDiscNumber',  type: 'int' },
    { value: 'bpm',         labelKey: 'smartCollection.fieldBpm',         type: 'int' },
    { value: 'rating',      labelKey: 'smartCollection.fieldRating',      type: 'int' },
    { value: 'cover_path',  labelKey: 'smartCollection.fieldCover',       type: 'nullable' },
    { value: 'added_at',    labelKey: 'smartCollection.fieldAddedAt',     type: 'timestamp' },
    { value: 'credit',      labelKey: 'smartCollection.fieldCredit',      type: 'credit' },
    { value: 'play_count',  labelKey: 'smartCollection.fieldPlayCount',   type: 'count' },
    { value: 'last_played_at', labelKey: 'smartCollection.fieldLastPlayed', type: 'timestamp' },
  ];

  const OPS_BY_TYPE: Record<string, { value: string; label?: string; labelKey?: string }[]> = {
    int: [
      { value: '=', label: '=' }, { value: '!=', label: '≠' },
      { value: '>=', label: '≥' }, { value: '>', label: '>' },
      { value: '<=', label: '≤' }, { value: '<', label: '<' },
      { value: 'between', labelKey: 'smartCollection.opBetween' },
    ],
    text: [
      { value: '=', label: '=' }, { value: '!=', label: '≠' },
      { value: 'contains', labelKey: 'smartCollection.opContains' },
      { value: 'starts_with', labelKey: 'smartCollection.opStartsWith' },
      { value: 'in', labelKey: 'smartCollection.opIn' },
      { value: 'is_null', labelKey: 'smartCollection.opIsEmpty' },
      { value: 'is_not_null', labelKey: 'smartCollection.opIsNotEmpty' },
    ],
    nullable: [
      { value: 'is_null', labelKey: 'smartCollection.opIsEmpty' },
      { value: 'is_not_null', labelKey: 'smartCollection.opIsNotEmpty' },
    ],
    timestamp: [
      { value: '>', labelKey: 'smartCollection.opAfter' }, { value: '<', labelKey: 'smartCollection.opBefore' },
      { value: 'between', labelKey: 'smartCollection.opBetween' },
      { value: 'is_null', labelKey: 'smartCollection.opNever' },
    ],
    credit: [{ value: 'has', labelKey: 'smartCollection.opContains' }],
    count: [
      { value: '>=', label: '≥' }, { value: '>', label: '>' },
      { value: '<', label: '<' }, { value: '=', label: '=' },
      { value: 'between', labelKey: 'smartCollection.opBetween' },
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
        name: name.trim() || $t('smartCollection.defaultName'),
        description, icon, color,
        rules, match_mode: matchMode,
        sort_by: sortBy, sort_order: sortOrder,
        max_limit: maxAlbums,
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
      <h2>{collection ? $t('smartCollection.edit') : $t('smartCollection.new')} Smart Collection</h2>
      <button class="close" onclick={onCancel}>✕</button>
    </header>

    <div class="meta">
      <input class="name" placeholder={$t('smartCollection.namePlaceholder')} bind:value={name} />
      <input class="color" type="color" bind:value={color} />
      <select bind:value={matchMode}>
        <option value="all">{$t('smartCollection.allRules')}</option>
        <option value="any">{$t('smartCollection.anyRule')}</option>
      </select>
    </div>
    <textarea class="desc" placeholder={$t('smartCollection.descPlaceholder')} bind:value={description}></textarea>

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
            {#each FIELDS as f}<option value={f.value}>{$t(f.labelKey)}</option>{/each}
          </select>

          <select value={rule.op} onchange={(e) => updateRule(i, { op: (e.target as HTMLSelectElement).value, value: rule.value })}>
            {#each OPS_BY_TYPE[fieldType(rule.field)] ?? [] as op}
              <option value={op.value}>{op.labelKey ? $t(op.labelKey) : op.label}</option>
            {/each}
          </select>

          {#if rule.op === 'is_null' || rule.op === 'is_not_null'}
            <span class="value-na">—</span>
          {:else if rule.field === 'credit'}
            <span class="credit-grid">
              <input
                placeholder={$t('smartCollection.rolePlaceholder')}
                value={rule.value?.role ?? ''}
                oninput={(e) => updateRule(i, { value: { ...rule.value, role: (e.target as HTMLInputElement).value || undefined } })}
              />
              <input
                placeholder={$t('smartCollection.artistPlaceholder')}
                value={rule.value?.artist_name ?? ''}
                oninput={(e) => updateRule(i, { value: { ...rule.value, artist_name: (e.target as HTMLInputElement).value || undefined } })}
              />
              <input
                placeholder={$t('smartCollection.instrumentPlaceholder')}
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
              placeholder={$t('smartCollection.commaSeparated')}
              value={Array.isArray(rule.value) ? rule.value.join(',') : ''}
              oninput={(e) => updateRule(i, { value: (e.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean) })}
            />
          {:else}
            <input
              class="value"
              placeholder={fieldType(rule.field) === 'timestamp' ? $t('smartCollection.timestampPlaceholder') : $t('smartCollection.valuePlaceholder')}
              value={rule.value ?? ''}
              oninput={(e) => updateRule(i, { value: coerce((e.target as HTMLInputElement).value, fieldType(rule.field)) })}
            />
          {/if}

          <button class="rm" onclick={() => removeRule(i)} title={$t('smartCollection.removeRule')}>×</button>
        </div>
      {/each}
      <button class="add" onclick={addRule}>{$t('smartCollection.addRule')}</button>
    </div>

    <div class="sort">
      <label>{$t('smartCollection.sortLabel')}</label>
      <select bind:value={sortBy}>
        <option value="added_at">{$t('smartCollection.fieldAddedAt')}</option>
        <option value="title">{$t('smartCollection.sortTitle')}</option>
        <option value="artist_name">{$t('smartCollection.fieldArtist')}</option>
        <option value="year">{$t('smartCollection.fieldYear')}</option>
        <option value="label">{$t('smartCollection.fieldLabel')}</option>
        <option value="sample_rate">Sample rate</option>
        <option value="random">{$t('smartCollection.sortRandom')}</option>
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
          <span class="count">{preview.count}</span> {preview.count > 1 ? $t('smartCollection.albumsMatching') : $t('smartCollection.albumMatching')}
        {/if}
      </div>
      <div class="actions">
        <button class="cancel" onclick={onCancel}>{$t('common.cancel')}</button>
        <button class="save" onclick={save} disabled={saving || !!preview.error}>
          {saving ? $t('smartCollection.savingProgress') : (collection ? $t('smartCollection.update') : $t('smartCollection.create'))}
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
  .meta select { padding: 0.5rem; background: var(--tune-surface, #1e1e1e); border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.4); color: var(--tune-text); border-radius: 6px; }
  .desc { width: 100%; min-height: 40px; padding: 0.5rem 0.7rem; background: transparent; border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.4); color: var(--tune-text); border-radius: 6px; resize: vertical; box-sizing: border-box; margin-bottom: 0.8rem; font-family: inherit; }

  .rules { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.8rem; }
  .rule { display: grid; grid-template-columns: 200px 130px 1fr auto; gap: 0.4rem; align-items: center; padding: 0.4rem; border: 1px dashed rgba(var(--tune-accent-rgb, 99, 102, 241), 0.25); border-radius: 8px; }
  .rule select, .rule input { padding: 0.35rem 0.5rem; background: var(--tune-surface, #1e1e1e); border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.3); color: var(--tune-text); border-radius: 4px; font-size: 0.85rem; }
  .rule .rm { background: transparent; border: none; color: #dc2626; font-size: 1.1rem; cursor: pointer; padding: 0 0.3rem; }
  .credit-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.3rem; }
  .value-na { color: var(--tune-text-muted); padding: 0 0.5rem; }
  .add { padding: 0.4rem 0.8rem; background: transparent; border: 1px dashed rgba(var(--tune-accent-rgb, 99, 102, 241), 0.4); border-radius: 6px; color: var(--tune-text); cursor: pointer; }
  .add:hover { border-style: solid; }

  .sort { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0; border-top: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.15); border-bottom: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.15); margin-bottom: 0.8rem; font-size: 0.85rem; }
  .sort label { color: var(--tune-text-muted); }
  .sort select, .sort input { padding: 0.3rem 0.4rem; background: var(--tune-surface, #1e1e1e); border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.3); color: var(--tune-text); border-radius: 4px; }
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

  /* Fix dropdown popup readability in dark theme: option elements need
     explicit bg/color because browsers render them independently. */
  select option { background: var(--tune-surface, #1e1e1e); color: var(--tune-text, #fff); }
</style>
