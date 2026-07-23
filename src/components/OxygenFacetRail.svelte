<script lang="ts">
  import type { Track } from '../lib/types';

  interface Props {
    tracks: Track[];
    facets: string[];                 // which facets to show (from preferences.oxygenFacets)
    selected: { field: string; value: string } | null;
    onSelect: (field: string, value: string | null) => void;
  }
  let { tracks, facets, selected, onSelect }: Props = $props();

  // Facets computable from the loaded track window (fixed columns on Track).
  // country/mood/rating/collection/folder need the server-side facet index
  // (Phase 2b) — shown as a hint, not as clickable counts, so we never lie.
  const FIELD_DEFS: Record<string, { label: string; get: (t: Track) => string | null | undefined }> = {
    genre: { label: 'Genres', get: t => t.genre },
    label: { label: 'Labels', get: t => t.label },
    year: { label: 'Années', get: t => (t.year != null ? String(t.year) : null) },
    artist: { label: 'Artistes', get: t => t.artist_name },
  };
  const SERVER_ONLY = new Set(['country', 'mood', 'rating', 'collection', 'folder', 'untagged']);
  const SERVER_LABELS: Record<string, string> = { country: 'Pays', mood: 'Moods', rating: 'Notes', collection: 'Collections', folder: 'Dossiers', untagged: 'Non-taggés' };

  const clientFacets = $derived(facets.filter(f => f in FIELD_DEFS));
  const serverFacets = $derived(facets.filter(f => SERVER_ONLY.has(f)));

  // { field -> [{value,count}] } computed from the loaded tracks.
  const groups = $derived.by(() => {
    const out: Record<string, { value: string; count: number }[]> = {};
    for (const f of clientFacets) {
      const counts = new Map<string, number>();
      for (const t of tracks) {
        const v = FIELD_DEFS[f].get(t);
        if (v == null || v === '') continue;
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      out[f] = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'fr'))
        .slice(0, 60);
    }
    return out;
  });

  let open = $state<Record<string, boolean>>({});
  function toggle(f: string) { open = { ...open, [f]: !(open[f] ?? true) }; }
  function isOpen(f: string) { return open[f] ?? true; }
</script>

<nav class="rail">
  {#each clientFacets as f (f)}
    <div class="group">
      <button class="ghead" onclick={() => toggle(f)}>
        <svg class="chev" class:closed={!isOpen(f)} viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg>
        {FIELD_DEFS[f].label}
        <span class="gn">{groups[f]?.length ?? 0}</span>
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
  {/each}

  {#if serverFacets.length}
    <div class="group">
      <div class="ghead static">Bientôt</div>
      <div class="values">
        {#each serverFacets as f (f)}
          <div class="val disabled" title="Nécessite l'index de facettes serveur (Phase 2b)">
            <span class="vl">{SERVER_LABELS[f]}</span>
            <span class="vc">—</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <p class="note">Facettes calculées sur les pistes chargées. Le comptage complet par label/pays arrive avec l'index serveur.</p>
</nav>

<style>
  .rail { display: flex; flex-direction: column; overflow-y: auto; min-height: 0; padding: 8px 8px 16px; }
  .group { margin-bottom: 4px; }
  .ghead { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: 0; color: var(--tune-text); font: inherit; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; font-weight: 700; padding: 9px 8px 5px; cursor: pointer; }
  .ghead.static { cursor: default; color: var(--tune-text-muted); }
  .chev { transition: transform .12s; color: var(--tune-text-muted); }
  .chev.closed { transform: rotate(-90deg); }
  .gn { margin-left: auto; font-size: 10px; color: var(--tune-text-muted); font-variant-numeric: tabular-nums; }
  .values { display: flex; flex-direction: column; }
  .val { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: 0; color: var(--tune-text-secondary); font: inherit; text-align: left; padding: 5px 8px; border-radius: 7px; cursor: pointer; }
  .val:hover { background: var(--tune-surface-hover); color: var(--tune-text); }
  .val.active { background: var(--tune-surface-selected); color: var(--tune-accent); }
  .val.disabled { cursor: default; opacity: .55; }
  .vl { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; }
  .vc { font-size: 10.5px; color: var(--tune-text-muted); font-variant-numeric: tabular-nums; }
  .val.active .vc { color: var(--tune-accent); }
  .note { font-size: 10.5px; color: var(--tune-text-muted); line-height: 1.5; padding: 12px 8px 0; }
</style>
