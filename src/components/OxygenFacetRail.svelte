<script lang="ts">
  import type { Track } from '../lib/types';
  import type { FacetValue, FolderChild, FolderCrumb } from '../lib/api';
  import { get } from 'svelte/store';
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
    composer: 'Compositeurs',
    country: 'Pays', mood: 'Moods', source: 'Support',
    format: 'Format', sample_rate: 'Fréquence', bit_depth: 'Résolution',
    rating: 'Note', collection: 'Collections', original_year: 'Enregistrement',
    favorite: 'Favoris', playlist: 'Listes de lecture', untagged: 'Sans étiquette',
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
    composer: t => t.composer,
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
    if (field === 'rating') {
      const n = Math.max(0, Math.min(5, Number(value) || 0));
      return '★'.repeat(n) + '☆'.repeat(5 - n);
    }
    // Favoris et Sans étiquette portent des valeurs techniques (`track`,
    // `cover`…) que le serveur renvoie telles quelles. On les traduit ici, en
    // gardant row.value brut pour la sélection — même principe que les kHz.
    if (field === 'favorite' || field === 'untagged') {
      const key = `oxygen.facetValue.${field}.${value}`;
      const label = get(t)(key as any);
      return label && label !== key ? label : value;
    }
    return value;
  }

  const shown = $derived(facets.filter(f => f in FIELD_LABELS));

  // ---- Index alphabétique -------------------------------------------------
  // Sur 8 873 artistes (bibliothèque de Bertrand), dérouler la liste n'est pas
  // une navigation : Helium replie les siens en dossiers A→Z. Ici la bande de
  // lettres NARROW la liste au lieu de la replier — un clic, une lettre, et le
  // tri en cours (fréquence ou alphabétique) reste celui qu'on avait choisi.
  // Seules les listes assez longues pour être illisibles la reçoivent.
  const ALPHA_MIN = 25;
  /** Première lettre d'affichage : accents repliés (Étienne → E), tout ce qui
   *  n'est pas une lettre regroupé sous « # » (compilations « 4 Non Blondes »,
   *  labels numériques…). */
  function initialOf(value: string): string {
    const c = (value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').charAt(0).toUpperCase();
    return c >= 'A' && c <= 'Z' ? c : '#';
  }
  let alphaSel = $state<Record<string, string>>({});
  const alphaOf = (f: string) => alphaSel[f] ?? '';
  function pickAlpha(f: string, letter: string) {
    alphaSel = { ...alphaSel, [f]: alphaOf(f) === letter ? '' : letter };
  }
  /** Les initiales réellement présentes, dans l'ordre, « # » en dernier. */
  function alphaLetters(f: string): string[] {
    const set = new Set((groups[f] ?? []).map(r => initialOf(fmtValue(f, r.value))));
    const letters = [...set].filter(c => c !== '#').sort();
    return set.has('#') ? [...letters, '#'] : letters;
  }
  /** Le jeu affiché : filtré par la lettre choisie, s'il y en a une. */
  function rowsOf(f: string) {
    const rows = groups[f] ?? [];
    const a = alphaOf(f);
    return a ? rows.filter(r => initialOf(fmtValue(f, r.value)) === a) : rows;
  }

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
    if (field === 'year' || field === 'sample_rate' || field === 'bit_depth' || field === 'rating')
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

  // Facettes repliées. Mémorisées par navigateur : un rail replié à la main
  // qui se rouvre entier au retour dans Oxygen se replie une deuxième fois,
  // puis une troisième. On stocke les REPLIÉES (et non les ouvertes) pour
  // qu'une facette nouvellement livrée arrive dépliée.
  const CLOSED_KEY = 'tune-oxygen-facets-closed';
  function loadClosed(): Set<string> {
    try {
      const raw = localStorage.getItem(CLOSED_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
    } catch { return new Set(); }
  }
  let closed = $state<Set<string>>(loadClosed());
  function setClosed(next: Set<string>) {
    closed = next;
    try { localStorage.setItem(CLOSED_KEY, JSON.stringify([...next])); } catch { /* quota / mode privé */ }
  }
  const isOpen = (f: string) => !closed.has(f);
  const toggle = (f: string) => {
    const next = new Set(closed);
    if (next.has(f)) next.delete(f); else next.add(f);
    setClosed(next);
  };
  // Un seul geste pour retrouver la liste des facettes quand elles sont
  // toutes ouvertes — ou tout rouvrir d'un coup (Bertrand).
  const allCollapsed = $derived(shown.length > 0 && shown.every(f => closed.has(f)));
  const toggleAll = () => setClosed(allCollapsed ? new Set() : new Set(shown));
  const usingServer = $derived(Object.keys(serverFacets).length > 0);
</script>

<nav class="rail">
  <div class="railhead">
    <span class="rht">{$t('oxygen.facetsTitle')}</span>
    <button class="allbtn" onclick={toggleAll}
            title={allCollapsed ? $t('oxygen.expandAll') : $t('oxygen.collapseAll')}
            aria-label={allCollapsed ? $t('oxygen.expandAll') : $t('oxygen.collapseAll')}>
      <svg class="chev" class:closed={allCollapsed} viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg>
      {allCollapsed ? $t('oxygen.expandAll') : $t('oxygen.collapseAll')}
    </button>
  </div>
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
          <!-- Le bouton annonce l'ACTION, pas l'état courant : « # » au-dessus
               d'une colonne de nombres se lisait comme un en-tête de colonne, et
               contredisait son infobulle qui, elle, annonçait déjà l'action.
               D'où « classement alphabétique absent » alors que le tri existait
               (retour Stéphane Villerio, 08/08/2026). -->
          <button class="sortbtn" title={modeOf(f) === 'count' ? $t('oxygen.sortAlpha') : $t('oxygen.sortCount')} onclick={() => cycleSort(f)}>{modeOf(f) === 'count' ? 'A→Z' : '#'}</button>
          <span class="gn">{alphaOf(f) ? `${rowsOf(f).length}/${(groups[f] ?? []).length}` : (groups[f] ?? []).length}</span>
        </div>
        {#if isOpen(f)}
          {#if (groups[f] ?? []).length >= ALPHA_MIN}
            {@const letters = alphaLetters(f)}
            {#if letters.length > 1}
              <div class="alpha" role="group" aria-label={$t('oxygen.alphaIndex')}>
                {#each letters as c (c)}
                  <button class="al" class:on={alphaOf(f) === c} onclick={() => pickAlpha(f, c)}>{c}</button>
                {/each}
              </div>
            {/if}
          {/if}
          <div class="values">
            {#each rowsOf(f) as row (row.value)}
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
  /* Sticky within .rail (the scroller): negative margins absorb the rail's
     8px padding so the opaque header spans the full scrollport width. */
  .railhead { position: sticky; top: 0; z-index: 3; background: var(--tune-surface); display: flex; align-items: center; gap: 8px; margin: -8px -8px 4px; padding: 10px 16px 6px; border-bottom: 1px solid var(--tune-border); }
  /* Bande de lettres : dense, elle doit tenir sur deux lignes au plus dans un
     rail de 240 px, et ne jamais voler l'attention aux valeurs elles-mêmes. */
  .alpha { display: flex; flex-wrap: wrap; gap: 2px; padding: 4px 2px 6px; }
  .alpha .al { min-width: 18px; padding: 2px 0; background: none; border: 0; border-radius: 4px;
               color: var(--tune-text-muted); font: inherit; font-size: 10.5px; font-weight: 700;
               cursor: pointer; text-align: center; }
  .alpha .al:hover { color: var(--tune-text); background: var(--tune-surface-hover); }
  .alpha .al.on { background: var(--tune-accent); color: #1a1206; }
  .rht { font-size: 11px; letter-spacing: .05em; text-transform: uppercase; font-weight: 700; color: var(--tune-text-muted); }
  .allbtn { display: flex; align-items: center; gap: 5px; margin-left: auto; background: none; border: 0; color: var(--tune-text-muted); font: inherit; font-size: 11px; padding: 3px 6px; border-radius: 6px; cursor: pointer; }
  .allbtn:hover { color: var(--tune-accent); background: var(--tune-surface-hover); }
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
