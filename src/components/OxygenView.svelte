<script lang="ts">
  import { onMount } from 'svelte';
  import QualityBadge from './QualityBadge.svelte';
  import OxygenFacetRail from './OxygenFacetRail.svelte';
  import { getFilteredTracks, getLibraryFacets, artworkUrl, type FacetValue } from '../lib/api';
  import { getTrackExtendedMetadata, getMetadataFieldSettings, type MetadataCategory } from '../lib/api/metadata';
  import { displayFields } from '../lib/stores/displayFields';
  import { preferences, type OxygenViewMode } from '../lib/stores/preferences';
  import { activeView } from '../lib/stores/navigation';
  import { fold } from '../lib/utils';
  import type { Track } from '../lib/types';

  const NEW_KEYS = new Set(['release_country', 'mb_release_track_id', 'encoder_software', 'source_media']);
  const LOAD_LIMIT = 3000; // client window; full-library facets = server index (Phase 2b)

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
  let serverFacets = $state<Record<string, FacetValue[]>>({});
  const SERVER_FACET_FIELDS = ['genre', 'label', 'year', 'artist', 'country', 'mood', 'source'];
  let facetSel = $state<{ field: string; value: string } | null>(null);
  let albumFilter = $state<string | number | null>(null);
  let albumFilterLabel = $state('');
  // Mobile: rail + inspector become slide-over drawers.
  let mobileRail = $state(false);
  let mobileInspector = $state(false);
  let isNarrow = $state(false);

  let mode = $derived<OxygenViewMode>($preferences.oxygenView);
  let columns = $derived(($displayFields ?? []).filter(k => k in COLUMN_DEFS));

  let labelOf = $derived.by(() => {
    const m: Record<string, string> = {};
    for (const cat of categories) for (const f of cat.fields) m[f.key] = f.label;
    return m;
  });

  // A selected facet maps to a server track-filter param (server-side filtering,
  // full library — not just the loaded window).
  function facetParam(sel: { field: string; value: string } | null): Record<string, string | number> {
    if (!sel) return {};
    switch (sel.field) {
      case 'genre': return { genre: sel.value };
      case 'label': return { label: sel.value };
      case 'year': return { year: Number(sel.value) };
      case 'artist': return { artist: sel.value };
      case 'country': return { country: sel.value };
      case 'mood': return { mood: sel.value };
      case 'source': return { source_media: sel.value };
      default: return {};
    }
  }

  let visible = $derived.by(() => {
    let list = tracks; // already server-filtered by the active facet
    if (albumFilter != null) list = list.filter(t => (t.album_id ?? `t:${t.album_title}`) === albumFilter);
    const q = fold(query.trim());
    if (q) list = list.filter(t =>
      fold(t.title).includes(q) || fold(t.artist_name ?? '').includes(q) ||
      fold(t.album_title ?? '').includes(q) || fold(t.label ?? '').includes(q));
    return list;
  });

  interface AlbumGroup { key: string | number; title: string; artist: string; cover?: string | null; year?: number | null; format?: any; sr?: number | null; bd?: number | null; source?: any; tracks: Track[]; }
  let albums = $derived.by<AlbumGroup[]>(() => {
    const m = new Map<string | number, AlbumGroup>();
    for (const t of visible) {
      const key = t.album_id ?? `t:${t.album_title}`;
      let g = m.get(key);
      if (!g) { g = { key, title: t.album_title ?? 'Album inconnu', artist: t.artist_name ?? '', cover: t.cover_path, year: t.year, format: t.format, sr: t.sample_rate, bd: t.bit_depth, source: t.source, tracks: [] }; m.set(key, g); }
      g.tracks.push(t);
    }
    return [...m.values()].sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'fr') || (a.title || '').localeCompare(b.title || '', 'fr'));
  });

  function fmtDur(ms?: number): string {
    if (!ms) return '';
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  function setMode(m: OxygenViewMode) { preferences.update(p => ({ ...p, oxygenView: m })); }

  async function select(t: Track) {
    selected = t; ext = {};
    if (isNarrow) mobileInspector = true;
    if (t.id == null) return;
    extLoading = true;
    try { ext = await getTrackExtendedMetadata(t.id); } catch { ext = {}; } finally { extLoading = false; }
  }
  function openAlbum(g: AlbumGroup) {
    albumFilter = g.key; albumFilterLabel = `${g.title} — ${g.artist}`;
    setMode('album'); if (g.tracks[0]) select(g.tracks[0]);
  }
  function clearAlbum() { albumFilter = null; albumFilterLabel = ''; }

  let inspectorGroups = $derived.by(() => {
    const groups: { name: string; rows: { key: string; label: string; value: string; isNew: boolean }[] }[] = [];
    const used = new Set<string>();
    for (const cat of categories) {
      const rows = cat.fields.filter(f => ext[f.key]).map(f => { used.add(f.key); return { key: f.key, label: f.label, value: ext[f.key], isNew: NEW_KEYS.has(f.key) }; });
      if (rows.length) groups.push({ name: cat.name, rows });
    }
    const others = Object.keys(ext).filter(k => !used.has(k)).map(k => ({ key: k, label: labelOf[k] ?? k, value: ext[k], isNew: NEW_KEYS.has(k) }));
    if (others.length) groups.push({ name: 'Autres', rows: others });
    return groups;
  });

  async function loadTracks() {
    loading = true; error = null;
    try {
      const res = await getFilteredTracks({ ...facetParam(facetSel), limit: LOAD_LIMIT });
      tracks = res.items;
      selected = null;
      if (tracks.length) select(tracks[0]);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Chargement impossible';
    } finally { loading = false; }
  }

  onMount(() => {
    const mq = window.matchMedia('(max-width: 1150px)');
    const upd = () => { isNarrow = mq.matches; if (!isNarrow) { mobileRail = false; mobileInspector = false; } };
    upd();
    mq.addEventListener('change', upd);
    getMetadataFieldSettings().then(f => { categories = f.categories ?? []; }).catch(() => {});
    const fields = $preferences.oxygenFacets.filter(f => SERVER_FACET_FIELDS.includes(f));
    if (fields.length) getLibraryFacets(fields).then(f => { serverFacets = f; }).catch(() => {});
  });

  // Server-driven: (re)fetch the filtered track set whenever the facet changes.
  $effect(() => { void facetSel; loadTracks(); });
</script>

<div class="oxygen">
  <header class="bar">
    <button class="icnbtn" onclick={() => activeView.set('library')} title="Retour à la bibliothèque" aria-label="Retour">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
    </button>
    <button class="icnbtn railtoggle" onclick={() => mobileRail = true} title="Facettes" aria-label="Facettes">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h18M6 12h12M10 19h4"/></svg>
    </button>
    <div class="titleblock"><div class="eyebrow">Bibliothèque · Oxygen</div><h1>Collection</h1></div>

    <div class="seg">
      <button class:on={mode === 'album'} onclick={() => setMode('album')} title="Albums">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="7" height="7" rx="1.5"/><path d="M13 6h8M13 10h8M3 15h18M3 19h18"/></svg>
      </button>
      <button class:on={mode === 'grid'} onclick={() => setMode('grid')} title="Grille">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
      </button>
      <button class:on={mode === 'detail'} onclick={() => setMode('detail')} title="Détails">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      </button>
    </div>

    <div class="search">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      <input placeholder="Filtrer…" bind:value={query} />
    </div>
    <div class="count">{visible.length.toLocaleString('fr')}</div>
  </header>

  {#if facetSel || albumFilter != null}
    <div class="crumbs">
      {#if facetSel}<button class="crumb" onclick={() => facetSel = null}>{facetSel.value} <span class="x">×</span></button>{/if}
      {#if albumFilter != null}<button class="crumb" onclick={clearAlbum}>{albumFilterLabel} <span class="x">×</span></button>{/if}
    </div>
  {/if}

  <div class="body">
    <aside class="railwrap" class:open={mobileRail}>
      <OxygenFacetRail tracks={tracks} serverFacets={serverFacets} facets={$preferences.oxygenFacets} selected={facetSel} onSelect={(field, value) => { facetSel = value == null ? null : { field, value }; mobileRail = false; }} />
    </aside>

    <section class="main">
      {#if loading}
        <div class="state">Chargement de la bibliothèque…</div>
      {:else if error}
        <div class="state err">{error}</div>
      {:else if !visible.length}
        <div class="state">Aucune piste pour ce filtre.</div>
      {:else if mode === 'grid'}
        <div class="grid">
          {#each albums as g (g.key)}
            <button class="card" onclick={() => openAlbum(g)}>
              <div class="cwrap">
                {#if g.cover}<img class="cvr" src={artworkUrl(g.cover)} alt="" loading="lazy" onerror={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />{:else}<div class="cvr ph">♪</div>{/if}
                <span class="qov"><QualityBadge format={g.format} sampleRate={g.sr} bitDepth={g.bd} source={g.source} /></span>
              </div>
              <div class="ct">{g.title}</div>
              <div class="ca">{g.artist}</div>
            </button>
          {/each}
        </div>
      {:else if mode === 'album'}
        <div class="albums">
          {#each albums as g (g.key)}
            <div class="album">
              <div class="aart">
                {#if g.cover}<img class="cvr" src={artworkUrl(g.cover)} alt="" loading="lazy" onerror={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />{:else}<div class="cvr ph">♪</div>{/if}
              </div>
              <div class="abody">
                <div class="ahead">
                  <div><div class="at">{g.title}</div><div class="aa">{g.artist}{g.year ? ` · ${g.year}` : ''} · {g.tracks.length} titres</div></div>
                  <QualityBadge format={g.format} sampleRate={g.sr} bitDepth={g.bd} source={g.source} />
                </div>
                <div class="atracks">
                  {#each g.tracks as t (t.id)}
                    <button class="trk" class:sel={selected?.id === t.id} onclick={() => select(t)}>
                      <span class="tn">{t.track_number ?? ''}</span>
                      <span class="tt">{t.title}</span>
                      <span class="td">{fmtDur(t.duration_ms)}</span>
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="tablescroll">
          <table>
            <thead><tr>
              <th class="n">#</th><th>Titre</th><th>Artiste</th><th>Album</th><th>Qualité</th>
              {#each columns as c}<th>{COLUMN_DEFS[c].label}</th>{/each}
              <th class="r">Durée</th>
            </tr></thead>
            <tbody>
              {#each visible as t (t.id)}
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
      {/if}
    </section>

    <aside class="inspector" class:empty={!selected} class:open={mobileInspector}>
      <button class="drawerclose mobonly" onclick={() => mobileInspector = false} aria-label="Fermer">×</button>
      {#if selected}
        <div class="insp-title">{selected.title}</div>
        <div class="insp-sub">{selected.artist_name ?? ''} · {selected.album_title ?? ''}</div>
        <div class="insp-badges"><QualityBadge format={selected.format} sampleRate={selected.sample_rate} bitDepth={selected.bit_depth} source={selected.source} /></div>
        {#if extLoading}
          <div class="state small">Lecture des métadonnées…</div>
        {:else if !inspectorGroups.length}
          <div class="state small">Aucune métadonnée étendue.</div>
        {:else}
          {#each inspectorGroups as grp}
            <div class="mgroup"><h4>{grp.name}</h4>
              {#each grp.rows as row}
                <div class="field" class:isnew={row.isNew}>
                  <span class="k">{row.label}{#if row.isNew}<span class="tag">nouveau</span>{/if}</span>
                  <span class="v" title={row.value}>{row.value}</span>
                </div>
              {/each}
            </div>
          {/each}
        {/if}
      {:else}<div class="state small">Sélectionnez une piste.</div>{/if}
    </aside>
    {#if mobileRail || mobileInspector}
      <button class="backdrop" onclick={() => { mobileRail = false; mobileInspector = false; }} aria-label="Fermer"></button>
    {/if}
  </div>
</div>

<style>
  .oxygen { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--tune-bg); color: var(--tune-text); }
  .bar { display: flex; align-items: center; gap: 12px; padding: 12px 18px; border-bottom: 1px solid var(--tune-border); flex-shrink: 0; }
  .icnbtn { background: var(--tune-surface); border: 1px solid var(--tune-border); color: var(--tune-text-secondary); width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; cursor: pointer; }
  .icnbtn:hover { color: var(--tune-text); border-color: var(--tune-accent); }
  .titleblock .eyebrow { font-size: 11px; letter-spacing: .04em; color: var(--tune-accent); }
  .titleblock h1 { font-size: 19px; font-weight: 700; margin: 1px 0 0; }
  .seg { display: inline-flex; background: var(--tune-surface); border: 1px solid var(--tune-border); border-radius: 9px; padding: 3px; }
  .seg button { background: none; border: 0; color: var(--tune-text-secondary); padding: 6px 10px; border-radius: 6px; cursor: pointer; display: grid; place-items: center; }
  .seg button.on { background: var(--tune-accent); color: #1a1206; }
  .search { flex: 1; max-width: 320px; position: relative; display: flex; align-items: center; }
  .search svg { position: absolute; left: 11px; color: var(--tune-text-muted); }
  .search input { width: 100%; background: var(--tune-surface); border: 1px solid var(--tune-border); border-radius: 20px; color: var(--tune-text); font: inherit; padding: 8px 12px 8px 32px; outline: none; }
  .search input:focus { border-color: var(--tune-accent); }
  .count { font-size: 12px; color: var(--tune-text-muted); font-variant-numeric: tabular-nums; min-width: 40px; text-align: right; }

  .crumbs { display: flex; gap: 8px; padding: 8px 18px 0; flex-wrap: wrap; }
  .crumb { background: var(--tune-surface-selected); border: 1px solid var(--tune-border); color: var(--tune-accent); border-radius: 20px; padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer; }
  .crumb .x { opacity: .7; margin-left: 3px; }

  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 220px 1fr 322px; position: relative; }
  .mobonly { display: none; }
  .railtoggle { display: none; }
  @media (max-width: 780px) { .railtoggle { display: inline-grid; } }
  .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.5); border: 0; z-index: 35; cursor: pointer; }
  .drawerclose { position: absolute; top: 10px; right: 12px; background: var(--tune-surface-hover); border: 0; color: var(--tune-text); width: 30px; height: 30px; border-radius: 50%; font-size: 20px; line-height: 1; cursor: pointer; z-index: 2; }
  /* Tablet: inspector becomes a right slide-over. */
  @media (max-width: 1150px) {
    .body { grid-template-columns: 200px 1fr; }
    .inspector { position: absolute; top: 0; right: 0; bottom: 0; width: 340px; max-width: 88vw; transform: translateX(100%); transition: transform .22s ease; z-index: 40; box-shadow: -8px 0 30px rgba(0,0,0,.4); }
    .inspector.open { transform: none; }
    .mobonly { display: inline-grid; }
  }
  /* Phone: rail also becomes a left slide-over. */
  @media (max-width: 780px) {
    .body { grid-template-columns: 1fr; }
    .railwrap { position: absolute; top: 0; left: 0; bottom: 0; width: 280px; max-width: 84vw; transform: translateX(-100%); transition: transform .22s ease; z-index: 40; box-shadow: 8px 0 30px rgba(0,0,0,.4); }
    .railwrap.open { transform: none; }
  }
  @media (prefers-reduced-motion: reduce) { .inspector, .railwrap { transition: none; } }

  .railwrap { border-right: 1px solid var(--tune-border); background: var(--tune-surface); min-height: 0; display: flex; }
  .railwrap :global(.rail) { flex: 1; }
  .main { min-width: 0; min-height: 0; overflow: auto; padding: 14px 18px 20px; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 20px 16px; }
  .card { background: none; border: 0; padding: 0; cursor: pointer; text-align: left; color: inherit; }
  .cwrap { position: relative; border-radius: 10px; overflow: hidden; box-shadow: 0 8px 22px rgba(0,0,0,.35); aspect-ratio: 1; }
  .cvr { width: 100%; height: 100%; object-fit: cover; display: block; background: var(--tune-surface-hover); }
  .cvr.ph { display: grid; place-items: center; font-size: 30px; color: var(--tune-text-muted); }
  .card:hover .cwrap { transform: translateY(-3px); transition: transform .15s; }
  .qov { position: absolute; top: 7px; right: 7px; }
  .ct { margin-top: 9px; font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ca { color: var(--tune-text-secondary); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .albums { display: flex; flex-direction: column; }
  .album { display: grid; grid-template-columns: 116px 1fr; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--tune-border); }
  .aart .cvr { border-radius: 10px; box-shadow: 0 8px 22px rgba(0,0,0,.35); }
  .ahead { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .at { font-size: 16px; font-weight: 700; }
  .aa { color: var(--tune-text-secondary); font-size: 13px; margin-top: 1px; }
  .atracks { margin-top: 10px; display: flex; flex-direction: column; }
  .trk { display: grid; grid-template-columns: 26px 1fr auto; gap: 12px; align-items: center; background: none; border: 0; color: var(--tune-text); font: inherit; text-align: left; padding: 6px 8px; border-radius: 7px; cursor: pointer; }
  .trk:hover { background: var(--tune-surface-hover); }
  .trk.sel { background: var(--tune-surface-selected); }
  .trk .tn { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; color: var(--tune-text-muted); text-align: right; }
  .trk .tt { font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .trk .td { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; color: var(--tune-text-secondary); }

  .tablescroll { border: 1px solid var(--tune-border); border-radius: 12px; background: var(--tune-surface); overflow: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th { position: sticky; top: 0; background: var(--tune-bg-secondary); text-align: left; font-size: 10.5px; letter-spacing: .04em; text-transform: uppercase; color: var(--tune-text-secondary); font-weight: 600; padding: 9px 12px; border-bottom: 1px solid var(--tune-border); white-space: nowrap; }
  th.n, td.n { width: 34px; text-align: right; color: var(--tune-text-muted); }
  th.r, td.r { text-align: right; }
  tbody td { padding: 7px 12px; border-bottom: 1px solid var(--tune-border); white-space: nowrap; }
  tbody tr { cursor: pointer; }
  tbody tr:hover td { background: var(--tune-surface-hover); }
  tbody tr.sel td { background: var(--tune-surface-selected); }
  td.title { font-weight: 500; max-width: 230px; overflow: hidden; text-overflow: ellipsis; }
  td.dim { color: var(--tune-text-secondary); max-width: 170px; overflow: hidden; text-overflow: ellipsis; }
  td.mono { font-family: ui-monospace, Menlo, monospace; font-variant-numeric: tabular-nums; color: var(--tune-text-secondary); }

  .inspector { border-left: 1px solid var(--tune-border); background: var(--tune-surface); padding: 18px; overflow-y: auto; min-height: 0; }
  .inspector.empty { display: grid; place-items: center; }
  .insp-title { font-size: 17px; font-weight: 700; }
  .insp-sub { color: var(--tune-text-secondary); font-size: 13px; margin-top: 2px; }
  .insp-badges { margin: 12px 0 4px; }
  .mgroup { margin-top: 16px; }
  .mgroup h4 { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--tune-text-muted); border-bottom: 1px solid var(--tune-border); padding-bottom: 6px; margin: 0 0 4px; }
  .field { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; align-items: baseline; }
  .field .k { color: var(--tune-text-secondary); font-size: 12px; }
  .field .v { color: var(--tune-text); font-size: 12.5px; text-align: right; font-family: ui-monospace, Menlo, monospace; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .field.isnew .k, .field.isnew .v { color: var(--tune-accent); }
  .tag { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: var(--tune-accent); background: rgba(var(--tune-accent-rgb), .14); padding: 1px 5px; border-radius: 4px; margin-left: 6px; }
  .state { padding: 40px 20px; text-align: center; color: var(--tune-text-muted); }
  .state.err { color: var(--tune-danger, var(--tune-error)); }
  .state.small { padding: 20px 4px; font-size: 12.5px; }
</style>
