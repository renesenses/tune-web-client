<script lang="ts">
  import type { Track } from '../lib/types';
  import type { FacetValue } from '../lib/api';
  import { t } from '../lib/i18n';

  interface Props {
    tracks: Track[];                                  // loaded window (client fallback)
    serverFacets: Record<string, FacetValue[]>;       // full-library counts from the server index
    facets: string[];                                 // which facets to show (preferences.oxygenFacets)
    selected: { field: string; value: string } | null;
    onSelect: (field: string, value: string | null) => void;
  }
  let { tracks, serverFacets, facets, selected, onSelect }: Props = $props();

  const FIELD_LABELS: Record<string, string> = {
    genre: 'Genres', label: 'Labels', year: 'Années', artist: 'Artistes',
    country: 'Pays', mood: 'Moods', source: 'Support',
  };
  // Fields computable client-side from Track columns (fallback when the server
  // index is unavailable). k/v fields (country/mood/source) need the server.
  const CLIENT_GET: Record<string, (t: Track) => string | null | undefined> = {
    genre: t => t.genre, label: t => t.label,
    year: t => (t.year != null ? String(t.year) : null), artist: t => t.artist_name,
  };

  const shown = $derived(facets.filter(f => f in FIELD_LABELS));

  function clientCounts(field: string): FacetValue[] {
    const get = CLIENT_GET[field];
    if (!get) return [];
    const m = new Map<string, number>();
    for (const t of tracks) { const v = get(t); if (v == null || v === '') continue; m.set(v, (m.get(v) ?? 0) + 1); }
    return [...m.entries()].map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'fr')).slice(0, 60);
  }
  // Prefer the server index (full library); fall back to the loaded window.
  const groups = $derived.by<Record<string, FacetValue[]>>(() => {
    const out: Record<string, FacetValue[]> = {};
    for (const f of shown) {
      const sv = serverFacets[f];
      out[f] = (sv && sv.length) ? sv : clientCounts(f);
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
    {#if (groups[f] ?? []).length}
      <div class="group">
        <button class="ghead" onclick={() => toggle(f)}>
          <svg class="chev" class:closed={!isOpen(f)} viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg>
          {$t('oxygen.facet.' + f)}
          <span class="gn">{(groups[f] ?? []).length}</span>
        </button>
        {#if isOpen(f)}
          <div class="values">
            {#each groups[f] ?? [] as row (row.value)}
              <button class="val" class:active={selected?.field === f && selected?.value === row.value}
                onclick={() => onSelect(f, selected?.field === f && selected?.value === row.value ? null : row.value)}>
                <span class="vl" title={row.value}>{row.value}</span>
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
  .ghead { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: 0; color: var(--tune-text); font: inherit; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; font-weight: 700; padding: 9px 8px 5px; cursor: pointer; }
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
