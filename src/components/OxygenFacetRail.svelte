<script lang="ts">
  import type { Track } from '../lib/types';
  import type { FacetValue, FolderChild, FolderCrumb } from '../lib/api';
  import { t } from '../lib/i18n';
  import OxygenFolderFacet from './OxygenFolderFacet.svelte';

  interface Props {
    tracks: Track[];                                  // loaded window (client fallback)
    serverFacets: Record<string, FacetValue[]>;       // full-library counts from the server index
    facets: string[];                                 // which facets to show (preferences.oxygenFacets)
    limit?: number;                                   // max values per facet; 0 = no limit
    selected: Record<string, string>;
    onSelect: (field: string, value: string | null) => void;
    // Folder facet (drill-down) — supplied by OxygenView from /library/folder-facet.
    folderCrumbs?: FolderCrumb[];
    folderChildren?: FolderChild[];
    folderLoading?: boolean;
    onFolderDrill?: (path: string | null) => void;
  }
  let {
    tracks, serverFacets, facets, limit = 200, selected, onSelect,
    folderCrumbs = [], folderChildren = [], folderLoading = false, onFolderDrill = () => {},
  }: Props = $props();

  const FIELD_LABELS: Record<string, string> = {
    genre: 'Genres', label: 'Labels', year: 'Années', artist: 'Artistes',
    country: 'Pays', mood: 'Moods', source: 'Support',
    format: 'Format', sample_rate: 'Fréquence', bit_depth: 'Résolution',
    folder: 'Répertoire',
  };
  // Fields computable client-side from Track columns (fallback when the server
  // index is unavailable). k/v fields (country/mood/source) need the server.
  // Technical dimensions (format/sample_rate/bit_depth) are plain Track columns,
  // so they aggregate client-side too — the raw value is kept for filtering; the
  // human label (44.1 kHz / 16 bit) is applied at render time via fmtValue.
  const CLIENT_GET: Record<string, (t: Track) => string | null | undefined> = {
    genre: t => t.genre, label: t => t.label,
    year: t => (t.year != null ? String(t.year) : null), artist: t => t.artist_name,
    format: t => (t.format ? String(t.format) : null),
    sample_rate: t => (t.sample_rate != null ? String(t.sample_rate) : null),
    bit_depth: t => (t.bit_depth != null ? String(t.bit_depth) : null),
  };
  // Display a raw facet value. sample_rate is stored in Hz, bit_depth in bits;
  // show the audiophile-readable form while keeping row.value raw for selection.
  function fmtValue(field: string, value: string): string {
    if (field === 'sample_rate') {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? `${(n / 1000).toLocaleString('fr')} kHz` : value;
    }
    if (field === 'bit_depth') return `${value} bit`;
    return value;
  }

  const shown = $derived(facets.filter(f => f in FIELD_LABELS));

  function clientCounts(field: string): FacetValue[] {
    const get = CLIENT_GET[field];
    if (!get) return [];
    const m = new Map<string, number>();
    for (const t of tracks) { const v = get(t); if (v == null || v === '') continue; m.set(v, (m.get(v) ?? 0) + 1); }
    const all = sortFacet(field, [...m.entries()].map(([value, count]) => ({ value, count })));
    return limit > 0 ? all.slice(0, limit) : all;
  }
  // Per-facet sort mode. Default 'count' (years = chronological desc, so 2026
  // stays on top — Bertrand: "pas facile de trouver 2026 !"). Dominique wanted
  // an A-Z toggle so a long Genres/Artists list can be scanned alphabetically.
  let sortMode = $state<Record<string, 'count' | 'alpha'>>({});
  const modeOf = (f: string) => sortMode[f] ?? 'count';
  const cycleSort = (f: string) => { sortMode = { ...sortMode, [f]: modeOf(f) === 'count' ? 'alpha' : 'count' }; };
  function sortFacet(field: string, vals: FacetValue[]): FacetValue[] {
    const out = [...vals];
    if (modeOf(field) === 'alpha') {
      return out.sort((a, b) => a.value.localeCompare(b.value, 'fr', { numeric: true }));
    }
    if (field === 'year' || field === 'sample_rate' || field === 'bit_depth')
      return out.sort((a, b) => Number(b.value) - Number(a.value));
    return out.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'fr'));
  }
  // Prefer the server index (full library); fall back to the loaded window.
  const groups = $derived.by<Record<string, FacetValue[]>>(() => {
    const out: Record<string, FacetValue[]> = {};
    for (const f of shown) {
      const sv = serverFacets[f];
      out[f] = (sv && sv.length) ? sortFacet(f, [...sv]) : clientCounts(f);
    }
    return out;
  });

  let open = $state<Record<string, boolean>>({});
  const isOpen = (f: string) => open[f] ?? true;
  const toggle = (f: string) => { open = { ...open, [f]: !isOpen(f) }; };
  const usingServer = $derived(Object.keys(serverFacets).length > 0);
