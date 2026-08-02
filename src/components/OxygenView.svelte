<script lang="ts">
  import { onMount } from 'svelte';
  import QualityBadge from './QualityBadge.svelte';
  import OxygenFacetRail from './OxygenFacetRail.svelte';
  import HeartButton from './HeartButton.svelte';
  import { getFilteredTracks, getLibraryFacets, getFolderFacet, getAlbumTracks, artworkUrl, addToQueue, getQueue, jumpInQueue, type FacetValue, type FolderFacet } from '../lib/api';
  import { getTrackExtendedMetadata, getMetadataFieldSettings, type MetadataCategory } from '../lib/api/metadata';
  import { displayFields } from '../lib/stores/displayFields';
  import { preferences, type OxygenViewMode } from '../lib/stores/preferences';
  import { get } from 'svelte/store';
  import { activeView, pendingOxygenFolder } from '../lib/stores/navigation';
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import { currentTrackId } from '../lib/stores/nowPlaying';
  import { notifications } from '../lib/stores/notifications';
  import { fold } from '../lib/utils';
  import { t } from '../lib/i18n';
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
  const SERVER_FACET_FIELDS = ['genre', 'label', 'year', 'artist', 'format', 'sample_rate', 'bit_depth', 'country', 'mood', 'source', 'rating', 'collection'];
  // Multi-facet: one active value per field, combinable (Bertrand :
  // « filtrer simultanément par Genre, year et label »). Chaque champ garde
  // au plus une valeur ; les champs actifs se cumulent côté serveur.
  // A folder path handed over from the Répertoires view ("open in library"
  // button, pendingOxygenFolder) pre-filters Oxygen on that folder + its
  // subfolders. Consumed once at init so the first data fetch is already scoped
  // (no empty-then-filtered double load). Shows as a removable folder crumb.
  function takePendingOxygenFolder(): Record<string, string> {
    const pf = get(pendingOxygenFolder);
    if (pf) { pendingOxygenFolder.set(null); return { folder: pf }; }
    return {};
  }
  let facetSels = $state<Record<string, string>>(takePendingOxygenFolder());
  // Folder facet (drill-down): the current path lives in facetSels.folder (so it
  // flows to /tracks and /facets like any other filter); folderData holds the
  // breadcrumb + child folders fetched from /library/folder-facet for that path.
  let folderData = $state<FolderFacet>({ path: null, crumbs: [], children: [] });
  let folderLoading = $state(false);
  let albumFilter = $state<string | number | null>(null);
  let albumFilterLabel = $state('');
  // Mobile: rail + inspector become slide-over drawers.
  let mobileRail = $state(false);
  let mobileInspector = $state(false);
  // Desktop: the inspector is a fixed grid column, so the mobile drawer close
  // never applied — there was no way to dismiss the metadata panel (31/07).
  // Closing collapses the column; selecting a track brings it back.
  let inspectorCollapsed = $state(false);
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
  function facetParam(sels: Record<string, string>): Record<string, string | number> {
    const out: Record<string, string | number> = {};
    for (const [field, value] of Object.entries(sels)) {
      switch (field) {
        case 'genre': out.genre = value; break;
        case 'label': out.label = value; break;
        case 'year': out.year = Number(value); break;
        case 'artist': out.artist = value; break;
        case 'format': out.format = value; break;
        case 'sample_rate': out.sample_rate = Number(value); break;
        case 'bit_depth': out.bit_depth = Number(value); break;
        case 'country': out.country = value; break;
        case 'mood': out.mood = value; break;
        case 'source': out.source_media = value; break;
        case 'rating': out.rating = Number(value); break;
        case 'collection': out.collection = value; break;
        case 'folder': out.folder = value; break;
      }
    }
    return out;
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

  interface DiscGroup { disc: number; subtitle: string | null; tracks: Track[]; }
  interface AlbumGroup { key: string | number; title: string; artist: string; cover?: string | null; year?: number | null; format?: any; sr?: number | null; bd?: number | null; source?: any; tracks: Track[]; albumArtistSet: Set<string>; artistSet: Set<string>; }
  let albums = $derived.by<AlbumGroup[]>(() => {
    const m = new Map<string | number, AlbumGroup>();
    for (const t of visible) {
      const key = t.album_id ?? `t:${t.album_title}`;
      let g = m.get(key);
      if (!g) { g = { key, title: t.album_title ?? 'Album inconnu', artist: '', albumArtistSet: new Set(), cover: t.cover_path, year: t.year, format: t.format, sr: t.sample_rate, bd: t.bit_depth, source: t.source, tracks: [], artistSet: new Set() }; m.set(key, g); }
      if (t.artist_name) g.artistSet.add(t.artist_name);
      if (t.album_artist) g.albumArtistSet.add(t.album_artist);
      g.tracks.push(t);
    }
    // Compilation display artist: prefer the tagged ALBUMARTIST; else, when the
    // album mixes several track artists, show "Artistes multiples" rather than
    // whichever track happened to load first (Dominique). Single-artist albums
    // keep that artist. (See albumArtistOf.)
    for (const g of m.values()) g.artist = albumArtistOf(g);
    return [...m.values()].sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'fr') || (a.title || '').localeCompare(b.title || '', 'fr'));
  });
  // Mirrors the server's compilation detection (case-insensitive ALBUMARTIST
  // sentinels) so a "Various Artists"-tagged album is recognised even when the
  // exact casing/wording varies between files.
  function isVariousArtists(s: string): boolean {
    return /^\s*(various artists|various|va|compilations)\s*$/i.test(s);
  }
  function albumArtistOf(g: AlbumGroup): string {
    const aa = [...g.albumArtistSet].filter(s => s.trim().length > 0);
    const hasVA = aa.some(isVariousArtists);
    // A single, coherent ALBUMARTIST that isn't a VA sentinel wins.
    if (aa.length === 1 && !hasVA) return aa[0];
    // A VA tag, divergent ALBUMARTISTs, or several distinct track artists all
    // mean a compilation → show "Various Artists" instead of track 1's tag.
    if (hasVA || aa.length > 1 || g.artistSet.size > 1) return $t('oxygen.variousArtists');
    // Single-artist album with no usable ALBUMARTIST: fall back to the artist.
    return [...g.artistSet][0] ?? '';
  }
  // Split an album's tracks into disc groups so per-disc subtitles (DISCSUBTITLE)
  // can head each disc. A single untitled disc renders flat (no heading).
  function discGroups(g: AlbumGroup): DiscGroup[] {
    const m = new Map<number, DiscGroup>();
    for (const t of g.tracks) {
      const disc = t.disc_number ?? 1;
      let d = m.get(disc);
      if (!d) { d = { disc, subtitle: t.disc_subtitle ?? null, tracks: [] }; m.set(disc, d); }
      if (!d.subtitle && t.disc_subtitle) d.subtitle = t.disc_subtitle;
      d.tracks.push(t);
    }
    return [...m.values()].sort((a, b) => a.disc - b.disc);
  }

  function fmtDur(ms?: number): string {
    if (!ms) return '';
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  function setMode(m: OxygenViewMode) { preferences.update(p => ({ ...p, oxygenView: m })); }

  async function select(t: Track) {
    selected = t; ext = {};
    inspectorCollapsed = false;
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
  // In-view back: undo the album drill-down, then the facet selections one by
  // one, and only leave Oxygen for the classic Library once there's nothing
  // left to undo. Previously the header back always exited Oxygen, so a user
  // filtering by genre/artist/… lost the whole view on the first click
  // (Benjithom, v0.9.10).
  function oxyBack() {
    if (albumFilter != null) { clearAlbum(); return; }
    const keys = Object.keys(facetSels);
    if (keys.length) {
      const next = { ...facetSels };
      delete next[keys[keys.length - 1]];
      facetSels = next;
      return;
    }
    activeView.set('library');
  }

  // Play wiring (Bertrand, .15 v0.9.0 pre-release test: rien n'était cliquable
  // pour lancer la lecture). Double-clic piste = joue la piste puis la suite de
  // SON album (prévisible, même sur une liste filtrée de 3000 pistes) ; bouton
  // ▶ sur les cartes album = joue l'album groupé.
  let zone = $derived($currentZone);
  // Piste en lecture : `sel` marque la piste ouverte dans l'inspecteur (et
  // openAlbum sélectionne la 1re piste), ce qui se lisait à tort comme « en
  // lecture » — d'où un indicateur distinct. L'id passe par `currentTrackId`,
  // qui absorbe les deux formes de `current_track` renvoyées par le serveur.
  let playingId = $derived($currentTrackId);
  let playingPaused = $derived(zone?.state !== 'playing' && zone?.state !== 'buffering');
  // Précalculés : dans {#each g.tracks as t}, la piste `t` masque le store
  // i18n `t` — $t y est donc inutilisable.
  let L_PLAY_NEXT = $derived($t('library.playNext'));
  let L_ADD_QUEUE = $derived($t('queue.addToQueue'));
  let L_NOW_PLAYING = $derived($t('nav.nowplaying'));
  async function playTracks(ids: number[]) {
    if (!zone?.id) { notifications.error($t('library.noZoneSelected')); return; }
    if (!ids.length) return;
    try { await playAndSync(zone.id, { track_ids: ids }); }
    catch (e) { notifications.error($t('library.playbackError') + ' : ' + (e instanceof Error ? e.message : String(e))); }
  }
  async function playBody(body: Record<string, unknown>) {
    if (!zone?.id) { notifications.error($t('library.noZoneSelected')); return; }
    try { await playAndSync(zone.id, body); }
    catch (e) { notifications.error($t('library.playbackError') + ' : ' + (e instanceof Error ? e.message : String(e))); }
  }
  function playAlbumGroup(g: AlbumGroup) {
    // album_id = chemin rapide serveur (une requête, la file se construit côté
    // serveur) — l'envoi de track_ids reconstruisait la file piste à piste et
    // se sentait lent (Bertrand). Fallback track_ids pour les groupes sans id.
    if (typeof g.key === 'number') return playBody({ album_id: g.key });
    return playTracks(g.tracks.map(t => t.id).filter(Boolean) as number[]);
  }
  function playFromTrack(t: Track) {
    // album_id + track_id: the server resolves the album in ITS canonical
    // order and infers the start index from track_id. Computing start_index
    // client-side against the VIEW's ordering launched the wrong track
    // (Bertrand: « Lire à partir de ne lance pas le morceau sélectionné »).
    if (typeof t.album_id === 'number' && typeof t.id === 'number') {
      return playBody({ album_id: t.album_id, track_id: t.id });
    }
    const key = t.album_id ?? `t:${t.album_title}`;
    const g = albums.find(a => a.key === key);
    const list = g ? g.tracks : [t];
    const idx = Math.max(0, list.findIndex(x => x.id === t.id));
    return playTracks(list.slice(idx).map(x => x.id).filter(Boolean) as number[]);
  }

  // Actions file — même sémantique que la bibliothèque classique (y compris
  // le démarrage quand la zone est idle).
  // NB : le paramètre piste s'appelle `track`, pas `t` — `t` est le store i18n
  // et le masquer cassait la traduction ici : `get(t)` recevait la piste, d'où
  // « n.subscribe is not a function » au clic sur ⏭ / ＋.
  async function queueNext(track: Track) {
    if (!zone?.id || track.id == null) { if (!zone?.id) notifications.error($t('library.noZoneSelected')); return; }
    try {
      const qs = await getQueue(zone.id);
      const nextPos = qs.position + 1;
      const idle = qs.length === 0 || (zone.state !== 'playing' && zone.state !== 'buffering');
      await addToQueue(zone.id, { track_id: track.id, position: nextPos });
      if (idle) await jumpInQueue(zone.id, nextPos);
      notifications.success(`"${track.title}" — ${$t('library.playNext').toLowerCase()}`);
    } catch (e) {
      notifications.error(e instanceof Error ? e.message : String(e));
    }
  }
  async function queueAppendTrack(track: Track) {
    if (!zone?.id || track.id == null) { if (!zone?.id) notifications.error($t('library.noZoneSelected')); return; }
    try {
      await addToQueue(zone.id, { track_id: track.id });
      notifications.success(`"${track.title}" — ${$t('queue.addToQueue').toLowerCase()}`);
    } catch (e) {
      notifications.error(e instanceof Error ? e.message : String(e));
    }
  }
  async function queueAppendAlbum(g: AlbumGroup) {
    if (!zone?.id) { notifications.error($t('library.noZoneSelected')); return; }
    try {
      // /queue/add ne connaît que track_id(s) : contrairement au endpoint de
      // lecture, il ignore album_id et répond 400 (« track_ids, track_id,
      // source+source_id, or tracks[] required »). On résout donc les pistes de
      // l'album — côté serveur pour avoir son ordre canonique et la totalité de
      // l'album, pas seulement les pistes chargées dans la vue filtrée — et on
      // les envoie en un seul lot.
      let ids: number[] = [];
      if (typeof g.key === 'number') {
        const full = await getAlbumTracks(g.key).catch(() => [] as Track[]);
        ids = full.map(t => t.id).filter(id => id != null) as number[];
      }
      if (!ids.length) ids = g.tracks.map(t => t.id).filter(id => id != null) as number[];
      if (!ids.length) return;
      await addToQueue(zone.id, { track_ids: ids });
      notifications.success(`"${g.title}" — ${$t('queue.addToQueue').toLowerCase()}`);
    } catch (e) {
      notifications.error(e instanceof Error ? e.message : String(e));
    }
  }

  let inspectorGroups = $derived.by(() => {
    const groups: { name: string; rows: { key: string; label: string; value: string; isNew: boolean }[] }[] = [];
    const used = new Set<string>();
    // Track-column extra fields (composer, label, ISRC, BPM, comments,
    // MusicBrainz recording id, disc subtitle) live on the `tracks` table, not
    // the k/v `track_metadata` store that feeds `ext` — so they were absent from
    // the inspector entirely (Bertrand: "toutes les extra-metadonnées ne sont
    // pas affichées"). Surface them from the selected track object, which
    // already carries them. Only non-empty values are shown.
    if (selected) {
      const detail: { key: string; label: string; value: string; isNew: boolean }[] = [];
      const add = (key: string, label: string, val: unknown) => {
        if (val != null && String(val).trim() !== '') detail.push({ key, label, value: String(val), isNew: false });
      };
      add('composer', $t('oxygen.detail.composer'), selected.composer);
      add('label', $t('oxygen.detail.label'), selected.label);
      add('isrc', 'ISRC', selected.isrc);
      add('bpm', 'BPM', selected.bpm);
      add('disc_subtitle', $t('oxygen.detail.discSubtitle'), selected.disc_subtitle);
      add('comments', $t('oxygen.detail.comments'), selected.comments);
      add('musicbrainz_recording_id', 'MusicBrainz Recording ID', selected.musicbrainz_recording_id);
      if (detail.length) groups.push({ name: $t('oxygen.details'), rows: detail });
    }
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
      const res = await getFilteredTracks({ ...facetParam(facetSels), limit: LOAD_LIMIT });
      tracks = res.items;
      selected = null;
      if (tracks.length) select(tracks[0]);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Chargement impossible';
    } finally { loading = false; }
  }

  const serverFacetFields = $preferences.oxygenFacets.filter(f => SERVER_FACET_FIELDS.includes(f));
  const folderEnabled = $preferences.oxygenFacets.includes('folder');
  // Cumulative: recompute facet counts over the active filter set so selecting a
  // genre narrows the labels/artists/… lists (Dominique). A facet excludes its
  // own field server-side, keeping its alternatives visible.
  async function loadFacets() {
    if (!serverFacetFields.length) return;
    try { serverFacets = await getLibraryFacets(serverFacetFields, facetParam(facetSels), $preferences.oxygenFacetLimit); }
    catch { /* keep the previous facet counts on transient failure */ }
  }

  // Fetch the child folders of the current path (facetSels.folder), narrowed by
  // the other active facets. The current breadcrumb path IS the folder filter.
  async function loadFolder() {
    if (!folderEnabled) return;
    folderLoading = true;
    try { folderData = await getFolderFacet(facetSels.folder ?? null, facetParam(facetSels), $preferences.oxygenFacetLimit); }
    catch { /* keep the previous folder listing on transient failure */ }
    finally { folderLoading = false; }
  }

  // Drill into (and filter by) a folder; null returns to the library roots.
  function drillFolder(path: string | null) {
    const next = { ...facetSels };
    if (path == null) delete next.folder; else next.folder = path;
    facetSels = next; // triggers loadTracks + loadFacets + loadFolder via effects
  }

  onMount(() => {
    const mq = window.matchMedia('(max-width: 1150px)');
    const upd = () => { isNarrow = mq.matches; if (!isNarrow) { mobileRail = false; mobileInspector = false; } };
    upd();
    mq.addEventListener('change', upd);
    getMetadataFieldSettings().then(f => { categories = f.categories ?? []; }).catch(() => {});
  });

  // Server-driven: (re)fetch the filtered tracks whenever the selection changes.
  $effect(() => { void JSON.stringify(facetSels); loadTracks(); });
  // Facet counts also re-fetch when the per-facet value limit changes.
  $effect(() => { void JSON.stringify(facetSels); void $preferences.oxygenFacetLimit; loadFacets(); });
  // Folder drill-down re-fetches its children when the path or any filter changes.
  $effect(() => { void JSON.stringify(facetSels); void $preferences.oxygenFacetLimit; loadFolder(); });
</script>

<!-- Indicateur « en lecture », partagé par la vue album et la vue tableau : il
     prend la place du numéro de piste, seul créneau de largeur fixe des deux
     listes. Barres figées quand la zone est en pause, comme l'accueil. -->
{#snippet nowPlayingBars()}
  <span class="eqbars" class:paused={playingPaused} title={L_NOW_PLAYING} aria-label={L_NOW_PLAYING}>
    <span></span><span></span><span></span>
  </span>
{/snippet}

<div class="oxygen">
  <header class="bar">
    <button class="icnbtn" onclick={oxyBack} title={$t('oxygen.back')} aria-label={$t('oxygen.back')}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
    </button>
    <button class="icnbtn railtoggle" onclick={() => mobileRail = true} title={$t('oxygen.facets')} aria-label={$t('oxygen.facets')}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h18M6 12h12M10 19h4"/></svg>
    </button>
    <div class="titleblock"><div class="eyebrow">{$t('oxygen.eyebrow')}</div><h1>{$t('oxygen.title')}</h1></div>

    <div class="seg">
      <button class:on={mode === 'album'} onclick={() => setMode('album')} title={$t('oxygen.view.album')} aria-label={$t('oxygen.view.album')}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="7" height="7" rx="1.5"/><path d="M13 6h8M13 10h8M3 15h18M3 19h18"/></svg>
      </button>
      <button class:on={mode === 'grid'} onclick={() => setMode('grid')} title={$t('oxygen.view.grid')} aria-label={$t('oxygen.view.grid')}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
      </button>
      <button class:on={mode === 'detail'} onclick={() => setMode('detail')} title={$t('oxygen.view.detail')} aria-label={$t('oxygen.view.detail')}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      </button>
    </div>

    <div class="search">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      <input placeholder={$t('oxygen.filter')} bind:value={query} />
    </div>
    <div class="count">{visible.length.toLocaleString('fr')}</div>
  </header>

  {#if Object.keys(facetSels).length || albumFilter != null}
    <div class="crumbs">
      {#each Object.entries(facetSels) as [field, value] (field)}
        <button class="crumb" title={value} onclick={() => { const next = { ...facetSels }; delete next[field]; facetSels = next; }}>{field === 'folder' ? (value.split(/[/\\]/).filter(Boolean).pop() ?? value) : value} <span class="x">×</span></button>
      {/each}
      {#if albumFilter != null}<button class="crumb" onclick={clearAlbum}>{albumFilterLabel} <span class="x">×</span></button>{/if}
    </div>
  {/if}

  <div class="body" class:noinsp={inspectorCollapsed}>
    <aside class="railwrap" class:open={mobileRail}>
      <OxygenFacetRail tracks={tracks} serverFacets={serverFacets} facets={$preferences.oxygenFacets} limit={$preferences.oxygenFacetLimit} selected={facetSels} folderCrumbs={folderData.crumbs} folderChildren={folderData.children} folderLoading={folderLoading} onFolderDrill={drillFolder} onSelect={(field, value) => { const next = { ...facetSels }; if (value == null) { delete next[field]; } else { next[field] = value; } facetSels = next; mobileRail = false; }} />
    </aside>

    <section class="main">
      {#if loading}
        <div class="state">{$t('oxygen.loading')}</div>
      {:else if error}
        <div class="state err">{error}</div>
      {:else if !visible.length}
        <div class="state">{$t('oxygen.empty')}</div>
      {:else if mode === 'grid'}
        <div class="grid">
          {#each albums as g (g.key)}
            <div class="card" role="button" tabindex="0" onclick={() => openAlbum(g)} ondblclick={() => playAlbumGroup(g)} onkeydown={(e) => e.key === 'Enter' && openAlbum(g)}>
              <div class="cwrap">
                {#if g.cover}<img class="cvr" src={artworkUrl(g.cover)} alt="" loading="lazy" onerror={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />{:else}<div class="cvr ph">♪</div>{/if}
                <span class="qov"><QualityBadge format={g.format} sampleRate={g.sr} bitDepth={g.bd} source={g.source} /></span>
                {#if typeof g.key === 'number'}<span class="hov" onclick={(e) => e.stopPropagation()}><HeartButton albumId={g.key} size={14} /></span>{/if}
                <button class="pov" title={$t('library.playAlbum')} onclick={(e) => { e.stopPropagation(); playAlbumGroup(g); }}>
                  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M8 5v14l11-7z"/></svg>
                </button>
              </div>
              <div class="ct">{g.title}</div>
              <div class="ca">{g.artist}</div>
            </div>
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
                  <div><div class="at">{g.title}</div><div class="aa">{g.artist}{g.year ? ` · ${g.year}` : ''} · {g.tracks.length} {$t('oxygen.tracks')}</div></div>
                  {#if typeof g.key === 'number'}<span class="ahheart"><HeartButton albumId={g.key} size={16} /></span>{/if}
                  <button class="aplay aq" title={$t('queue.addToQueue')} onclick={() => queueAppendAlbum(g)}>＋</button>
                  <button class="aplay" title={$t('library.playAlbum')} onclick={() => playAlbumGroup(g)}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                  <QualityBadge format={g.format} sampleRate={g.sr} bitDepth={g.bd} source={g.source} />
                </div>
                <div class="atracks">
                  {#each discGroups(g) as d (d.disc)}
                    {#if d.subtitle || discGroups(g).length > 1}
                      <div class="dischead"><span class="discno">{$t('oxygen.disc')} {d.disc}</span>{#if d.subtitle}<span class="discsub">{d.subtitle}</span>{/if}</div>
                    {/if}
                    {#each d.tracks as t (t.id)}
                      <div class="trkrow">
                        <button class="trk" class:sel={selected?.id === t.id} class:playing={t.id != null && t.id === playingId} onclick={() => select(t)} ondblclick={() => playFromTrack(t)}>
                          <span class="tn">{#if t.id != null && t.id === playingId}{@render nowPlayingBars()}{:else}{t.track_number ?? ''}{/if}</span>
                          <span class="tt">{t.title}</span>
                          <span class="td">{fmtDur(t.duration_ms)}</span>
                        </button>
                        <span class="trkacts">
                          {#if t.id != null}<span class="tact-h"><HeartButton trackId={t.id} size={13} /></span>{/if}
                          <button class="tact" title={L_PLAY_NEXT} onclick={() => queueNext(t)}>⏭</button>
                          <button class="tact" title={L_ADD_QUEUE} onclick={() => queueAppendTrack(t)}>＋</button>
                        </span>
                      </div>
                    {/each}
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
              <th class="n">#</th><th>{$t('oxygen.col.title')}</th><th>{$t('oxygen.col.artist')}</th><th>{$t('oxygen.col.album')}</th><th>{$t('oxygen.col.quality')}</th>
              {#each columns as c}<th>{COLUMN_DEFS[c].label}</th>{/each}
              <th class="r">{$t('oxygen.col.duration')}</th>
            </tr></thead>
            <tbody>
              {#each visible as t (t.id)}
                <tr class:sel={selected?.id === t.id} class:playing={t.id != null && t.id === playingId} onclick={() => select(t)} ondblclick={() => playFromTrack(t)}>
                  <td class="n">{#if t.id != null && t.id === playingId}{@render nowPlayingBars()}{:else}{t.track_number ?? ''}{/if}</td>
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
      <button class="drawerclose" onclick={() => { mobileInspector = false; inspectorCollapsed = true; }} aria-label={$t('oxygen.close')}>×</button>
      {#if selected}
        <div class="insp-title">{selected.title}</div>
        <div class="insp-sub">{selected.artist_name ?? ''} · {selected.album_title ?? ''}</div>
        <div class="insp-badges"><QualityBadge format={selected.format} sampleRate={selected.sample_rate} bitDepth={selected.bit_depth} source={selected.source} /></div>
        {#if extLoading}
          <div class="state small">{$t('oxygen.metaLoading')}</div>
        {:else if !inspectorGroups.length}
          <div class="state small">{$t('oxygen.noMeta')}</div>
        {:else}
          {#each inspectorGroups as grp}
            <div class="mgroup"><h4>{grp.name}</h4>
              {#each grp.rows as row}
                <div class="field" class:isnew={row.isNew}>
                  <span class="k">{row.label}{#if row.isNew}<span class="tag">{$t('oxygen.new')}</span>{/if}</span>
                  <span class="v" title={row.value}>{row.value}</span>
                </div>
              {/each}
            </div>
          {/each}
        {/if}
      {:else}<div class="state small">{$t('oxygen.selectTrack')}</div>{/if}
    </aside>
    {#if mobileRail || mobileInspector}
      <button class="backdrop" onclick={() => { mobileRail = false; mobileInspector = false; }} aria-label={$t('oxygen.close')}></button>
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
  /* Desktop only: the mobile slide-over (≤1150px) keeps its own open/close. */
  @media (min-width: 1151px) {
    .body.noinsp { grid-template-columns: 220px 1fr; }
    .body.noinsp .inspector { display: none; }
  }
  .railtoggle { display: none; }
  @media (max-width: 780px) { .railtoggle { display: inline-grid; } }
  .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.5); border: 0; z-index: 35; cursor: pointer; }
  .drawerclose { position: absolute; top: 10px; right: 12px; background: var(--tune-surface-hover); border: 0; color: var(--tune-text); width: 30px; height: 30px; border-radius: 50%; font-size: 20px; line-height: 1; cursor: pointer; z-index: 2; }
  /* Tablet: inspector becomes a right slide-over. */
  @media (max-width: 1150px) {
    .body { grid-template-columns: 200px 1fr; }
    .inspector { position: absolute; top: 0; right: 0; bottom: 0; width: 340px; max-width: 88vw; transform: translateX(100%); transition: transform .22s ease; z-index: 40; box-shadow: -8px 0 30px rgba(0,0,0,.4); }
    .inspector.open { transform: none; }
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
  .pov { position: absolute; right: 8px; bottom: 8px; width: 34px; height: 34px; border-radius: 50%; border: 0; background: var(--tune-accent, #f5a623); color: #000; display: none; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.4); }
  .card:hover .pov, .pov:focus { display: inline-flex; }
  .aplay { width: 28px; height: 28px; border-radius: 50%; border: 0; background: var(--tune-accent, #f5a623); color: #000; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex: none; }
  .aplay.aq { background: var(--tune-surface); color: var(--tune-text); border: 1px solid var(--tune-border); font-size: 15px; }
  .trkrow { display: flex; align-items: center; gap: 4px; }
  .trkrow .trk { flex: 1; min-width: 0; }
  .trkacts { display: none; flex: none; gap: 2px; }
  .trkrow:hover .trkacts { display: inline-flex; }
  .tact { border: 0; background: none; color: var(--tune-text-secondary); cursor: pointer; font-size: 13px; padding: 2px 4px; border-radius: 4px; }
  .tact:hover { color: var(--tune-accent); background: var(--tune-surface); }
  .hov { position: absolute; right: 8px; top: 8px; z-index: 2; }
  .ahheart { display: inline-flex; align-items: center; flex: none; }
  .tact-h { display: inline-flex; align-items: center; }
  .cwrap { position: relative; border-radius: 10px; overflow: hidden; box-shadow: 0 8px 22px rgba(0,0,0,.35); aspect-ratio: 1; }
  .cvr { width: 100%; height: 100%; object-fit: cover; display: block; background: var(--tune-surface-hover); }
  .cvr.ph { display: grid; place-items: center; font-size: 30px; color: var(--tune-text-muted); }
  .card:hover .cwrap { transform: translateY(-3px); transition: transform .15s; }
  .qov { position: absolute; top: 7px; right: 7px; }
  .ct { margin-top: 9px; font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ca { color: var(--tune-text-secondary); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .albums { display: flex; flex-direction: column; }
  .album { display: grid; grid-template-columns: 116px 1fr; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--tune-border); }
  /* Square cover pinned to the top of the row: without an explicit height the
     grid cell stretches to the track list's height and object-fit:cover crops
     the artwork (truncated thumbnails, #1170). */
  .aart { align-self: start; height: 116px; }
  .aart .cvr { border-radius: 10px; box-shadow: 0 8px 22px rgba(0,0,0,.35); }
  .ahead { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .at { font-size: 16px; font-weight: 700; }
  .aa { color: var(--tune-text-secondary); font-size: 13px; margin-top: 1px; }
  .atracks { margin-top: 10px; display: flex; flex-direction: column; }
  .dischead { display: flex; align-items: baseline; gap: 10px; padding: 8px 8px 4px; margin-top: 2px; }
  .discno { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--tune-text-muted); }
  .discsub { font-size: 12.5px; font-weight: 600; color: var(--tune-text-secondary); }
  .trk { display: grid; grid-template-columns: 26px 1fr auto; gap: 12px; align-items: center; background: none; border: 0; color: var(--tune-text); font: inherit; text-align: left; padding: 6px 8px; border-radius: 7px; cursor: pointer; }
  .trk:hover { background: var(--tune-surface-hover); }
  .trk.sel { background: var(--tune-surface-selected); }
  /* « En lecture » doit rester lisible quand la piste est AUSSI sélectionnée :
     la sélection garde son fond neutre, la lecture ajoute le liseré et la
     couleur d'accent — deux signaux qui se superposent sans se masquer. */
  .trk.playing { box-shadow: inset 3px 0 0 0 var(--tune-accent); }
  .trk.playing .tt { color: var(--tune-accent); font-weight: 600; }
  .trk .tn { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; color: var(--tune-text-muted); text-align: right; }
  .trk .tt { font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .trk .td { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; color: var(--tune-text-secondary); }

  /* Bounded height so THIS element is the scroll viewport (not .main): a
     sticky header only sticks within its own scroll container, and the
     horizontal scrollbar stays pinned to the bottom of the visible area
     instead of being buried under a full-height table (Oxygen table view). */
  .tablescroll { border: 1px solid var(--tune-border); border-radius: 12px; background: var(--tune-surface); overflow: auto; max-height: 100%; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  /* box-shadow, not border-bottom: with border-collapse the collapsed bottom
     border detaches from a sticky th and scrolls away; the inset shadow rides along. */
  thead th { position: sticky; top: 0; z-index: 2; background: var(--tune-bg-secondary); text-align: left; font-size: 10.5px; letter-spacing: .04em; text-transform: uppercase; color: var(--tune-text-secondary); font-weight: 600; padding: 9px 12px; box-shadow: inset 0 -1px 0 var(--tune-border); white-space: nowrap; }
  th.n, td.n { width: 34px; text-align: right; color: var(--tune-text-muted); }
  th.r, td.r { text-align: right; }
  tbody td { padding: 7px 12px; border-bottom: 1px solid var(--tune-border); white-space: nowrap; }
  tbody tr { cursor: pointer; }
  tbody tr:hover td { background: var(--tune-surface-hover); }
  tbody tr.sel td { background: var(--tune-surface-selected); }
  tbody tr.playing td.title { color: var(--tune-accent); font-weight: 600; }
  tbody tr.playing td:first-child { box-shadow: inset 3px 0 0 0 var(--tune-accent); }

  /* Barres d'égaliseur logées dans le créneau du numéro de piste (26px en vue
     album, 34px en vue tableau) — d'où une hauteur plus discrète que celle de
     l'accueil. */
  .eqbars { display: inline-flex; align-items: flex-end; justify-content: flex-end; gap: 2px; height: 11px; }
  .eqbars span { display: block; width: 2.5px; background: var(--tune-accent); border-radius: 1px; animation: oxy-eq 0.8s ease-in-out infinite alternate; }
  .eqbars span:nth-child(1) { height: 60%; animation-delay: 0s; }
  .eqbars span:nth-child(2) { height: 100%; animation-delay: 0.2s; }
  .eqbars span:nth-child(3) { height: 40%; animation-delay: 0.4s; }
  /* Zone en pause : barres figées, comme l'indicateur de l'accueil. */
  .eqbars.paused span { animation: none; height: 30%; transform: none; opacity: .6; }
  @keyframes oxy-eq { 0% { transform: scaleY(0.3); } 100% { transform: scaleY(1); } }
  @media (prefers-reduced-motion: reduce) { .eqbars span { animation: none; } }
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
  .field .k { color: var(--tune-text-secondary); font-size: 12px; flex-shrink: 0; }
  /* Long extra-metadata values (MusicBrainz ids, ReplayGain peaks, raw tags)
     were capped at 60% width and truncated with an ellipsis — only visible via
     the hover tooltip, impossible on touch, so extra metadata couldn't be fully
     read (Bertrand). Let the value take the remaining width and wrap instead of
     truncating, so every character is visible without a horizontal scrollbar in
     the narrow (340px) inspector. */
  .field .v { color: var(--tune-text); font-size: 12.5px; text-align: right; font-family: ui-monospace, Menlo, monospace; min-width: 0; white-space: normal; overflow-wrap: anywhere; }
  .field.isnew .k, .field.isnew .v { color: var(--tune-accent); }
  .tag { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: var(--tune-accent); background: rgba(var(--tune-accent-rgb), .14); padding: 1px 5px; border-radius: 4px; margin-left: 6px; }
  .state { padding: 40px 20px; text-align: center; color: var(--tune-text-muted); }
  .state.err { color: var(--tune-danger, var(--tune-error)); }
  .state.small { padding: 20px 4px; font-size: 12.5px; }
</style>
