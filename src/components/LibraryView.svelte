<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { formatAnneeAlbum } from '../lib/formats';
  import { dialogs } from '../lib/stores/dialogs';
  import { trierAlbumsParAnnee } from '../lib/trierAlbums';
  import { doitMemoriserPositionListe } from '../lib/libraryNavScroll';
  import { tip } from '../lib/tooltip';
  import { libraryTab, libraryLoading, albums, artists, tracks, selectedAlbum, albumTracks, selectedArtist, artistAlbums, genres, yearFilter, type LibraryTab } from '../lib/stores/library';
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import { preferences } from '../lib/stores/preferences';
  import { currentTrackId, seekPositionMs } from '../lib/stores/nowPlaying';
  import { formatsSansCollision } from '../lib/utils';
  import { isBrowserZone, browserSeek } from '../lib/stores/browserAudio';
  import { playFromHere } from '../lib/playback';
  import { tuneWS } from '../lib/websocket';
  import { queueTracks, queuePosition } from '../lib/stores/queue';
  import { currentProfileId } from '../lib/stores/profile';
  import * as api from '../lib/api';
  import { notifications } from '../lib/stores/notifications';
  import { groupCreditsByRole, uniqueInstruments } from '../lib/library/credits';
  import { bioDisplayText } from '../lib/library/bio';
  import { sectionHeads } from '../lib/library/grouping';
import { observeHeight, observeWidth } from '../lib/actions/observeSize';
import { formatTime, formatDuration,  fold } from '../lib/utils';
  import AlbumArt from './AlbumArt.svelte';