</script>

<nav class="rail">
  {#each shown as f (f)}
    {#if f === 'folder'}
      <!-- Hierarchical drill-down: breadcrumb + child folders (server-backed). -->
      <div class="group">
        <div class="ghead">
          <button class="ghtitle" onclick={() => toggle(f)}>
            <svg class="chev" class:closed={!isOpen(f)} viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg>
            {$t('oxygen.facet.' + f)}
          </button>
          <span class="gn">{folderChildren.length}</span>
        </div>
        {#if isOpen(f)}
          <OxygenFolderFacet crumbs={folderCrumbs} folders={folderChildren} selected={selected.folder ?? null} loading={folderLoading} onDrill={onFolderDrill} />
        {/if}
      </div>
    {:else if (groups[f] ?? []).length}
      <div class="group">
        <div class="ghead">
          <button class="ghtitle" onclick={() => toggle(f)}>
            <svg class="chev" class:closed={!isOpen(f)} viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg>
            {$t('oxygen.facet.' + f)}
          </button>
          <button class="sortbtn" title={modeOf(f) === 'count' ? $t('oxygen.sortAlpha') : $t('oxygen.sortCount')} onclick={() => cycleSort(f)}>{modeOf(f) === 'count' ? '#' : 'A→Z'}</button>
          <span class="gn">{(groups[f] ?? []).length}</span>
        </div>
        {#if isOpen(f)}
          <div class="values">
            {#each groups[f] ?? [] as row (row.value)}
              <button class="val" class:active={selected[f] === row.value}
                onclick={() => onSelect(f, selected[f] === row.value ? null : row.value)}>
                <span class="vl" title={row.value}>{fmtValue(f, row.value)}</span>
                <span class="vc">{row.count.toLocaleString('fr')}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/each}
  <p class="note">{usingServer ? $t('oxygen.facetsServer') : $t('oxygen.facetsClient')}</p>
</nav>

<style>
  .rail { display: flex; flex-direction: column; overflow-y: auto; min-height: 0; padding: 8px 8px 16px; }
  .group { margin-bottom: 4px; }
  .ghead { display: flex; align-items: center; gap: 6px; width: 100%; padding: 9px 8px 5px; }
  .ghtitle { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; background: none; border: 0; color: var(--tune-text); font: inherit; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; font-weight: 700; padding: 0; cursor: pointer; text-align: left; }
  .sortbtn { background: none; border: 0; color: var(--tune-text-muted); font: inherit; font-size: 10px; font-weight: 700; letter-spacing: .02em; padding: 1px 5px; border-radius: 5px; cursor: pointer; flex: none; }
  .sortbtn:hover { color: var(--tune-accent); background: var(--tune-surface-hover); }
  .chev { transition: transform .12s; color: var(--tune-text-muted); }
  .chev.closed { transform: rotate(-90deg); }
  .gn { margin-left: auto; font-size: 10px; color: var(--tune-text-muted); font-variant-numeric: tabular-nums; }
  .values { display: flex; flex-direction: column; }
  .val { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: 0; color: var(--tune-text-secondary); font: inherit; text-align: left; padding: 5px 8px; border-radius: 7px; cursor: pointer; }
  .val:hover { background: var(--tune-surface-hover); color: var(--tune-text); }
  .val.active { background: var(--tune-surface-selected); color: var(--tune-accent); }
  .vl { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; }
  .vc { font-size: 10.5px; color: var(--tune-text-muted); font-variant-numeric: tabular-nums; }
  .val.active .vc { color: var(--tune-accent); }
  .note { font-size: 10.5px; color: var(--tune-text-muted); line-height: 1.5; padding: 12px 8px 0; }
</style>
