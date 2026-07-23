<script lang="ts">
  import { onMount } from 'svelte';
  import QualityBadge from './QualityBadge.svelte';
  import { getFilteredTracks } from '../lib/api';
  import { getTrackExtendedMetadata, getMetadataFieldSettings, type MetadataCategory } from '../lib/api/metadata';
  import { displayFields } from '../lib/stores/displayFields';
  import { preferences } from '../lib/stores/preferences';
  import { activeView } from '../lib/stores/navigation';
  import { fold } from '../lib/utils';
  import type { Track } from '../lib/types';

  // The 4 Vorbis tags added to the engine this cycle — highlighted in the inspector.
  const NEW_KEYS = new Set(['release_country', 'mb_release_track_id', 'encoder_software', 'source_media']);

  // Optional columns the detail table can render, keyed by the same ids as the
  // metadata-fields catalog so the Settings column editor drives them.
  const COLUMN_DEFS: Record<string, { label: string; get: (t: Track) => string }> = {
    genre: { label: 'Genre', get: t => t.genre ?? '' },
    year: { label: 'Année', get: t => t.year != null ? String(t.year) : '' },
    label: { label: 'Label', get: t => t.label ?? '' },
    composer: { label: 'Compositeur', get: t => t.composer ?? '' },
    sample_rate: { label: 'Fréq.', get: t => t.sample_rate ? (t.sample_rate / 1000).toFixed(1) : '' },
    bit_depth: { label: 'Bits', get: t => t.bit_depth ? String(t.bit_depth) : '' },
    disc_subtitle: { label: 'Sous-titre', get: t => t.disc_subtitle ?? '' },
  };

  let tracks = $state<Track[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let query = $state('');
  let selected = $state<Track | null>(null);
  let ext = $state<Record<string, string>>({});
  let extLoading = $state(false);
  let categories = $state<MetadataCategory[]>([]);

  // Column set = the Track-backed subset of the user's visible fields ($displayFields).
  // Extended-only tags (country, encoder…) live in the inspector, not per-row.
  let columns = $derived(($displayFields ?? []).filter(k => k in COLUMN_DEFS));

  // Label lookup from the localized field catalog (falls back to the raw key).
  let labelOf = $derived.by(() => {
    const m: Record<string, string> = {};
    for (const cat of categories) for (const f of cat.fields) m[f.key] = f.label;
    return m;
  });

  let filtered = $derived.by(() => {
    const q = fold(query.trim());
    if (!q) return tracks;
    return tracks.filter(t =>
      fold(t.title).includes(q) ||
      fold(t.artist_name ?? '').includes(q) ||
      fold(t.album_title ?? '').includes(q) ||
      fold(t.label ?? '').includes(q));
  });

  function fmtDur(ms?: number): string {
    if (!ms) return '';
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  async function select(t: Track) {
    selected = t;
    ext = {};
    if (t.id == null) return;
    extLoading = true;
    try {
      ext = await getTrackExtendedMetadata(t.id);
    } catch { ext = {}; }
    finally { extLoading = false; }
  }

  // Group the extended k/v for the inspector by the catalog's categories, keeping
  // only keys that have a value; unknown keys fall into "Autres".
  let inspectorGroups = $derived.by(() => {
    const groups: { name: string; rows: { key: string; label: string; value: string; isNew: boolean }[] }[] = [];
    const used = new Set<string>();
    for (const cat of categories) {
      const rows = cat.fields
        .filter(f => ext[f.key])
        .map(f => { used.add(f.key); return { key: f.key, label: f.label, value: ext[f.key], isNew: NEW_KEYS.has(f.key) }; });
      if (rows.length) groups.push({ name: cat.name, rows });
    }
    const others = Object.keys(ext).filter(k => !used.has(k)).map(k => ({ key: k, label: k, value: ext[k], isNew: NEW_KEYS.has(k) }));
    if (others.length) groups.push({ name: 'Autres', rows: others });
    return groups;
  });

  onMount(async () => {
    try {
      const [res, fields] = await Promise.all([
        getFilteredTracks({ limit: 500 }),
        getMetadataFieldSettings().catch(() => ({ categories: [] })),
      ]);
      tracks = res.items;
      categories = fields.categories ?? [];
      if (tracks.length) select(tracks[0]);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Chargement impossible';
    } finally {
      loading = false;
    }
  });
</script>

<div class="oxygen">
  <header class="bar">
    <button class="back" onclick={() => activeView.set('library')} title="Retour à la bibliothèque">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
    </button>
    <div class="titleblock">
      <div class="eyebrow">Bibliothèque · Oxygen</div>
      <h1>Vue détaillée</h1>
    </div>
    <div class="search">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      <input placeholder="Filtrer titre, artiste, album, label…" bind:value={query} />
    </div>
    <div class="count">{filtered.length.toLocaleString('fr')} pistes</div>
  </header>

  <div class="body">
    <section class="listwrap">
      {#if loading}
        <div class="state">Chargement de la bibliothèque…</div>
      {:else if error}
        <div class="state err">{error}</div>
      {:else if !filtered.length}
        <div class="state">Aucune piste.</div>
      {:else}
        <div class="tablescroll">
          <table>
            <thead>
              <tr>
                <th class="n">#</th>
                <th>Titre</th>
                <th>Artiste</th>
                <th>Album</th>
                <th>Qualité</th>
                {#each columns as c}<th>{COLUMN_DEFS[c].label}</th>{/each}
                <th class="r">Durée</th>
              </tr>
            </thead>
            <tbody>
              {#each filtered as t (t.id)}
                <tr class:sel={selected?.id === t.id} onclick={() => select(t)}>
                  <td class="n">{t.track_number ?? ''}</td>
                  <td class="title">{t.title}</td>
                  <td class="dim">{t.artist_name ?? ''}</td>
                  <td class="dim">{t.album_title ?? ''}</td>
                  <td><QualityBadge format={t.format} sampleRate={t.sample_rate} bitDepth={t.bit_depth} source={t.source} /></td>
                  {#each columns as c}<td class="mono">{COLUMN_DEFS[c].get(t)}</td>{/each}
                  <td class="r mono">{fmtDur(t.duration_ms)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="hint">Les colonnes suivent vos champs visibles — configurez-les dans <b>Réglages › Bibliothèque</b>.</p>
      {/if}
    </section>

    <aside class="inspector" class:empty={!selected}>
      {#if selected}
        <div class="insp-title">{selected.title}</div>
        <div class="insp-sub">{selected.artist_name ?? ''} · {selected.album_title ?? ''}</div>
        <div class="insp-badges">
          <QualityBadge format={selected.format} sampleRate={selected.sample_rate} bitDepth={selected.bit_depth} source={selected.source} />
        </div>
        {#if extLoading}
          <div class="state small">Lecture des métadonnées…</div>
        {:else if !inspectorGroups.length}
          <div class="state small">Aucune métadonnée étendue.</div>
        {:else}
          {#each inspectorGroups as g}
            <div class="mgroup">
              <h4>{g.name}</h4>
              {#each g.rows as row}
                <div class="field" class:isnew={row.isNew}>
                  <span class="k">{row.label}{#if row.isNew}<span class="tag">nouveau</span>{/if}</span>
                  <span class="v" title={row.value}>{row.value}</span>
                </div>
              {/each}
            </div>
          {/each}
        {/if}
      {:else}
        <div class="state small">Sélectionnez une piste pour voir ses métadonnées.</div>
      {/if}
    </aside>
  </div>
</div>

<style>
  .oxygen { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--tune-bg); color: var(--tune-text); }
  .bar { display: flex; align-items: center; gap: 14px; padding: 14px 20px; border-bottom: 1px solid var(--tune-border); flex-shrink: 0; }
  .back { background: var(--tune-surface); border: 1px solid var(--tune-border); color: var(--tune-text-secondary); width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; cursor: pointer; }
  .back:hover { color: var(--tune-text); border-color: var(--tune-accent); }
  .titleblock .eyebrow { font-size: 11px; letter-spacing: .04em; color: var(--tune-accent); }
  .titleblock h1 { font-size: 20px; font-weight: 700; margin: 1px 0 0; }
  .search { flex: 1; max-width: 420px; position: relative; display: flex; align-items: center; }
  .search svg { position: absolute; left: 12px; color: var(--tune-text-muted); }
  .search input { width: 100%; background: var(--tune-surface); border: 1px solid var(--tune-border); border-radius: 20px; color: var(--tune-text); font: inherit; padding: 8px 14px 8px 34px; outline: none; }
  .search input:focus { border-color: var(--tune-accent); }
  .count { font-size: 12px; color: var(--tune-text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }

  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 330px; }
  @media (max-width: 900px) { .body { grid-template-columns: 1fr; } .inspector { display: none; } }

  .listwrap { min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: 12px 20px 0; }
  .tablescroll { flex: 1; min-height: 0; overflow: auto; border: 1px solid var(--tune-border); border-radius: 12px; background: var(--tune-surface); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th { position: sticky; top: 0; background: var(--tune-bg-secondary); text-align: left; font-size: 10.5px; letter-spacing: .04em; text-transform: uppercase; color: var(--tune-text-secondary); font-weight: 600; padding: 9px 12px; border-bottom: 1px solid var(--tune-border); white-space: nowrap; }
  th.n, td.n { width: 34px; text-align: right; color: var(--tune-text-muted); }
  th.r, td.r { text-align: right; }
  tbody td { padding: 7px 12px; border-bottom: 1px solid var(--tune-border); white-space: nowrap; }
  tbody tr { cursor: pointer; }
  tbody tr:hover td { background: var(--tune-surface-hover); }
  tbody tr.sel td { background: var(--tune-surface-selected); }
  td.title { font-weight: 500; max-width: 230px; overflow: hidden; text-overflow: ellipsis; }
  td.dim { color: var(--tune-text-secondary); max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
  td.mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-variant-numeric: tabular-nums; color: var(--tune-text-secondary); }
  .hint { font-size: 11px; color: var(--tune-text-muted); padding: 8px 2px 12px; }
  .hint b { color: var(--tune-text-secondary); }

  .inspector { border-left: 1px solid var(--tune-border); background: var(--tune-surface); padding: 18px; overflow-y: auto; min-height: 0; }
  .inspector.empty { display: grid; place-items: center; }
  .insp-title { font-size: 17px; font-weight: 700; }
  .insp-sub { color: var(--tune-text-secondary); font-size: 13px; margin-top: 2px; }
  .insp-badges { margin: 12px 0 4px; }
  .mgroup { margin-top: 16px; }
  .mgroup h4 { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--tune-text-muted); border-bottom: 1px solid var(--tune-border); padding-bottom: 6px; margin: 0 0 4px; }
  .field { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; align-items: baseline; }
  .field .k { color: var(--tune-text-secondary); font-size: 12px; }
  .field .v { color: var(--tune-text); font-size: 12.5px; text-align: right; font-family: ui-monospace, "SF Mono", Menlo, monospace; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .field.isnew .k, .field.isnew .v { color: var(--tune-accent); }
  .tag { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: var(--tune-accent); background: rgba(var(--tune-accent-rgb), .14); padding: 1px 5px; border-radius: 4px; margin-left: 6px; }
  .state { padding: 40px 20px; text-align: center; color: var(--tune-text-muted); }
  .state.err { color: var(--tune-danger, var(--tune-error)); }
  .state.small { padding: 20px 4px; font-size: 12.5px; }
</style>