import TrackContextMenu from './TrackContextMenu.svelte';
import AlbumRating from './AlbumRating.svelte';
import CollapsibleSection from './CollapsibleSection.svelte';
  import ClampedText from './ClampedText.svelte';
  import AlbumEditModal from './AlbumEditModal.svelte';
  import ArtistEditModal from './ArtistEditModal.svelte';
  import TrackEditModal from './TrackEditModal.svelte';
  import HeartButton from './HeartButton.svelte';
  import AlphaIndex from './AlphaIndex.svelte';
  import MetadataChips from './MetadataChips.svelte';
  import type { Album, Artist, Track, TrackCredit, UserTag } from '../lib/types';
  import { t as tr, locale } from '../lib/i18n';
  import { streamingServices, activeStreamingService, pendingStreamingAlbum } from '../lib/stores/streaming';
  import { get } from 'svelte/store';
  import { activeView, pendingSearchQuery, pendingLibraryFolder } from '../lib/stores/navigation';
  import { CANDIDATS_DEFILEMENT, conteneurDefilant } from '../lib/defilementReel';
  import { reculerAvecIntention } from '../lib/historiqueNavigation';
  import ServiceBadge from './ServiceBadge.svelte';
  import QualityBadge from './QualityBadge.svelte';
  import ImportWizard from './ImportWizard.svelte';
  import { displayFields } from '../lib/stores/displayFields';
  import ReportButton from './ReportButton.svelte';
  import type { ArtistMetadata } from '../lib/types';


  interface Props {
    onAddToPlaylist?: (track: Track) => void;
  }
  let { onAddToPlaylist }: Props = $props();

  let scanProgress = $state<{ scanned: number; added: number } | null>(null);
  let cancellingScan = $state(false);

  async function stopScan() {
    cancellingScan = true;
    try {
      await api.cancelScan();
    } catch (e) {
      console.error('Cancel scan error:', e);
    } finally {
      scanProgress = null;
      cancellingScan = false;
    }
  }

  $effect(() => {
    const unsub = tuneWS.onEvent((event) => {
      if (event.type === 'library.scan.progress') {
        scanProgress = { scanned: event.data?.scanned ?? 0, added: event.data?.added ?? 0 };
      } else if (event.type === 'library.updated') {
        // Le surveillant de fichiers vient d'importer ou de retirer quelque
        // chose. Il ne le disait a personne : les listes en memoire restaient
        // telles quelles, et il fallait changer d'onglet puis revenir pour voir
        // arriver les albums qu'on venait de deposer (Patatorz, fil #1517).
        //
        // Meme rechargement selectif que pour un scan : un onglet jamais ouvert
        // se chargera de lui-meme a sa premiere visite.
        if (albumsLoaded) loadAlbums();
        if (artistsLoaded) loadArtists();
        if (tracksLoaded) loadTracks();
      } else if (event.type === 'library.scan.completed' || event.type === 'library.scan.started') {
        scanProgress = event.type === 'library.scan.started' ? { scanned: 0, added: 0 } : null;
        if (event.type === 'library.scan.completed') {
          // The scan just added albums, and nothing else invalidates the
          // lists held in memory: they stayed as they were until the user
          // reloaded the page by hand (Eric, #1393). Reload only what was
          // already loaded — an untouched tab still loads on first opening.
          if (albumsLoaded) loadAlbums();
          if (artistsLoaded) loadArtists();
          if (tracksLoaded) loadTracks();
        }
      }
    });
    return unsub;
  });

  // Quick Fav state
  let quickFavTrackIds = $state<Set<number>>(new Set());
  async function handleQuickFavTrack(trackId: number, e: MouseEvent) {
    e.stopPropagation();
    try {
      await api.quickFavTrack(trackId);
      quickFavTrackIds = new Set([...quickFavTrackIds, trackId]);
      notifications.success($tr('library.quickFavAdded'));
    } catch (err) {
      console.error('Quick fav error:', err);
    }
  }

  // Collections for album
  let collections: any[] = $state([]);
  let showCollectionMenu = $state(false);
  let collectionsLoaded = $state(false);

  async function loadCollections() {
    if (collectionsLoaded) return;
    try {
      collections = await api.getCollections();
      collectionsLoaded = true;
    } catch (e) {
      console.error('Load collections error:', e);
    }
  }

  async function handleAddToCollection(collectionId: number) {
    if (!$selectedAlbum?.id) return;
    try {
      await api.addAlbumToCollection(collectionId, $selectedAlbum.id);
      showCollectionMenu = false;
      notifications.success($tr('library.albumAddedToCollection'));
    } catch (e) {
      console.error('Add to collection error:', e);
      notifications.error($tr('library.collectionAddError'));
    }
  }

  let editingAlbum = $state<Album | null>(null);
  let editingTrack = $state<Track | null>(null);
  let writingAlbumTags = $state(false);
  let writeTagsMessage = $state<string | null>(null);
  let reidentifyingAlbum = $state(false);

  // Track context menu ("...")
  let trackMenuOpenId = $state<number | null>(null);

  function openTrackMenu(e: MouseEvent, trackId: number | null | undefined) {
    e.stopPropagation();
    if (!trackId) return;
    trackMenuOpenId = trackMenuOpenId === trackId ? null : trackId;
  }

  function closeTrackMenu() {
    trackMenuOpenId = null;
  }

  // Artist metadata
  let artistMetadata = $state<ArtistMetadata | null>(null);
  let artistMetadataLoading = $state(false);
  let artistMetadataError = $state(false);
  // Community bio (mozaiklabs, generated by name — no MBID needed). Fallback
  // when the Last.fm metadata carries no bio, which is most of the library.
  let communityArtistBio = $state<string | null>(null);
  let openSections = $state<Record<string, boolean>>({});

  // Album bio
  let albumBio = $state<string | null>(null);
  let albumBioLevel = $state<'simple' | 'complete' | 'full'>('complete');
  let albumBioLoading = $state(false);
  let albumBioAlbumId = $state<number | null>(null);
  let showAlbumBio = $state(false);

  async function loadAlbumBio(albumId: number) {
    if (albumId === albumBioAlbumId && albumBio !== null) return;
    albumBioAlbumId = albumId;
    albumBioLoading = true;
    try {
      const r = await api.getAlbumBio(albumId);
      albumBio = r.bio;
    } catch {
      albumBio = null;
    }
    albumBioLoading = false;
  }

  // Track credits
  let expandedTrackCredits = $state<number | null>(null);
  let trackCreditsMap = $state<Record<number, TrackCredit[]>>({});
  let trackCreditsLoading = $state<number | null>(null);

  // « Autres versions de ce titre » (#2372). Meme mecanique que les credits :
  // une ligne depliee SOUS la piste, un cache par piste, un seul deplie a la
  // fois. Pas de nouvel ecran — la creation d'ecran revient au designer.
  let expandedTrackVersions = $state<number | null>(null);
  let trackVersionsMap = $state<Record<number, api.TrackVersions | null>>({});
  let trackVersionsLoading = $state<number | null>(null);

  // Artist credits
  let artistCredits = $state<TrackCredit[] | null>(null);
  let artistCreditsLoading = $state(false);
  let enrichLoading = $state(false);
  let bioLevel = $state<'simple' | 'complete' | 'full'>('complete');

  // Artist editing
  let editingArtistName = $state(false);
  let artistNameInput = $state('');
  let artistNameSaving = $state(false);
  let showArtistEdit = $state(false);

  async function saveArtistName() {
    if (!$selectedArtist?.id || !artistNameInput.trim()) return;
    artistNameSaving = true;
    try {
      const updated = await api.updateArtist($selectedArtist.id, { name: artistNameInput.trim() });
      // Update the store so the UI refreshes
      selectedArtist.set({ ...$selectedArtist, name: updated.name ?? artistNameInput.trim() });
      editingArtistName = false;
    } catch (e) {
      console.error('Save artist name error:', e);
    }
    artistNameSaving = false;
  }

  function startEditArtistName() {
    if (!$selectedArtist) return;
    artistNameInput = $selectedArtist.name;
    editingArtistName = true;
  }

  function cancelEditArtistName() {
    editingArtistName = false;
  }

  // Streaming albums for current artist
  let streamingArtistAlbums = $state<{ service: string; albums: Album[] }[]>([]);
  let streamingArtistAlbumsLoading = $state(false);

  async function toggleTrackCredits(trackId: number) {
    if (expandedTrackCredits === trackId) {
      expandedTrackCredits = null;
      return;
    }
    expandedTrackCredits = trackId;
    if (trackCreditsMap[trackId]) return;
    trackCreditsLoading = trackId;
    try {
      const credits = await api.getTrackCredits(trackId);
      trackCreditsMap = { ...trackCreditsMap, [trackId]: credits };
    } catch (e) {
      console.error('Load track credits error:', e);
      trackCreditsMap = { ...trackCreditsMap, [trackId]: [] };
    }
    trackCreditsLoading = null;
  }

  /**
   * Deplie « Autres versions » sous la piste, et charge le resultat.
   *
   * Le serveur fait TOUT le rapprochement — bibliotheque et services — dans
   * `GET /library/tracks/{id}/versions` : l'ecran ne fait que dessiner. Le
   * resultat est garde par piste, parce qu'une recherche streaming coute des
   * appels reseau et que replier/deplier ne doit pas les refacturer.
   */
  async function toggleTrackVersions(trackId: number) {
    if (expandedTrackVersions === trackId) {
      expandedTrackVersions = null;
      return;
    }
    expandedTrackVersions = trackId;
    if (trackVersionsMap[trackId] !== undefined) return;
    trackVersionsLoading = trackId;
    try {
      const versions = await api.getTrackVersions(trackId);
      trackVersionsMap = { ...trackVersionsMap, [trackId]: versions };
    } catch (e) {
      console.error('Load track versions error:', e);
      // `null` distingue l'echec du « rien trouve » : les deux affichent le
      // meme message, mais l'echec ne doit pas etre mis en cache comme un
      // resultat definitif.
      trackVersionsMap = { ...trackVersionsMap, [trackId]: null };
    }
    trackVersionsLoading = null;
  }

  /** Une version STREAMING : on ouvre son album dans la vue du service —
   *  exactement la porte qu'emprunte deja la grille d'albums de streaming. */
  function ouvrirVersionStreaming(v: {
    service: string;
    source_id?: string | null;
    album_id?: string | null;
    album_title?: string | null;
    title: string;
    artist_name?: string | null;
    cover_path?: string | null;
  }) {
    const albumId = v.album_id ?? v.source_id;
    if (!albumId) return;
    activeStreamingService.set(v.service);
    pendingStreamingAlbum.set({
      id: albumId,
      source_id: albumId,
      source: v.service,
      title: v.album_title ?? v.title,
      artist_name: v.artist_name ?? null,
      cover_path: v.cover_path ?? null,
    } as any);
    activeView.set('streaming');
  }

  async function loadArtistCredits(artistId: number) {
    artistCreditsLoading = true;
    try {
      artistCredits = await api.getArtistCredits(artistId);
    } catch (e) {
      console.error('Load artist credits error:', e);
      artistCredits = [];
    }
    artistCreditsLoading = false;
  }

  function formatRole(role: string): string {
    const key = `credits.${role}`;
    const translated = $tr(key);
    return translated !== key ? translated : role.charAt(0).toUpperCase() + role.slice(1);
  }


  async function handleWriteAlbumTags(albumId: number) {
    writingAlbumTags = true;
    writeTagsMessage = null;
    try {
      // writeAlbumTags is accepted asynchronously ({status:"accepted"}) — there
      // is no success/total count to show, so the toast used to render
      // "undefined/undefined". Use the placeholder-free "started in background"
      // message instead.
      await api.writeAlbumTags(albumId);
      writeTagsMessage = $tr('library.tagsWritten');
      setTimeout(() => writeTagsMessage = null, 5000);
    } catch (e: any) {
      writeTagsMessage = `${$tr('common.error')} : ${e?.message || e}`;
    }
    writingAlbumTags = false;
  }

  /** Refait l'identification de l'album affiché (#2128).
   *
   *  Le verdict est rendu tel quel à l'utilisateur, y compris quand il est
   *  décevant : « même pressage » et « rien trouvé » sont des réponses, pas des
   *  échecs à masquer. Sans elles, on renvoie l'utilisateur enquêter à
   *  l'aveugle — c'est précisément ce que décrivait le fil forum #1455. */
  async function handleReidentifyAlbum(albumId: number) {
    reidentifyingAlbum = true;
    const tid = notifications.info($tr('library.reidentifying'), 0);
    try {
      const r = await api.reidentifyAlbum(albumId);
      notifications.dismiss(tid);

      if (r.verdict === 'no_tracks') {
        notifications.error($tr('library.reidentifyNoTracks'));
        return;
      }
      if (r.verdict === 'not_found') {
        notifications.error(
          $tr('library.reidentifyNotFound').replace('{title}', r.searched_title ?? '')
        );
        return;
      }
      if (r.verdict === 'unchanged') {
        // Le cas le plus instructif : la source en ligne confirme, donc
        // l'erreur est ailleurs. Le dire évite de recommencer pour rien.
        notifications.info($tr('library.reidentifyUnchanged'), 9000);
        return;
      }

      let msg = $tr('library.reidentifySuccess')
        .replace('{title}', r.release_title ?? '')
        .replace('{matched}', String(r.tracks_matched ?? 0))
        .replace('{total}', String(r.tracks_total ?? 0));
      if (r.fields_left_as_is?.length) {
        msg += ` — ${$tr('library.reidentifyKept').replace('{fields}', r.fields_left_as_is.join(', '))}`;
      }
      notifications.success(msg, 9000);
      // Relire la fiche pour que l'écran montre ce qui vient d'être écrit. On
      // ne rappelle pas `selectAlbumDetail`, qui remettrait la navigation et le
      // défilement à zéro : seule la fiche a changé, pas la liste des pistes.
      const full = await api.getAlbum(albumId);
      selectedAlbum.set(full);
    } catch (e: any) {
      notifications.dismiss(tid);
      notifications.error(`${$tr('library.reidentifyFailed')} : ${e?.message || e}`);
    } finally {
      reidentifyingAlbum = false;
    }
  }

  function openAlbumEdit(e: MouseEvent, album: Album) {
    e.stopPropagation();
    editingAlbum = album;
  }

  function openTrackEdit(e: MouseEvent, track: Track) {
    e.stopPropagation();
    editingTrack = track;
  }

  function handleAlbumSaved(updated: Album) {
    albums.update(list => list.map(a => a.id === updated.id ? updated : a));
    if ($selectedAlbum?.id === updated.id) selectedAlbum.set(updated);
  }

  function handleTrackSaved(updated: Track) {
    tracks.update(list => list.map(t => t.id === updated.id ? updated : t));
    // GROUPING vit dans `track_metadata`, pas dans la table `tracks` : la
    // réponse de PATCH /metadata/tracks/{id} ne le porte donc jamais. Sans ce
    // report, renommer une piste effacerait son en-tête de section jusqu'au
    // prochain chargement de l'album (#2130).
    albumTracks.update(list => list.map(t =>
      t.id === updated.id ? { ...updated, grouping: updated.grouping ?? t.grouping } : t
    ));
  }

  let zone = $derived($currentZone);
  let searchQuery = $state('');
  let selectedGenre = $state<string | null>(null);
  let selectedParent = $state<string | null>(null);
  // ── Onglet Labels (Bertrand, 25/08) ──
  // La facette label compte des PISTES (t.label) ; la grille d'albums vient
  // de /library/albums-detailed, agrégée PAR LE SERVEUR avec le même filtre.
  let labelsList = $state<{ value: string; count: number }[]>([]);
  let labelsLoaded = $state(false);
  let selectedLabel = $state<string | null>(null);
  let labelAlbums = $state<api.AlbumDetailed[]>([]);
  let labelAlbumsLoading = $state(false);

  /// Les tags portent du bruit (« Columbia\rLegacy » avec un retour chariot) :
  /// on nettoie à l'AFFICHAGE, le filtre garde la valeur brute exacte.
  function nomLabelPropre(v: string): string {
    return v.replace(/[\r\n]+/g, ' · ').trim();
  }

  async function loadLabels() {
    try {
      const f = await api.getLibraryFacets(['label'], undefined, 0);
      labelsList = (f.label ?? []).filter((l) => l.value && l.value.trim());
      labelsLoaded = true;
    } catch (e) {
      console.error('loadLabels error:', e);
    }
  }

  async function selectLabel(value: string) {
    selectedLabel = value;
    labelAlbumsLoading = true;
    labelAlbums = [];
    try {
      labelAlbums = (await api.getAlbumsDetailed({ label: value }, 500)).items;
    } catch (e) {
      console.error('label albums error:', e);
    } finally {
      labelAlbumsLoading = false;
    }
  }

  let genreTree = $state<Record<string, string[]>>({});
  // Whether the genre tree has been fetched at least once. Until it has, we must
  // NOT treat every library genre as "orphan" (see orphanGenres): doing so dumps
  // the whole library into the responsive grid, which then collapses into the
  // branch list the instant the tree arrives — the grid↔list flash reported in
  // forum #1029 (also visible when the server is unreachable and the fetch fails).
  let genreTreeLoaded = $state(false);

  // Auto-resolve parent from selectedGenre via tree, even if the user
  // navigated via a chip before the tree finished loading.
  let displayParent = $derived.by(() => {
    if (selectedGenre) {
      for (const [p, kids] of Object.entries(genreTree)) {
        if (p.toLowerCase() === selectedGenre.toLowerCase()) return null; // it's a parent itself
        if (kids.some(c => c.toLowerCase() === selectedGenre!.toLowerCase())) return p;
      }
    }
    return selectedParent;
  });

  // Aggregated count per branch (parent + children).
  let parentAlbumCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    const byName: Record<string, number> = {};
    for (const g of $genres) byName[g.name.toLowerCase()] = g.count;
    for (const [parent, children] of Object.entries(genreTree)) {
      let total = (byName[parent.toLowerCase()] || 0);
      for (const c of children) total += (byName[c.toLowerCase()] || 0);
      counts[parent] = total;
    }
    return counts;
  });

  // Genres in the library that aren't anywhere in the tree → orphan
  // section ("Hors arbre") at the bottom of the genres tab.
  let knownTreeGenres = $derived.by(() => {
    const set = new Set<string>();
    for (const [p, kids] of Object.entries(genreTree)) {
      set.add(p.toLowerCase());
      for (const k of kids) set.add(k.toLowerCase());
    }
    return set;
  });
  // While the tree is still loading, return [] so the "Hors arbre" grid stays
  // empty instead of briefly showing every genre as a card (forum #1029). Once
  // the fetch settles — success OR failure — orphans resolve normally, so a
  // genuinely empty tree still falls back to the grid without a mid-load flash.
  let orphanGenres = $derived(
    genreTreeLoaded ? $genres.filter(g => !knownTreeGenres.has(g.name.toLowerCase())) : [],
  );

  // Genres filtered by search query (for the Genres tab)
  let genreSearchQuery = $derived(fold(searchQuery));
  let filteredGenreTreeKeys = $derived.by(() => {
    if (!genreSearchQuery) return Object.keys(genreTree);
    return Object.keys(genreTree).filter(parent => {
      if (fold(parent).includes(genreSearchQuery)) return true;
      return (genreTree[parent] ?? []).some(child => fold(child).includes(genreSearchQuery));
    });
  });
  let filteredOrphanGenres = $derived.by(() => {
    if (!genreSearchQuery) return orphanGenres;
    return orphanGenres.filter(g => fold(g.name).includes(genreSearchQuery));
  });

  // Use onMount (not $effect) — the $effect(() => { untrack(...) }) pattern
  // can re-trigger on batch flushes in certain Svelte 5 runtime versions.
  onMount(() => {
    api.getGenreTree()
      .then(r => genreTree = r.tree ?? {})
      .catch(() => {})
      .finally(() => genreTreeLoaded = true);
    loadUserTags();
    // Les DR réellement présents (#2144). Un échec ou un serveur antérieur à
    // la v0.9.130 rend une liste vide : la commande n'est simplement pas
    // dessinée, aucune erreur à l'écran.
    api.getAlbumDynamicRanges().then(v => drValues = v).catch(() => {});
  });
  let formatFilter = $state<string | null>(null);
  let qualityFilter = $state<string | null>(null);
  let albumQualityFilter = $state<string | null>(null);
  let albumFormatFilter = $state<string | null>(null);
  let albumSampleRateFilter = $state<number | null>(null);
  let albumYearFilter = $state<number | null>(null);
  let albumDuplicatesFilter = $state(false);

  // Duplicate album detection: same title + same artist but different format/quality
  function normalizeDupKey(title: string, artist: string): string {
    // Strip formatting punctuation/spacing, but keep '!' and '?' — they are
    // part of the title, not noise, so "Joe Cocker!" and "Joe Cocker" are not
    // flagged as duplicates (Alain).
    const strip = (s: string) => s.trim().toLowerCase().replace(/[\s\-_.:;,'"()[\]{}]+/g, '');
    return strip(title) + '|||' + strip(artist);
  }

  function formatAlbumQualityLabel(album: Album): string {
    const parts: string[] = [];
    if (album.format) parts.push(String(album.format).toUpperCase());
    if (album.sample_rate) parts.push(formatSampleRate(album.sample_rate));
    if (album.bit_depth) parts.push(`${album.bit_depth}-bit`);
    if (parts.length === 0 && album.quality) parts.push(album.quality.toUpperCase());
    return parts.join(' ') || '?';
  }

  // Map from normalized key -> array of albums that share that key
  let duplicateMap = $derived.by(() => {
    const map = new Map<string, Album[]>();
    for (const a of $albums) {
      const key = normalizeDupKey(a.title, a.artist_name ?? '');
      const arr = map.get(key);
      if (arr) arr.push(a);
      else map.set(key, [a]);
    }
    // Only keep entries with 2+ albums
    const result = new Map<string, Album[]>();
    for (const [key, arr] of map) {
      if (arr.length >= 2) result.set(key, arr);
    }
    return result;
  });

  // Set of album IDs that have duplicates
  let duplicateAlbumIds = $derived.by(() => {
    const ids = new Set<number>();
    for (const arr of duplicateMap.values()) {
      for (const a of arr) {
        if (a.id !== null && a.id !== undefined) ids.add(a.id!);
      }
    }
    return ids;
  });

  // Count of albums that are duplicates (for chip display)
  let duplicateAlbumCount = $derived(duplicateAlbumIds.size);

  // Currently open duplicate popup album id
  let dupPopupAlbumId = $state<number | null>(null);

  function getDuplicateSiblings(album: Album): Album[] {
    const key = normalizeDupKey(album.title, album.artist_name ?? '');
    return duplicateMap.get(key) ?? [];
  }

  function toggleDupPopup(albumId: number, e: MouseEvent) {
    e.stopPropagation();
    dupPopupAlbumId = dupPopupAlbumId === albumId ? null : albumId;
  }

  function closeDupPopup() {
    dupPopupAlbumId = null;
  }

  // Sync year filter from store (set by NowPlaying)
  $effect(() => {
    const v = $yearFilter;
    if (v !== null) {
      untrack(() => {
        albumYearFilter = v;
        yearFilter.set(null); // consume it
      });
    }
  });

  // Sort options
  type AlbumSortKey = 'title' | 'artist' | 'release_date' | 'original_year' | 'added_date' | 'dynamic_range' | 'random';
  const ALBUM_SORT_OPTIONS: { key: AlbumSortKey; label: string; defaultOrder: 'asc' | 'desc' }[] = [
    { key: 'title', label: 'library.sortTitle', defaultOrder: 'asc' },
    { key: 'artist', label: 'library.sortArtist', defaultOrder: 'asc' },
    { key: 'release_date', label: 'library.sortReleaseDate', defaultOrder: 'desc' },
    { key: 'original_year', label: 'library.sortOriginalYear', defaultOrder: 'desc' },
    { key: 'added_date', label: 'library.sortAddedDate', defaultOrder: 'desc' },
    // Dynamic Range (#2144). Décroissant par défaut : on trie par DR pour
    // remonter ses disques les PLUS dynamiques, pas les plus écrasés. Les
    // albums sans tag sortent en dernier (`NULLS LAST` côté serveur) — les
    // annoncer à DR0 serait un mensonge.
    { key: 'dynamic_range', label: 'library.sortDynamicRange', defaultOrder: 'desc' },
    // Tri aléatoire (#3074, Steve Taylor, fil 1635) : « sort by random and have
    // something I have not played for years come out on top ». Redécouvrir sa
    // propre bibliothèque, pas écouter — d'où un TRI, distinct du bouton
    // « Play all shuffled » qui, lui, lance la lecture.
    { key: 'random', label: 'library.sortRandom', defaultOrder: 'asc' },
  ];
  // Album sort lives in the server-synced preferences store (#1134) so the
  // chosen order follows the user across sessions/devices, not just this browser.
  let albumSort = $derived(($preferences.albumSort as AlbumSortKey) || 'title');
  let albumSortOrder = $derived(($preferences.albumSortOrder as 'asc' | 'desc') || 'asc');

  type GenreSortKey = 'title' | 'artist' | 'year';
  const GENRE_SORT_OPTIONS: { key: GenreSortKey; label: string; defaultOrder: 'asc' | 'desc' }[] = [
    { key: 'title', label: 'library.sortTitle', defaultOrder: 'asc' },
    { key: 'artist', label: 'library.sortArtist', defaultOrder: 'asc' },
    { key: 'year', label: 'library.sortYear', defaultOrder: 'desc' },
  ];
  let genreSort = $state<GenreSortKey>((localStorage.getItem('tune_genre_sort') as GenreSortKey) || 'artist');
  let genreSortOrder = $state<'asc' | 'desc'>((localStorage.getItem('tune_genre_sort_order') as 'asc' | 'desc') || 'asc');

  function setGenreSort(key: GenreSortKey) {
    if (genreSort === key) {
      genreSortOrder = genreSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      genreSort = key;
      genreSortOrder = GENRE_SORT_OPTIONS.find(o => o.key === key)?.defaultOrder ?? 'asc';
    }
    localStorage.setItem('tune_genre_sort', genreSort);
    localStorage.setItem('tune_genre_sort_order', genreSortOrder);
  }

  function setAlbumSort(key: AlbumSortKey) {
    // Re-click toggles order; a new key resets to that column's default order.
    const order: 'asc' | 'desc' = albumSort === key
      ? (albumSortOrder === 'asc' ? 'desc' : 'asc')
      : (ALBUM_SORT_OPTIONS.find(o => o.key === key)?.defaultOrder ?? 'asc');
    // Persist through the preferences store (localStorage + server ui_preferences),
    // so the order is remembered per profile across devices (#1134).
    preferences.update(p => ({ ...p, albumSort: key, albumSortOrder: order }));
    // Chaque passage AU tri aléatoire est un nouveau tirage : garder l'ancienne
    // graine rendrait exactement la même grille, et le tri paraîtrait cassé.
    if (key === 'random') albumRandomSeed = null;
    albumsLoaded = false;
    loadAlbums();
  }

  // Tranche de Dynamic Range (#2144), bornes INCLUSES et indépendantes.
  //
  // Le filtre part au SERVEUR (`dr_min`/`dr_max`) et non au client : la liste
  // d'albums ne porte pas la valeur de DR, un filtrage local ne verrait donc
  // rien. `drValues` liste ce qui existe réellement — vide sur une
  // bibliothèque non taguée, et la commande n'est alors pas dessinée du tout
  // plutôt que d'offrir un menu qui ne filtrerait rien.
  // Graine du tri aléatoire (#3074). `null` = « tire-m'en une » : le serveur
  // en fabrique une, la renvoie, et on la garde pour les pages suivantes —
  // sinon chaque requête re-tire et la grille montre des albums en double tout
  // en en cachant d'autres. Le bouton de re-tirage la remet simplement à
  // `null`.
  let albumRandomSeed = $state<number | null>(null);
  function retirerAleatoire() {
    albumRandomSeed = null;
    albumsLoaded = false;
    loadAlbums();
  }

  let albumDrMin = $state<number | null>(null);
  let albumDrMax = $state<number | null>(null);
  let drValues = $state<number[]>([]);
  let drRange = $derived(
    albumDrMin == null && albumDrMax == null ? undefined : { min: albumDrMin, max: albumDrMax },
  );
  function setAlbumDr(borne: 'min' | 'max', valeur: string) {
    const n = valeur === '' ? null : Number(valeur);
    if (borne === 'min') albumDrMin = n; else albumDrMax = n;
    albumsLoaded = false;
    loadAlbums();
  }
  function clearAlbumDr() {
    if (albumDrMin == null && albumDrMax == null) return;
    albumDrMin = null; albumDrMax = null;
    albumsLoaded = false;
    loadAlbums();
  }

  // Favorites filter
  let albumFavoritesFilter = $state(false);
  let albumTagFilter = $state<number | null>(null);
  let userTags = $state<UserTag[]>([]);
  let tagAlbumIds = $state<Set<number>>(new Set());

  async function loadUserTags() {
    try {
      userTags = await api.getTags('album');
    } catch (e) { /* ignore */ }
  }

  let showTagPicker = $state(false);
  let newTagName = $state('');
  let albumTagsKey = $state(0);

  const TAG_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#e91e63', '#795548', '#607d8b'];
  async function handleCreateAndAssignTag(albumId: number) {
    const name = newTagName.trim();
    if (!name) return;
    const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
    try {
      const result = await api.createTag(name, color);
      if (result.id) {
        await api.tagItem(result.id, 'album', albumId);
      }
    } catch (e) {
      console.error('createTag error:', e);
    }
    newTagName = '';
    showTagPicker = false;
    await loadUserTags();
    albumTagsKey++;
  }

  // Tag management (rename / delete). Backend + api already support these
  // (PUT/DELETE /tags/{id}); this surfaces them in the UI.
  let manageTags = $state(false);
  async function handleRenameTag(tag: UserTag) {
    const next = await dialogs.prompt($tr('library.renameTagPrompt' as any), tag.name);
    if (next === null) return;
    const name = next.trim();
    if (!name || name === tag.name) return;
    try {
      await api.updateTag(tag.id!, name);
      await loadUserTags();
    } catch (e) { console.error('updateTag error:', e); }
  }
  async function handleDeleteTag(tag: UserTag) {
    if (!(await dialogs.confirm($tr('library.deleteTagConfirm' as any).replace('{name}', tag.name), { danger: true }))) return;
    try {
      await api.deleteTag(tag.id!);
      if (albumTagFilter === tag.id) applyTagFilter(null);
      await loadUserTags();
    } catch (e) { console.error('deleteTag error:', e); }
  }

  /**
   * Création d'une étiquette SANS passer par la fiche d'un album (#2256,
   * point 1/3).
   *
   * Le défaut vécu, signalé par bluevelvet (Pascal) le 06/07/2026 : « Je n'ai
   * pas retrouvé la manière de créer une troisième étiquette. » Il avait
   * raison de ne pas la trouver — jusqu'ici `api.createTag` n'avait qu'un seul
   * appelant, `handleCreateAndAssignTag`, lui-même déclenché depuis le seul
   * champ ouvert par le bouton « + Tag » de la fiche d'un album. La barre de
   * filtres, elle, savait filtrer, renommer et supprimer une étiquette, mais
   * jamais en créer : la gestion était là, la création ailleurs.
   *
   * Cette fonction complète l'affordance existante au même endroit que le
   * renommage, avec le même dialogue. Elle ne crée QUE l'étiquette : aucun
   * album n'est assigné, puisqu'aucun n'est sélectionné ici.
   */
  async function handleCreateTag() {
    const saisi = await dialogs.prompt($tr('library.createTagPrompt' as any), '');
    if (saisi === null) return;
    const name = saisi.trim();
    if (!name) return;
    const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
    try {
      await api.createTag(name, color);
      await loadUserTags();
    } catch (e) { console.error('createTag error:', e); }
  }

  async function applyTagFilter(tagId: number | null) {
    albumTagFilter = tagId;
    if (tagId) {
      try {
        const result = await api.getTagAlbums(tagId);
        tagAlbumIds = new Set(result.albums.map(a => a.id!).filter(Boolean));
      } catch (e) { tagAlbumIds = new Set(); }
    } else {
      tagAlbumIds = new Set();
    }
  }
  let trackFavoritesFilter = $state(false);
  let favAlbumIds = $state<Set<number>>(new Set());
  let favTrackIds = $state<Set<number>>(new Set());
  let favoritesLoaded = $state(false);

  async function loadFavoriteIds() {
    const pid = $currentProfileId;
    if (!pid) return;
    try {
      const result = await api.getFavorites(pid);
      favAlbumIds = new Set((result.albums ?? []).map((a: Album) => a.id).filter(Boolean) as number[]);
      favTrackIds = new Set((result.tracks ?? []).map((t: Track) => t.id).filter(Boolean) as number[]);
      favoritesLoaded = true;
    } catch (e) {
      console.error('Load favorite IDs error:', e);
    }
  }

  $effect(() => {
    const _pid = $currentProfileId;
    if (_pid) untrack(() => loadFavoriteIds());
  });

  // Virtual scroll state (tracks)
  const TRACK_ROW_HEIGHT = 52;
  const OVERSCAN = 10;
  let trackListEl = $state<HTMLDivElement | null>(null);
  let scrollTop = $state(0);
  let containerHeight = $state(600);
  let visibleTracks = $derived.by(() => {
    const total = filteredTracks.length;
    const startIdx = Math.max(0, Math.floor(scrollTop / TRACK_ROW_HEIGHT) - OVERSCAN);
    const endIdx = Math.min(total, Math.ceil((scrollTop + containerHeight) / TRACK_ROW_HEIGHT) + OVERSCAN);
    return { startIdx, endIdx, totalHeight: total * TRACK_ROW_HEIGHT };
  });

  // Virtual scroll state (album grid)
  const ALBUM_MIN_WIDTH = 156;     // 140px min + gap
  const ALBUM_TEXT_HEIGHT = 60;    // text + gap below artwork
  const ALBUM_OVERSCAN_ROWS = 3;
  let albumGridViewport = $state<HTMLDivElement | null>(null);
  let albumScrollTop = $state(0);
  let savedAlbumScrollTop = $state(0);
  let savedArtistScrollTop = $state(0);
  // Genres tab: its drill (genre → album cards) renders directly inside
  // `.library-view` (no virtual grid), so the virtual-grid offset is useless
  // there. Captured on detail entry, restored on Back (#1215).
  let savedGenreScrollTop = $state(0);
  // Back-stack of artists visited by drilling into "similar artists" within the
  // detail view (#1144, Bilou). Entering the detail fresh (from grid/search/album)
  // leaves this empty, so Back returns to the grid as before; each similar-artist
  // hop pushes the current artist, so Back re-opens the previous one (with its
  // own similar list) instead of dead-ending on the grid.
  let similarArtistStack = $state<Artist[]>([]);
  let restoringScroll = $state(false);
  let albumViewportHeight = $state(800);
  let albumViewportWidth = $state(1200);

  let prevAlbumCols = $state(0);

  // Mur de pochettes : pochettes seules, grille plus dense (demande Alex
  // Campbell, PR #369). La grille des albums est VIRTUALISÉE — ses métriques
  // sont calculées ici en JavaScript, pas déduites du CSS — donc le mode mur
  // doit changer les DEUX : la largeur minimale de colonne, et la hauteur de
  // texte sous la pochette (nulle, puisqu'il n'y a plus de texte).
  const WALL_MIN_WIDTH = 104;      // 88px min + gap
  let albumWall = $derived($preferences.albumGridDensity === 'wall');
  let albumMinWidth = $derived(albumWall ? WALL_MIN_WIDTH : ALBUM_MIN_WIDTH);
  let albumTextHeight = $derived(albumWall ? 0 : ALBUM_TEXT_HEIGHT);

  let albumGridMetrics = $derived.by(() => {
    const cols = Math.max(1, Math.floor(albumViewportWidth / albumMinWidth));
    const colWidth = albumViewportWidth / cols;
    const rowHeight = colWidth + albumTextHeight;
    const total = filteredAlbums.length;
    const rows = Math.ceil(total / cols);
    const totalHeight = rows * rowHeight;
    const startRow = Math.max(0, Math.floor(albumScrollTop / rowHeight) - ALBUM_OVERSCAN_ROWS);
    const endRow = Math.min(rows, Math.ceil((albumScrollTop + albumViewportHeight) / rowHeight) + ALBUM_OVERSCAN_ROWS);
    const startIdx = startRow * cols;
    const endIdx = Math.min(total, endRow * cols);
    const offsetY = startRow * rowHeight;
    return { cols, colWidth, rowHeight, totalHeight, startIdx, endIdx, offsetY };
  });

  $effect(() => {
    const cols = albumGridMetrics.cols;
    untrack(() => {
      if (prevAlbumCols > 0 && prevAlbumCols !== cols && albumScrollTop > 0) {
        // Reset scroll to top when grid columns change (window resize, etc.)
        // to avoid inconsistent scroll positions
        albumScrollTop = 0;
        if (albumGridViewport) albumGridViewport.scrollTop = 0;
      }
      prevAlbumCols = cols;
    });
  });

  let visibleAlbums = $derived(filteredAlbums.slice(albumGridMetrics.startIdx, albumGridMetrics.endIdx));

  function handleAlbumGridScroll(e: Event) {
    albumScrollTop = (e.currentTarget as HTMLDivElement).scrollTop;
    if (dupPopupAlbumId !== null) dupPopupAlbumId = null;
  }

  // Debounce helper for filter changes
  function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
    let timer: ReturnType<typeof setTimeout>;
    return ((...args: any[]) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    }) as T;
  }

  // Debounced filter setters
  let debouncedQualityFilter = $state<string | null>(null);
  let debouncedFormatFilter = $state<string | null>(null);
  let debouncedSampleRateFilter = $state<number | null>(null);

  const applyAlbumQualityFilter = debounce((v: string | null) => { albumQualityFilter = v; }, 100);
  const applyAlbumFormatFilter = debounce((v: string | null) => { albumFormatFilter = v; }, 100);
  const applyAlbumSampleRateFilter = debounce((v: number | null) => { albumSampleRateFilter = v; }, 100);

  function setAlbumQualityChip(v: string | null) {
    debouncedQualityFilter = v;
    applyAlbumQualityFilter(v);
  }
  function setAlbumFormatChip(v: string | null) {
    debouncedFormatFilter = v;
    applyAlbumFormatFilter(v);
  }
  function setAlbumSampleRateChip(v: number | null) {
    debouncedSampleRateFilter = v;
    applyAlbumSampleRateFilter(v);
  }

  type QualityBucket = { key: string; label: string; match: (t: Track) => boolean };
  const qualityBuckets: QualityBucket[] = [
    { key: 'dsd', label: 'DSD', match: t => t.format === 'dsd' || t.format === 'dsf' || t.format === 'dff' || (t.file_path ?? '').toLowerCase().endsWith('.dsf') || (t.file_path ?? '').toLowerCase().endsWith('.dff') },
    { key: 'hires', label: 'Hi-Res', match: t => t.format !== 'dsd' && ((t.sample_rate ?? 0) > 48000 || (t.bit_depth ?? 0) > 16) },
    { key: 'cd', label: 'CD', match: t => t.format !== 'dsd' && (t.sample_rate ?? 0) <= 48000 && (t.bit_depth ?? 0) <= 16 && !['mp3', 'aac', 'ogg', 'opus', 'wma'].includes(t.format ?? '') },
    { key: 'lossy', label: 'Lossy', match: t => ['mp3', 'aac', 'ogg', 'opus', 'wma'].includes(t.format ?? '') },
  ];

  // Albums filtered by search only (for quality chip counts)
  let searchFilteredAlbums = $derived.by(() => {
    if (!searchQuery.trim()) return $albums;
    const terms = fold(searchQuery).split(/\s+/).filter(t => t.length > 0);
    return $albums.filter(a => terms.every(q =>
      fold(a.title).includes(q)
      || fold(a.artist_name).includes(q)
      || fold(a.genre).includes(q)
      || String(a.year ?? '').includes(q)
    ));
  });

  // Albums filtered by search + quality + format + sample rate + favorites + duplicates (final display)
  let filteredAlbums = $derived.by(() => {
    let result = searchFilteredAlbums;
    if (albumQualityFilter) result = result.filter(a => a.quality === albumQualityFilter);
    if (albumFormatFilter) result = result.filter(a => a.format === albumFormatFilter);
    // Cadence EXACTE, jamais « ou plus ». Le filtre « 176,4 kHz » montrait aussi
    // les albums 192 kHz (Patatorz, forum) : le « + » du libellé annonçait bien
    // un `>=`, mais personne ne le lit ainsi — on choisit une cadence pour
    // n'avoir QUE celle-là.
    if (albumSampleRateFilter) result = result.filter(a => a.sample_rate === albumSampleRateFilter);
    if (albumFavoritesFilter) result = result.filter(a => a.id !== null && favAlbumIds.has(a.id!));
    if (albumYearFilter) result = result.filter(a => a.year === albumYearFilter);
    if (albumDuplicatesFilter) result = result.filter(a => a.id !== null && duplicateAlbumIds.has(a.id!));
    if (albumTagFilter) result = result.filter(a => a.id !== null && tagAlbumIds.has(a.id!));
    return result;
  });

  // Reset album grid scroll when filters change (but not when restoring after back-nav).
  // Only `filteredAlbums.length` is a tracked dependency: reading `restoringScroll`
  // or `albumGridViewport` reactively made this re-fire when a Back-restore
  // completed (restoringScroll true→false) or the grid re-mounted, zeroing the
  // scroll a frame after it was restored → jumped to top (#1096, #1170).
  $effect(() => {
    const _len = filteredAlbums.length;
    untrack(() => {
      if (restoringScroll) return;
      albumScrollTop = 0;
      if (albumGridViewport) albumGridViewport.scrollTop = 0;
    });
  });

  let albumFormats = $derived(
    formatsSansCollision(searchFilteredAlbums.map((a) => a.format)),
  );

  /// « 44.1kHz », « 48kHz », « 176.4kHz » — une decimale seulement quand elle
  /// existe. Meme regle que la ligne de qualite d'un album, pour que la
  /// vignette et le badge disent la meme chose.
  function formatSampleRate(sr: number): string {
    if (sr < 1000) return `${sr}Hz`;
    return `${(sr / 1000).toFixed(sr % 1000 === 0 ? 0 : 1)}kHz`;
  }

  let albumSampleRates = $derived(
    [...new Set(searchFilteredAlbums.map(a => a.sample_rate).filter(Boolean))].sort((a, b) => (a ?? 0) - (b ?? 0)) as number[]
  );

  // #2449 (Lulu, fil 1558) : le bandeau de filtres qualité est replié sur UNE
  // ligne par défaut — voir le commentaire dans le template. L'état ci-dessous
  // ne sert qu'à savoir si le repli cache réellement des puces : le bouton de
  // dépliage n'apparaît que dans ce cas, et l'affichage reste identique à
  // avant pour toute bibliothèque dont les puces tiennent sur une ligne.
  let qualityFiltersEl = $state<HTMLDivElement | null>(null);
  let qualityFiltersExpanded = $state(false);
  let qualityFiltersOverflow = $state(false);

  function measureQualityFiltersOverflow() {
    const el = qualityFiltersEl;
    if (!el) return;
    // Replié : scrollHeight > clientHeight ⇔ des puces sont cachées.
    // Déplié : rien n'est rogné, la mesure vaut false — le bouton reste
    // affiché via `qualityFiltersExpanded` pour pouvoir replier.
    qualityFiltersOverflow = el.scrollHeight - el.clientHeight > 1;
  }

  // Redimensionnement du conteneur (fenêtre, sidebar) : le point d'enroulement
  // change, donc le débordement aussi.
  $effect(() => {
    const el = qualityFiltersEl;
    if (!el) return;
    const ro = new ResizeObserver(measureQualityFiltersOverflow);
    ro.observe(el);
    measureQualityFiltersOverflow();
    return () => ro.disconnect();
  });

  // Le jeu de puces dépend de ces entrées ; en replié, leur variation ne
  // change PAS la hauteur du conteneur (plafonnée), donc le ResizeObserver ne
  // se déclenche pas : on re-mesure explicitement après mise à jour du DOM.
  $effect(() => {
    void searchFilteredAlbums; void albumFormats; void albumSampleRates;
    void userTags; void duplicateAlbumCount; void albumYearFilter;
    void manageTags; void qualityFiltersExpanded;
    measureQualityFiltersOverflow();
  });

  let filteredArtists = $derived.by(() => {
    let result = searchQuery.trim()
      ? $artists.filter(a => fold(a.name).includes(fold(searchQuery)))
      : [...$artists];
    result.sort((a, b) => {
      const nameA = (a.sort_name || a.name || '').toLowerCase();
      const nameB = (b.sort_name || b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
    return result;
  });

  // Alpha index for artists
  let artistLetters = $derived(
    [...new Set(filteredArtists.map(a => {
      const first = (a.sort_name || a.name).charAt(0).toUpperCase();
      return /[A-Z]/.test(first) ? first : '#';
    }))].sort((a, b) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b))
  );

  let activeArtistLetter = $state('');

  function scrollToArtistLetter(letter: string) {
    activeArtistLetter = letter;
    const idx = filteredArtists.findIndex(a => {
      const first = (a.sort_name || a.name).charAt(0).toUpperCase();
      const normalized = /[A-Z]/.test(first) ? first : '#';
      return normalized === letter;
    });
    if (idx < 0) return;
    const grid = document.querySelector('.artists-grid');
    if (!grid) return;
    const cards = grid.querySelectorAll('.artist-card');
    if (cards[idx]) {
      cards[idx].scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  const MONTH_NAMES = $derived([
    $tr('date.month1'), $tr('date.month2'), $tr('date.month3'), $tr('date.month4'),
    $tr('date.month5'), $tr('date.month6'), $tr('date.month7'), $tr('date.month8'),
    $tr('date.month9'), $tr('date.month10'), $tr('date.month11'), $tr('date.month12'),
  ]);

  function albumDateKey(a: any): string {
    if (albumSort === 'added_date') {
      // Index by when the album entered the library — the server exposes
      // added_at (epoch seconds) on the added-date sorted listing. Month
      // granularity kept: additions cluster in recent months. No
      // release-year fallback (it would interleave two different axes).
      if (typeof a.added_at === 'number' && a.added_at > 0) {
        const d = new Date(a.added_at * 1000);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
      return '?';
    }
    // Release-date sorts: index by YEAR only — month entries made the
    // scrubber unusable (Bertrand: "slider années avec les mois").
    const date = a.original_date || a.release_date;
    if (date && typeof date === 'string' && date.length >= 4) return date.substring(0, 4);
    const year = a.original_year || a.release_year || a.year;
    return year ? `${year}` : '?';
  }

  function formatDateKey(key: string): string {
    if (key.length === 7 && key[4] === '-') {
      const month = parseInt(key.substring(5), 10);
      return `${MONTH_NAMES[month - 1]} ${key.substring(0, 4)}`;
    }
    return key;
  }

  // Alpha index for albums (years + months when sorted by date, letters otherwise)
  let albumIndexEntries = $derived.by(() => {
    // Trié par DR, une bande de lettres A→Z ne désigne plus rien : elle
    // sauterait à un titre au hasard dans une grille ordonnée par dynamique.
    // Pas de repère plutôt qu'un faux repère — la liste d'albums ne porte pas
    // la valeur de DR, on ne peut donc pas en dessiner un vrai ici.
    if (albumSort === 'dynamic_range' || albumSort === 'random') return [];
    if (albumSort === 'release_date' || albumSort === 'original_year' || albumSort === 'added_date') {
      const keys = [...new Set(filteredAlbums.map(albumDateKey))];
      return albumSortOrder === 'desc' ? keys.sort((a, b) => b.localeCompare(a)) : keys.sort();
    }
    const letters = [...new Set(filteredAlbums.map(a => {
      const field = albumSort === 'artist' ? (a.artist_name || a.title) : a.title;
      const first = field.charAt(0).toUpperCase();
      return /[A-Z]/.test(first) ? first : '#';
    }))];
    return letters.sort((a, b) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b));
  });

  let activeAlbumEntry = $state('');

  function scrollToAlbumEntry(entry: string) {
    activeAlbumEntry = entry;
    const isYear = albumSort === 'release_date' || albumSort === 'original_year' || albumSort === 'added_date';
    const idx = filteredAlbums.findIndex(a => {
      if (isYear) {
        return albumDateKey(a) === entry;
      }
      const field = albumSort === 'artist' ? (a.artist_name || a.title) : a.title;
      const first = field.charAt(0).toUpperCase();
      const normalized = /[A-Z]/.test(first) ? first : '#';
      return normalized === entry;
    });
    if (idx < 0 || !albumGridViewport) return;
    const cols = albumGridMetrics.cols || 4;
    const rowHeight = albumGridMetrics.rowHeight || 220;
    const row = Math.floor(idx / cols);
    albumGridViewport.scrollTo({ top: row * rowHeight, behavior: 'smooth' });
  }

  let availableFormats = $derived(
    [...new Set($tracks.map(t => t.format).filter(Boolean))].sort() as string[]
  );

  let qualityCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const b of qualityBuckets) {
      counts[b.key] = $tracks.filter(b.match).length;
    }
    return counts;
  });

  let filteredTracks = $derived.by(() => {
    let result = $tracks;
    if (formatFilter) {
      result = result.filter(t => t.format === formatFilter);
    }
    if (qualityFilter) {
      const bucket = qualityBuckets.find(b => b.key === qualityFilter);
      if (bucket) result = result.filter(bucket.match);
    }
    if (trackFavoritesFilter) {
      result = result.filter(t => t.id !== null && favTrackIds.has(t.id!));
    }
    if (searchQuery.trim()) {
      const terms = fold(searchQuery).split(/\s+/).filter(t => t.length > 0);
      result = result.filter(t => terms.every(q =>
        fold(t.title).includes(q)
        || fold(t.artist_name).includes(q)
        || fold(t.album_title).includes(q)
      ));
    }
    return result;
  });

  let genreAlbums = $derived.by(() => {
    let result: typeof $albums = [];
    if (selectedNoGenre) {
      result = noGenreAlbums;
    } else if (selectedGenre) {
      const sel = selectedGenre.toLowerCase();
      result = $albums.filter(a => a.genre && a.genre.toLowerCase() === sel);
    } else if (selectedParent) {
      const branch = new Set([selectedParent.toLowerCase(),
        ...(genreTree[selectedParent] ?? []).map(c => c.toLowerCase())]);
      result = $albums.filter(a => a.genre && branch.has(a.genre.toLowerCase()));
    }
    if (searchQuery.trim()) {
      const q = fold(searchQuery);
      result = result.filter(a =>
        fold(a.title).includes(q)
        || fold(a.artist_name).includes(q)
        || String(a.year ?? a.original_year ?? '').includes(q)
      );
    }
    const dir = genreSortOrder === 'asc' ? 1 : -1;
    return result.sort((a, b) => {
      if (genreSort === 'year') {
        const ya = a.original_year ?? a.year ?? 0;
        const yb = b.original_year ?? b.year ?? 0;
        return (ya - yb) * dir || (a.title ?? '').localeCompare(b.title ?? '');
      }
      if (genreSort === 'artist') {
        return (a.artist_name ?? '').localeCompare(b.artist_name ?? '') * dir || (a.title ?? '').localeCompare(b.title ?? '');
      }
      return (a.title ?? '').localeCompare(b.title ?? '') * dir;
    });
  });

  // "No genre" filter state for genres tab
  let selectedNoGenre = $state(false);
  let genreBranchSort = $state<'count' | 'name'>('count');

  // Albums without genre
  let noGenreAlbums = $derived.by(() => {
    return $albums.filter(a => !a.genre || a.genre.trim() === '');
  });

  // Years tab: group albums by year (descending), unknown year at the bottom
  // Treat year=0 as unknown (same as null) so totals match the albums tab
  // Years tab sort direction (persisted like tune_genre_sort_order).
  let yearSortOrder = $state<'asc' | 'desc'>((localStorage.getItem('tune_year_sort_order') as 'asc' | 'desc') || 'desc');
  function toggleYearSortOrder() {
    yearSortOrder = yearSortOrder === 'desc' ? 'asc' : 'desc';
    localStorage.setItem('tune_year_sort_order', yearSortOrder);
  }

  // Sens de tri des albums d'un artiste (#1659, Sevy Tabroc).
  //
  // Le défaut reste CROISSANT — c'est l'ordre chronologique que la vue avait
  // déjà, et Sevy demandait le choix, pas un autre défaut. Persisté comme les
  // autres tris de cette page : quelqu'un qui préfère le plus récent d'abord
  // le préfère sur tous les artistes, pas seulement celui-ci.
  let artistAlbumSortOrder = $state<'asc' | 'desc'>(
    (localStorage.getItem('tune_artist_album_sort_order') as 'asc' | 'desc') || 'asc'
  );
  function toggleArtistAlbumSortOrder() {
    artistAlbumSortOrder = artistAlbumSortOrder === 'asc' ? 'desc' : 'asc';
    localStorage.setItem('tune_artist_album_sort_order', artistAlbumSortOrder);
  }

  // La règle du tri vit dans `trierAlbums.ts`, avec ses tests : l'année
  // absente doit rester en fin de liste DANS LES DEUX SENS, et ça ne se déduit
  // pas à la lecture.
  let sortedArtistAlbums = $derived(trierAlbumsParAnnee($artistAlbums, artistAlbumSortOrder));

  let yearGroups = $derived.by(() => {
    const map = new Map<number | null, Album[]>();
    const filtered = searchQuery.trim()
      ? $albums.filter(a => {
          const q = fold(searchQuery);
          return fold(a.title).includes(q)
            || fold(a.artist_name).includes(q)
            || String(a.year ?? a.original_year ?? '').includes(q);
        })
      : $albums;
    for (const album of filtered) {
      const raw = (album.year && album.year > 0) ? album.year : (album.original_year && album.original_year > 0) ? album.original_year : null;
      const y = raw;
      if (!map.has(y)) map.set(y, []);
      map.get(y)!.push(album);
    }
    const groups: { year: number | null; label: string; albums: Album[] }[] = [];
    const years = [...map.keys()].filter((y): y is number => y !== null)
      .sort((a, b) => (yearSortOrder === 'desc' ? b - a : a - b));
    for (const y of years) {
      groups.push({ year: y, label: String(y), albums: map.get(y)! });
    }
    if (map.has(null)) {
      groups.push({ year: null, label: $tr('library.unknownYear'), albums: map.get(null)! });
    }
    return groups;
  });

  // Total albums across all year groups (should equal total filtered albums)
  let yearGroupsTotalCount = $derived(yearGroups.reduce((sum, g) => sum + g.albums.length, 0));

  // Virtual scroll state (Years tab). The Years view used to render every album
  // across every year group as a real DOM card inside the main .library-view
  // scroller. For a large library that is thousands of nodes + lazy <img> tags,
  // so scrolling stuttered badly (#1125). We virtualize it the same way as the
  // Albums tab: flatten the year groups into a flat list of fixed-height "rows"
  // (a header row per year + one grid row per rank of albums) and only render
  // the slice inside a dedicated viewport.
  const YEAR_HEADER_HEIGHT = 62;   // .year-section header block (margin + text + border)
  const YEAR_GRID_GAP = 24;        // --space-lg (desktop), grid row gap
  let yearGridViewport = $state<HTMLDivElement | null>(null);
  let yearScrollTop = $state(0);
  let yearViewportHeight = $state(800);
  let yearViewportWidth = $state(1200);

  type YearRow =
    | { kind: 'header'; label: string; count: number; top: number; height: number }
    | { kind: 'albums'; albums: Album[]; top: number; height: number };

  // Flat, positioned row list for the Years tab (headers + album grid-rows).
  let yearRowModel = $derived.by(() => {
    const cols = Math.max(1, Math.floor(yearViewportWidth / ALBUM_MIN_WIDTH));
    const colWidth = yearViewportWidth / cols;
    const rowHeight = colWidth + ALBUM_TEXT_HEIGHT + YEAR_GRID_GAP; // artwork+text + grid gap between rows
    const rows: YearRow[] = [];
    let top = 0;
    for (const group of yearGroups) {
      rows.push({ kind: 'header', label: group.label, count: group.albums.length, top, height: YEAR_HEADER_HEIGHT });
      top += YEAR_HEADER_HEIGHT;
      for (let i = 0; i < group.albums.length; i += cols) {
        const slice = group.albums.slice(i, i + cols);
        rows.push({ kind: 'albums', albums: slice, top, height: rowHeight });
        top += rowHeight;
      }
    }
    return { rows, totalHeight: top, cols };
  });

  // Visible slice of the year rows for the current scroll position.
  let visibleYearRows = $derived.by(() => {
    const { rows } = yearRowModel;
    const top = yearScrollTop;
    const bottom = yearScrollTop + yearViewportHeight;
    const OVER = 400; // px overscan above/below the viewport
    const out: YearRow[] = [];
    for (const r of rows) {
      if (r.top + r.height < top - OVER) continue;
      if (r.top > bottom + OVER) break;
      out.push(r);
    }
    return out;
  });

  function handleYearGridScroll(e: Event) {
    yearScrollTop = (e.currentTarget as HTMLDivElement).scrollTop;
  }

  let albumTotalDuration = $derived(
    $albumTracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0)
  );

  let tracksByDisc = $derived.by(() => {
    const map = new Map<number, typeof $albumTracks>();
    const subtitles = new Map<number, string | null>();
    for (const t of $albumTracks) {
      const disc = t.disc_number ?? 1;
      if (!map.has(disc)) map.set(disc, []);
      map.get(disc)!.push(t);
      if (t.disc_subtitle && !subtitles.has(disc)) subtitles.set(disc, t.disc_subtitle);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([num, tracks]) => [num, tracks, subtitles.get(num) ?? null] as [number, typeof $albumTracks, string | null]);
  });

  let hasMultipleDiscs = $derived(tracksByDisc.length > 1);

  // GROUPING (#2130) — en-têtes de section À L'INTÉRIEUR d'un disque
  // (mouvements, bonus, ensembles), là où DISCSUBTITLE nomme le disque entier.
  // La règle, et pourquoi elle s'efface d'elle-même quand le tag n'apprend
  // rien, sont dans `lib/library/grouping.ts` (couvert par ses tests).
  let groupingHeads = $derived(sectionHeads(tracksByDisc.map(([, tracks]) => tracks)));

  function selectGenreInTab(name: string) {
    // If the user clicked on a genre name that's a parent in the tree,
    // treat it as a branch view. Otherwise it's a leaf — also resolve
    // its parent so the breadcrumb shows the path.
    if (genreTree[name]) {
      selectedParent = name;
      selectedGenre = null;
      return;
    }
    selectedGenre = name;
    selectedParent = null;
    for (const [p, kids] of Object.entries(genreTree)) {
      if (kids.some(c => c.toLowerCase() === name.toLowerCase())) {
        selectedParent = p;
        break;
      }
    }
  }

  function clearGenreSelection() {
    selectedGenre = null;
    selectedParent = null;
    selectedNoGenre = false;
  }

  function backToParent() {
    selectedGenre = null;
    selectedParent = displayParent;
  }

  function initials(name: string): string {
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.charAt(0).toUpperCase();
  }

  function switchTab(tab: LibraryTab) {
    libraryTab.set(tab);
    selectedAlbum.set(null);
    selectedArtist.set(null);
    similarArtistStack = [];
    selectedGenre = null;
    selectedNoGenre = false;
    searchQuery = '';
    // Switching tabs unmounts the album/year grids; their viewports remount
    // fresh at scrollTop 0. A stale virtual-scroll offset from a previous
    // scroll would make the visible slice render far below the fold, leaving
    // the grid blank (black page) until the user scrolls (#1109, and the
    // Years-tab "page noire" in #1170). Reset both so the grids always come
    // back consistent with the fresh DOM.
    albumScrollTop = 0;
    if (albumGridViewport) albumGridViewport.scrollTop = 0;
    yearScrollTop = 0;
    if (yearGridViewport) yearGridViewport.scrollTop = 0;
    // Update current history entry so browser-back restores the correct tab
    try {
      const cur = window.history.state ?? {};
      window.history.replaceState({ ...cur, tab }, '', window.location.hash || '#library');
    } catch {}
  }

  let albumsLoaded = $state(false);

  /** Assistant d'ajout de contenu (dossier → bibliothèque). */
  let showImportWizard = $state(false);
  let artistsLoaded = $state(false);
  let tracksLoaded = $state(false);

  // --- Folder-scoped mode (from the Répertoires view's "View in library"
  // button, pendingLibraryFolder). Scope Albums/Artists/Tracks/Genres to a
  // folder + subfolders by deriving them client-side from that folder's tracks
  // (/library/tracks?folder=), so no server change is needed. Genres follow for
  // free (the genres store is derived from `albums`). Consumed once at init so
  // the first tab load is already scoped.
  function takePendingLibraryFolder(): string | null {
    const pf = get(pendingLibraryFolder);
    if (pf) { pendingLibraryFolder.set(null); return pf; }
    return null;
  }
  let scopedFolder = $state<string | null>(takePendingLibraryFolder());
  let scopedFolderName = $derived(scopedFolder ? (scopedFolder.split(/[/\\]/).filter(Boolean).pop() ?? scopedFolder) : '');
  let scopedTracksCache: Track[] | null = null;

  async function ensureScopedTracks(): Promise<Track[]> {
    if (scopedTracksCache) return scopedTracksCache;
    const res = await api.getFilteredTracks({ folder: scopedFolder!, limit: 5000 });
    scopedTracksCache = res.items;
    return scopedTracksCache;
  }

  async function loadScopedAlbums() {
    libraryLoading.set(true);
    try {
      const ts = await ensureScopedTracks();
      const map = new Map<number, Album>();
      for (const t of ts) {
        if (t.album_id == null) continue;
        const ex = map.get(t.album_id);
        if (ex) { ex.track_count = (ex.track_count ?? 0) + 1; }
        else map.set(t.album_id, {
          id: t.album_id, title: t.album_title ?? '',
          artist_id: t.artist_id ?? null, artist_name: t.album_artist ?? t.artist_name ?? '',
          year: t.year ?? null, genre: t.genre ?? null, cover_path: t.cover_path ?? null,
          track_count: 1, format: t.format ?? null, sample_rate: t.sample_rate ?? null, bit_depth: t.bit_depth ?? null } as Album);
      }
      albums.set([...map.values()].sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '')));
      albumsLoaded = true;
    } catch (e) { console.error('Load scoped albums error:', e); albumsLoaded = true; }
    libraryLoading.set(false);
  }

  async function loadScopedArtists() {
    libraryLoading.set(true);
    try {
      const ts = await ensureScopedTracks();
      const map = new Map<number, Artist>();
      for (const t of ts) {
        if (t.artist_id == null) continue;
        if (!map.has(t.artist_id)) map.set(t.artist_id, { id: t.artist_id, name: t.artist_name ?? t.album_artist ?? '', image_path: null } as Artist);
      }
      artists.set([...map.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')));
      artistsLoaded = true;
    } catch (e) { console.error('Load scoped artists error:', e); artistsLoaded = true; }
    libraryLoading.set(false);
  }

  async function loadScopedTracks() {
    libraryLoading.set(true);
    try {
      tracks.set(await ensureScopedTracks());
      tracksLoaded = true;
    } catch (e) { console.error('Load scoped tracks error:', e); tracksLoaded = true; }
    libraryLoading.set(false);
  }

  function clearFolderScope() {
    scopedFolder = null;
    scopedTracksCache = null;
    albumsLoaded = false; artistsLoaded = false; tracksLoaded = false;
    if ($libraryTab === 'artists') loadArtists();
    else if ($libraryTab === 'tracks') loadTracks();
    else loadAlbums();
  }

  async function loadAlbums() {
    if (scopedFolder) { await loadScopedAlbums(); return; }
    libraryLoading.set(true);
    try {
      const premier = await api.getAllAlbumsSeeded(100, albumSort, albumSortOrder, 1, 100, drRange, albumRandomSeed);
      // La graine du premier tirage vaut pour TOUTE la grille : on la retient
      // avant la seconde requête, qui doit lire le même ordre.
      if (albumSort === 'random' && premier.seed != null) albumRandomSeed = premier.seed;
      albums.set(premier.albums);
      albumsLoaded = true;
      libraryLoading.set(false);
      if (premier.albums.length >= 100) {
        const reste = await api.getAllAlbumsSeeded(2000, albumSort, albumSortOrder, undefined, undefined, drRange, albumRandomSeed);
        albums.set(reste.albums);
      }
    } catch (e) {
      console.error('Load albums error:', e);
      albumsLoaded = true;
      libraryLoading.set(false);
    }
  }

  async function loadArtists() {
    if (scopedFolder) { await loadScopedArtists(); return; }
    libraryLoading.set(true);
    try {
      const result = await api.getAllArtists();
      artists.set(result);
      artistsLoaded = true;
    } catch (e) {
      console.error('Load artists error:', e);
      artistsLoaded = true;
    }
    libraryLoading.set(false);
  }

  async function loadTracks() {
    if (scopedFolder) { await loadScopedTracks(); return; }
    libraryLoading.set(true);
    try {
      const result = await api.getAllTracks();
      tracks.set(result);
      tracksLoaded = true;
    } catch (e) {
      console.error('Load tracks error:', e);
      tracksLoaded = true;
    }
    libraryLoading.set(false);
  }

  async function selectAlbumDetail(album: Album) {
    if (!album.id) return;
    savedAlbumScrollTop = albumScrollTop;
    if ($libraryTab === 'genres') {
      const scrollEl = conteneurDefilant(CANDIDATS_DEFILEMENT);
      savedGenreScrollTop = scrollEl ? scrollEl.scrollTop : 0;
    }
    // NE PAS vider selectedArtist ici : le garder permet à goBack() de revenir à
    // la page de l'artiste quand l'album a été ouvert depuis celle-ci (bug Fabien-1).
    expandedTrackCredits = null;
    trackCreditsMap = {};
    expandedTrackVersions = null;
    albumBio = null;
    albumBioAlbumId = null;
    showAlbumBio = false;
    // Album rating state now lives in <AlbumRating/>, which reloads itself when
    // its albumId prop changes.
    libraryLoading.set(true);
    try {
      // The detail endpoint carries fields the grid listing cannot: the Dynamic
      // Range read from the files' tags, for one. The old shortcut — reuse the
      // grid item whenever it already had a cover_path — meant those fields
      // never arrived on the common path, and their absence is indistinguishable
      // from "this album simply has no DR tag".
      //
      // So the album is always fetched, but CONCURRENTLY with its tracks rather
      // than before them. The previous code awaited the two in sequence, so this
      // costs no extra wall-clock on the slow path and one small keyed GET on
      // the fast one — next to the track list, which is far heavier.
      //
      // Forward the active grid quality/format filter so the detail shows only
      // the matching tracks (a mixed album opened under a Hi-Res/FLAC filter
      // no longer reveals its MP3/44.1 tracks).
      const [full, result] = await Promise.all([
        api.getAlbum(album.id),
        api.getAlbumTracks(album.id, albumQualityFilter, albumFormatFilter),
      ]);
      selectedAlbum.set(full);
      albumTracks.set(result);
      // Pas de `pushState` ici : l'abonnement `selectedAlbum` d'App.svelte en a
      // DÉJÀ empilé une, et il en est la seule source de vérité. Empiler la
      // sienne en plus déposait deux entrées jumelles pour une seule
      // navigation, si bien que le premier appui sur « Précédent » retombait
      // sur la jumelle — qui porte encore `albumId`, donc que le gestionnaire
      // `popstate` laisse en fiche. L'utilisateur voyait un appui sans effet et
      // devait appuyer deux fois (5c420af, reperdu par la fusion f14553f).
      // Cette entrée-là omettait de surcroît `artistId`, que l'abonnement
      // reporte, lui — voir le cas « album ouvert depuis une fiche artiste ».
    } catch (e) {
      console.error('Load album tracks error:', e);
      selectedAlbum.set(album);
    }
    libraryLoading.set(false);
  }

  /// Ouvre la fiche artiste depuis le nom affiché sous une vignette d'album.
  ///
  /// Demandé trois fois — #1868, #1927 (fil forum de FabienM) et #1580 — et
  /// jamais fait : #1868 a été fermée comme doublon de #1580, mais les deux ne
  /// parlent pas du même endroit. #1580 visait la FICHE d'un album, où le lien
  /// existe depuis longtemps ; #1927 vise les VIGNETTES de la grille, où le nom
  /// n'était qu'un `<span>`. Cliquer dessus ouvrait l'album, comme le reste de
  /// la carte.
  ///
  /// `stopPropagation` est indispensable : sans lui le clic remonte à la carte
  /// et ouvre l'album, c'est-à-dire exactement ce que FabienM veut éviter.
  ///
  /// Repli assumé : un album sans `artist_id` — un résultat de streaming sans
  /// ligne artiste locale — ouvre l'album plutôt que de ne rien faire. Un lien
  /// mort se lit comme une panne ; le comportement d'avant reste préférable.
  function ouvrirArtisteDepuisAlbum(e: MouseEvent, album: Album) {
    e.stopPropagation();
    if (album.artist_id && album.artist_name) {
      selectArtistDetail({ id: album.artist_id, name: album.artist_name } as Artist);
      return;
    }
    selectAlbumDetail(album);
  }

  async function selectArtistDetail(artist: Artist, keepSimilarStack = false) {
    if (!artist.id) return;
    // Fresh entry into the artist view (from the grid, search, an album, a track
    // or a credit) starts a new similar-artist chain, so Back returns to the
    // grid. Only the similar-artist drill and the in-app Back button preserve the
    // stack (#1144).
    if (!keepSimilarStack) similarArtistStack = [];
    // Only save scroll position if navigating from the album grid (not from album detail)
    if (!$selectedAlbum) {
      savedAlbumScrollTop = albumScrollTop;
    }
    // The artist list scrolls inside `.library-scroller` (height:100% + overflow-y:
    // auto), NOT `.main-content` — whose child fills it exactly, so its scrollTop
    // stays 0. Reading `.main-content` here always captured 0, so Back landed at
    // the top of the artist list instead of the viewed artist (#1118, #870).
    //
    // …mais seulement si l'on quitte réellement une LISTE. `selectArtistDetail`
    // est aussi appelée depuis une fiche déjà ouverte : lien artiste d'un album,
    // pastilles de crédits, liens artiste des pistes, fil des « artistes
    // similaires », et `goBack()` lui-même quand ce fil se dépile. Dans ces
    // cas-là `.library-scroller` porte le défilement d'une page de DÉTAIL —
    // pratiquement toujours 0 — et l'écrire ici écrasait la position de la liste
    // mémorisée à l'entrée. Comme `restoreArtistScrollWhenReady` ne fait rien
    // pour une cible <= 0, le retour final laissait la liste tout en haut :
    // « le retour ramène toujours en début de liste » (Pierre M, fil 1177,
    // renesenses/tune-server-rust#2253). La grille d'albums avait déjà sa garde
    // (`if (!$selectedAlbum)` ci-dessus) ; l'artiste ne l'avait jamais eue.
    if (doitMemoriserPositionListe({ albumOuvert: $selectedAlbum != null, artisteOuvert: $selectedArtist != null })) {
      const scrollEl = conteneurDefilant(CANDIDATS_DEFILEMENT);
      if (scrollEl) savedArtistScrollTop = scrollEl.scrollTop;
      if ($libraryTab === 'genres' && scrollEl) savedGenreScrollTop = scrollEl.scrollTop;
    }
    selectedArtist.set(artist);
    // Même raison qu'en fiche album : l'abonnement `selectedArtist` d'App.svelte
    // est la seule source de vérité de l'historique. Un second `pushState` ici
    // rendait le premier appui sur « Précédent » sans effet.
    selectedAlbum.set(null);
    artistMetadata = null;
    artistMetadataError = false;
    communityArtistBio = null;
    artistCredits = null;
    openSections = {};
    bioLevel = 'complete';
    libraryLoading.set(true);
    try {
      const result = await api.getArtistAlbums(artist.id);
      artistAlbums.set(result);
    } catch (e) {
      console.error('Load artist albums error:', e);
    }
    libraryLoading.set(false);
    // Lazy-load metadata + credits + streaming albums (non-blocking)
    loadArtistMetadata(artist.id);
    loadCommunityArtistBio(artist.id);
    loadArtistCredits(artist.id);
    loadStreamingArtistAlbums(artist.name);
  }

  async function loadStreamingArtistAlbums(artistName: string) {
    streamingArtistAlbums = [];
    streamingArtistAlbumsLoading = true;
    const services = $streamingServices;
    const results: { service: string; albums: Album[] }[] = [];

    for (const [svc, status] of Object.entries(services)) {
      if (!status.authenticated) continue;
      try {
        const searchResults = await api.federatedSearch(artistName, [svc], 5);
        const svcData = searchResults.services?.[svc];
        if (!svcData?.artists?.length) {
          console.warn(`[streaming-albums] ${svc}: no artists found for "${artistName}"`);
          continue;
        }
        const matchedArtist = svcData.artists.find(
          (a: any) => a.name.toLowerCase() === artistName.toLowerCase()
        ) ?? svcData.artists[0];
        const artistId = matchedArtist.id ?? (matchedArtist as any).source_id;
        if (!artistId) {
          console.warn(`[streaming-albums] ${svc}: no artist ID for`, matchedArtist);
          continue;
        }
        console.log(`[streaming-albums] ${svc}: fetching albums for artist ${artistId} (${matchedArtist.name})`);
        const albums = await api.getStreamingArtistAlbums(svc, String(artistId));
        console.log(`[streaming-albums] ${svc}: got ${albums.length} albums`);
        if (albums.length > 0) {
          results.push({ service: svc, albums: albums.map(a => ({ ...a, source: svc as any })) });
        }
      } catch (e) {
        console.error(`[streaming-albums] ${svc}: error`, e);
      }
    }

    streamingArtistAlbums = results;
    streamingArtistAlbumsLoading = false;
  }

  async function loadArtistMetadata(artistId: number) {
    artistMetadataLoading = true;
    try {
      const result = await api.getArtistMetadata(artistId);
      // API returns {data: {...}, enrichment_status: "..."}
      const raw = (result as any)?.data ?? result;
      if (raw.bio_fr) raw.bio = raw.bio_fr;
      if (!raw.enrichment_status && (result as any)?.enrichment_status) {
        raw.enrichment_status = (result as any).enrichment_status;
      }
      artistMetadata = raw;
    } catch (e) {
      console.error('Load artist metadata error:', e);
      artistMetadataError = true;
    }
    artistMetadataLoading = false;
  }

  async function loadCommunityArtistBio(artistId: number) {
    try {
      const r = await api.getArtistBio(artistId);
      // Only keep it if this is still the artist on screen (avoid a slow AI
      // generation landing on a different artist after fast navigation).
      if ($selectedArtist?.id === artistId) communityArtistBio = r.bio;
    } catch {
      /* leave null — the metadata/local bio still applies */
    }
  }

  function toggleSection(key: string) {
    openSections = { ...openSections, [key]: !openSections[key] };
  }

  async function navigateToSimilarArtist(name: string) {
    try {
      const allArtists = await api.getArtists(5000);
      const match = allArtists.find((a: Artist) => a.name.toLowerCase() === name.toLowerCase());
      if (match) {
        // Remember the artist we're leaving so the in-app Back button can return
        // to it (and its similar list) instead of jumping straight to the grid.
        const from = $selectedArtist;
        if (from) similarArtistStack = [...similarArtistStack, from];
        selectArtistDetail(match, true);
      } else {
        pendingSearchQuery.set(name);
        activeView.set('search');
      }
    } catch (e) {
      console.error('Navigate to similar artist error:', e);
    }
  }

  let artistBio = $derived.by(() => {
    if (artistMetadata) {
      if ($locale === 'en' && artistMetadata.bio_en) return artistMetadata.bio_en;
      if (artistMetadata.bio) return artistMetadata.bio;
      if (artistMetadata.bio_en) return artistMetadata.bio_en;
    }
    return $selectedArtist?.bio ?? communityArtistBio ?? null;
  });

  async function enrichArtistBio() {
    const artist = $selectedArtist;
    if (!artist?.id || enrichLoading) return;
    enrichLoading = true;
    try {
      const result = await api.enrichArtist(artist.id);
      const raw = (result as any)?.data ?? result;
      if (raw.bio_fr) raw.bio = raw.bio_fr;
      if (!raw.bio && raw.bio_summary) raw.bio = raw.bio_summary;
      if (!raw.enrichment_status && (result as any)?.enrichment_status) {
        raw.enrichment_status = (result as any).enrichment_status;
      }
      if (raw.similar_artists && !raw.similar) {
        raw.similar = raw.similar_artists.map((a: any) => a.name).filter(Boolean);
      }
      if (raw.tags && !raw.genres) {
        raw.genres = raw.tags;
      }
      artistMetadata = { ...artistMetadata, ...raw };
      // Auto-expand sections after enrichment
      if (raw.similar_artists?.length) openSections['similar'] = true;
      if (raw.bio) {
        notifications.success($tr('library.bioEnriched'));
      } else if (raw.similar_artists?.length || raw.tags?.length) {
        notifications.success($tr('library.similarAndTagsFound'));
      } else {
        notifications.info($tr('library.noInfoFound'));
      }
    } catch (e) {
      console.error('Enrich artist error:', e);
      notifications.error($tr('library.enrichUnavailable'));
    }
    enrichLoading = false;
  }

  // Restore the album grid scroll once the virtual-scroll list is tall enough to
  // hold the target offset. A fixed double-rAF isn't enough for a large library
  // (the grid's total height is only known after albums render + measure over
  // several frames), so scrollTop clamps to 0 and the user lands at the top
  // (#1024). Poll a bounded number of frames until the height is ready.
  function restoreAlbumScrollWhenReady(target: number) {
    if (target <= 0) { restoringScroll = false; return; }
    let attempts = 0;
    const tick = () => {
      const el = albumGridViewport;
      const ready = el && el.scrollHeight >= target + el.clientHeight;
      if (ready || attempts >= 30) {
        albumScrollTop = target;
        if (el) el.scrollTop = target;
        requestAnimationFrame(() => { restoringScroll = false; });
        return;
      }
      attempts += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Same poll-until-ready pattern for the Years tab: its viewport remounts at
  // scrollTop 0 on Back while `yearScrollTop` (the virtual-scroll offset) still
  // holds the pre-detail position, so the visible slice renders below the fold
  // and the tab comes back as a black page until the user scrolls (#1170).
  // Re-aligning the viewport on the saved offset both restores the position
  // and repaints the slice.
  function restoreYearScrollWhenReady(target: number) {
    if (target <= 0) return;
    let attempts = 0;
    const tick = () => {
      const el = yearGridViewport;
      const ready = el && el.scrollHeight >= target + el.clientHeight;
      if (ready || attempts >= 30) {
        if (el) el.scrollTop = target;
        return;
      }
      attempts += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Same poll-until-ready pattern as albums, but for the artist list, whose
  // scroll container is `.library-scroller` (not the album grid viewport). A fixed
  // double-rAF clamped to 0 on a large artist list, so Back landed at the top
  // of the list instead of the viewed artist (#1118, #870).
  function restoreArtistScrollWhenReady(target: number) {
    if (target <= 0) return;
    let attempts = 0;
    const tick = () => {
      // Meme regle qu'a la capture : on vise le conteneur qui defile pour de
      // bon, pas un nom fige (`lib/defilementReel.ts`).
      const el = conteneurDefilant(CANDIDATS_DEFILEMENT);
      const ready = el && el.scrollHeight >= target + el.clientHeight;
      if (ready || attempts >= 30) {
        if (el) el.scrollTop = target;
        return;
      }
      attempts += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function goBack() {
    // If we drilled into one or more "similar artists", Back returns to the
    // previous artist (with its similar list) rather than to the grid (#1144).
    if (similarArtistStack.length > 0) {
      const prev = similarArtistStack[similarArtistStack.length - 1];
      similarArtistStack = similarArtistStack.slice(0, -1);
      selectArtistDetail(prev, true);
      return;
    }
    // Album ouvert DEPUIS une page artiste : le retour revient à cet artiste,
    // pas à la grille complète des artistes (bug Fabien-1). selectedArtist est
    // conservé par selectAlbumDetail exactement pour ça.
    if ($selectedAlbum != null && $selectedArtist != null) {
      // Les `set(null)` tournent DANS la fenetre d'intention : ce sont eux qui
      // reveillent les souscriptions d'App.svelte, lesquelles reecrivaient
      // l'entree de la fiche juste avant de reculer.
      reculerAvecIntention(() => {
        selectedAlbum.set(null);
        albumTracks.set([]);
      });
      return;
    }
    const restoreAlbumScroll = savedAlbumScrollTop;
    const restoreArtistScroll = savedArtistScrollTop;
    const wasArtistTab = $libraryTab === 'artists';
    restoringScroll = restoreAlbumScroll > 0;
    reculerAvecIntention(() => {
      selectedAlbum.set(null);
      selectedArtist.set(null);
      albumTracks.set([]);
      artistAlbums.set([]);
      streamingArtistAlbums = [];
      artistMetadata = null;
      artistMetadataError = false;
      artistMetadataLoading = false;
    });
    // Poll until the re-rendered grid/list is tall enough before restoring
    // scroll — a fixed 2-frame wait clamped to 0 on large libraries (#1024).
    // Running the album restore here sets restoringScroll first, so the
    // `_prevInDetail` effect no-ops for browser-back (no double restore).
    restoreAlbumScrollWhenReady(restoreAlbumScroll);
    if (wasArtistTab && restoreArtistScroll > 0) {
      restoreArtistScrollWhenReady(restoreArtistScroll);
    }
    if ($libraryTab === 'genres' && savedGenreScrollTop > 0) {
      restoreArtistScrollWhenReady(savedGenreScrollTop);
    }
    if ($libraryTab === 'years') {
      restoreYearScrollWhenReady(yearScrollTop);
    }
  }

  // Le signalement lui-même (et la suppression de l'image fautive) est fait
  // par ReportButton → POST /library/reports ; il ne reste qu'à relire
  // l'artiste pour que le placeholder apparaisse tout de suite.
  async function refreshReportedArtist(artistId: number) {
    try {
      selectedArtist.set(await api.getArtist(artistId));
    } catch (e) {
      console.error('Refresh reported artist error:', e);
    }
  }

  let shuffleAllLoading = $state(false);

  // Le bouton doit DIRE ce qu'il va faire. `scopedFolder` manquait de cette
  // liste : pastille de répertoire active, le bouton continuait d'annoncer
  // « Tout lire en aléatoire » — ce que la capture de Marco Polo montre, et ce
  // qui rendait le défaut invisible (#2801). La condition était par ailleurs
  // recopiée à l'identique dans le libellé ET dans l'infobulle : une seule
  // expression, pour qu'elles ne puissent plus diverger.
  let shuffleEstPorte = $derived(
    !!(scopedFolder || searchQuery.trim() || selectedGenre || selectedParent || selectedNoGenre),
  );

  async function shuffleAllLibrary() {
    if (!zone?.id) {
      notifications.error($tr('library.noZoneSelected'));
      return;
    }
    shuffleAllLoading = true;
    try {
      // When browsing the genres tab, shuffle must stay scoped to the visible
      // genre selection — never leak to the whole library (#1126). A leaf genre
      // (`selectedGenre`) maps 1:1 to the server's `genre` filter, but a *parent
      // branch* (`selectedParent`, which the genres tab shows as top-level cards)
      // and the "no genre" bucket have no single server-side genre string. For
      // those, gather the visible albums' tracks and shuffle them client-side
      // (same pattern as SmartCollectionsView) so only the chosen genre plays.
      //
      // `!scopedFolder` : quand la pastille de répertoire est active, les trois
      // onglets ne chargent QUE le sous-arbre (`loadScopedAlbums/Artists/Tracks`)
      // et `genreAlbums` n'est plus ce qui est à l'écran. Sans cette garde, ce
      // retour anticipé DÉSARMERAIT la portée de répertoire ajoutée six lignes
      // plus bas : la lecture partirait des albums d'un genre qui n'est plus
      // affiché.
      if (!scopedFolder && !searchQuery.trim() && (selectedParent || selectedNoGenre) && !selectedGenre) {
        const albumIds = genreAlbums.map((a) => a.id).filter((id): id is number => id != null);
        // Bounded-concurrency fetch with one retry per album (getAlbumTracksBatch)
        // instead of a single Promise.all burst that silently dropped albums whose
        // request failed while the server was busy (ReplayGain/analysis) — the queue
        // came back truncated with no warning (same class fixed in SmartCollectionsView;
        // this is the Genres parent / "no genre" shuffle path).
        const { tracks, failedAlbums } = await api.getAlbumTracksBatch(albumIds);
        const trackIds = tracks.map((t) => t.id).filter((id): id is number => id != null);
        if (!trackIds.length) {
          notifications.error($tr('library.noTracks'));
          return;
        }
        if (failedAlbums > 0) {
          notifications.error($tr('smartCollection.partialQueue').replace('{failed}', String(failedAlbums)));
        }
        // Fisher–Yates shuffle.
        for (let i = trackIds.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [trackIds[i], trackIds[j]] = [trackIds[j], trackIds[i]];
        }
        await api.play(zone.id, { track_ids: trackIds });
        notifications.success($tr('library.shufflePlaying').replace('{count}', String(trackIds.length)));
        return;
      }
      // Pass current search/filter context so shuffle applies to visible results
      //
      // `folder` (#2801) : la pastille de répertoire est la portée EXTÉRIEURE
      // de cet écran — elle remplace le contenu des trois onglets par le seul
      // sous-arbre, et la zone de recherche ne fait ensuite que le restreindre.
      // Les deux partent donc ENSEMBLE, et le serveur les intersecte ; le genre
      // ne l'accompagne pas, parce qu'il vit dans l'onglet Genres, qui n'a pas
      // de pastille.
      //
      // Sans ce champ, `opts` restait VIDE dans le cas de Marco Polo (un
      // répertoire, ni recherche ni genre) : l'appel partait avec `undefined`
      // et le serveur tirait dans toute la bibliothèque.
      const opts: { search_query?: string; genre?: string; folder?: string } = {};
      if (scopedFolder) opts.folder = scopedFolder;
      if (searchQuery.trim()) opts.search_query = searchQuery.trim();
      else if (selectedGenre && !scopedFolder) opts.genre = selectedGenre;
      const result = await api.shuffleAll(zone.id, Object.keys(opts).length ? opts : undefined);
      notifications.success($tr('library.shufflePlaying').replace('{count}', String(result.track_count)));
    } catch (e) {
      console.error('Shuffle all error:', e);
      notifications.error($tr('common.error') + ' : ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      shuffleAllLoading = false;
    }
  }

  // "Toutes les pistes" / "Lecture aléatoire" on an artist page, scoped to the
  // LIBRARY albums only ($artistAlbums, never the streaming discography —
  // Sevy #1302). Gathers every track of the artist's owned albums and plays
  // them in order, or shuffled (Fisher–Yates), reusing the shuffleAllLibrary
  // client-side pattern.
  let artistPlayLoading = $state(false);
  async function playArtistLibrary(shuffle: boolean) {
    if (!zone?.id) {
      notifications.error($tr('library.noZoneSelected'));
      return;
    }
    artistPlayLoading = true;
    try {
      const albumIds = $artistAlbums.map((a) => a.id).filter((id): id is number => id != null);
      const trackLists = await Promise.all(
        albumIds.map((id) => api.getAlbumTracks(id).catch(() => [] as Track[])),
      );
      const trackIds = trackLists.flat().map((t) => t.id).filter((id): id is number => id != null);
      if (!trackIds.length) {
        notifications.error($tr('library.noTracks'));
        return;
      }
      if (shuffle) {
        for (let i = trackIds.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [trackIds[i], trackIds[j]] = [trackIds[j], trackIds[i]];
        }
      }
      await api.play(zone.id, { track_ids: trackIds });
      notifications.success($tr('library.shufflePlaying').replace('{count}', String(trackIds.length)));
    } catch (e) {
      console.error('Play artist library error:', e);
      notifications.error($tr('common.error') + ' : ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      artistPlayLoading = false;
    }
  }

  /// « FLAC 96 kHz / 24 bit », « DSF 2822 kHz »… pour le toast qualité.
  function libelleQualite(b: api.BetterQuality): string {
    const fmt = (b.format ?? '').toUpperCase();
    const sr = b.sample_rate ? `${Math.round(b.sample_rate / 1000)} kHz` : '';
    const bd = b.bit_depth && b.bit_depth > 1 ? ` / ${b.bit_depth} bit` : '';
    return [fmt, sr].filter(Boolean).join(' ') + bd;
  }

  /// La lecture demandée part IMMÉDIATEMENT ; la proposition arrive en toast,
  /// jamais en travers du chemin (Bertrand, 25/08 — pistes ET albums).
  async function proposerMeilleureQualiteAlbum(albumId: number) {
    try {
      const r = await api.albumBetterQuality(albumId);
      const b = r.better;
      if (!b?.album_id || b.album_id === albumId) return;
      notifications.withAction(
        `${$tr('library.betterQualityAvailable')} : ${libelleQualite(b)}`,
        $tr('library.playBetterQuality'),
        () => { void playAlbum(b.album_id!, { sansProposition: true }); },
      );
    } catch { /* proposition silencieuse : jamais d'erreur pour ça */ }
  }

  async function proposerMeilleureQualitePiste(trackId: number) {
    try {
      const r = await api.trackBetterQuality(trackId);
      const b = r.better;
      if (!b?.track_id || b.track_id === trackId) return;
      notifications.withAction(
        `${$tr('library.betterQualityAvailable')} : ${libelleQualite(b)}`,
        $tr('library.playBetterQuality'),
        () => { void playTrack(b.track_id!, { sansProposition: true }); },
      );
    } catch { /* proposition silencieuse */ }
  }

  async function playAlbum(albumId: number, opts?: { sansProposition?: boolean }) {
    if (!zone?.id) {
      notifications.error($tr('library.noZoneSelected'));
      return;
    }
    if (!opts?.sansProposition) void proposerMeilleureQualiteAlbum(albumId);
    try {
      // Respect the active quality/format filter: play only the matching tracks
      // instead of the whole (mixed-quality) album. Sergio #910/#915 — with a
      // FLAC / Hi-Res filter on, hitting play on an album card enqueued the
      // album's MP3 / 44.1 tracks too. getAlbumTracks applies the same
      // server-side filter the album detail uses. No filter (or empty result)
      // → the fast album_id path (whole album), unchanged.
      if (albumQualityFilter || albumFormatFilter) {
        const tracks = await api.getAlbumTracks(albumId, albumQualityFilter, albumFormatFilter);
        const ids = tracks.map(t => t.id).filter(Boolean) as number[];
        if (ids.length > 0) {
          await playAndSync(zone.id, { track_ids: ids });
          return;
        }
      }
      await playAndSync(zone.id, { album_id: albumId });
    } catch (e) {
      console.error('Play album error:', e);
      notifications.error($tr('library.playbackError') + ' : ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  // "Tout lire" from the album detail: play exactly the tracks currently shown.
  // The detail is loaded via getAlbumTracks() with the active quality/format
  // filter, so when a filter is on ($albumTracks holds only the matching subset)
  // the queue matches what the user sees instead of silently enqueuing the whole
  // (mixed-quality) album. Streaming albums (tracks without a numeric id) and any
  // load failure fall back to the plain album_id play.
  let ajoutFileEnCours = $state(false);

  /**
   * Ajouter l'album entier à la file d'attente.
   *
   * On envoie `album_id` au serveur plutôt que de résoudre les pistes ici. Ce
   * n'est pas une économie de requêtes : le serveur sait RATTRAPER un album
   * dont la ligne est vide en cherchant une ligne sœur peuplée — celle que la
   * vue Artistes atteint (Pascal, Totaldac, v0.9.21). Résoudre les pistes côté
   * client ignorerait ce rattrapage, et l'album s'ajouterait VIDE là où « lire »
   * fonctionne.
   */
  async function ajouterAlbumALaFile() {
    const albumId = $selectedAlbum?.id;
    const zoneId = $currentZone?.id;
    if (!albumId || !zoneId || ajoutFileEnCours) return;
    ajoutFileEnCours = true;
    try {
      const r = await api.addToQueue(zoneId, { album_id: albumId });
      notifications.success(
        `${$tr('library.albumQueued')} — ${r.queue_length} ${$tr('home.tracks').toLowerCase()}`,
      );
    } catch (e: any) {
      notifications.error(e?.message ?? $tr('library.albumQueueFailed'));
    } finally {
      ajoutFileEnCours = false;
    }
  }

  async function playAlbumDetail() {
    if (!zone?.id) {
      notifications.error($tr('library.noZoneSelected'));
      return;
    }
    const ids = $albumTracks.map(t => t.id).filter(Boolean) as number[];
    if (ids.length > 0) {
      try {
        await playAndSync(zone.id, { track_ids: ids });
      } catch (e) {
        console.error('Play album detail error:', e);
        notifications.error($tr('library.playbackError') + ' : ' + (e instanceof Error ? e.message : String(e)));
      }
      return;
    }
    if ($selectedAlbum?.id) await playAlbum($selectedAlbum.id);
  }

  // "Plus comme ça" — play a queue of tracks acoustically similar to this one
  // (Phase 2). Empty when the seed has no embedding yet (audio-embedding not run
  // / not covered), so we tell the user instead of silently doing nothing.
  async function playSimilar(track: { id?: number | null }) {
    const zone = $currentZone;
    if (!zone?.id || !track.id) return;
    try {
      const res = await api.getSimilarTracks(track.id, 50);
      const ids = res.items.map((t) => t.id).filter((x): x is number => typeof x === 'number');
      if (ids.length === 0) {
        notifications.info($tr('library.noSimilar'));
        return;
      }
      await playAndSync(zone.id, { track_ids: ids });
    } catch (e) {
      console.error('Play similar error:', e);
      notifications.error($tr('library.similarError'));
    }
  }

  async function playTrack(trackId: number, opts?: { sansProposition?: boolean }) {
    if (!zone?.id) {
      notifications.error($tr('library.noZoneSelected'));
      return;
    }
    if (!opts?.sansProposition) void proposerMeilleureQualitePiste(trackId);
    // If this track is already the one playing, restart it from the beginning
    // instead of rebuilding the queue (Elie: "retour au début de la piste").
    // Via currentTrackId : `$currentTrack.id` est absent de la charge utile de
    // /zones (le champ y est `track_id`), donc ce raccourci ne se déclenchait
    // jamais et chaque clic reconstruisait la file.
    if (trackId === $currentTrackId) {
      try {
        await api.seek(zone.id, 0);
        if (isBrowserZone(zone)) browserSeek(0);
        seekPositionMs.set(0);
      } catch (e) {
        console.error('Restart track error:', e);
      }
      return;
    }
    try {
      const idx = $albumTracks.findIndex(t => t.id === trackId);
      if (idx >= 0) {
        const ids = $albumTracks.slice(idx).map(t => t.id).filter(Boolean) as number[];
        await playAndSync(zone.id, { track_ids: ids });
      } else {
        await playAndSync(zone.id, { track_id: trackId });
      }
    } catch (e) {
      console.error('Play track error:', e);
      notifications.error($tr('library.playbackError') + ' : ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function playNext(track: Track) {
    if (!zone?.id) {
      notifications.error($tr('library.noZoneSelectedShort'));
      return;
    }
    try {
      const qs = await api.getQueue(zone.id);
      const nextPos = qs.position + 1;
      // Idle = nothing is actually playing (stopped/paused, no current track, or empty queue).
      // In that case "Play next" should also START playback on the inserted track.
      const idle = qs.length === 0 || (zone.state !== 'playing' && zone.state !== 'buffering' && !zone.current_track);
      if (track.id) {
        await api.addToQueue(zone.id, { track_id: track.id, position: nextPos });
      } else if (track.source && track.source_id) {
        await api.addToQueue(zone.id, { source: track.source, source_id: track.source_id, position: nextPos });
      }
      if (idle) {
        // Start playback at the just-inserted track (same action as clicking it in QueueView).
        await api.jumpInQueue(zone.id, nextPos);
      }
      const updated = await api.getQueue(zone.id);
      queueTracks.set(updated.tracks);
      queuePosition.set(updated.position);
      notifications.success(`"${track.title}" — ${$tr('library.playNext').toLowerCase()}`);
    } catch (e: any) {
      notifications.error(e?.message || $tr('common.error'));
    }
  }

  async function addTrackToQueue(track: Track) {
    if (!zone?.id) {
      notifications.error($tr('library.noZoneSelectedSelectZone'));
      return;
    }
    try {
      if (track.id) {
        await api.addToQueue(zone.id, { track_id: track.id });
      } else if (track.source && track.source_id) {
        await api.addToQueue(zone.id, { source: track.source, source_id: track.source_id });
      } else {
        // Sans ce dernier cas, une piste qui n'a ni identifiant local ni
        // couple source/source_id tombait entre les deux branches SANS RIEN
        // FAIRE — et le rafraîchissement de file juste en dessous s'exécutait
        // quand même, donnant à l'écran l'apparence d'un ajout réussi.
        notifications.error($tr('queue.addFailed'));
        console.error('addTrackToQueue: piste sans identifiant exploitable', track);
        return;
      }
      // Refresh queue after add
      const qs = await api.getQueue(zone.id);
      queueTracks.set(qs.tracks);
      queuePosition.set(qs.position);
    } catch (e) {
      console.error('Add to queue error:', e);
    }
  }

  // Detect browser-back (popstate) returning to grid from detail view
  let _prevInDetail = false;
  $effect(() => {
    const album = $selectedAlbum;
    const artist = $selectedArtist;
    untrack(() => {
      const inDetail = album != null || artist != null;
      const wasInDetail = _prevInDetail;
      _prevInDetail = inDetail;
      // Restore scroll when transitioning from detail back to grid (e.g. browser back button)
      if (wasInDetail && !inDetail && savedAlbumScrollTop > 0 && !restoringScroll) {
        restoringScroll = true;
        // Wait for the grid's virtual-scroll height to be laid out before setting
        // scrollTop, otherwise it clamps to 0 on browser-back (Pierre/#1024).
        restoreAlbumScrollWhenReady(savedAlbumScrollTop);
      }
      // Same for the artist list on browser-back (#1118, #870): restore its saved
      // position once the re-rendered list is tall enough.
      if (wasInDetail && !inDetail && $libraryTab === 'artists' && savedArtistScrollTop > 0) {
        restoreArtistScrollWhenReady(savedArtistScrollTop);
      }
      // Genres tab: same container as the artist list (`.library-scroller`) —
      // restore the drill's position on browser-back too (#1215).
      if (wasInDetail && !inDetail && $libraryTab === 'genres' && savedGenreScrollTop > 0) {
        restoreArtistScrollWhenReady(savedGenreScrollTop);
      }
      // Years tab: re-align the remounted viewport on the stale virtual-scroll
      // offset, otherwise the tab comes back as a black page (#1170).
      if (wasInDetail && !inDetail && $libraryTab === 'years') {
        restoreYearScrollWhenReady(yearScrollTop);
      }
    });
  });

  // Auto-load on tab switch
  $effect(() => {
    const tab = $libraryTab;
    untrack(() => {
      if (tab === 'albums' && !albumsLoaded && $albums.length === 0) loadAlbums();
      if (tab === 'artists' && !artistsLoaded && $artists.length === 0) loadArtists();
      if (tab === 'tracks' && !tracksLoaded && $tracks.length === 0) loadTracks();
      if (tab === 'genres' && !albumsLoaded && $albums.length === 0) loadAlbums();
      if (tab === 'years' && !albumsLoaded && $albums.length === 0) loadAlbums();
      if (tab === 'labels' && !labelsLoaded) loadLabels();
    });
  });
</script>

<div class="library-view">
  <!-- En-tete de la vue principale : HORS du conteneur de defilement,
       donc il ne bouge pas — sans `position: sticky`, que Firefox
       n'honore pas dans un scroller flex-colonne (#463, #1282). -->
  {#if !$selectedAlbum && !$selectedArtist}
      <div class="library-header">
        <h2>{$tr('library.title')}</h2>
        {#if scopedFolder}
          <button class="folder-scope-chip" onclick={clearFolderScope} title={scopedFolder}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span class="folder-scope-name">{scopedFolderName}</span>
            <span class="folder-scope-x">×</span>
          </button>
        {/if}
        <button class="shuffle-all-btn" onclick={shuffleAllLibrary} disabled={shuffleAllLoading} title={shuffleEstPorte ? $tr('library.shuffleResults') : $tr('library.shuffleAll')}>
          <!-- Ce bouton DECLENCHE une lecture ; la bascule de la barre de transport
               ACTIVE un mode. Les deux portaient le meme glyphe de fleches croisees,
               et un testeur a cliqué ici en croyant eteindre le mode aleatoire
               (renesenses/tune-server-rust#2261). Le triangle de lecture accolé est
               ce qui distingue « demarrer » de « activer » : ne pas le retirer, et
               ne pas l'ajouter a la bascule de TransportBar.svelte. -->
          <svg viewBox="0 0 36 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="16" aria-hidden="true"><polygon class="shuffle-all-play" points="1 5 1 19 10 12" fill="currentColor" stroke="none"/><g transform="translate(13,0)"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></g></svg>
          {shuffleAllLoading ? $tr('common.loading') : (shuffleEstPorte ? $tr('library.shuffle') : $tr('library.shuffleAll'))}
        </button>
        <button class="add-content-btn" onclick={() => (showImportWizard = true)} title={$tr('library.addContent')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {$tr('library.addContent')}
        </button>
        <div class="library-header-right">
          <div class="search-box">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" placeholder={$tr('library.searchPlaceholder')} bind:value={searchQuery} />
            {#if searchQuery}
              <button class="search-clear" onclick={() => searchQuery = ''}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            {/if}
          </div>
          <div class="tab-bar">
            <button class="tab" class:active={$libraryTab === 'albums'} onclick={() => switchTab('albums')}>{$tr('common.albums')}</button>
            <button class="tab" class:active={$libraryTab === 'artists'} onclick={() => switchTab('artists')}>{$tr('common.artists')}</button>
            <button class="tab" class:active={$libraryTab === 'tracks'} onclick={() => switchTab('tracks')}>{$tr('home.tracks')}</button>
            <button class="tab" class:active={$libraryTab === 'genres'} onclick={() => switchTab('genres')}>{$tr('common.genres')}</button>
            <button class="tab" class:active={$libraryTab === 'years'} onclick={() => switchTab('years')}>{$tr('common.years')}</button>
            <button class="tab" class:active={$libraryTab === 'labels'} onclick={() => switchTab('labels')}>{$tr('common.labels' as any)}</button>
          </div>
        </div>
      </div>
  {/if}
  <!-- UN SEUL conteneur de defilement, hors de la chaine conditionnelle : il doit SURVIVRE
       au passage grille -> detail -> retour. Place dans la branche
       bibliotheque, il etait detruit puis recree, et la position de la
       liste Artistes repartait a zero au Retour (mesure : meme element
       apres retour = false). C'est ce qu'assurait `.library-view` avant,
       en enjambant les trois branches. -->
  <div class="library-scroller">
  {#if $selectedAlbum}
    <!-- Album detail -->
    <div class="detail-header">
      <button class="back-btn" onclick={goBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        {$tr('common.back')}
      </button>
    </div>
    <div class="album-detail">
      <div class="album-detail-header">
        <AlbumArt coverPath={$selectedAlbum.cover_path} albumId={$selectedAlbum.id} size={400} alt={$selectedAlbum.title} />
        <div class="album-detail-info">
          <h2>{$selectedAlbum.title}</h2>
          {#if $selectedAlbum.artist_name}
            <button class="detail-artist-link" onclick={() => { if ($selectedAlbum?.artist_id) selectArtistDetail({ id: $selectedAlbum.artist_id, name: $selectedAlbum.artist_name! }); }}>{$selectedAlbum.artist_name}</button>
          {/if}
          <div class="detail-meta">
            {#if $selectedAlbum.year || $selectedAlbum.original_year}
              <span>{$formatAnneeAlbum($selectedAlbum)}</span>
            {/if}
            {#if $selectedAlbum.genre}
              <span>{$selectedAlbum.genre.split(/[;\/\\]/).map(g => g.trim()).filter(Boolean).join(', ')}</span>
            {/if}
            {#if $albumTracks.length > 0}
              <span>{$albumTracks.length} {$tr('common.tracks')}</span>
            {/if}
            {#if albumTotalDuration > 0}
              <span>{formatDuration(albumTotalDuration)}</span>
            {/if}
            <!-- Dynamic Range, quand les fichiers portent le tag (#303, #1418).
                 Rien n'est affiché sinon : la plupart des bibliothèques ne sont
                 pas taguées, et une mention vide sur chaque album serait pire
                 que l'absence. -->
            {#if $selectedAlbum.dynamic_range}
              <span class="dr-badge" use:tip={'library.dynamicRangeTip'}>DR {$selectedAlbum.dynamic_range}</span>
            {/if}
          </div>
          {#if $selectedAlbum.source && $selectedAlbum.source !== 'local'}
            <span class="source-badge">{$selectedAlbum.source}</span>
          {/if}
          <div class="detail-actions">
            <button class="play-all-btn" onclick={() => playAlbumDetail()} title={$tr('library.playAlbum')}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M8 5v14l11-7z" /></svg>
            </button>
            <button
              class="queue-album-btn"
              onclick={() => ajouterAlbumALaFile()}
              disabled={ajoutFileEnCours || !$currentZone?.id}
              title={$tr('queue.addToQueue')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="3" y1="6" x2="14" y2="6" /><line x1="3" y1="12" x2="14" y2="12" /><line x1="3" y1="18" x2="10" y2="18" /><line x1="18" y1="9" x2="18" y2="19" /><line x1="13" y1="14" x2="23" y2="14" /></svg>
              {$tr('queue.addToQueue')}
            </button>
            <button class="edit-btn" onclick={(e) => $selectedAlbum && openAlbumEdit(e, $selectedAlbum)} title={$tr('metadata.editAlbum')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              {$tr('metadata.editAlbum')}
            </button>
            {#if !$selectedAlbum.source || $selectedAlbum.source === 'local'}
              <button class="write-tags-btn" onclick={() => $selectedAlbum?.id && handleWriteAlbumTags($selectedAlbum.id)} disabled={writingAlbumTags}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /></svg>
                {writingAlbumTags ? $tr('library.writingTags') : $tr('library.writeTags')}
              </button>
            {/if}
            {#if !$selectedAlbum.source || $selectedAlbum.source === 'local'}
              <button
                class="edit-btn"
                onclick={() => $selectedAlbum?.id && handleReidentifyAlbum($selectedAlbum.id)}
                disabled={reidentifyingAlbum}
                title={$tr('library.reidentifyTip')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                {reidentifyingAlbum ? $tr('library.reidentifying') : $tr('library.reidentify')}
              </button>
            {/if}
            {#if $selectedAlbum.cover_path && $selectedAlbum.id}
              <ReportButton
                entity="cover"
                entityId={$selectedAlbum.id}
                reasons={['wrong_entity', 'incorrect', 'poor_quality', 'offensive']}
              />
            {/if}
            <div class="collection-dropdown-wrap" style="position:relative;display:inline-flex">
              <button class="edit-btn" onclick={() => { showCollectionMenu = !showCollectionMenu; if (!collectionsLoaded) loadCollections(); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                Collection
              </button>
              {#if showCollectionMenu}
                <div class="collection-dropdown">
                  {#if collections.length === 0}
                    <span class="collection-empty">{$tr('library.noCollections')}</span>
                  {:else}
                    {#each collections as col}
                      <button class="collection-option" onclick={() => handleAddToCollection(col.id)}>
                        {#if col.color}<span class="col-dot" style="background:{col.color}"></span>{/if}
                        {col.name}
                      </button>
                    {/each}
                  {/if}
                </div>
              {/if}
            </div>
          </div>
          {#if writeTagsMessage}
            <div class="write-tags-message">{writeTagsMessage}</div>
          {/if}
          <!-- User tags -->
          {#if $selectedAlbum?.id}
            {@const albumId = $selectedAlbum.id}
            <!-- #2256 (bluevelvet, fil 451) : la zone de création s'ouvrait
                 « en bas de l'écran, juste au-dessus de la barre de lecture,
                 partiellement masquée par celle-ci ». `.tag-picker` est
                 `position: absolute; top: 100%` et n'avait aucun ancêtre
                 positionné : son bloc de référence remontait jusqu'à
                 `.view-scroller` (App.svelte, `position: relative`), qui
                 occupe toute la hauteur de la vue — `top: 100%` tombait donc
                 au ras du lecteur. La règle `.tag-add-wrap { position:
                 relative }` existait depuis l'origine mais n'était employée
                 nulle part ; c'est elle, ici, qui ancre la zone sous son
                 bouton. Le bouton sort du bloc `{#await}` pour rester avec
                 elle dans le même conteneur : il reste ainsi visible pendant
                 le chargement des étiquettes au lieu d'apparaître après. -->
            <div class="album-tags-row">
              {#key albumTagsKey}
                {#await api.getTagsForItem('album', albumId) then albumTags}
                  {#each albumTags as tag}
                    <span class="album-tag-chip" style="background:{tag.color}">
                      {tag.name}
                      <button class="tag-remove" onclick={async () => { await api.untagItem(tag.id!, 'album', albumId); await loadUserTags(); albumTagsKey++; }}>×</button>
                    </span>
                  {/each}
                {/await}
              {/key}
              <span class="tag-add-wrap">
                <button class="tag-add-btn" onclick={() => showTagPicker = !showTagPicker}>+ Tag</button>
                {#if showTagPicker}
                  <div class="tag-picker">
                    <!-- La touche Entrée était le SEUL moyen de valider : un
                         nom saisi puis un clic ailleurs, et la saisie
                         disparaissait sans un mot. Le bouton rend la
                         validation visible ; Entrée continue de marcher. -->
                    <div class="tag-picker-create">
                      <input class="tag-picker-input" type="text" placeholder={$tr('library.newTagPlaceholder')} bind:value={newTagName} onkeydown={(e) => { if (e.key === 'Enter' && newTagName.trim()) handleCreateAndAssignTag(albumId); }} />
                      <button class="tag-picker-submit" disabled={!newTagName.trim()} title={$tr('library.createTag' as any)} aria-label={$tr('library.createTag' as any)} onclick={() => handleCreateAndAssignTag(albumId)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>
                      </button>
                    </div>
                    {#each userTags as tag}
                      <button class="tag-picker-option" onclick={async () => { await api.tagItem(tag.id!, 'album', albumId); showTagPicker = false; await loadUserTags(); albumTagsKey++; }}>
                        <span class="tag-dot" style="background:{tag.color}"></span>
                        {tag.name}
                      </button>
                    {/each}
                  </div>
                {/if}
              </span>
            </div>
          {/if}
          <button class="bio-toggle-btn" onclick={() => { showAlbumBio = !showAlbumBio; if (showAlbumBio && $selectedAlbum?.id) loadAlbumBio($selectedAlbum.id); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            {showAlbumBio ? $tr('library.hideNotes') : $tr('library.notesBio')}
          </button>
          {#if showAlbumBio}
            <div class="album-bio-section">
              {#if albumBioLoading}
                <div class="spinner-sm"></div>
              {:else if albumBio}
                {@const displayAlbumBio = bioDisplayText(albumBio, albumBioLevel, { simpleSentenceStart: 80, simpleMax: 300, completeCut: 800 })}
                {#if albumBio.length > 300}
                  <div class="bio-level-pills">
                    <button class="bio-level-pill" class:active={albumBioLevel === 'simple'} onclick={() => albumBioLevel = 'simple'}>{$tr('library.bioLevelSimple')}</button>
                    <button class="bio-level-pill" class:active={albumBioLevel === 'complete'} onclick={() => albumBioLevel = 'complete'}>{$tr('library.bioLevelComplete')}</button>
                    <button class="bio-level-pill" class:active={albumBioLevel === 'full'} onclick={() => albumBioLevel = 'full'}>{$tr('library.bioLevelFull')}</button>
                  </div>
                {/if}
                <ClampedText lines={3} resetKey={displayAlbumBio}>
                  <p class="album-bio-text">{displayAlbumBio}</p>
                </ClampedText>
              {:else}
                <p class="album-bio-empty">{$tr('library.noAlbumNote')}</p>
              {/if}
            </div>
          {/if}
          <!-- Album Rating -->
          {#if $selectedAlbum?.id}
            <AlbumRating albumId={$selectedAlbum.id} />
          {/if}
        </div>
      </div>
      {#if hasMultipleDiscs}
        {#each tracksByDisc as [discNum, discTracks, discSubtitle]}
          <div class="disc-header">{$tr('library.disc').replace('{num}', String(discNum))}{#if discSubtitle} — {discSubtitle}{/if}</div>
          <div class="track-list">
            {#each discTracks as t, index}
              {#if t.id != null && groupingHeads.has(t.id)}
                <div class="grouping-header">{groupingHeads.get(t.id)}</div>
              {/if}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- `t.id != null` d'abord : sans ce garde, deux pistes sans
                   identifiant se surligneraient ensemble. Voir .track-item.playing. -->
              <div
                class="track-item"
                class:playing={t.id != null && t.id === $currentTrackId}
                aria-current={t.id != null && t.id === $currentTrackId ? 'true' : undefined}
                onclick={() => t.id && playTrack(t.id)}
              >
                <span class="track-num">
                  <span class="num-text">{t.track_number ?? index + 1}</span>
                  <span class="num-play">&#9654;</span>
                </span>
                <div class="track-info">
                  <span class="track-title truncate" title={t.title}>{t.title}</span>
                  {#if t.artist_name}
                    <span class="track-artist truncate" title={t.artist_name}>{t.artist_name}</span>
                  {/if}
                  <MetadataChips track={t} fields={$displayFields} />
                </div>
                <span class="track-duration">{formatTime(t.duration_ms)}</span>
                <span class="track-heart" onclick={(e) => e.stopPropagation()}><HeartButton trackId={t.id} size={14} /></span>
                {#if t.id}
                  <button class="quick-fav-btn" class:faved={quickFavTrackIds.has(t.id)} onclick={(e) => handleQuickFavTrack(t.id!, e)} title={$tr('library.quickFav')}>
                    <svg viewBox="0 0 24 24" fill={quickFavTrackIds.has(t.id) ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                  </button>
                {/if}
                <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); addTrackToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
              <button class="play-from-here-btn" onclick={(e) => { e.stopPropagation(); playFromHere($albumTracks, $albumTracks.indexOf(t)); }} title={$tr('common.playFromHere')} aria-label={$tr('common.playFromHere')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="3" y1="6" x2="14" y2="6" /><line x1="3" y1="12" x2="14" y2="12" /><line x1="3" y1="18" x2="10" y2="18" /><path d="M16 8v8l6-4z" fill="currentColor" stroke="none" /></svg>
              </button>
              <button class="play-next-btn" onclick={(e) => { e.stopPropagation(); playNext(t); }} title={$tr('library.playNext')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
              </button>
                {#if onAddToPlaylist && (t.id || t.source_id)}
                  <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={$tr('nowplaying.addToPlaylist')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" /><line x1="16" y1="3" x2="16" y2="11" /><line x1="12" y1="7" x2="20" y2="7" /></svg>
                  </button>
                {/if}
                <button class="credits-btn" class:active={expandedTrackCredits === t.id} onclick={(e) => { e.stopPropagation(); t.id && toggleTrackCredits(t.id); }} title={$tr('artist.credits')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                </button>
                <button class="edit-track-btn" onclick={(e) => { e.stopPropagation(); openTrackEdit(e, t); }} title={$tr('metadata.editTrack')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </button>
                <!-- Track context menu -->
                <div class="track-more-wrap">
                  <button class="track-more-btn" onclick={(e) => openTrackMenu(e, t.id)} title={$tr('library.moreOptions')}>···</button>
                  {#if trackMenuOpenId === t.id}
                    <TrackContextMenu
                      onClose={closeTrackMenu}
                      onPlay={() => t.id && playTrack(t.id)}
                      onAddToQueue={() => addTrackToQueue(t)}
                      onPlaySimilar={() => playSimilar(t)}
                      onOtherVersions={t.id ? () => toggleTrackVersions(t.id!) : undefined}
                      onAddToPlaylist={onAddToPlaylist ? () => onAddToPlaylist!(t) : undefined}
                      onGoToArtist={t.artist_name
                        ? () => { const a = $artists.find(ar => ar.name === t.artist_name); if (a) selectArtistDetail(a); }
                        : undefined}
                    />
                  {/if}
                </div>
              </div>
              {#if expandedTrackCredits === t.id}
                <div class="track-credits-row">
                  {#if trackCreditsLoading === t.id}
                    <div class="spinner-sm"></div>
                  {:else if trackCreditsMap[t.id!] && trackCreditsMap[t.id!].length > 0}
                    {#each Object.entries(groupCreditsByRole(trackCreditsMap[t.id!])) as [role, credits]}
                      <div class="credits-role-group">
                        <span class="credits-role-label">{formatRole(role)}</span>
                        <div class="credits-names">
                          {#each credits as c}
                            <span class="credit-chip" onclick={(e) => { e.stopPropagation(); if (c.artist_id) selectArtistDetail({ id: c.artist_id, name: c.artist_name }); }}>
                              {c.artist_name}{#if c.instrument}<span class="credit-instrument">{c.instrument}</span>{/if}
                            </span>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  {:else}
                    <span class="credits-empty">{$tr('artist.noMetadata')}</span>
                  {/if}
                </div>
              {/if}
              {#if expandedTrackVersions === t.id}
                <!--
                  « Autres versions de ce titre » (#2372). La MEME surface que les
                  crédits : une ligne dépliée sous la piste. Pas de modale, pas de vue
                  neuve — la création d'écran revient au designer.
                -->
                <div class="track-versions-row">
                  {#if trackVersionsLoading === t.id}
                    <div class="spinner-sm"></div>
                  {:else}
                    {@const g = trackVersionsMap[t.id!] ?? null}
                    {@const locales = g?.versions ?? []}
                    {@const flux = g?.streaming ?? []}
                    {#if locales.length === 0 && flux.length === 0}
                      <span class="credits-empty">{$tr('library.noOtherVersions')}</span>
                    {:else}
                      <div class="versions-tuiles">
                        {#each locales as v}
                          <button class="version-tuile" onclick={(e) => { e.stopPropagation(); if (v.track_id) playTrack(v.track_id); }} title={v.album_title ?? ''}>
                            <AlbumArt coverPath={v.cover_path} albumId={v.album_id} size={48} alt={v.album_title ?? ''} />
                            <span class="version-tuile-texte">
                              <span class="version-tuile-titre truncate">{v.album_title ?? ''}</span>
                              <span class="version-tuile-sub">
                                {#if v.duration_ms}{formatTime(v.duration_ms)}{/if}
                              </span>
                            </span>
                          </button>
                        {/each}
                        {#each flux as v}
                          <button
                            class="version-tuile"
                            class:reprise={v.kind === 'reprise'}
                            class:inerte={!(v.album_id ?? v.source_id)}
                            onclick={(e) => { e.stopPropagation(); ouvrirVersionStreaming(v); }}
                            title={v.album_title ?? v.title}
                          >
                            <AlbumArt coverPath={v.cover_path} size={48} alt={v.album_title ?? v.title} />
                            <span class="version-tuile-texte">
                              <span class="version-tuile-titre truncate">{v.kind === 'reprise' ? (v.artist_name ?? v.title) : (v.album_title ?? v.title)}</span>
                              <span class="version-tuile-sub">
                                <ServiceBadge source={v.service} compact />
                              </span>
                            </span>
                          </button>
                        {/each}
                      </div>
                    {/if}
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        {/each}
      {:else}
        <div class="track-list">
          {#each $albumTracks as t, index}
            {#if t.id != null && groupingHeads.has(t.id)}
              <div class="grouping-header">{groupingHeads.get(t.id)}</div>
            {/if}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <!-- Voir .track-item.playing — même garde `t.id != null`. -->
            <div
              class="track-item"
              class:playing={t.id != null && t.id === $currentTrackId}
              aria-current={t.id != null && t.id === $currentTrackId ? 'true' : undefined}
              onclick={() => t.id && playTrack(t.id)}
            >
              <span class="track-num">
                <span class="num-text">{t.track_number ?? index + 1}</span>
                <span class="num-play">&#9654;</span>
              </span>
              <div class="track-info" title={t.file_path ?? ''}>
                <span class="track-title truncate" title={t.title}>{t.title}</span>
                {#if t.artist_name}
                  <span class="track-artist truncate" title={t.artist_name}>{t.artist_name}</span>
                {/if}
                <MetadataChips track={t} fields={$displayFields} />
              </div>
              <span class="track-duration">{formatTime(t.duration_ms)}</span>
              <span class="track-heart" onclick={(e) => e.stopPropagation()}><HeartButton trackId={t.id} size={14} /></span>
              {#if t.id}
                <button class="quick-fav-btn" class:faved={quickFavTrackIds.has(t.id)} onclick={(e) => handleQuickFavTrack(t.id!, e)} title={$tr('library.quickFav')}>
                  <svg viewBox="0 0 24 24" fill={quickFavTrackIds.has(t.id) ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                </button>
              {/if}
              <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); addTrackToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
              <button class="play-from-here-btn" onclick={(e) => { e.stopPropagation(); playFromHere($albumTracks, index); }} title={$tr('common.playFromHere')} aria-label={$tr('common.playFromHere')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="3" y1="6" x2="14" y2="6" /><line x1="3" y1="12" x2="14" y2="12" /><line x1="3" y1="18" x2="10" y2="18" /><path d="M16 8v8l6-4z" fill="currentColor" stroke="none" /></svg>
              </button>
              <button class="play-next-btn" onclick={(e) => { e.stopPropagation(); playNext(t); }} title={$tr('library.playNext')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
              </button>
              {#if onAddToPlaylist && (t.id || t.source_id)}
                <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={$tr('nowplaying.addToPlaylist')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" /><line x1="16" y1="3" x2="16" y2="11" /><line x1="12" y1="7" x2="20" y2="7" /></svg>
                </button>
              {/if}
              <button class="credits-btn" class:active={expandedTrackCredits === t.id} onclick={(e) => { e.stopPropagation(); t.id && toggleTrackCredits(t.id); }} title={$tr('artist.credits')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              </button>
              <button class="edit-track-btn" onclick={(e) => { e.stopPropagation(); openTrackEdit(e, t); }} title={$tr('metadata.editTrack')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </button>
              <!-- Track context menu -->
              <div class="track-more-wrap">
                <button class="track-more-btn" onclick={(e) => openTrackMenu(e, t.id)} title={$tr('library.moreOptions')}>···</button>
                {#if trackMenuOpenId === t.id}
                  <TrackContextMenu
                    onClose={closeTrackMenu}
                    onPlay={() => t.id && playTrack(t.id)}
                    onAddToQueue={() => addTrackToQueue(t)}
                      onPlaySimilar={() => playSimilar(t)}
                      onOtherVersions={t.id ? () => toggleTrackVersions(t.id!) : undefined}
                    onAddToPlaylist={onAddToPlaylist ? () => onAddToPlaylist!(t) : undefined}
                    onGoToArtist={t.artist_name
                      ? () => { const a = $artists.find(ar => ar.id === t.artist_id) ?? $artists.find(ar => ar.name === t.artist_name) ?? (t.artist_id != null ? { id: t.artist_id, name: t.artist_name ?? '' } as Artist : undefined); if (a?.id != null) selectArtistDetail(a as Artist); }
                      : undefined}
                  />
                {/if}
              </div>
            </div>
            {#if expandedTrackCredits === t.id}
              <div class="track-credits-row">
                {#if trackCreditsLoading === t.id}
                  <div class="spinner-sm"></div>
                {:else if trackCreditsMap[t.id!] && trackCreditsMap[t.id!].length > 0}
                  {#each Object.entries(groupCreditsByRole(trackCreditsMap[t.id!])) as [role, credits]}
                    <div class="credits-role-group">
                      <span class="credits-role-label">{formatRole(role)}</span>
                      <div class="credits-names">
                        {#each credits as c}
                          <span class="credit-chip" onclick={(e) => { e.stopPropagation(); if (c.artist_id) selectArtistDetail({ id: c.artist_id, name: c.artist_name }); }}>
                            {c.artist_name}{#if c.instrument}<span class="credit-instrument">{c.instrument}</span>{/if}
                          </span>
                        {/each}
                      </div>
                    </div>
                  {/each}
                {:else}
                  <span class="credits-empty">{$tr('artist.noMetadata')}</span>
                {/if}
              </div>
            {/if}
            {#if expandedTrackVersions === t.id}
              <!--
                « Autres versions de ce titre » (#2372). La MEME surface que les
                crédits : une ligne dépliée sous la piste. Pas de modale, pas de vue
                neuve — la création d'écran revient au designer.
              -->
              <div class="track-versions-row">
                {#if trackVersionsLoading === t.id}
                  <div class="spinner-sm"></div>
                {:else}
                  {@const g = trackVersionsMap[t.id!] ?? null}
                  {@const locales = g?.versions ?? []}
                  {@const flux = g?.streaming ?? []}
                  {#if locales.length === 0 && flux.length === 0}
                    <span class="credits-empty">{$tr('library.noOtherVersions')}</span>
                  {:else}
                    <div class="versions-tuiles">
                      {#each locales as v}
                        <button class="version-tuile" onclick={(e) => { e.stopPropagation(); if (v.track_id) playTrack(v.track_id); }} title={v.album_title ?? ''}>
                          <AlbumArt coverPath={v.cover_path} albumId={v.album_id} size={48} alt={v.album_title ?? ''} />
                          <span class="version-tuile-texte">
                            <span class="version-tuile-titre truncate">{v.album_title ?? ''}</span>
                            <span class="version-tuile-sub">
                              {#if v.duration_ms}{formatTime(v.duration_ms)}{/if}
                            </span>
                          </span>
                        </button>
                      {/each}
                      {#each flux as v}
                        <button
                          class="version-tuile"
                          class:reprise={v.kind === 'reprise'}
                          class:inerte={!(v.album_id ?? v.source_id)}
                          onclick={(e) => { e.stopPropagation(); ouvrirVersionStreaming(v); }}
                          title={v.album_title ?? v.title}
                        >
                          <AlbumArt coverPath={v.cover_path} size={48} alt={v.album_title ?? v.title} />
                          <span class="version-tuile-texte">
                            <span class="version-tuile-titre truncate">{v.kind === 'reprise' ? (v.artist_name ?? v.title) : (v.album_title ?? v.title)}</span>
                            <span class="version-tuile-sub">
                              <ServiceBadge source={v.service} compact />
                            </span>
                          </span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

  {:else if $selectedArtist}
    <!-- Artist detail -->
    <div class="detail-header">
      <button class="back-btn" onclick={goBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        {$tr('common.back')}
      </button>
    </div>

    <div class="artist-detail">
      <!-- Artist header -->
      <div class="artist-detail-header">
        <div class="artist-detail-avatar">
          {#if $selectedArtist.image_path}
            <AlbumArt coverPath={$selectedArtist.image_path} size={160} alt={$selectedArtist.name} round />
          {:else if artistMetadata?.image_url}
            <img class="artist-detail-img" src={artistMetadata.image_url} alt={$selectedArtist.name} loading="lazy" onerror={(e) => (e.target as HTMLImageElement).style.display='none'} />
          {:else}
            <span class="artist-detail-initials">{initials($selectedArtist.name)}</span>
          {/if}
        </div>
        <div class="artist-detail-info">
          {#if editingArtistName}
            <div class="artist-name-edit">
              <input
                type="text"
                class="artist-name-input"
                bind:value={artistNameInput}
                onkeydown={(e) => { if (e.key === 'Enter') saveArtistName(); if (e.key === 'Escape') cancelEditArtistName(); }}
                autofocus
              />
              <button class="artist-name-save" onclick={saveArtistName} disabled={artistNameSaving || !artistNameInput.trim()}>
                {#if artistNameSaving}
                  <div class="spinner-sm"></div>
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
                {/if}
              </button>
              <button class="artist-name-cancel" onclick={cancelEditArtistName} use:tip={'common.cancel'}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          {:else}
            <h2 class="artist-detail-name">
              {$selectedArtist.name}
              <button class="artist-edit-btn" onclick={() => showArtistEdit = true} title={$tr('library.editArtist')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </button>
            </h2>
          {/if}
          {#if $artistAlbums.length > 0}
            <span class="artist-detail-count">{$artistAlbums.length} {$artistAlbums.length > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
            <!-- Sens du tri chronologique (#1659). Même bouton et même icône
                 que l'onglet Années, pour que le geste se reconnaisse. -->
            <button
              class="sort-order-btn artist-sort-btn"
              onclick={toggleArtistAlbumSortOrder}
              title={artistAlbumSortOrder === 'asc' ? $tr('library.ascending') : $tr('library.descending')}
              aria-label={artistAlbumSortOrder === 'asc' ? $tr('library.ascending') : $tr('library.descending')}
            >
              {#if artistAlbumSortOrder === 'asc'}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 5v14M5 12l7-7 7 7" /></svg>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 19V5M5 12l7 7 7-7" /></svg>
              {/if}
            </button>
            <div class="artist-play-actions">
              <button class="artist-play-btn" onclick={() => playArtistLibrary(false)} disabled={artistPlayLoading} title={$tr('library.playAllArtist')}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z" /></svg>
                {$tr('library.playAllArtist')}
              </button>
              <button class="artist-play-btn" onclick={() => playArtistLibrary(true)} disabled={artistPlayLoading} title={$tr('library.shuffleArtist')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" /></svg>
                {$tr('library.shuffleArtist')}
              </button>
            </div>
          {/if}
          {#if artistMetadataLoading}
            <div class="artist-meta-loading">
              <div class="spinner-sm"></div>
              {$tr('common.loading')}
            </div>
          {:else if artistMetadata?.enrichment_status === 'pending'}
            <div class="artist-enriching">
              <div class="spinner-sm"></div>
              {$tr('artist.enriching')}
            </div>
          {/if}
          {#if $selectedArtist.image_path || artistMetadata?.image_url}
            <ReportButton
              entity="artist_image"
              entityId={$selectedArtist.id!}
              mbid={$selectedArtist.musicbrainz_id ?? undefined}
              reasons={['wrong_entity', 'incorrect', 'poor_quality', 'offensive']}
              compact
              onReported={() => refreshReportedArtist($selectedArtist!.id!)}
            />
          {/if}
        </div>
      </div>

      <!-- Bio -->
      {#if artistBio}
        {@const isLong = artistBio.length > 500}
        {@const displayBio = !isLong ? artistBio : bioDisplayText(artistBio, bioLevel, { simpleSentenceStart: 100, simpleMax: 400, completeCut: 1500, trimTrailingLine: true })}
        {#if isLong}
          <div class="bio-level-pills">
            <button class="bio-level-pill" class:active={bioLevel === 'simple'} onclick={() => bioLevel = 'simple'}>{$tr('library.bioLevelSimple')}</button>
            <button class="bio-level-pill" class:active={bioLevel === 'complete'} onclick={() => bioLevel = 'complete'}>{$tr('library.bioLevelComplete')}</button>
            <button class="bio-level-pill" class:active={bioLevel === 'full'} onclick={() => bioLevel = 'full'}>{$tr('library.bioLevelFull')}</button>
          </div>
        {/if}
        <ClampedText lines={3} resetKey={displayBio}>
          <blockquote class="artist-bio">
            {#each displayBio.split('\n').filter(p => p.trim()) as paragraph}
              <p>{paragraph}</p>
            {/each}
          </blockquote>
        </ClampedText>
        <div class="bio-actions">
          <button class="bio-enrich-btn" onclick={enrichArtistBio} disabled={enrichLoading}>
            {#if enrichLoading}
              <div class="btn-spinner"></div>
              {$tr('artist.enriching')}
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" /></svg>
              {isLong ? $tr('library.reEnrich') : $tr('library.enrichBio')}
            {/if}
          </button>
          {#if $selectedArtist?.id}
            <ReportButton
              entity="bio"
              entityId={$selectedArtist.id}
              mbid={$selectedArtist.musicbrainz_id ?? undefined}
              reasons={['incorrect', 'wrong_entity', 'offensive']}
            />
          {/if}
        </div>
      {:else if !artistMetadataLoading}
        <div class="bio-actions">
          <button class="bio-enrich-btn bio-enrich-btn--prominent" onclick={enrichArtistBio} disabled={enrichLoading}>
            {#if enrichLoading}
              <div class="btn-spinner"></div>
              {$tr('artist.enriching')}
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" /></svg>
              {$tr('library.getBio')}
            {/if}
          </button>
        </div>
      {/if}

      <!-- Collapsible sections -->
      {#if artistMetadata && !artistMetadataLoading}
        {#if artistMetadata.anecdotes && artistMetadata.anecdotes.length > 0}
          <CollapsibleSection title={$tr('artist.anecdotes')} open={!!openSections['anecdotes']} onToggle={() => toggleSection('anecdotes')}>
            <ul class="artist-anecdotes">
              {#each artistMetadata.anecdotes as anecdote}
                <li>{anecdote}</li>
              {/each}
            </ul>
          </CollapsibleSection>
        {/if}

        {#if artistMetadata.similar_artists && artistMetadata.similar_artists.length > 0}
          <CollapsibleSection title={$tr('artist.similarArtists')} open={!!openSections['similar']} onToggle={() => toggleSection('similar')}>
            <div class="artist-similar-list">
              {#each artistMetadata.similar_artists as sa}
                <button class="artist-similar-chip clickable" title={sa.reason} onclick={() => navigateToSimilarArtist(sa.name)}>{sa.name}</button>
              {/each}
            </div>
          </CollapsibleSection>
        {/if}

        {#if artistMetadata.members && artistMetadata.members.length > 0}
          <CollapsibleSection title={$tr('artist.members')} open={!!openSections['members']} onToggle={() => toggleSection('members')}>
            <div class="artist-members-list">
              {#each artistMetadata.members as member}
                <div class="artist-member">
                  <span class="artist-member-name">{member.name}</span>
                  <span class="artist-member-role">{member.role}</span>
                </div>
              {/each}
            </div>
          </CollapsibleSection>
        {/if}

        {#if artistMetadata.discography_highlights && artistMetadata.discography_highlights.length > 0}
          <CollapsibleSection title={$tr('artist.discography')} open={!!openSections['discography']} onToggle={() => toggleSection('discography')}>
            <div class="artist-discography-list">
              {#each artistMetadata.discography_highlights as disc}
                <div class="artist-disc-item">
                  <span class="artist-disc-year">{disc.year}</span>
                  <div class="artist-disc-info">
                    <span class="artist-disc-title">{disc.title}</span>
                    <span class="artist-disc-desc">{disc.description}</span>
                  </div>
                </div>
              {/each}
            </div>
          </CollapsibleSection>
        {/if}
      {/if}

      <!-- Credits (instruments played) -->
      {#if artistCredits && artistCredits.length > 0}
        <CollapsibleSection title={$tr('artist.credits')} open={!!openSections['credits']} onToggle={() => toggleSection('credits')}>
          {@const instruments = uniqueInstruments(artistCredits)}
          <div class="artist-credits-list">
            {#if instruments.length > 0}
              <div class="credits-instruments">
                {#each instruments as instr}
                  <span class="credit-chip-static">{instr}</span>
                {/each}
              </div>
            {/if}
            <div class="credits-track-count">{artistCredits.length} {artistCredits.length > 1 ? $tr('common.tracks') : 'track'}</div>
          </div>
        </CollapsibleSection>
      {/if}

      <!-- Albums in library -->
      <div class="artist-section">
        <div class="artist-section-header-static">
          <span class="artist-section-title">{$tr('artist.albumsInLibrary')}</span>
        </div>
        {#if $artistAlbums.length === 0 && !streamingArtistAlbumsLoading}
          <div class="empty-hint" style="padding: 8px 0; color: var(--tune-text-muted); font-size: 13px;">{$tr('library.noLocalAlbumsHint')}</div>
        {/if}
        <div class="albums-grid">
          {#each sortedArtistAlbums as album}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="album-card" onclick={() => selectAlbumDetail(album)}>
              <div class="album-card-art">
                <img class="album-cover-img" src={api.artworkUrl(album.cover_path, 200)} alt={album.title} loading="lazy" onerror={(e) => (e.target as HTMLImageElement).style.display='none'} />
                <button class="play-overlay" onclick={(e) => { e.stopPropagation(); album.id && playAlbum(album.id); }} title={$tr('library.playAlbum')}>
                  <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><path d="M8 5v14l11-7z" /></svg>
                </button>
                <span class="heart-overlay"><HeartButton albumId={album.id} size={14} /></span>
                {#if album.format || album.sample_rate}
                  <!-- Quality variants of the same album stay as separate cards
                       (Bertrand: « pas de regroupement ») — the badge is what
                       tells them apart at a glance. -->
                  <span class="quality-overlay"><QualityBadge format={album.format} sampleRate={album.sample_rate} bitDepth={album.bit_depth} source={album.source} /></span>
                {/if}
              </div>
              <span class="album-card-title truncate" title={album.title}>{album.title}</span>
              {#if album.year || album.original_year}
                <span class="album-card-year">{$formatAnneeAlbum(album)}</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Streaming albums -->
      {#if streamingArtistAlbumsLoading}
        <div class="artist-section">
          <div class="artist-section-header-static">
            <span class="artist-section-title">{$tr('library.streamingAlbums')}</span>
          </div>
          <div class="streaming-loading">{$tr('common.loading')}</div>
        </div>
      {:else if streamingArtistAlbums.length === 0 && $artistAlbums.length === 0}
        <div class="artist-section">
          <div class="artist-section-header-static">
            <span class="artist-section-title">{$tr('library.streamingAlbums')}</span>
          </div>
          <div class="empty-hint" style="padding: 8px 0; color: var(--tune-text-muted); font-size: 13px;">{$tr('library.noStreamingAlbumsHint')}</div>
        </div>
      {/if}
      {#each streamingArtistAlbums as { service, albums: svcAlbums }}
        <div class="artist-section">
          <div class="artist-section-header-static">
            <span class="artist-section-title">
              <ServiceBadge source={service} />
              {svcAlbums.length} {svcAlbums.length > 1 ? 'albums' : 'album'}
            </span>
          </div>
          <div class="albums-grid">
            {#each svcAlbums as album}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="album-card" onclick={() => {
                activeStreamingService.set(service);
                pendingStreamingAlbum.set(album);
                activeView.set('streaming');
              }}>
                <div class="album-card-art">
                  <AlbumArt coverPath={album.cover_path} size={200} alt={album.title} />
                  <button class="play-overlay" onclick={(e) => {
                    e.stopPropagation();
                    const zoneId = $currentZone?.id;
                    if (zoneId && album.source_id) {
                      playAndSync(zoneId, { source: service, streaming_album_id: album.source_id });
                    }
                  }} title={$tr('common.play')}>
                    <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><path d="M8 5v14l11-7z" /></svg>
                  </button>
                </div>
                <span class="album-card-title truncate" title={album.title}>{album.title}</span>
                {#if album.year}
                  <span class="album-card-year">{album.year}</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>

  {:else}
    <!-- Main library view -->

    {#if $libraryLoading}
      <div class="loading">
        <div class="spinner"></div>
        {$tr('common.loading')}
        {#if scanProgress}
          <span class="scan-progress">{$tr('library.scanProgress').replace('{scanned}', String(scanProgress.scanned)).replace('{added}', String(scanProgress.added))}</span>
          <button class="scan-stop-btn" onclick={stopScan} disabled={cancellingScan}>
            {cancellingScan ? '…' : $tr('library.stopScan')}
          </button>
        {/if}
      </div>
    {:else if $libraryTab === 'albums'}
      <div class="quality-filters">
        <!-- #2449 (Lulu, fil 1558) : les puces dépendent de la bibliothèque
             (formats, cadences, tags réellement présents) et le bandeau
             s'enroulait sans limite (flex-wrap) au-dessus d'une grille qui,
             elle, ne reçoit que le reste (flex: 1). Chaque ligne gagnée ici
             était perdue par les pochettes — jusqu'aux « demi-pochettes ».
             Invariant : replié (défaut), ce conteneur occupe UNE seule ligne
             de puces quel que soit leur nombre ; un bouton libellé les
             déplie toutes. Le tri, le mur et le compteur restent visibles
             hors du conteneur repliable. -->
        <div class="filter-chips" class:collapsed={!qualityFiltersExpanded} bind:this={qualityFiltersEl}>
        <button class="quality-chip" class:active={!albumQualityFilter} onclick={() => setAlbumQualityChip(null)}>{$tr('metadata.all')} ({searchFilteredAlbums.length})</button>
        {#each [
          { key: 'dsd', label: 'DSD' },
          { key: 'hi-res', label: 'Hi-Res' },
          { key: 'cd', label: 'CD' },
          { key: 'lossy', label: 'Lossy' },
        ] as tier}
          {@const count = searchFilteredAlbums.filter(a => a.quality === tier.key).length}
          {#if count > 0}
            <button class="quality-chip {tier.key}" class:active={albumQualityFilter === tier.key} onclick={() => setAlbumQualityChip(albumQualityFilter === tier.key ? null : tier.key)}>
              {tier.label} ({count})
            </button>
          {/if}
        {/each}
        {#if albumFormats.length > 1}
          <span class="filter-sep">|</span>
          {#each albumFormats as fmt}
            {@const count = searchFilteredAlbums.filter(a => a.format === fmt).length}
            {#if count > 0}
              <button class="quality-chip format" class:active={albumFormatFilter === fmt} onclick={() => setAlbumFormatChip(albumFormatFilter === fmt ? null : fmt)}>
                {fmt.toUpperCase()} ({count})
              </button>
            {/if}
          {/each}
        {/if}
        {#if albumSampleRates.length > 1}
          <span class="filter-sep">|</span>
          <!-- Les cadences REELLEMENT presentes, pas une liste figee : une
               bibliotheque en 352,8 kHz n'avait aucune vignette. -->
          {#each albumSampleRates as sr}
            {@const count = searchFilteredAlbums.filter(a => a.sample_rate === sr).length}
            {#if count > 0}
              <button class="quality-chip samplerate" class:active={albumSampleRateFilter === sr} onclick={() => setAlbumSampleRateChip(albumSampleRateFilter === sr ? null : sr)}>
                {formatSampleRate(sr)} ({count})
              </button>
            {/if}
          {/each}
        {/if}
        <span class="filter-sep">|</span>
        <button class="quality-chip favorites" class:active={albumFavoritesFilter} onclick={() => albumFavoritesFilter = !albumFavoritesFilter}>
          <svg viewBox="0 0 24 24" fill={albumFavoritesFilter ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          {$tr('favorites.filter')}
        </button>
        {#if duplicateAlbumCount > 0}
          <button class="quality-chip duplicates" class:active={albumDuplicatesFilter} onclick={() => albumDuplicatesFilter = !albumDuplicatesFilter}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="8" y="2" width="13" height="13" rx="2" /><path d="M4 8H3a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1" /></svg>
            {$tr('library.duplicates')} ({duplicateAlbumCount})
          </button>
        {/if}
        <!-- #2256, point 1/3 : le point d'entrée de création. Cette section
             n'était montée que `{#if userTags.length > 0}` et n'offrait que
             filtrer / renommer / supprimer — jamais créer. Une bibliothèque
             sans aucune étiquette n'affichait donc RIEN ici, et la seule
             création possible se cachait derrière « + Tag » sur la fiche d'un
             album. C'est ce que Pascal n'a pas retrouvé. La barre est
             désormais montée en permanence et porte la création à côté de la
             gestion. -->
        <span class="filter-sep">|</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="opacity:0.5;flex-shrink:0"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
        <button class="quality-chip tag-create" title={$tr('library.createTag' as any)} onclick={handleCreateTag}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {$tr('library.createTag' as any)}
        </button>
        {#if userTags.length > 0}
          {#each userTags as tag}
            <span class="user-tag-wrap">
              <button
                class="quality-chip user-tag"
                class:active={albumTagFilter === tag.id}
                style="--tag-color: {tag.color}"
                onclick={() => applyTagFilter(albumTagFilter === tag.id ? null : tag.id!)}
              >
                <span class="tag-dot" style="background:{tag.color}"></span>
                {tag.name} ({tag.count ?? 0})
              </button>
              {#if manageTags}
                <button class="tag-manage-btn" title={$tr('library.renameTag' as any)} onclick={() => handleRenameTag(tag)} aria-label={$tr('library.renameTag' as any)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                </button>
                <button class="tag-manage-btn danger" title={$tr('library.deleteTag' as any)} onclick={() => handleDeleteTag(tag)} aria-label={$tr('library.deleteTag' as any)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              {/if}
            </span>
          {/each}
          <button class="tag-manage-toggle" class:active={manageTags} title={$tr('library.manageTags' as any)} aria-label={$tr('library.manageTags' as any)} onclick={() => manageTags = !manageTags}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        {/if}
        {#if albumYearFilter}
          <span class="filter-sep">|</span>
          <button class="quality-chip year active" onclick={() => albumYearFilter = null}>
            {albumYearFilter}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        {/if}
        </div>
        {#if qualityFiltersOverflow || qualityFiltersExpanded}
          <!-- Libellé texte, pas une icône seule : Lulu demandait un réglage
               qui existait déjà derrière une icône muette (le mur). -->
          <button class="quality-chip filters-expand" onclick={() => qualityFiltersExpanded = !qualityFiltersExpanded}>
            {qualityFiltersExpanded ? $tr('library.lessFilters') : $tr('library.moreFilters')}
            {#if qualityFiltersExpanded}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><polyline points="18 15 12 9 6 15" /></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><polyline points="6 9 12 15 18 9" /></svg>
            {/if}
          </button>
        {/if}
        <!-- Tranche de Dynamic Range (#2144). Dessinée SEULEMENT si la
             bibliothèque porte des tags DR : ailleurs, ce serait une commande
             qui ne filtre rien. Deux bornes indépendantes — « DR12 et
             au-dessus » se règle en ne touchant qu'au minimum. -->
        {#if drValues.length > 0}
          <span class="filter-sep">|</span>
          <span class="dr-range" class:active={albumDrMin != null || albumDrMax != null}>
            <span class="dr-label">{$tr('library.drRange')}</span>
            <select class="dr-select" aria-label={$tr('library.drMin')} title={$tr('library.drMin')}
              value={albumDrMin == null ? '' : String(albumDrMin)}
              onchange={(e) => setAlbumDr('min', (e.currentTarget as HTMLSelectElement).value)}>
              <option value="">{$tr('library.drAny')}</option>
              {#each drValues as v}<option value={String(v)}>{v}</option>{/each}
            </select>
            <span class="dr-dash">–</span>
            <select class="dr-select" aria-label={$tr('library.drMax')} title={$tr('library.drMax')}
              value={albumDrMax == null ? '' : String(albumDrMax)}
              onchange={(e) => setAlbumDr('max', (e.currentTarget as HTMLSelectElement).value)}>
              <option value="">{$tr('library.drAny')}</option>
              {#each drValues as v}<option value={String(v)}>{v}</option>{/each}
            </select>
            {#if albumDrMin != null || albumDrMax != null}
              <button class="dr-clear" onclick={clearAlbumDr} title={$tr('library.drClear')} aria-label={$tr('library.drClear')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            {/if}
          </span>
        {/if}
        <span class="filter-sep">|</span>
        <span class="sort-control">
          <svg class="sort-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M3 6h18M3 12h12M3 18h6" /></svg>
          <select class="sort-select" value={albumSort} onchange={(e) => setAlbumSort((e.currentTarget as HTMLSelectElement).value as AlbumSortKey)}>
            {#each ALBUM_SORT_OPTIONS as opt}
              <option value={opt.key}>{$tr(opt.label)}</option>
            {/each}
          </select>
          <!-- Tri aléatoire : croissant/décroissant ne veut plus rien dire, et
               retourner un tirage n'est pas le re-tirer. La flèche cède donc la
               place au bouton de re-tirage demandé au fil 1635 — qui n'est rien
               d'autre que « redemander sans graine ». -->
          {#if albumSort === 'random'}
            <button class="sort-order-btn" onclick={retirerAleatoire} title={$tr('library.reshuffle')} aria-label={$tr('library.reshuffle')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
            </button>
          {:else}
            <button class="sort-order-btn" onclick={() => { albumSortOrder = albumSortOrder === 'asc' ? 'desc' : 'asc'; localStorage.setItem('tune_album_sort_order', albumSortOrder); loadAlbums(); }} title={albumSortOrder === 'asc' ? $tr('library.ascending') : $tr('library.descending')}>
              {#if albumSortOrder === 'asc'}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="18 15 12 9 6 15" /></svg>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9" /></svg>
              {/if}
            </button>
          {/if}
          <!-- Mur de pochettes : pochettes seules, grille plus dense. On choisit
               un album de mémoire visuelle, et le texte court-circuite ce
               mécanisme (demande Alex Campbell). -->
          <button
            class="wall-toggle"
            class:active={albumWall}
            onclick={() => preferences.update((p) => ({ ...p, albumGridDensity: albumWall ? 'detail' : 'wall' }))}
            title={albumWall ? $tr('library.wallOff') : $tr('library.wallOn')}
            aria-label={albumWall ? $tr('library.wallOff') : $tr('library.wallOn')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </button>
        </span>
        <span class="quality-count">{filteredAlbums.length} album{filteredAlbums.length > 1 ? 's' : ''}</span>
      </div>
      <div class="album-viewport-wrapper">
        {#if albumIndexEntries.length > 5}
          <AlphaIndex letters={albumIndexEntries} activeLetter={activeAlbumEntry} onSelect={scrollToAlbumEntry} formatLabel={(albumSort === 'release_date' || albumSort === 'original_year' || albumSort === 'added_date') ? formatDateKey : undefined} />
        {/if}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="album-grid-viewport" bind:this={albumGridViewport} onscroll={handleAlbumGridScroll}
          use:observeHeight={(h) => { albumViewportHeight = h; }}
          use:observeWidth={(w) => { albumViewportWidth = w; }}>
          {#if filteredAlbums.length === 0}
          <div class="empty">{searchQuery ? $tr('common.noResult') : $tr('library.noAlbums')}</div>
        {:else}
          <div style="height:{albumGridMetrics.totalHeight}px;position:relative;">
            <!-- Le nombre de colonnes est ÉPINGLÉ sur celui qu'a calculé la
                 virtualisation, il n'est pas laissé au CSS.
                 Les deux lignes en conflit ici visaient le même but — que le
                 CSS et le calcul s'accordent — mais `auto-fill` laisse le
                 navigateur choisir, et c'est justement ce désaccord qui
                 provoquait le chevauchement des pochettes sous Firefox
                 (#1307). `albumGridMetrics.cols` tient déjà compte du mur
                 (WALL_MIN_WIDTH), donc l'épinglage couvre les deux modes et
                 la variable --album-col-min devient inutile. -->
            <div class="albums-grid" style="grid-template-columns:repeat({albumGridMetrics.cols}, minmax(0, 1fr));transform:translateY({albumGridMetrics.offsetY}px);">
              {#each visibleAlbums as album (album.id ?? album.title)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="album-card" class:album-card-wall={albumWall} onclick={() => selectAlbumDetail(album)}
                     title={albumWall ? album.title + (album.artist_name ? " — " + album.artist_name : "") : undefined}>
                  <div class="album-card-art">
                    <img class="album-cover-img" src={api.artworkUrl(album.cover_path, 200)} alt={album.title} loading="lazy" onerror={(e) => (e.target as HTMLImageElement).style.display='none'} />
                    <button class="play-overlay" onclick={(e) => { e.stopPropagation(); album.id && playAlbum(album.id); }} title={$tr('library.playAlbum')}>
                      <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><path d="M8 5v14l11-7z" /></svg>
                    </button>
                    <button class="edit-overlay" onclick={(e) => openAlbumEdit(e, album)} title={$tr('metadata.editAlbum')}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                    <span class="heart-overlay"><HeartButton albumId={album.id} size={14} /></span>
                    {#if album.id !== null && album.id !== undefined && duplicateAlbumIds.has(album.id)}
                      {@const siblings = getDuplicateSiblings(album)}
                      <button class="dup-badge" onclick={(e) => toggleDupPopup(album.id!, e)} title={$tr('library.existsInVersions').replace('{count}', String(siblings.length))}>
                        {siblings.length} versions
                      </button>
                      {#if dupPopupAlbumId === album.id}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div class="dup-popup-backdrop" onclick={(e) => { e.stopPropagation(); closeDupPopup(); }}></div>
                        <div class="dup-popup">
                          <div class="dup-popup-title">{siblings.length} versions</div>
                          {#each siblings as sib (sib.id ?? sib.title)}
                            <button class="dup-popup-item" class:current={sib.id === album.id} onclick={(e) => { e.stopPropagation(); closeDupPopup(); selectAlbumDetail(sib); }}>
                              <span class="dup-popup-format">{formatAlbumQualityLabel(sib)}</span>
                              {#if sib.year}<span class="dup-popup-year">{sib.year}</span>{/if}
                              {#if sib.id === album.id}<span class="dup-popup-current">{$tr('library.current')}</span>{/if}
                            </button>
                          {/each}
                        </div>
                      {/if}
                    {/if}
                  </div>
                  {#if !albumWall}
                    <span class="album-card-title truncate" title={album.title}>{album.title}</span>
                    {#if album.artist_name}
                      <button
                        class="album-card-artist album-card-artist-link truncate"
                        title={album.artist_name}
                        onclick={(e) => ouvrirArtisteDepuisAlbum(e, album)}
                      >{album.artist_name}</button>
                    {/if}
                  {/if}
                </div>
              {/each}
            </div>
          </div>
          {/if}
        </div>
      </div>

    {:else if $libraryTab === 'artists'}
      <div class="artists-section">
        {#if artistLetters.length > 5}
          <AlphaIndex letters={artistLetters} activeLetter={activeArtistLetter} onSelect={scrollToArtistLetter} sticky />
        {/if}
        <div class="artists-grid">
          {#each filteredArtists as artist}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="artist-card" onclick={() => selectArtistDetail(artist)}>
            <div class="artist-card-avatar">
              <AlbumArt coverPath={artist.image_path} size={100} alt={artist.name} round fallbackInitials={initials(artist.name)} />
            </div>
            <!--
              Le cœur manquait, et seulement pour les artistes. `HeartButton`
              acceptait `artistId` depuis toujours, le store `favoriteArtistIds`
              et la route existaient — mais aucun écran ne passait jamais cette
              propriété. Mettre un artiste en favori était donc impossible, ce
              qui explique le zéro absolu en base bien mieux que la discrétion
              du bouton.

              Il est posé sur la CARTE et non sur l'avatar : celui-ci porte un
              `overflow: hidden` avec un `border-radius: 50%`, qui rognerait
              tout ce qu'on placerait dans ses coins. Il arrête la propagation
              lui-même — le clic n'ouvre pas la fiche.
            -->
            <span class="artist-card-heart">
              <HeartButton artistId={artist.id} size={18} />
            </span>
            <span class="artist-card-name truncate" title={artist.name}>{artist.name}</span>
          </div>
        {/each}
        {#if filteredArtists.length === 0}
          <div class="empty">{searchQuery ? $tr('common.noResult') : $tr('library.noArtists')}</div>
        {/if}
        </div>
      </div>

    {:else if $libraryTab === 'tracks'}
      <div class="track-filters">
        {#if availableFormats.length > 1}
          <div class="format-filters">
            <span class="filter-label">Format</span>
            <button class="format-btn" class:active={!formatFilter} onclick={() => formatFilter = null}>{$tr('metadata.all')}</button>
            {#each availableFormats as fmt}
              <button class="format-btn" class:active={formatFilter === fmt} onclick={() => formatFilter = fmt}>{fmt.toUpperCase()}</button>
            {/each}
          </div>
        {/if}
        <div class="format-filters">
          <span class="filter-label">{$tr('library.quality')}</span>
          <button class="format-btn" class:active={!qualityFilter} onclick={() => qualityFilter = null}>{$tr('metadata.all')}</button>
          {#each qualityBuckets as bucket}
            {#if qualityCounts[bucket.key]}
              <button class="format-btn" class:active={qualityFilter === bucket.key} onclick={() => qualityFilter = bucket.key}>
                {bucket.label} <span class="badge">{qualityCounts[bucket.key]}</span>
              </button>
            {/if}
          {/each}
        </div>
        <div class="format-filters">
          <button class="format-btn favorites-btn" class:active={trackFavoritesFilter} onclick={() => trackFavoritesFilter = !trackFavoritesFilter}>
            <svg viewBox="0 0 24 24" fill={trackFavoritesFilter ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            {$tr('favorites.filter')}
          </button>
        </div>
        <span class="format-count">{filteredTracks.length} {$tr('common.tracks')}</span>
      </div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="track-list" bind:this={trackListEl}
        onscroll={(e) => { scrollTop = (e.currentTarget as HTMLDivElement).scrollTop; }}
        use:observeHeight={(h) => { containerHeight = h; }}>
        <div style="height:{visibleTracks.totalHeight}px;position:relative;">
          {#each filteredTracks.slice(visibleTracks.startIdx, visibleTracks.endIdx) as t, i (t.id ?? visibleTracks.startIdx + i)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- Liste virtualisée de l'onglet Titres : même indicateur, sinon
                 il dépendrait de l'écran où l'on se trouve. Voir .track-item.playing. -->
            <div
              class="track-item"
              class:playing={t.id != null && t.id === $currentTrackId}
              aria-current={t.id != null && t.id === $currentTrackId ? 'true' : undefined}
              style="position:absolute;top:{(visibleTracks.startIdx + i) * TRACK_ROW_HEIGHT}px;left:0;right:0;height:{TRACK_ROW_HEIGHT}px;"
              onclick={() => t.id && playTrack(t.id)}
            >
              <span class="track-thumb"><AlbumArt coverPath={t.cover_path} albumId={t.album_id} size={36} alt={t.album_title ?? ''} /></span>
              <div class="track-info" title={t.file_path ?? ''}>
                <span class="track-title truncate" title={t.title}>{t.title}</span>
                <span class="track-meta truncate">{#if t.artist_name}<button class="track-link" onclick={(e) => { e.stopPropagation(); if (t.artist_id) selectArtistDetail({ id: t.artist_id, name: t.artist_name! }); }}>{t.artist_name}</button>{/if}{#if t.album_title}<span class="track-sep"> — </span><button class="track-link" onclick={(e) => { e.stopPropagation(); if (t.album_id) selectAlbumDetail({ id: t.album_id, title: t.album_title!, artist_name: t.artist_name } as Album); }}>{t.album_title}</button>{/if}</span>
                <MetadataChips track={t} fields={$displayFields} />
              </div>
              <span class="track-duration">{formatTime(t.duration_ms)}</span>
              <HeartButton trackId={t.id} size={14} />
              <button class="edit-track-btn" onclick={(e) => openTrackEdit(e, t)} title={$tr('metadata.editTrack')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </button>
              <button class="play-from-here-btn" onclick={(e) => { e.stopPropagation(); playFromHere(filteredTracks, visibleTracks.startIdx + i); }} title={$tr('common.playFromHere')} aria-label={$tr('common.playFromHere')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="3" y1="6" x2="14" y2="6" /><line x1="3" y1="12" x2="14" y2="12" /><line x1="3" y1="18" x2="10" y2="18" /><path d="M16 8v8l6-4z" fill="currentColor" stroke="none" /></svg>
              </button>
              <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); addTrackToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
              <button class="play-next-btn" onclick={(e) => { e.stopPropagation(); playNext(t); }} title={$tr('library.playNext')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
              </button>
              {#if onAddToPlaylist && (t.id || t.source_id)}
                <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={$tr('nowplaying.addToPlaylist')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" /><line x1="16" y1="3" x2="16" y2="11" /><line x1="12" y1="7" x2="20" y2="7" /></svg>
                </button>
              {/if}
              <!-- Le même menu que la fiche d'album (#2574). Sans lui, cet
                   onglet n'offrait RIEN au doigt : les règles @media
                   (max-width:640px) et (hover:none) plus bas mettent en
                   `display:none` tous les boutons de la ligne et renvoient sur
                   le « ··· » — qui n'existait pas ici.
                   « Autres versions » reste volontairement absente : son
                   résultat s'affiche dans `track-versions-row`, qui n'est
                   rendue que dans la fiche d'album. -->
              <div class="track-more-wrap">
                <button class="track-more-btn" onclick={(e) => openTrackMenu(e, t.id)} title={$tr('library.moreOptions')}>···</button>
                {#if trackMenuOpenId === t.id}
                  <TrackContextMenu
                    onClose={closeTrackMenu}
                    onPlay={() => t.id && playTrack(t.id)}
                    onAddToQueue={() => addTrackToQueue(t)}
                    onPlaySimilar={() => playSimilar(t)}
                    onAddToPlaylist={onAddToPlaylist ? () => onAddToPlaylist!(t) : undefined}
                    onGoToArtist={t.artist_id != null && t.artist_name
                      ? () => selectArtistDetail({ id: t.artist_id!, name: t.artist_name! })
                      : undefined}
                    onGoToAlbum={t.album_id != null && t.album_title
                      ? () => selectAlbumDetail({ id: t.album_id!, title: t.album_title!, artist_name: t.artist_name } as Album)
                      : undefined}
                  />
                {/if}
              </div>
            </div>
          {/each}
        </div>
        {#if filteredTracks.length === 0}
          <div class="empty">{searchQuery ? $tr('common.noResult') : $tr('library.noTracks')}</div>
        {/if}
      </div>

    {:else if $libraryTab === 'genres'}
      {#if selectedGenre || selectedParent || selectedNoGenre}
        <!-- Genre filtered albums (parent branch OR specific subgenre OR no genre) -->
        <div class="genre-detail-header">
          <button class="back-btn" onclick={clearGenreSelection}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
            {$tr('common.genres')}
          </button>
          {#if selectedNoGenre}
            <span class="bc-sep">/</span>
            <span class="bc-current">{$tr('library.noGenreLabel')}</span>
          {:else}
            {#if displayParent}
              <span class="bc-sep">/</span>
              {#if selectedGenre}
                <button class="bc-link" onclick={backToParent}>{displayParent}</button>
              {:else}
                <span class="bc-current">{displayParent}</span>
              {/if}
            {/if}
            {#if selectedGenre}
              <span class="bc-sep">/</span>
              <span class="bc-current">{selectedGenre}</span>
            {/if}
          {/if}
          <span class="genre-detail-count">{genreAlbums.length} {genreAlbums.length > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
          <span class="sort-control">
            <svg class="sort-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M3 6h18M3 12h12M3 18h6" /></svg>
            <select class="sort-select" value={genreSort} onchange={(e) => setGenreSort((e.currentTarget as HTMLSelectElement).value as GenreSortKey)}>
              {#each GENRE_SORT_OPTIONS as opt}
                <option value={opt.key}>{$tr(opt.label)}</option>
              {/each}
            </select>
            <button class="sort-order-btn" onclick={() => { genreSortOrder = genreSortOrder === 'asc' ? 'desc' : 'asc'; localStorage.setItem('tune_genre_sort_order', genreSortOrder); }} title={genreSortOrder === 'asc' ? $tr('library.ascending') : $tr('library.descending')}>
              {#if genreSortOrder === 'asc'}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 5v14M5 12l7-7 7 7" /></svg>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 19V5M5 12l7 7 7-7" /></svg>
              {/if}
            </button>
          </span>
        </div>

        <!-- Subchips when on a parent branch (or with a child selected) -->
        {#if displayParent && genreTree[displayParent]}
          <div class="bc-chips">
            {#if selectedGenre}
              <button class="bc-chip" onclick={backToParent}>{$tr('metadata.all')}</button>
            {:else}
              <button class="bc-chip bc-chip-all" disabled>{$tr('metadata.all')}</button>
            {/if}
            {#each genreTree[displayParent] as child}
              {@const c = ($genres.find(g => g.name.toLowerCase() === child.toLowerCase())?.count ?? 0)}
              {#if c > 0}
                <button class="bc-chip" class:active={selectedGenre === child} onclick={() => selectGenreInTab(child)}>
                  {child} <span class="bc-chip-count">{c}</span>
                </button>
              {/if}
            {/each}
          </div>
        {/if}

        <div class="albums-grid">
          {#each genreAlbums as album}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="album-card" onclick={() => selectAlbumDetail(album)}>
              <div class="album-card-art">
                <img class="album-cover-img" src={api.artworkUrl(album.cover_path, 200)} alt={album.title} loading="lazy" onerror={(e) => (e.target as HTMLImageElement).style.display='none'} />
                <button class="play-overlay" onclick={(e) => { e.stopPropagation(); album.id && playAlbum(album.id); }} title={$tr('library.playAlbum')}>
                  <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><path d="M8 5v14l11-7z" /></svg>
                </button>
              </div>
              <span class="album-card-title truncate" title={album.title}>{album.title}</span>
              {#if album.artist_name}
                <button
                        class="album-card-artist album-card-artist-link truncate"
                        title={album.artist_name}
                        onclick={(e) => ouvrirArtisteDepuisAlbum(e, album)}
                      >{album.artist_name}</button>
              {/if}
              {#if selectedParent && album.genre && album.genre.toLowerCase() !== (selectedParent ?? '').toLowerCase()}
                <span class="album-card-genre truncate" title={album.genre.split(/[;\/\\]/).map(g => g.trim()).filter(Boolean).join(', ')}>{album.genre.split(/[;\/\\]/).map(g => g.trim()).filter(Boolean).join(', ')}</span>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <!-- Genre tree: branches first, then orphans. -->
        {#if !genreSearchQuery}
          <div class="year-summary genres-summary">
            <span class="year-summary-total">{$albums.length} {$albums.length > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
            {#if noGenreAlbums.length > 0}
              <span class="year-summary-groups">{$tr('library.ofWhichNoGenre').replace('{count}', String(noGenreAlbums.length))}</span>
            {/if}
            <div class="genre-sort-btns">
              <button class="genre-sort-btn" class:active={genreBranchSort === 'count'} onclick={() => genreBranchSort = 'count'}>{$tr('library.sortByCount')}</button>
              <button class="genre-sort-btn" class:active={genreBranchSort === 'name'} onclick={() => genreBranchSort = 'name'}>A-Z</button>
            </div>
          </div>
        {/if}
        {#if filteredGenreTreeKeys.length > 0}
          <div class="branches">
            {#each filteredGenreTreeKeys.sort((a, b) => genreBranchSort === 'name' ? a.localeCompare(b) : (parentAlbumCounts[b] ?? 0) - (parentAlbumCounts[a] ?? 0)) as parent (parent)}
              {@const total = parentAlbumCounts[parent] ?? 0}
              {#if total > 0}
                {@const childrenWithAlbums = (genreTree[parent] ?? []).filter(
                  (child) => ($genres.find(g => g.name.toLowerCase() === child.toLowerCase())?.count ?? 0) > 0,
                )}
                <div
                  class="branch-row"
                  role="button"
                  tabindex="0"
                  onclick={() => selectGenreInTab(parent)}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectGenreInTab(parent);
                    }
                  }}
                >
                  <div class="branch-card">
                    <span class="branch-name">{parent}</span>
                    <span class="branch-count">{total} {total > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
                  </div>
                  {#if childrenWithAlbums.length > 0}
                    <div class="branch-children">
                      {#each childrenWithAlbums as child}
                        {@const c = ($genres.find(g => g.name.toLowerCase() === child.toLowerCase())?.count ?? 0)}
                        <button class="child-chip" onclick={(e) => { e.stopPropagation(); selectGenreInTab(child); }}>
                          {child} <span class="child-chip-count">{c}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        {/if}

        {#if filteredOrphanGenres.length > 0}
          <h3 class="bc-section-title">{$tr('library.outsideTree')}</h3>
          <div class="genres-grid">
            {#each filteredOrphanGenres.sort((a, b) => genreBranchSort === 'name' ? a.name.localeCompare(b.name) : b.count - a.count) as g}
              <button class="genre-card" onclick={() => selectGenreInTab(g.name)}>
                <span class="genre-card-name">{g.name}</span>
                <span class="genre-card-count">{g.count} {g.count > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
              </button>
            {/each}
          </div>
        {/if}

        {#if noGenreAlbums.length > 0 && !genreSearchQuery}
          <h3 class="bc-section-title">{$tr('library.noGenreSection')}</h3>
          <div class="genres-grid">
            <button class="genre-card genre-card-warning" onclick={() => { selectedNoGenre = true; selectedGenre = null; selectedParent = null; }}>
              <span class="genre-card-name">{$tr('library.noGenreLabel')}</span>
              <span class="genre-card-count">{noGenreAlbums.length} {noGenreAlbums.length > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
            </button>
          </div>
        {/if}

        {#if $genres.length === 0}
          <div class="empty">{$tr('library.noGenres')}</div>
        {:else if genreSearchQuery && filteredGenreTreeKeys.length === 0 && filteredOrphanGenres.length === 0}
          <div class="empty">{$tr('common.noResult')}</div>
        {/if}
      {/if}

    {:else if $libraryTab === 'labels'}
      {#if selectedLabel}
        <div class="label-detail-head">
          <button class="back-btn" onclick={() => { selectedLabel = null; labelAlbums = []; }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
            {$tr('common.back')}
          </button>
          <h2 class="label-detail-name">{nomLabelPropre(selectedLabel)}</h2>
          <HeartButton facet={{ facet: 'label', value: selectedLabel }} size={20} />
          <span class="label-detail-count">{labelAlbums.length} {labelAlbums.length > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
        </div>
        {#if labelAlbumsLoading}
          <div class="empty">{$tr('common.loading')}</div>
        {:else if labelAlbums.length === 0}
          <div class="empty">{$tr('library.noAlbums')}</div>
        {:else}
          <div class="albums-grid">
            {#each labelAlbums as a (a.album_id)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="album-card" onclick={() => selectAlbumDetail({ id: a.album_id, title: a.title ?? '', cover_path: a.cover_path } as any)}>
                <div class="album-card-art">
                  {#if a.cover_path}
                    <img class="album-cover-img" src={api.artworkUrl(a.cover_path, 200)} alt={a.title ?? ''} loading="lazy" />
                  {/if}
                  <button class="play-overlay" onclick={(e) => { e.stopPropagation(); playAlbum(a.album_id); }} title={$tr('library.playAlbum')}>
                    <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><path d="M8 5v14l11-7z" /></svg>
                  </button>
                  {#if a.format || a.sample_rate}
                    <span class="quality-overlay"><QualityBadge format={a.format} sampleRate={a.sample_rate} bitDepth={a.bit_depth} /></span>
                  {/if}
                </div>
                <span class="album-card-title truncate" title={a.title ?? ''}>{a.title ?? ''}</span>
                {#if a.album_artist}
                  <span class="album-card-artist truncate">{a.album_artist}</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      {:else if !labelsLoaded}
        <div class="empty">{$tr('common.loading')}</div>
      {:else if labelsList.length === 0}
        <div class="empty">{$tr('library.noLabels' as any)}</div>
      {:else}
        <div class="genres-grid">
          {#each labelsList as l (l.value)}
            <!-- Le coeur vit A COTE du bouton, jamais dedans : un bouton dans un
                 bouton est du HTML invalide, et le clic du coeur ouvrirait le
                 label. #2442 -->
            <div class="label-card-wrap">
              <button class="genre-card" onclick={() => selectLabel(l.value)}>
                <span class="genre-card-name">{nomLabelPropre(l.value)}</span>
                <span class="genre-card-count">{l.count} {$tr('home.tracks').toLowerCase()}</span>
              </button>
              <span class="label-card-heart">
                <HeartButton facet={{ facet: 'label', value: l.value }} size={16} />
              </span>
            </div>
          {/each}
        </div>
      {/if}
    {:else if $libraryTab === 'years'}
      {#if yearGroups.length === 0}
        <div class="empty">{$tr('library.noAlbums')}</div>
      {:else}
        <div class="year-summary">
          <span class="year-summary-total">{yearGroupsTotalCount} {yearGroupsTotalCount > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
          <span class="year-summary-groups">{yearGroups.length} {yearGroups.length > 1 ? $tr('library.yearGroupPlural') : $tr('library.yearGroup')}</span>
          <button class="sort-order-btn year-sort-btn" onclick={toggleYearSortOrder} title={yearSortOrder === 'asc' ? $tr('library.ascending') : $tr('library.descending')}>
            {#if yearSortOrder === 'asc'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 5v14M5 12l7-7 7 7" /></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 19V5M5 12l7 7 7-7" /></svg>
            {/if}
          </button>
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="year-grid-viewport" bind:this={yearGridViewport} onscroll={handleYearGridScroll}
          use:observeHeight={(h) => { yearViewportHeight = h; }}
          use:observeWidth={(w) => { yearViewportWidth = w; }}>
          <div style="height:{yearRowModel.totalHeight}px;position:relative;">
            {#each visibleYearRows as row (row.kind === 'header' ? 'h' + row.top : 'a' + row.top)}
              {#if row.kind === 'header'}
                <div class="year-section" style="position:absolute;top:{row.top}px;left:0;right:0;height:{row.height}px;">
                  <h3 class="year-header">{row.label}</h3>
                  <span class="year-count">{row.count} {row.count > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
                </div>
              {:else}
                <div class="albums-grid year-albums-row" style="grid-template-columns:repeat({yearRowModel.cols}, minmax(0, 1fr));position:absolute;top:{row.top}px;left:0;right:0;height:{row.height}px;">
                  {#each row.albums as album (album.id ?? album.title)}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="album-card" onclick={() => selectAlbumDetail(album)}>
                      <div class="album-card-art">
                        <img class="album-cover-img" src={api.artworkUrl(album.cover_path, 200)} alt={album.title} loading="lazy" onerror={(e) => (e.target as HTMLImageElement).style.display='none'} />
                        <button class="play-overlay" onclick={(e) => { e.stopPropagation(); album.id && playAlbum(album.id); }} title={$tr('library.playAlbum')}>
                          <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><path d="M8 5v14l11-7z" /></svg>
                        </button>
                      </div>
                      <span class="album-card-title truncate" title={album.title}>{album.title}</span>
                      {#if album.artist_name}
                        <button
                        class="album-card-artist album-card-artist-link truncate"
                        title={album.artist_name}
                        onclick={(e) => ouvrirArtisteDepuisAlbum(e, album)}
                      >{album.artist_name}</button>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            {/each}
          </div>
        </div>
      {/if}

    {/if}
  {/if}
  </div>
</div>

{#if editingAlbum}
  <AlbumEditModal
    album={editingAlbum}
    onClose={() => editingAlbum = null}
    onSaved={handleAlbumSaved}
  />
{/if}

{#if editingTrack}
  <TrackEditModal
    track={editingTrack}
    onClose={() => editingTrack = null}
    onSaved={handleTrackSaved}
  />
{/if}

{#if showArtistEdit && $selectedArtist}
  <ArtistEditModal
    artist={$selectedArtist}
    onClose={() => showArtistEdit = false}
    onSaved={(updated) => {
      selectedArtist.set(updated);
      showArtistEdit = false;
    }}
  />
{/if}

{#if showImportWizard}
  <ImportWizard
    onClose={() => (showImportWizard = false)}
    onImported={() => {
      // Le scan ciblé côté serveur est asynchrone : on laisse une seconde à
      // l'insertion avant de recharger, sinon la grille se rafraîchit sur un
      // état où l'album n'est pas encore en base.
      setTimeout(() => loadAlbums(), 1200);
    }}
  />
{/if}

<style>
  /* Cette vue MET EN PAGE, elle ne defile pas : le defilement appartient a
     `.library-scroller`. Elle etait les deux a la fois — flex-colonne ET
     scroller — avec `.library-header` en `position: sticky` dedans, ce que
     Firefox n'honore pas : l'en-tete (titre, recherche, onglets) partait avec
     le contenu dans Albums / Artistes / Genres, alors qu'il tenait sous Chrome
     (#463, Jean Valjean, 0.9.75 Windows/Firefox — retour du defaut #1282, que
     la 0.9.44 avait corrige au niveau de `.main-content`).
     Le `flex-direction: column` reste indispensable : `.album-viewport-wrapper`
     s'appuie sur `flex: 1` pour occuper la hauteur restante (#1119). */
  .library-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    padding-bottom: calc(var(--space-lg) + 24px);
    overflow: hidden;
    /* Firefox: the global `* { scrollbar-width: thin }` (tune-theme.css) makes the
       Artists/Genres scrollbar too thin to grab (#1143, Bilou). Chrome keeps the
       14px ::-webkit-scrollbar. Restore a full-width, grabbable bar in Firefox and
       colour it to match the webkit thumb. WebKit rules are untouched. */
    scrollbar-width: auto;
    scrollbar-color: rgba(255, 255, 255, 0.35) transparent;
  }

  /* Le conteneur qui defile reellement. Il garde la colonne flex parce que
     `.album-viewport-wrapper` en depend (`flex: 1`, #1119) ; il porte le
     padding-bottom qui vivait sur `.library-view`, sinon la derniere ligne
     collerait au bas de la fenetre. */
  .library-scroller {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    /* Pas de padding-bottom ici : `.library-view` porte deja le sien
       (`calc(var(--space-lg) + 24px)`), qui reduit d'autant la hauteur du
       scroller. Le doubler ajouterait un vide en fin de liste. */
    /* Firefox : le `* { scrollbar-width: thin }` global (tune-theme.css) rend
       la barre des listes Artistes/Genres trop fine pour etre saisie (#1143,
       Bilou). Chrome garde son ::-webkit-scrollbar de 14px. Regle deplacee
       avec le defilement, sinon elle s'appliquerait a un bloc qui ne defile
       plus. */
    scrollbar-width: auto;
    scrollbar-color: rgba(255, 255, 255, 0.35) transparent;
  }

  .library-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    gap: var(--space-md);
    flex-wrap: wrap;
    /* Keep the right-side controls (year switches etc.) clear of the floating
       global search button pinned to the top-right. */
    padding-right: 52px;
    /* En-tête figé (titre + recherche + onglets) pendant le défilement des
       listes Artistes/Genres, qui scrollent DANS .library-view — les grilles
       Albums/Années ont leur propre viewport et ne défilent pas ici (#1237,
       Jean). Le margin/padding absorbe le padding-top du conteneur pour que
       le contenu ne dépasse pas au-dessus du bandeau. */
    /* Plus de `position: sticky` : l'en-tete est desormais un FRERE du
       conteneur de defilement, donc il ne bouge pas — sans dependre du
       traitement du sticky par le navigateur. */
    flex: 0 0 auto;
    z-index: 20;
    background: var(--tune-bg);
    padding-bottom: var(--space-sm);
  }

  .library-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }
  /* Folder-scope chip: shown when the library is scoped to a Répertoires folder.
     Click to clear the scope and return to the whole library. */
  .folder-scope-chip {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--tune-accent); color: #1a1206;
    border: 0; border-radius: 999px; padding: 5px 10px 5px 9px;
    font-size: 12.5px; font-weight: 600; cursor: pointer; max-width: 300px;
  }
  .folder-scope-chip:hover { filter: brightness(1.06); }
  .folder-scope-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .folder-scope-x { font-size: 15px; line-height: 1; opacity: .8; }

  /* Secondary to the shuffle button: same shape, outlined rather than filled,
     so "add content" reads as a library action and not a playback one. */
  .add-content-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: transparent;
    color: var(--tune-text);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 0.15s, color 0.15s;
  }

  .add-content-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .shuffle-all-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: var(--tune-accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s;
  }

  .shuffle-all-btn:hover {
    opacity: 0.85;
  }

  .shuffle-all-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .library-header-right {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: 5px 10px;
    transition: border-color 0.12s;
  }

  .search-box:focus-within {
    border-color: var(--tune-accent);
  }

  .search-icon {
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  .search-box input {
    background: none;
    border: none;
    outline: none;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    width: 180px;
  }

  .search-box input::placeholder {
    color: var(--tune-text-muted);
  }

  .search-clear {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    border-radius: var(--radius-sm);
  }

  .search-clear:hover {
    color: var(--tune-text);
  }

  .tab-bar {
    display: flex;
    gap: 2px;
    background: var(--tune-grey2);
    border-radius: var(--radius-md);
    padding: 2px;
  }

  .tab {
    padding: var(--space-xs) var(--space-md);
    background: none;
    border: none;
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.12s ease-out;
  }

  .tab:hover {
    color: var(--tune-text);
  }

  .tab.active {
    background: var(--tune-surface-selected);
    color: var(--tune-text);
  }

  .detail-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .detail-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s ease-out;
  }

  .back-btn:hover {
    border-color: var(--tune-text-muted);
    color: var(--tune-text);
  }

  .album-detail-header {
    display: flex;
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
    align-items: flex-start;
  }

  .album-detail-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .album-detail-info h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
  }

  .detail-artist-link {
    background: none;
    border: none;
    padding: 0;
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--tune-text-secondary);
    cursor: pointer;
    text-align: left;
  }

  .detail-artist-link:hover {
    color: var(--tune-accent);
    text-decoration: underline;
  }

  /* La rangee d'actions doit passer a la ligne. Elle porte jusqu'a sept
     boutons (lecture, file, edition, gravure des tags, re-identification,
     signalement, Collection) dont les libelles sont plus longs en francais
     qu'en anglais. Sans `flex-wrap`, elle restait sur une seule ligne : sur un
     portable 1366x768 le dernier bouton — « Collection » — depassait de 53 px
     le bord de `.library-scroller`, qui est en `overflow-x: hidden` et le
     rognait sans laisser aucun defilement horizontal pour aller le chercher
     (#2510, releve par Lulu sur un Asus 15,6"). Le bouton n'etait donc pas
     seulement malcommode : il etait inatteignable. */
  .detail-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin-top: var(--space-md);
  }

  .edit-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    background: var(--tune-grey2);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text-secondary);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s;
  }

  .edit-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-text);
  }

  /* Même habillage que « Modifier » et « Écrire les tags » : c'est une action
     secondaire de la fiche album, pas une deuxième façon de lancer la lecture. */
  .queue-album-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    background: var(--tune-grey2);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text-secondary);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s;
  }
  .queue-album-btn:hover:not(:disabled) {
    border-color: var(--tune-accent);
    color: var(--tune-text);
  }
  .queue-album-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .queue-album-btn:focus-visible {
    outline: 2px solid var(--tune-accent);
    outline-offset: 2px;
  }

  .write-tags-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    background: rgba(234, 88, 12, 0.08);
    border: 1px solid rgba(234, 88, 12, 0.25);
    border-radius: var(--radius-md);
    color: #fb923c;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s;
  }

  .write-tags-btn:hover:not(:disabled) {
    background: rgba(234, 88, 12, 0.18);
    border-color: #fb923c;
  }

  .write-tags-btn:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  .write-tags-message {
    margin-top: 8px;
    padding: 6px 12px;
    background: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(34, 197, 94, 0.2);
    border-radius: var(--radius-sm);
    color: #86efac;
    font-size: 13px;
  }

  .bio-toggle-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    background: none;
    border: 1px solid var(--tune-border);
    border-radius: 14px;
    padding: 4px 12px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    cursor: pointer;
    transition: all 0.12s;
  }
  .bio-toggle-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .bio-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .bio-actions .bio-toggle-btn { margin-top: 0; }

  .bio-enrich-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--tune-border);
    border-radius: 14px;
    padding: 5px 14px;
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 500;
    color: var(--tune-accent);
    cursor: pointer;
    transition: all 0.15s;
  }
  .bio-enrich-btn:hover:not(:disabled) {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
  }
  .bio-enrich-btn:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .bio-enrich-btn--prominent {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
    padding: 8px 20px;
    font-size: 13px;
  }
  .bio-enrich-btn--prominent:hover:not(:disabled) {
    background: var(--tune-accent-hover);
  }
  .btn-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255,255,255,0.2);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  .bio-level-pills {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }
  .bio-level-pill {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 14px;
    border: 1px solid var(--tune-border);
    background: transparent;
    color: var(--tune-text-secondary);
    cursor: pointer;
    transition: all 0.12s;
  }
  .bio-level-pill:hover { border-color: var(--tune-accent); color: var(--tune-text); }
  .bio-level-pill.active {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
  }

  .album-bio-section {
    margin-top: 10px;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: var(--radius-md);
    max-height: 200px;
    overflow-y: auto;
  }

  .album-bio-text {
    font-family: var(--font-body);
    font-size: 13px;
    line-height: 1.7;
    color: var(--tune-text-secondary);
    white-space: pre-wrap;
    margin: 0;
  }

  .album-bio-empty {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    font-style: italic;
    margin: 0;
  }

  /* Album Rating */
  .detail-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-md);
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
  }

  .detail-meta span:not(:last-child)::after {
    content: '·';
    margin-left: var(--space-md);
    color: var(--tune-text-muted);
    opacity: 0.5;
  }

  .source-badge {
    display: inline-block;
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    background: rgba(87, 198, 185, 0.15);
    color: var(--tune-accent);
    margin-top: var(--space-xs);
    width: fit-content;
  }

  .disc-header {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    padding: var(--space-md) 28px var(--space-xs);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-top: 1px solid var(--tune-border);
    margin-top: var(--space-sm);
  }

  .disc-header:first-of-type {
    border-top: none;
    margin-top: 0;
  }

  /* Section GROUPING (#2130) : subordonnée à l'en-tête de disque — pas de
     filet, pas de capitales, décalée sur la gauche des numéros de piste, pour
     qu'on lise « disque 2 » puis « les bonus » et jamais l'inverse. */
  .grouping-header {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    padding: var(--space-sm) 28px var(--space-xs);
    letter-spacing: 0.2px;
  }

  .play-all-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: transform 0.12s ease-out, background 0.12s ease-out;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .play-all-btn:hover {
    background: var(--tune-accent-hover);
    transform: scale(1.08);
  }

  /* Albums grid */
  .quality-filters {
    display: flex;
    /* flex-start, pas center : déplié, le tri et le compteur restent alignés
       sur la première ligne de puces au lieu de flotter au milieu du bloc. */
    align-items: flex-start;
    gap: 8px;
    padding: 12px 24px;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  /* Invariant #2449 : replié (défaut), le conteneur de puces occupe UNE seule
     ligne quel que soit le nombre de formats/cadences/tags de la bibliothèque.
     La grille de pochettes en dessous (.album-grid-viewport, flex: 1) garde
     ainsi sa hauteur — c'est l'enroulement illimité de ce bandeau qui la lui
     volait, jusqu'à ne laisser que des demi-pochettes. */
  .filter-chips {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .filter-chips.collapsed {
    /* Une puce fait ~25px (12px de texte + 2×4px + bordures) ; la 2e ligne
       commence à ~33px (gap 8px). 28px : la 1re ligne entière, jamais la 2e —
       pas de demi-puces pour soigner des demi-pochettes. */
    max-height: 28px;
    overflow: hidden;
  }

  .quality-chip.filters-expand {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .quality-chip {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    padding: 4px 12px;
    border-radius: 16px;
    font-family: var(--font-body);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.12s ease-out;
  }

  .quality-chip:hover {
    border-color: var(--tune-text-secondary);
  }

  .quality-chip.active {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
  }

  .quality-chip.dsd.active {
    background: #8e44ad;
    border-color: #8e44ad;
  }

  .quality-chip.hi-res.active {
    background: #e67e22;
    border-color: #e67e22;
  }

  .quality-chip.cd.active {
    background: #27ae60;
    border-color: #27ae60;
  }

  .quality-chip.lossy.active {
    background: #7f8c8d;
    border-color: #7f8c8d;
  }

  .quality-chip.format.active {
    background: #2980b9;
    border-color: #2980b9;
  }

  .quality-chip.samplerate.active {
    background: #8e44ad;
    border-color: #8e44ad;
  }

  .quality-chip.user-tag {
    gap: 4px;
  }
  /* La création (#2256) : même puce que ses voisines, en pointillé, pour se
     lire comme une action et non comme un filtre de plus. */
  .quality-chip.tag-create {
    gap: 4px;
    border-style: dashed;
  }
  .quality-chip.tag-create:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }
  .quality-chip.user-tag.active {
    background: var(--tag-color, #808080);
    border-color: var(--tag-color, #808080);
  }
  .tag-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .user-tag-wrap {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .tag-manage-btn,
  .tag-manage-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px;
    border: none;
    background: transparent;
    color: var(--tune-text, #ccc);
    opacity: 0.6;
    border-radius: 4px;
    cursor: pointer;
    line-height: 0;
  }
  .tag-manage-btn:hover,
  .tag-manage-toggle:hover {
    opacity: 1;
    background: rgba(128, 128, 128, 0.18);
  }
  .tag-manage-btn.danger:hover {
    color: #e74c3c;
  }
  .tag-manage-toggle.active {
    opacity: 1;
    color: var(--tune-accent, #3498db);
  }

  .album-tags-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
    align-items: center;
  }
  .album-tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    color: white;
    letter-spacing: 0.3px;
  }
  .tag-remove {
    background: none;
    border: none;
    color: rgba(255,255,255,0.7);
    cursor: pointer;
    font-size: 14px;
    padding: 0 2px;
    line-height: 1;
  }
  .tag-remove:hover { color: white; }
  /* Bloc de référence de `.tag-picker` (#2256). Sans lui, `top: 100%` s'ancre
     sur `.view-scroller` et la zone de création tombe contre la barre de
     lecture. Règle load-bearing : la garde
     `etiquetteZoneCreationAncree.test.ts` la tient. */
  .tag-add-wrap { position: relative; display: inline-flex; }
  .tag-add-btn {
    background: none;
    border: 1px dashed var(--tune-border);
    color: var(--tune-text-muted);
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tag-add-btn:hover { border-color: var(--tune-accent); color: var(--tune-accent); }
  .tag-picker {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: 6px;
    min-width: 180px;
    z-index: 100;
    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tag-picker-input {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    background: var(--tune-bg);
    color: var(--tune-text);
    font-size: 12px;
    font-family: inherit;
    outline: none;
    margin-bottom: 4px;
  }
  .tag-picker-input:focus { border-color: var(--tune-accent); }
  /* Champ + bouton de validation sur une seule ligne (#2256) : sans le
     bouton, Entrée était la seule issue et un clic ailleurs perdait la
     saisie sans message. */
  .tag-picker-create {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 4px;
  }
  .tag-picker-create .tag-picker-input { margin-bottom: 0; }
  .tag-picker-submit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 5px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    background: var(--tune-bg);
    color: var(--tune-text-secondary);
    cursor: pointer;
  }
  .tag-picker-submit:hover:not(:disabled) {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }
  .tag-picker-submit:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .tag-picker-option {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border: none;
    background: none;
    color: var(--tune-text);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    border-radius: var(--radius-sm);
    text-align: left;
  }
  .tag-picker-option:hover { background: var(--tune-surface-hover); }

  .filter-sep {
    color: var(--tune-text-muted);
    opacity: 0.3;
    margin: 0 2px;
    font-size: 14px;
  }

  .quality-count {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    margin-left: auto;
  }

  .sort-control {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .sort-icon {
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  /* Tranche de Dynamic Range (#2144). Mêmes jetons que le tri voisin : la
     commande appartient à la même barre, elle ne doit pas s'en distinguer. */
  .dr-range {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .dr-label {
    color: var(--tune-text-muted);
    font-size: 12px;
    flex-shrink: 0;
  }
  .dr-range.active .dr-label { color: var(--tune-accent, #6c5ce7); }
  .dr-select {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 12px;
    padding: 3px 6px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    outline: none;
    transition: border-color 0.12s;
  }
  .dr-select:focus { border-color: var(--tune-accent); }
  .dr-range.active .dr-select { border-color: var(--tune-accent, #6c5ce7); }
  .dr-dash {
    color: var(--tune-text-muted);
    font-size: 12px;
  }
  .dr-clear {
    display: inline-flex;
    align-items: center;
    background: none;
    border: none;
    color: var(--tune-text-muted);
    padding: 2px;
    cursor: pointer;
  }
  .dr-clear:hover { color: var(--tune-text, #e8e8ea); }

  .wall-toggle {
    display: inline-flex;
    align-items: center;
    background: none;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--text-muted, #a0a0a8);
    padding: 3px 5px;
    cursor: pointer;
  }
  .wall-toggle:hover { color: var(--tune-text, #e8e8ea); }
  .wall-toggle.active {
    color: var(--tune-accent, #6c5ce7);
    border-color: var(--tune-accent, #6c5ce7);
  }
  /* En mode mur, la carte n'a plus de texte : la pochette occupe toute la
     cellule et le survol suffit à révéler le titre. */
  .album-card-wall { gap: 0; }
  .album-card-wall .album-card-art { margin-bottom: 0; }

  .sort-select {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 12px;
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    outline: none;
    transition: border-color 0.12s;
  }

  .sort-select:focus {
    border-color: var(--tune-accent);
  }

  .sort-order-btn {
    background: none;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    color: var(--tune-text-secondary);
    cursor: pointer;
    padding: 2px 4px;
    display: inline-flex;
    align-items: center;
    transition: all 0.12s;
  }

  .sort-order-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .album-viewport-wrapper {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
    gap: 4px;
  }

  .album-grid-viewport {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    /* Reserve the scrollbar gutter permanently so the content-box width does not
       shrink when the vertical scrollbar appears. Otherwise the width feeds back
       into the virtual-scroll column math and shifts the whole grid by one
       thumbnail the moment the scrollbar shows up (#1022). */
    scrollbar-gutter: stable;
    /* Firefox: widen the too-thin virtual-list scrollbar so it stays grabbable
       (#1143). Chrome keeps its 14px ::-webkit-scrollbar. */
    scrollbar-width: auto;
    scrollbar-color: rgba(255, 255, 255, 0.35) transparent;
  }

  .albums-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--album-col-min, 140px), 1fr));
    grid-auto-rows: min-content;
    gap: var(--space-lg);
    align-items: start;
  }

  .album-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    padding: 0;
    color: var(--tune-text);
    transition: transform 0.15s ease-out;
  }

  .album-card:hover {
    transform: translateY(-2px);
  }

  .album-card-art {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--tune-grey2);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .album-card-art::before {
    content: "♪";
    position: absolute;
    font-size: 32px;
    color: var(--tune-text-muted, #555);
    opacity: 0.3;
    z-index: 0;
  }

  .album-cover-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    position: relative;
    z-index: 1;
    opacity: 0;
    animation: fadeIn 0.3s ease-out forwards;
  }

  @keyframes fadeIn {
    to { opacity: 1; }
  }

  .play-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    opacity: 0;
    /* `inset: 0` recouvre TOUTE la pochette. Invisible mais cliquable, la
       pastille avalait l'appui et lançait la lecture au lieu d'ouvrir la fiche
       — criant sur un album SANS pochette (p. ex. DSF), dont l'<img> est
       masquée par `onerror` et qui n'offre qu'un aplat gris (Thibaud, #55).
       Elle ne capte donc le pointeur qu'une fois révélée par le survol ; un
       appui simple sur la pochette remonte alors à la carte → fiche de
       l'album. Supprime aussi les lectures déclenchées par mégarde au toucher,
       où il n'y a pas de survol du tout. */
    pointer-events: none;
    transition: opacity 0.15s ease-out;
    border: none;
    cursor: pointer;
    border-radius: var(--radius-lg);
  }

  .album-card-art:hover .play-overlay {
    opacity: 1;
    pointer-events: auto;
  }

  .edit-overlay {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s ease-out;
    z-index: 2;
  }

  .album-card-art:hover .edit-overlay {
    opacity: 1;
  }

  .edit-overlay:hover {
    background: rgba(0, 0, 0, 0.8);
  }

  .heart-overlay {
    position: absolute;
    top: 6px;
    left: 6px;
    z-index: 2;
  }
  .quality-overlay { position: absolute; left: 6px; bottom: 6px; z-index: 2; pointer-events: none; }

  .heart-overlay :global(.heart-btn) {
    opacity: 0;
    color: white;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
  }

  .heart-overlay :global(.heart-btn.active) {
    opacity: 1;
    color: #ef4444;
  }

  .album-card-art:hover .heart-overlay :global(.heart-btn) {
    opacity: 0.8;
  }

  .heart-overlay :global(.heart-btn:hover) {
    opacity: 1 !important;
  }

  /* Duplicate badge overlay on album card */
  .dup-badge {
    position: absolute;
    bottom: 6px;
    right: 6px;
    z-index: 3;
    background: rgba(245, 158, 11, 0.92);
    color: white;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    line-height: 1.3;
    letter-spacing: 0.02em;
    backdrop-filter: blur(4px);
    box-shadow: 0 1px 4px rgba(0,0,0,0.25);
    transition: background 0.15s;
  }

  .dup-badge:hover {
    background: rgba(217, 119, 6, 0.95);
  }

  .dup-popup-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .dup-popup {
    position: absolute;
    bottom: 36px;
    right: 4px;
    z-index: 100;
    background: var(--tune-surface, #1e1e2e);
    border: 1px solid var(--tune-border, #333);
    border-radius: 8px;
    padding: 6px 0;
    min-width: 180px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }

  .dup-popup-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--tune-text-muted, #999);
    padding: 4px 12px 6px;
    border-bottom: 1px solid var(--tune-border, #333);
    margin-bottom: 2px;
  }

  .dup-popup-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: none;
    color: var(--tune-text, #eee);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .dup-popup-item:hover {
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.15);
  }

  .dup-popup-item.current {
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.1);
  }

  .dup-popup-format {
    font-weight: 600;
    flex: 1;
  }

  .dup-popup-year {
    font-size: 11px;
    color: var(--tune-text-muted, #999);
  }

  .dup-popup-current {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--tune-accent, #6366f1);
    font-weight: 700;
  }

  /* Duplicates filter chip */
  .quality-chip.duplicates {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .quality-chip.duplicates.active {
    background: #f59e0b;
    border-color: #f59e0b;
    color: white;
  }

  .quality-chip.favorites {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .quality-chip.favorites.active {
    background: #ef4444;
    border-color: #ef4444;
    color: white;
  }

  .quality-chip.year {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .quality-chip.year.active {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
  }

  .format-btn.favorites-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .format-btn.favorites-btn.active {
    background: #ef4444 !important;
    border-color: #ef4444;
    color: white;
  }

  .album-card-title {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    max-width: 160px;
  }

  /* Un bouton qui doit se lire comme du texte : la carte entière est déjà
     cliquable, un bouton visible ferait croire à deux actions concurrentes.
     Seul le survol signale qu'il mène ailleurs. */
  .album-card-artist-link {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .album-card-artist-link:hover {
    color: var(--tune-text);
    text-decoration: underline;
  }

  .album-card-artist, .album-card-year {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    max-width: 160px;
  }

  .album-card-genre {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-accent);
    opacity: 0.7;
    max-width: 160px;
  }

  /* Artists section + grid */
  .artists-section {
    /* Grow to the grid's content height (NOT clamped to the viewport) so the
       sticky AlphaIndex pins across the whole .library-view scroll. With the
       previous flex:1;min-height:0 the section was viewport-tall, so once the
       grid scrolled past it the index scrolled away too (#1170 regression,
       Benjithom). Kept as a flex ROW for the grid width fix below; the index
       aligns itself via align-self:flex-start. */
    display: flex;
    align-items: flex-start;
    gap: 4px;
  }

  .artists-grid {
    /* Fill the remaining width next to the vertical AlphaIndex — .artists-section
       is a flex row, and without flex:1 the grid shrank to its min content, so
       `auto-fill` collapsed to a SINGLE column (#1092, #1096). min-width:0 lets
       it shrink past content instead of overflowing. */
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-lg);
    /* No inner scroll: the whole .library-view scrolls as one region (same
       Firefox double-scrollbar fix as the Genres tab — #1075). An inner
       overflow-y here also kept `.library-view` at scrollTop 0, so Back could
       never restore the artist list position (#1118, #1170). The Firefox
       scrollbar-width/color fix (#1143) lives on .library-view here. */
  }

  .artist-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    cursor: pointer;
    padding: var(--space-sm) 0;
    transition: transform 0.15s ease-out;
  }

  .artist-card:hover {
    transform: translateY(-2px);
  }

  /*
    Hors du flux, calé sur le bord bas-droit du disque de 100 px. Sur la CARTE
    et non sur l'avatar, qui recadre tout ce qu'il contient.
  */
  .artist-card-heart {
    position: absolute;
    top: 72px;
    left: 50%;
    margin-left: 22px;
    display: flex;
    padding: 5px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
  }

  .artist-card-avatar {
    position: relative;
    width: 100px;
    height: 100px;
    border-radius: 50%;
    background: var(--tune-grey2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-label);
    font-size: 32px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    overflow: hidden;
    flex-shrink: 0;
  }

  .artist-card-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    text-align: center;
    max-width: 140px;
  }

  /* Track filters */
  .track-filters {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-sm) 28px;
  }

  .format-filters {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .filter-label {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    color: var(--tune-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    min-width: 48px;
  }

  .format-btn {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 3px 10px;
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    cursor: pointer;
    transition: all 0.12s;
  }

  .format-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-text);
  }

  .format-btn.active {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
  }

  .format-btn .badge {
    font-size: 10px;
    opacity: 0.7;
  }

  .format-count {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    margin-left: auto;
    align-self: flex-end;
  }

  /* Track list (virtual scroll) */
  .track-list {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .track-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 8px 28px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease-out;
  }

  .track-item:hover {
    background: var(--tune-surface-hover);
  }

  /* La piste en cours de lecture.
   *
   * Demandée deux fois, à quatre mois d'écart : Levente
   * (tune-server-rust#1589, « doesn't highlight on the list ») et Didier
   * (#1845, « sans avoir à passer dans la vue lecture en cours »). Sans elle,
   * savoir ce qui joue obligeait à changer d'écran.
   *
   * Elle réutilise le ▶ déjà affiché au survol, mais permanent : le symbole est
   * connu à cet endroit, et une ligne survolée ressemble alors à ce qu'elle
   * deviendrait si on la lançait. Une icône de plus aurait chargé une ligne qui
   * porte déjà six boutons.
   *
   * Pas de fond coloré : la ligne doit rester survolable et cliquable sans que
   * deux teintes se disputent. La couleur d'accent sur le titre et le numéro
   * suffit, et elle survit au survol — c'est le point, on veut pouvoir la
   * repérer en parcourant la liste à la souris. */
  .track-item.playing .num-text { display: none; }
  .track-item.playing .num-play { display: inline; }
  .track-item.playing .track-title {
    color: var(--tune-accent);
    font-weight: 600;
  }

  .track-thumb {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .track-num {
    width: 28px;
    text-align: center;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .track-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .track-title {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
  }

  .track-meta {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
  }

  .track-link {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: var(--tune-text-secondary);
    cursor: pointer;
  }

  .track-link:hover {
    color: var(--tune-accent);
    text-decoration: underline;
  }

  .track-sep {
    color: var(--tune-text-muted);
  }

  .track-duration {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .audio-format {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-text-muted);
    letter-spacing: 0.3px;
    flex-shrink: 0;
  }

  .track-heart {
    display: flex;
    align-items: center;
    margin-right: 4px;
  }

  .add-queue-btn {
    width: 28px;
    height: 28px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s ease-out;
    opacity: 0;
  }

  .track-item:hover .add-queue-btn {
    opacity: 1;
  }

  .add-queue-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .play-from-here-btn {
    width: 28px;
    height: 28px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s ease-out;
    opacity: 0;
  }

  .track-item:hover .play-from-here-btn {
    opacity: 1;
  }

  .play-from-here-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .play-next-btn {
    width: 28px;
    height: 28px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s ease-out;
    opacity: 0;
  }

  .track-item:hover .play-next-btn {
    opacity: 1;
  }

  .play-next-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .add-playlist-btn {
    width: 28px;
    height: 28px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s ease-out;
    opacity: 0;
  }

  .track-item:hover .add-playlist-btn {
    opacity: 1;
  }

  .add-playlist-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .edit-track-btn {
    width: 28px;
    height: 28px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s ease-out;
    opacity: 0.5;
  }

  .track-item:hover .edit-track-btn {
    opacity: 1;
  }

  .edit-track-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .loading {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    padding: var(--space-xl);
    justify-content: center;
    flex-wrap: wrap;
  }

  .scan-progress {
    width: 100%;
    text-align: center;
    font-size: 0.85em;
    opacity: 0.7;
  }

  .scan-stop-btn {
    border: 1px solid var(--tune-border);
    background: transparent;
    color: var(--tune-text, inherit);
    padding: 4px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 0.85em;
    white-space: nowrap;
    margin-top: 8px;
  }

  .scan-stop-btn:hover:not(:disabled) {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .scan-stop-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Genres grid */
  .label-detail-head {
    display: flex; align-items: center; gap: var(--space-md, 12px);
    margin-bottom: var(--space-md, 12px);
  }
  .label-detail-name { margin: 0; font-size: 18px; font-weight: 700; }
  .label-detail-count { color: var(--tune-text-secondary); font-size: 13px; }

  .genres-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-md);
    /* No inner scroll: the whole .library-view scrolls as one region. A second
       overflow-y here made Firefox draw a classic scrollbar overlapping the
       page's on the Genres tab (#1075); Chrome hid it with overlay scrollbars.
       The stray flex:1 also collapsed the grid to a single column (#1119). */
  }

  .genre-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-lg);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    text-align: left;
    transition: all 0.12s ease-out;
    color: var(--tune-text);
  }

  .genre-card:hover {
    border-color: var(--tune-accent);
    background: var(--tune-surface-hover);
  }

  /* Carte de label : le cœur se pose PAR-DESSUS la carte, sans jamais être
     imbriqué dans son bouton (#2442). */
  .label-card-wrap {
    position: relative;
    display: flex;
  }

  .label-card-wrap .genre-card {
    flex: 1;
    /* De la place pour le cœur, sinon un nom long passe dessous. */
    padding-right: calc(var(--space-lg) + 20px);
  }

  .label-card-heart {
    position: absolute;
    top: var(--space-sm);
    right: var(--space-sm);
    display: flex;
  }

  .genre-card-name {
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
  }

  .genre-card-count {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
  }

  .genre-detail-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
    flex-wrap: wrap;
    /* Épinglé en haut du conteneur de défilement pour que le fil d'Ariane, le
       compte d'albums du genre et le tri restent visibles — #1282 (Jean
       Valjean). `top: 0` depuis #470 : l'en-tête ayant quitté le scroller, les
       72px de compensation étaient devenus 72px de vide. Classe propre aux
       Genres → aucun effet sur les autres onglets. */
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--tune-bg);
  }
  .bc-sep { color: var(--tune-text-muted); user-select: none; }
  .bc-link {
    background: none; border: none; color: var(--tune-accent);
    cursor: pointer; font-size: 14px; padding: 0;
  }
  .bc-link:hover { text-decoration: underline; }
  .bc-current { font-weight: 600; color: var(--tune-text); font-size: 14px; }

  .bc-chips {
    display: flex; flex-wrap: wrap; gap: 6px;
    margin-bottom: var(--space-md);
  }
  .bc-chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 10px;
    background: var(--tune-bg);
    color: var(--tune-text-muted);
    border: 1px solid var(--tune-border);
    border-radius: 14px; font-size: 12px; cursor: pointer;
  }
  .bc-chip:hover { color: var(--tune-text); border-color: var(--tune-accent); }
  .bc-chip.active { background: var(--tune-accent); color: white; border-color: var(--tune-accent); }
  .bc-chip-all { background: rgba(var(--tune-accent-rgb,99,102,241),0.15); color: var(--tune-accent); cursor: default; }
  .bc-chip-count { color: inherit; opacity: 0.7; font-size: 11px; }
  .bc-section-title {
    font-family: var(--font-label);
    font-size: 13px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--tune-text-muted);
    margin: var(--space-md) 0 var(--space-sm);
  }

  /* Grid on wide screens (desktop) instead of a single vertical column: the
     branch cards tile in 2-3 columns, which reads better on large displays and
     keeps the genre name close to its album count. On narrow screens auto-fill
     collapses to one column. Both this and the orphan `.genres-grid` above are
     grids, so the genre tree no longer regresses to a vertical list (#1119). */
  .branches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--space-md);
    align-items: start;
    margin-bottom: var(--space-xl);
  }
  .branch-row {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    padding: var(--space-md) var(--space-lg);
    display: flex; flex-direction: column; gap: var(--space-sm);
    cursor: pointer;
    transition: border-color 0.12s;
  }
  .branch-row:hover {
    border-color: var(--tune-accent);
    background: var(--tune-surface-hover);
  }
  .branch-row:focus-visible {
    outline: 2px solid var(--tune-accent);
    outline-offset: 2px;
  }
  /* Same layout as the "outside tree" .genre-card, which is the reference look
     (#1029, Thibaud): name on the first line, album count as a subtitle right
     under it — never pushed across the card. */
  .branch-card {
    display: flex; flex-direction: column;
    gap: var(--space-xs); width: 100%;
    color: var(--tune-text); text-align: left;
  }
  .branch-name { font-family: var(--font-label); font-size: 16px; font-weight: 600; }
  .branch-row:hover .branch-name { color: var(--tune-accent); }
  .branch-count { font-family: var(--font-body); font-size: 13px; color: var(--tune-text-muted); }
  .branch-children { display: flex; flex-wrap: wrap; gap: 6px; }
  .child-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px;
    background: rgba(var(--tune-accent-rgb,99,102,241),0.10);
    color: var(--tune-text);
    border: 1px solid rgba(var(--tune-accent-rgb,99,102,241),0.18);
    border-radius: 14px; font-size: 12px; cursor: pointer;
  }
  .child-chip:hover { background: rgba(var(--tune-accent-rgb,99,102,241),0.22); }
  .child-chip-count { color: var(--tune-text-muted); font-size: 11px; }

  .genre-detail-title {
    font-family: var(--font-label);
    font-size: 22px;
    font-weight: 600;
  }

  .genre-detail-count {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
  }

  /* Artist detail page */
  .artist-detail {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    flex: 1;
    overflow-y: auto;
  }

  .artist-detail-header {
    display: flex;
    gap: var(--space-lg);
    align-items: center;
  }

  .artist-detail-avatar {
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background: var(--tune-grey2);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
  }

  .artist-detail-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  .artist-detail-initials {
    font-family: var(--font-label);
    font-size: 56px;
    font-weight: 600;
    color: var(--tune-text-secondary);
  }

  .artist-detail-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .artist-detail-name {
    font-family: var(--font-label);
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -0.8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .artist-edit-btn {
    display: inline-flex;
    align-items: center;
    padding: 4px;
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    border-radius: 4px;
    /* Toujours visible, discrètement — et non révélée au seul survol : sans
       souris, l'icône était introuvable, donc l'édition d'un artiste
       inatteignable au doigt sur tablette et téléphone (#1081). Même parti que
       HeartButton. */
    opacity: 0.55;
    transition: opacity 0.15s, color 0.15s;
  }

  .artist-detail-name:hover .artist-edit-btn {
    opacity: 1;
  }

  .artist-edit-btn:hover {
    color: var(--tune-accent);
  }

  .artist-name-edit {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .artist-name-input {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.8px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-accent);
    border-radius: 6px;
    padding: 4px 10px;
    color: var(--tune-text);
    outline: none;
    min-width: 200px;
  }

  .artist-name-save,
  .artist-name-cancel {
    display: inline-flex;
    align-items: center;
    padding: 6px;
    border: 1px solid var(--tune-border);
    border-radius: 4px;
    background: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    transition: all 0.12s;
  }

  .artist-name-save:hover:not(:disabled) {
    color: var(--tune-success, #4ade80);
    border-color: var(--tune-success, #4ade80);
  }

  .artist-name-cancel:hover {
    color: var(--tune-danger, #f87171);
    border-color: var(--tune-danger, #f87171);
  }

  .artist-name-save:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .artist-sort-btn {
    margin-left: 8px;
    vertical-align: middle;
  }

  .artist-detail-count {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
  }

  .artist-play-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .artist-play-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 999px;
    border: 1px solid var(--tune-accent);
    background: var(--tune-accent);
    color: #1a1206;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }
  .artist-play-btn:nth-child(2) {
    background: transparent;
    color: var(--tune-accent);
  }
  .artist-play-btn:hover:not(:disabled) { opacity: 0.85; }
  .artist-play-btn:disabled { opacity: 0.5; cursor: default; }
  .artist-play-btn:focus-visible { outline: 2px solid var(--tune-accent); outline-offset: 2px; }

  .artist-meta-loading,
  .artist-enriching {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    margin-top: var(--space-xs);
  }

  .artist-enriching {
    color: var(--tune-accent);
  }

  .spinner-sm {
    width: 14px;
    height: 14px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .artist-bio {
    font-family: var(--font-body);
    font-size: 14px;
    line-height: 1.7;
    color: var(--tune-text-secondary);
    background: var(--tune-surface);
    border-left: 3px solid var(--tune-accent);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    padding: var(--space-md) var(--space-lg);
    margin: 0;
  }

  .artist-section {
    border-top: 1px solid var(--tune-border);
    padding-top: var(--space-sm);
  }

  .artist-section-header-static {
    display: flex;
    align-items: center;
    padding: var(--space-sm) 0;
  }

  .artist-section-title {
    font-family: var(--font-label);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.3px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .streaming-loading {
    color: var(--tune-text-muted);
    font-size: 13px;
    padding: 12px 0;
  }

  .artist-anecdotes {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--space-md) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .artist-anecdotes li {
    font-family: var(--font-body);
    font-size: 13px;
    line-height: 1.6;
    color: var(--tune-text-secondary);
    padding: var(--space-sm) var(--space-md);
    background: var(--tune-surface);
    border-radius: var(--radius-md);
    position: relative;
    padding-left: var(--space-lg);
  }

  .artist-anecdotes li::before {
    content: '';
    position: absolute;
    left: var(--space-sm);
    top: 50%;
    transform: translateY(-50%);
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--tune-accent);
  }

  .artist-similar-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    padding: var(--space-sm) 0 var(--space-md);
  }

  .artist-similar-chip {
    display: inline-block;
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 16px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    cursor: pointer;
    transition: all 0.12s ease-out;
  }

  .artist-similar-chip:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.1);
  }

  .artist-members-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-sm) 0 var(--space-md);
  }

  .artist-member {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-xs) var(--space-md);
  }

  .artist-member-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text);
  }

  .artist-member-role {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .artist-discography-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-sm) 0 var(--space-md);
  }

  .artist-disc-item {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: var(--tune-surface);
    border-radius: var(--radius-md);
  }

  .artist-disc-year {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 700;
    color: var(--tune-accent);
    min-width: 40px;
    padding-top: 1px;
  }

  .artist-disc-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .artist-disc-title {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text);
  }

  .artist-disc-desc {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    line-height: 1.5;
  }

  @media (max-width: 600px) {
    .artist-detail-header {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .artist-detail-avatar {
      width: 120px;
      height: 120px;
    }

    .artist-detail-initials {
      font-size: 42px;
    }

    .artist-detail-name {
      font-size: 24px;
    }
  }

  .empty {
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    text-align: center;
    padding: var(--space-2xl);
    grid-column: 1 / -1;
  }

  /* Track credits button */
  .credits-btn {
    display: none;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 2px;
    border-radius: var(--radius-sm);
    transition: all 0.12s ease-out;
  }

  .credits-btn.active {
    display: flex;
    color: var(--tune-accent);
  }

  .track-item:hover .credits-btn {
    display: flex;
  }

  .credits-btn:hover {
    color: var(--tune-accent);
  }

  /* Expanded credits row */
  .track-credits-row {
    padding: var(--space-sm) 28px var(--space-sm) 56px;
    background: var(--tune-surface);
    border-bottom: 1px solid var(--tune-border);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
    align-items: flex-start;
  }

  /*
    « Autres versions » (#2372) : la MÊME ligne dépliée que les crédits, aux
    mêmes marges, pour que l'œil reconnaisse le geste. Seul le contenu change
    — des tuiles au lieu de puces.
  */
  .track-versions-row {
    padding: var(--space-sm) 28px var(--space-sm) 56px;
    background: var(--tune-surface);
    border-bottom: 1px solid var(--tune-border);
  }

  .versions-tuiles {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .version-tuile {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px 4px 4px;
    border: 1px solid var(--tune-border);
    border-radius: 10px;
    background: none;
    cursor: pointer;
    text-align: left;
    max-width: 240px;
    transition: all 0.12s ease-out;
  }

  .version-tuile:hover {
    background: var(--tune-surface-hover);
    border-color: var(--tune-accent);
  }

  /* Une tuile qu'on ne sait pas ouvrir ne doit pas se donner l'air cliquable. */
  .version-tuile.inerte {
    cursor: default;
    opacity: 0.75;
  }

  .version-tuile.inerte:hover {
    background: none;
    border-color: var(--tune-border);
  }

  .version-tuile-texte {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .version-tuile-titre {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 600;
    color: var(--tune-text);
  }

  .version-tuile-sub {
    display: flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
  }

  .version-tuile.reprise .version-tuile-titre {
    font-style: italic;
  }

  .credits-role-group {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
  }

  .credits-role-label {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tune-text-muted);
    white-space: nowrap;
  }

  .credits-names {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .credit-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 500;
    padding: 2px 10px;
    border-radius: 12px;
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.08);
    color: var(--tune-text);
    cursor: pointer;
    transition: all 0.12s ease-out;
  }

  .credit-chip:hover {
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.18);
    color: var(--tune-accent);
  }

  .credit-instrument {
    font-size: 11px;
    color: var(--tune-text-muted);
    font-style: italic;
  }

  .credit-chip-static {
    display: inline-block;
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 500;
    padding: 3px 12px;
    border-radius: 12px;
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.08);
    color: var(--tune-text);
    border: 1px solid var(--tune-border);
  }

  .credits-empty {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    font-style: italic;
  }

  /* Artist credits section */
  .artist-credits-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-sm) 0 var(--space-md);
  }

  .credits-instruments {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .credits-track-count {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  /* Quick Fav */
  .quick-fav-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    opacity: 0;
    transition: all 0.12s;
  }

  .track-item:hover .quick-fav-btn {
    opacity: 1;
  }

  .quick-fav-btn.faved {
    color: #f59e0b;
    opacity: 1;
  }

  .quick-fav-btn:hover {
    color: #f59e0b;
    transform: scale(1.15);
  }

  /* Collection dropdown */
  .collection-dropdown-wrap {
    display: inline-flex;
  }

  .collection-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 10px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    z-index: 20;
    box-shadow: var(--shadow-lg);
    min-width: 160px;
    margin-top: 4px;
  }

  .collection-option {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    padding: 6px 12px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.1s;
    white-space: nowrap;
  }

  .collection-option:hover {
    background: var(--tune-surface-hover);
    color: var(--tune-text);
  }

  .collection-empty {
    padding: 8px 12px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .col-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  @media (max-width: 480px) {
    .library-view {
      padding: var(--space-md) 12px;
    }

    .library-header {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-sm);
    }

    .library-header h2 {
      font-size: 22px;
    }

    .library-header-right {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-sm);
    }

    .search-box {
      width: 100%;
    }

    .search-box input {
      width: 100%;
      flex: 1;
    }

    .tab-bar {
      width: 100%;
      justify-content: stretch;
    }

    .tab {
      flex: 1;
      text-align: center;
      padding: var(--space-xs) var(--space-sm);
      font-size: 12px;
    }

    .add-content-btn {
      width: 100%;
      justify-content: center;
    }

    .shuffle-all-btn {
      width: 100%;
      justify-content: center;
    }
  }

  /* Kiosk: fewer, larger album cards */
  @media (max-width: 840px) and (max-height: 520px) {
    .albums-grid {
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 8px;
    }

    .album-card-title {
      font-size: 12px;
    }

    .album-card-artist {
      font-size: 11px;
    }
  }

  /* "No genre" card variant */
  .genre-card-warning {
    border-color: var(--tune-warning, #e6a23c);
    border-style: dashed;
  }

  .genre-card-warning:hover {
    border-color: var(--tune-warning, #e6a23c);
    background: color-mix(in srgb, var(--tune-warning, #e6a23c) 8%, var(--tune-surface));
  }

  /* Years tab summary */
  .year-summary {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
    padding: var(--space-sm) 0;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
  }

  .year-sort-btn { margin-left: auto; }

  /* Genres tab only: pin the summary bar (total album count + "sans genre" +
     the right-side sort control) under the sticky header so it doesn't scroll
     away — #1282 refinement (Jean Valjean). Scoped to `.genres-summary` so the
     Years tab (which reuses `.year-summary` but scrolls via its own inner
     viewport) is provably untouched. */
  .genres-summary {
    position: sticky;
    /* `top: 0` depuis #470, même raison que `.genre-detail-header` ci-dessus :
       l'en-tête n'est plus dans le conteneur de défilement. */
    top: 0;
    z-index: 10;
    background: var(--tune-bg);
  }

  .genre-sort-btns {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }

  .genre-sort-btn {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: 12px;
    padding: 3px 10px;
    font-size: 11px;
    color: var(--tune-text-muted);
    cursor: pointer;
    transition: all 0.12s;
  }

  .genre-sort-btn.active {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
  }

  .year-summary-total {
    font-weight: 600;
    color: var(--tune-text);
  }

  .year-summary-groups::before {
    content: '·';
    margin-right: var(--space-md);
  }

  /* Years tab */
  .year-grid-viewport {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    /* Reserve the scrollbar gutter so the content width (and therefore the
       virtual-scroll column math) doesn't jump when the scrollbar appears. */
    scrollbar-gutter: stable;
  }

  .year-albums-row {
    /* Rows are absolutely positioned by the virtual scroller; keep the grid
       columns identical to the CSS auto-fill used by the album tab. */
    align-content: start;
  }

  .year-section {
    display: flex;
    align-items: baseline;
    gap: var(--space-md);
    padding-bottom: 6px;
    border-bottom: 1px solid var(--tune-border);
    box-sizing: border-box;
  }

  .year-header {
    font-family: var(--font-label);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.5px;
    margin: 0;
  }

  .year-count {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
  }

  /* Hover play icon on track number */
  .track-num .num-play {
    display: none;
    color: var(--tune-accent);
    font-size: 11px;
  }

  .track-item:hover .num-text {
    display: none;
  }

  .track-item:hover .num-play {
    display: inline;
  }

  /* Track context menu ("...") */
  .track-more-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .track-more-btn {
    width: 28px;
    height: 28px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 1px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s ease-out;
    opacity: 0;
    line-height: 1;
    padding: 0;
  }

  .track-item:hover .track-more-btn {
    opacity: 1;
  }

  .track-more-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  /* On touch/narrow viewports there is no hover, so the row's hover-only
     action buttons are unusable AND — being opacity:0, not display:none —
     they still consume width, squeezing the flex-basis:0 .track-info to zero
     so only the track number showed, never the title (Levente, Android web).
     Drop them from the layout and expose the ⋮ menu instead: the title gets
     its width back and every action stays reachable through openTrackMenu. */
  @media (max-width: 640px) {
    .track-item .quick-fav-btn,
    .track-item .add-queue-btn,
    .track-item .play-from-here-btn,
    .track-item .play-next-btn,
    .track-item .add-playlist-btn,
    .track-item .credits-btn,
    .track-item .edit-track-btn {
      display: none;
    }
    .track-item .track-more-btn {
      opacity: 1;
    }
    .track-info {
      min-width: 0;
      flex: 1 1 auto;
    }
  }

  /* Touch devices (e.g. an Android web view) have no hover, so the hover-reveal
     per-track action buttons are unusable AND — being opacity:0, not
     display:none — they still consume row width, squeezing .track-info's
     flex-basis to zero so ONLY the track number showed, never the title
     (forum #1142). The ≤640px rule above already drops them on phones; key it
     on the pointer type too so it also covers wider touch surfaces (tablets,
     Android web views reporting >640px). The ··· overflow menu carries these
     actions on touch. */
  @media (hover: none) {
    .track-item .quick-fav-btn,
    .track-item .add-queue-btn,
    .track-item .play-from-here-btn,
    .track-item .play-next-btn,
    .track-item .add-playlist-btn,
    .track-item .credits-btn,
    .track-item .edit-track-btn {
      display: none;
    }
    .track-item .track-more-btn {
      opacity: 1;
    }
  }

</style>
