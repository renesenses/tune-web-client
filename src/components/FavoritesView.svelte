<script lang="ts">
  import { currentProfileId } from '../lib/stores/profile';
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import { playFromHere } from '../lib/playback';
  import { trier, clesPourOnglet, type CleDeTri } from '../lib/favoritesSort';
  import { queueTracks, queuePosition } from '../lib/stores/queue';
  import { selectedAlbum, albumTracks, selectedArtist, artistAlbums } from '../lib/stores/library';
  import { activeView } from '../lib/stores/navigation';
  import * as api from '../lib/api';
  import { t as tr } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import { formatTime } from '../lib/utils';
  import AlbumArt from './AlbumArt.svelte';
  import MetadataChips from './MetadataChips.svelte';
  import ServiceBadge from './ServiceBadge.svelte';
  import { displayFields } from '../lib/stores/displayFields';
  import { setShortcutTarget, clearShortcutTarget } from '../lib/stores/shortcuts';
  import { activeStreamingService, pendingStreamingAlbum, pendingStreamingArtist, streamingServices } from '../lib/stores/streaming';
  import type { Track, Album, Artist } from '../lib/types';

  interface Props {
    onAddToPlaylist?: (track: Track) => void;
  }
  let { onAddToPlaylist }: Props = $props();

  type FavTab = 'tracks' | 'albums' | 'artists';
  let activeTab = $state<FavTab>('tracks');
  let loading = $state(false);

  // A shortcut created on Favorites reopens the same tab (tracks/albums/artists)
  // instead of always the default. Publish the active tab as the shortcut target
  // while mounted; the store is cleared when we leave.
  $effect(() => {
    setShortcutTarget({ key: `favorites:${activeTab}`, restore: { tab: activeTab }, label: activeTab });
    return () => clearShortcutTarget();
  });
  $effect(() => {
    const onRestore = (e: Event) => {
      const target = (e as CustomEvent).detail?.target;
      const key: string | undefined = target?.key;
      if (!key || !key.startsWith('favorites:')) return;
      const tab = target.restore?.tab as FavTab | undefined;
      if (tab === 'tracks' || tab === 'albums' || tab === 'artists') activeTab = tab;
    };
    window.addEventListener('tune:shortcut-restore', onRestore);
    return () => window.removeEventListener('tune:shortcut-restore', onRestore);
  });

  let favTracks = $state<Track[]>([]);
  let favAlbums = $state<Album[]>([]);
  let favArtists = $state<Artist[]>([]);

  let zone = $derived($currentZone);

  // --- Source filter + play controls (Fabien) ------------------------------
  // Every favorite carries `source` ('local', 'qobuz', 'tidal', …). Let the user
  // narrow a tab to a single service, and play/shuffle the (filtered) track list.
  let sourceFilter = $state<string>('all');
  const srcOf = (x: any): string => x?.source ?? 'local';

  // Tri des favoris (#2001) — la logique vit dans `favoritesSort.ts`, où elle
  // est éprouvée : accents, champs absents et sens de tri sont exactement les
  // règles qu'on croit évidentes et qu'on écrit de travers.
  let tri = $state<CleDeTri>('defaut');
  let triDescendant = $state(false);

  // Le tri s'applique APRÈS le filtre par source, et il pilote donc aussi
  // l'ordre de lecture : `playAllTracks` et « lire à partir d'ici » travaillent
  // sur `displayTracks`. C'est exactement ce que Tades demandait — les écouter
  // dans l'ordre qu'il choisit.
  let displayTracks = $derived(
    trier(
      sourceFilter === 'all' ? favTracks : favTracks.filter((t) => srcOf(t) === sourceFilter),
      tri,
      triDescendant,
    ),
  );
  let displayAlbums = $derived(
    trier(
      sourceFilter === 'all' ? favAlbums : favAlbums.filter((a) => srcOf(a) === sourceFilter),
      tri,
      triDescendant,
    ),
  );
  let displayArtists = $derived(
    trier(
      sourceFilter === 'all' ? favArtists : favArtists.filter((a) => srcOf(a) === sourceFilter),
      tri,
      triDescendant,
    ),
  );

  let clesDeTri = $derived(clesPourOnglet(activeTab));

  // Changer d'onglet peut invalider la clé courante — « album » n'existe pas
  // sur les artistes. On retombe sur l'ordre d'ajout plutôt que de trier sur
  // un champ vide, ce qui donnerait une liste d'apparence aléatoire.
  $effect(() => {
    if (!clesDeTri.includes(tri)) tri = 'defaut';
  });

  let currentList = $derived(
    activeTab === 'tracks' ? favTracks : activeTab === 'albums' ? favAlbums : favArtists,
  );

  // Les pastilles de filtre listent les sources dont l'utilisateur DISPOSE, pas
  // celles qui se trouvent avoir chargé.
  //
  // Elles étaient dérivées du contenu affiché : `[...new Set(currentList.map(srcOf))]`.
  // Il suffisait donc qu'un appel aux favoris Qobuz échoue — et il échoue en
  // silence, chaque `getStreamingFavorites` étant suivi d'un `.catch(() => null)` —
  // pour que la liste retombe au seul « local », que le compte tombe à un, et
  // que la barre entière disparaisse. Un filtre qui s'efface ne se lit pas comme
  // une panne : il se lit comme une fonction retirée. C'est exactement ce que
  // Fabien a rapporté, deux fois, à quatre versions d'écart (#1729).
  //
  // `streamingServices` est rafraîchi par huit écrans : il survit à un échec
  // ponctuel ici, là où une liste reconstruite à chaque chargement ne survit à
  // rien. On y ajoute « local », toujours possible, et les sources réellement
  // présentes — au cas où un favori porterait une source qu'on n'attendait pas.
  let connectedSources = $derived(
    Object.entries($streamingServices)
      .filter(([, s]) => s?.authenticated)
      .map(([name]) => name),
  );
  let availableSources = $derived(
    [...new Set(['local', ...connectedSources, ...currentList.map(srcOf)])].sort(),
  );

  function sourcesFor(tab: FavTab): Set<string> {
    const list = tab === 'tracks' ? favTracks : tab === 'albums' ? favAlbums : favArtists;
    return new Set(list.map(srcOf));
  }

  // A source present in one tab may be absent in another, so switching tabs with
  // a filter on would show an empty list — reset to "all" when that happens.
  function setTab(tab: FavTab) {
    activeTab = tab;
    if (sourceFilter !== 'all' && !sourcesFor(tab).has(sourceFilter)) sourceFilter = 'all';
  }

  function sourceLabel(s: string): string {
    return s === 'local' ? $tr('favorites.localSource') : s.charAt(0).toUpperCase() + s.slice(1);
  }

  function shuffled<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Play just one item (local via track_id, streaming via source/source_id).
  async function playSingle(t: Track) {
    if (!zone?.id) return;
    const st = t as unknown as { source?: string; source_id?: string };
    if (st.source_id && st.source) {
      await playAndSync(zone.id, {
        source: st.source, source_id: st.source_id,
        title: t.title, artist_name: t.artist_name,
        album_title: t.album_title, cover_path: t.cover_path,
      } as any);
    } else if (t.id) {
      await playAndSync(zone.id, { track_id: t.id });
    }
  }

  // Play the (filtered) favorites track list, optionally shuffled. An all-local
  // list plays in one call; a mixed/streaming list starts the first item then
  // enqueues the rest in order (the play API takes only one streaming item, but
  // addToQueue takes them one by one).
  async function playAllTracks(shuffle: boolean) {
    if (!zone?.id) return;
    const list = shuffle ? shuffled(displayTracks) : displayTracks;
    if (list.length === 0) return;
    try {
      if (list.every((t) => typeof t.id === 'number')) {
        await playAndSync(zone.id, { track_ids: list.map((t) => t.id as number), start_index: 0 });
        return;
      }
      await playSingle(list[0]);
      for (const t of list.slice(1)) {
        const st = t as unknown as { source?: string; source_id?: string };
        if (st.source_id && st.source) {
          await api.addToQueue(zone.id, {
            source: st.source as any, source_id: st.source_id,
            title: t.title, artist_name: t.artist_name,
            album_title: t.album_title, cover_path: t.cover_path, duration_ms: t.duration_ms,
          });
        } else if (t.id) {
          await api.addToQueue(zone.id, { track_id: t.id });
        }
      }
      const qs = await api.getQueue(zone.id);
      queueTracks.set(qs.tracks);
      queuePosition.set(qs.position);
    } catch (e) {
      console.error('Play favorites error:', e);
    }
  }

  // Map a Tune-hearted streaming favorite into a Track/Album/Artist-shaped
  // object carrying `source`/`source_id`, so the existing rendering and the
  // streaming play path work without a separate UI.
  function streamToTrack(f: api.StreamingFavorite): Track {
    return {
      title: f.title ?? '', artist_name: f.artist ?? '', album_title: f.album ?? '',
      cover_path: f.cover_url ?? null, source: f.service, source_id: f.service_id, duration_ms: 0,
    } as unknown as Track;
  }
  function streamToAlbum(f: api.StreamingFavorite): Album {
    return {
      title: f.title ?? '', artist_name: f.artist ?? '', cover_path: f.cover_url ?? null,
      source: f.service, source_id: f.service_id,
    } as unknown as Album;
  }
  function streamToArtist(f: api.StreamingFavorite): Artist {
    return {
      name: f.title ?? f.artist ?? '', image_path: f.cover_url ?? null,
      source: f.service, source_id: f.service_id,
    } as unknown as Artist;
  }

  // Native streaming-service favorites (items starred on the Qobuz/Tidal/… side,
  // not hearted inside Tune). They arrive in the StreamTrack/StreamAlbum/
  // StreamArtist shape from getStreamingFavorites(service,type): tracks/albums
  // already carry source_id/title/artist_name/album_title/cover_path but NO
  // `source` (it's implied by the request URL), and artists use id/name/
  // image_path. Normalise into the Track/Album/Artist shape the tab renders and
  // the streaming play path expects.
  function nativeToTrack(service: string, it: any): Track {
    return { ...it, source: service, source_id: it.source_id } as unknown as Track;
  }
  function nativeToAlbum(service: string, it: any): Album {
    return { ...it, source: service, source_id: it.source_id } as unknown as Album;
  }
  function nativeToArtist(service: string, it: any): Artist {
    return {
      name: it.name ?? '', image_path: it.image_path ?? null,
      source: service, source_id: it.id,
    } as unknown as Artist;
  }

  // Fetch native favorites for every authenticated streaming service, merged per
  // tab. The unified Favorites tab is meant to be the single place for everything
  // a user has favorited — including what they starred service-side, not only
  // Tune hearts (Bertrand, .18: Qobuz favorites weren't showing up here).
  // Resilient: a failing service/type yields nothing rather than blanking the tab.
  async function loadNativeServiceFavorites(): Promise<{ tracks: Track[]; albums: Album[]; artists: Artist[] }> {
    const out = { tracks: [] as Track[], albums: [] as Album[], artists: [] as Artist[] };
    let services: Record<string, { authenticated?: boolean }> = {};
    try {
      services = await api.getStreamingServices();
    } catch {
      return out;
    }
    const connected = Object.entries(services)
      .filter(([, s]) => s?.authenticated)
      .map(([name]) => name);
    await Promise.all(
      connected.map(async (svc) => {
        const [albums, artists, tracks] = await Promise.all([
          api.getStreamingFavorites(svc, 'albums').catch(() => null),
          api.getStreamingFavorites(svc, 'artists').catch(() => null),
          api.getStreamingFavorites(svc, 'tracks').catch(() => null),
        ]);
        for (const it of tracks?.tracks ?? []) out.tracks.push(nativeToTrack(svc, it));
        for (const it of albums?.albums ?? []) out.albums.push(nativeToAlbum(svc, it));
        for (const it of artists?.artists ?? []) out.artists.push(nativeToArtist(svc, it));
      }),
    );
    return out;
  }

  async function loadFavorites() {
    const pid = $currentProfileId;
    if (!pid) return;
    loading = true;
    try {
      // Local favorites (hydrated) + Tune-hearted streaming favorites (YouTube,
      // Qobuz, …) + native service-side favorites, merged per tab. Any streaming
      // lookup failing must not blank the local list.
      const [local, streaming, native] = await Promise.all([
        api.getFavorites(pid),
        api.getProfileStreamingFavorites(pid).catch(() => [] as api.StreamingFavorite[]),
        loadNativeServiceFavorites(),
      ]);

      const heartedTracks = streaming.filter((f) => f.item_type === 'track').map(streamToTrack);
      const heartedAlbums = streaming.filter((f) => f.item_type === 'album').map(streamToAlbum);
      const heartedArtists = streaming.filter((f) => f.item_type === 'artist').map(streamToArtist);

      // An item both hearted in Tune AND starred service-side must appear once.
      const key = (x: any) => `${x.source ?? ''}:${x.source_id ?? ''}`;
      const seenTracks = new Set(heartedTracks.map(key));
      const seenAlbums = new Set(heartedAlbums.map(key));
      const seenArtists = new Set(heartedArtists.map(key));

      favTracks = [
        ...(local.tracks ?? []),
        ...heartedTracks,
        ...native.tracks.filter((t) => !seenTracks.has(key(t))),
      ];
      favAlbums = [
        ...(local.albums ?? []),
        ...heartedAlbums,
        ...native.albums.filter((a) => !seenAlbums.has(key(a))),
      ];
      favArtists = [
        ...(local.artists ?? []),
        ...heartedArtists,
        ...native.artists.filter((a) => !seenArtists.has(key(a))),
      ];
    } catch (e) {
      console.error('Load favorites error:', e);
    }
    loading = false;
  }

  $effect(() => {
    // Reload when profile changes
    const _pid = $currentProfileId;
    if (_pid) loadFavorites();
  });

  async function playTrack(track: Track) {
    if (!zone?.id) return;
    // Streaming favorite: play via source/source_id (no local track_id).
    const st = track as unknown as { source?: string; source_id?: string };
    if (st.source_id && st.source) {
      try {
        await playAndSync(zone.id, {
          source: st.source, source_id: st.source_id,
          title: track.title, artist_name: track.artist_name,
          album_title: track.album_title, cover_path: track.cover_path,
        } as any);
      } catch (e) {
        console.error('Play streaming track error:', e);
      }
      return;
    }
    if (!track.id) return;
    try {
      // Play the whole (filtered) favorites list starting at the clicked track so
      // playback auto-advances through the remaining favorites (Elie). Sending a
      // lone track_id built a 1-entry queue that stopped after this track.
      const idx = displayTracks.findIndex(t => t.id === track.id);
      if (idx >= 0) {
        const ids = displayTracks.slice(idx).map(t => t.id).filter(Boolean) as number[];
        await playAndSync(zone.id, { track_ids: ids });
      } else {
        await playAndSync(zone.id, { track_id: track.id });
      }
    } catch (e) {
      console.error('Play track error:', e);
    }
  }

  // Le « + » d'un favori — local OU de service.
  //
  // La fonction ne connaissait que `track.id`. Un favori Qobuz/Tidal n'a pas
  // d'identifiant local : il porte `source` + `source_id` (cf. streamToTrack et
  // nativeToTrack juste au-dessus, qui les fabriquent). Il traversait donc le
  // `if` SANS RIEN FAIRE, puis la file était relue quand même — l'écran donnait
  // l'apparence d'un ajout réussi, alors qu'aucune requête n'était partie
  // (Tades #1487, sur ses favoris). Même défaut que celui corrigé dans
  // LibraryView et StreamingView (#1959), dans la vue qu'il utilisait vraiment.
  async function addToQueue(track: Track) {
    if (!zone?.id) {
      notifications.error($tr('library.noZoneSelectedSelectZone'));
      return;
    }
    const st = track as unknown as { source?: string; source_id?: string };
    try {
      if (track.id) {
        await api.addToQueue(zone.id, { track_id: track.id });
      } else if (st.source_id && st.source) {
        await api.addToQueue(zone.id, {
          source: st.source as any, source_id: st.source_id,
          title: track.title, artist_name: track.artist_name,
          album_title: track.album_title, cover_path: track.cover_path,
          duration_ms: track.duration_ms,
        });
      } else {
        // Un « + » qui ne fait rien est indistinguable d'un « + » cassé.
        notifications.error($tr('queue.addFailed'));
        console.error('addToQueue: favori sans identifiant exploitable', track);
        return;
      }
      const qs = await api.getQueue(zone.id);
      queueTracks.set(qs.tracks);
      queuePosition.set(qs.position);
    } catch (e) {
      notifications.error($tr('queue.addFailed'));
      console.error('Add to queue error:', e);
    }
  }

  // Un-hearting a streaming item here must (a) drop it service-side too
  // (Qobuz/Tidal star), not just the Tune-local favorite, and (b) tell the other
  // views (streaming album/browse) to refresh their heart state — otherwise the
  // track stayed marked favorite in the Qobuz album view (bug Fabien v0.9.41).
  function notifyStreamingFavoritesChanged() {
    window.dispatchEvent(new CustomEvent('tune:streaming-favorites-changed'));
  }

  async function removeFavTrack(track: Track) {
    const pid = $currentProfileId;
    if (!pid) return;
    const st = track as unknown as { source?: string; source_id?: string };
    if (st.source_id && st.source) {
      favTracks = favTracks.filter((t) => (t as any).source_id !== st.source_id);
      try {
        await api.removeProfileStreamingFavorite(pid, { item_type: 'track', service: st.source, service_id: st.source_id });
      } catch (e) { console.error('Remove streaming favorite error:', e); loadFavorites(); }
      await api.removeStreamingFavorite(st.source, 'tracks', st.source_id).catch(() => {});
      notifyStreamingFavoritesChanged();
      return;
    }
    if (!track.id) return;
    favTracks = favTracks.filter(t => t.id !== track.id);
    try {
      await api.removeFavorite(pid, { track_id: track.id });
    } catch (e) {
      console.error('Remove favorite error:', e);
      loadFavorites();
    }
  }

  async function removeFavAlbum(album: Album) {
    const pid = $currentProfileId;
    if (!pid) return;
    const st = album as unknown as { source?: string; source_id?: string };
    if (st.source_id && st.source) {
      favAlbums = favAlbums.filter((a) => (a as any).source_id !== st.source_id);
      try {
        await api.removeProfileStreamingFavorite(pid, { item_type: 'album', service: st.source, service_id: st.source_id });
      } catch (e) { console.error('Remove streaming favorite error:', e); loadFavorites(); }
      await api.removeStreamingFavorite(st.source, 'albums', st.source_id).catch(() => {});
      notifyStreamingFavoritesChanged();
      return;
    }
    if (!album.id) return;
    favAlbums = favAlbums.filter(a => a.id !== album.id);
    try {
      await api.removeFavorite(pid, { album_id: album.id });
    } catch (e) {
      console.error('Remove favorite error:', e);
      loadFavorites();
    }
  }

  async function removeFavArtist(artist: Artist) {
    const pid = $currentProfileId;
    if (!pid) return;
    const st = artist as unknown as { source?: string; source_id?: string };
    if (st.source_id && st.source) {
      favArtists = favArtists.filter((a) => (a as any).source_id !== st.source_id);
      try {
        await api.removeProfileStreamingFavorite(pid, { item_type: 'artist', service: st.source, service_id: st.source_id });
      } catch (e) { console.error('Remove streaming favorite error:', e); loadFavorites(); }
      await api.removeStreamingFavorite(st.source, 'artists', st.source_id).catch(() => {});
      notifyStreamingFavoritesChanged();
      return;
    }
    if (!artist.id) return;
    favArtists = favArtists.filter(a => a.id !== artist.id);
    try {
      await api.removeFavorite(pid, { artist_id: artist.id });
    } catch (e) {
      console.error('Remove favorite error:', e);
      loadFavorites();
    }
  }

  /** Reference d'un favori venant d'un service de streaming.
   *
   * `streamToAlbum` / `streamToArtist` ne posent que `source` et `source_id`
   * sur ces objets : ils n'ont pas d'id local. Les deux champs sont absents du
   * type Album/Artist, d'ou le cast — c'est exactement ce que fait deja
   * playSingle cote onglet Titres.
   *
   * Cette fonction etait APPELEE sans jamais avoir ete ecrite (#353) : le
   * bundle partait sans erreur de compilation, mais tout clic dans Favoris >
   * Albums ou Artistes levait un ReferenceError et mourait en silence — y
   * compris sur un favori LOCAL, l'appel precedant la garde sur l'id
   * (Benjithom, forum #1335 en 0.9.60).
   */
  function streamingRef(o: unknown): { source?: string; source_id?: string } {
    const s = o as { source?: string; source_id?: string } | null | undefined;
    return { source: s?.source, source_id: s?.source_id };
  }

  function navigateToAlbum(album: Album) {
    const st = streamingRef(album);
    if (st.source && st.source_id) {
      activeStreamingService.set(st.source as any);
      pendingStreamingAlbum.set(album);
      activeView.set('streaming');
      return;
    }
    if (!album.id) return;
    selectedArtist.set(null);
    selectedAlbum.set(album);
    api.getAlbumTracks(album.id).then(tracks => albumTracks.set(tracks));
    activeView.set('library');
  }

  function navigateToArtist(artist: Artist) {
    const st = streamingRef(artist);
    if (st.source && st.source_id) {
      activeStreamingService.set(st.source as any);
      pendingStreamingArtist.set(artist);
      activeView.set('streaming');
      return;
    }
    if (!artist.id) return;
    selectedAlbum.set(null);
    selectedArtist.set(artist);
    api.getArtistAlbums(artist.id).then(albums => artistAlbums.set(albums));
    activeView.set('library');
  }

  async function playAlbum(album: Album) {
    if (!zone?.id) return;
    const st = streamingRef(album);
    try {
      if (st.source && st.source_id) {
        // Le serveur sait enfiler un album distant entier via streaming_album_id.
        await playAndSync(zone.id, { source: st.source as any, streaming_album_id: st.source_id } as any);
        return;
      }
      if (!album.id) return;
      await playAndSync(zone.id, { album_id: album.id });
    } catch (e) {
      console.error('Play album error:', e);
    }
  }

  function initials(name: string): string {
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.charAt(0).toUpperCase();
  }
</script>

<div class="favorites-view">
  <div class="favorites-header">
    <h2>{$tr('nav.favorites')}</h2>
    <div class="tab-bar">
      <button class="tab" class:active={activeTab === 'tracks'} onclick={() => setTab('tracks')}>{$tr('favorites.tracks')} ({favTracks.length})</button>
      <button class="tab" class:active={activeTab === 'albums'} onclick={() => setTab('albums')}>{$tr('favorites.albums')} ({favAlbums.length})</button>
      <button class="tab" class:active={activeTab === 'artists'} onclick={() => setTab('artists')}>{$tr('favorites.artists')} ({favArtists.length})</button>
    </div>
  </div>

  {#if !loading && availableSources.length > 1}
    <div class="filter-bar">
      <button class="chip" class:active={sourceFilter === 'all'} onclick={() => sourceFilter = 'all'}>{$tr('common.all')}</button>
      {#each availableSources as s}
        <button class="chip" class:active={sourceFilter === s} onclick={() => sourceFilter = s}>
          <ServiceBadge source={s} compact />
          <span>{sourceLabel(s)}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if !loading && currentList.length > 1}
    <div class="filter-bar tri-bar">
      <span class="tri-label">{$tr('favorites.sortBy')}</span>
      {#each clesDeTri as cle (cle)}
        <button class="chip" class:active={tri === cle} onclick={() => (tri = cle)}>
          {cle === 'defaut'
            ? $tr('library.sortAddedDate')
            : cle === 'titre'
              ? $tr('library.sortTitle')
              : cle === 'artiste'
                ? $tr('library.sortArtist')
                : $tr('common.album')}
        </button>
      {/each}
      <!-- Le sens n'a aucun sens sur l'ordre d'ajout : on ne l'affiche pas
           plutôt que de le griser, un bouton grisé faisant croire à un défaut. -->
      {#if tri !== 'defaut'}
        <button
          class="chip"
          onclick={() => (triDescendant = !triDescendant)}
          title={triDescendant ? $tr('common.descending') : $tr('common.ascending')}
          aria-label={triDescendant ? $tr('common.descending') : $tr('common.ascending')}
        >{triDescendant ? '↓' : '↑'}</button>
      {/if}
    </div>
  {/if}

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      {$tr('common.loading')}
    </div>
  {:else if activeTab === 'tracks'}
    {#if displayTracks.length === 0}
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        <p>{$tr('favorites.empty')}</p>
      </div>
    {:else}
      <div class="play-bar">
        <button class="play-action" onclick={() => playAllTracks(false)}>
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="14" height="14"><path d="M8 5v14l11-7z" /></svg>
          {$tr('common.play')}
        </button>
        <button class="play-action" onclick={() => playAllTracks(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M16 3h5v5" /><path d="M4 20L21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" /></svg>
          {$tr('favorites.shuffle')}
        </button>
      </div>
      <div class="track-list">
        {#each displayTracks as t}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="track-item" onclick={() => playTrack(t)}>
            <span class="track-thumb"><AlbumArt coverPath={t.cover_path} albumId={t.album_id} size={36} alt={t.album_title ?? ''} /></span>
            <div class="track-info">
              <span class="track-title-row">
                <span class="track-title truncate">{t.title}</span>
                <ServiceBadge source={(t as any).source ?? 'local'} compact />
              </span>
              <span class="track-meta truncate">{t.artist_name ?? ''}{#if t.album_title} — {t.album_title}{/if}</span>
              <MetadataChips track={t} fields={$displayFields} />
            </div>
            <span class="track-duration">{formatTime(t.duration_ms)}</span>
            <button class="action-btn play-from-here-btn" onclick={(e) => { e.stopPropagation(); playFromHere(displayTracks, displayTracks.indexOf(t)); }} title={$tr('common.playFromHere')} aria-label={$tr('common.playFromHere')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="3" y1="6" x2="14" y2="6" /><line x1="3" y1="12" x2="14" y2="12" /><line x1="3" y1="18" x2="10" y2="18" /><path d="M16 8v8l6-4z" fill="currentColor" stroke="none" /></svg>
            </button>
            <button class="action-btn" onclick={(e) => { e.stopPropagation(); addToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
            {#if onAddToPlaylist && (t.id || t.source_id)}
              <button class="action-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={$tr('nowplaying.addToPlaylist')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" /><line x1="16" y1="3" x2="16" y2="11" /><line x1="12" y1="7" x2="20" y2="7" /></svg>
              </button>
            {/if}
            <button class="remove-btn" onclick={(e) => { e.stopPropagation(); removeFavTrack(t); }} title={$tr('profile.delete')}>
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}

  {:else if activeTab === 'albums'}
    {#if displayAlbums.length === 0}
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        <p>{$tr('favorites.empty')}</p>
      </div>
    {:else}
      <div class="albums-grid">
        {#each displayAlbums as album}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="album-card" onclick={() => navigateToAlbum(album)}>
            <div class="album-card-art">
              <img class="album-cover-img" src={api.artworkUrl(album.cover_path)} alt={album.title} loading="lazy" onerror={(e) => (e.target as HTMLImageElement).style.display='none'} />
              <button class="play-overlay" onclick={(e) => { e.stopPropagation(); playAlbum(album); }} title={$tr('library.playAlbum')}>
                <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><path d="M8 5v14l11-7z" /></svg>
              </button>
              <button class="remove-overlay" onclick={(e) => { e.stopPropagation(); removeFavAlbum(album); }}>
                <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
              </button>
              <div class="cover-badge"><ServiceBadge source={(album as any).source ?? 'local'} compact /></div>
            </div>
            <span class="album-card-title truncate">{album.title}</span>
            {#if album.artist_name}
              <span class="album-card-artist truncate">{album.artist_name}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

  {:else if activeTab === 'artists'}
    {#if displayArtists.length === 0}
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        <p>{$tr('favorites.empty')}</p>
      </div>
    {:else}
      <div class="artists-grid">
        {#each displayArtists as artist}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="artist-card" onclick={() => navigateToArtist(artist)}>
            <div class="artist-card-avatar">
              <AlbumArt coverPath={artist.image_path} size={100} alt={artist.name} round fallbackInitials={initials(artist.name)} />
            </div>
            <span class="artist-card-name truncate">{artist.name}</span>
            <ServiceBadge source={(artist as any).source ?? 'local'} compact />
            <button class="artist-remove-btn" onclick={(e) => { e.stopPropagation(); removeFavArtist(artist); }}>
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="14" height="14"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .favorites-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
  }

  .favorites-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .favorites-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
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

  /* Source filter chips (Fabien: filter favorites by service) */
.tri-bar { margin-top: -0.35rem; }
  .tri-label {
    align-self: center; font-size: 0.8125rem; color: var(--text-muted, #888);
    margin-right: 0.15rem;
  }
  .filter-bar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin-bottom: var(--space-md);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    background: var(--tune-grey2);
    border: 1px solid transparent;
    border-radius: 999px;
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.12s ease-out;
  }

  .chip:hover {
    color: var(--tune-text);
  }

  .chip.active {
    background: var(--tune-surface-selected);
    border-color: var(--tune-accent);
    color: var(--tune-text);
  }

  /* Play / Shuffle bar on the tracks tab (Fabien) */
  .play-bar {
    display: flex;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }

  .play-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: var(--tune-accent);
    border: none;
    border-radius: 999px;
    color: var(--tune-bg, #000);
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: filter 0.12s ease-out;
  }

  .play-action:hover {
    filter: brightness(1.08);
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: var(--space-xl);
    color: var(--tune-text-muted);
    font-family: var(--font-body);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    padding: var(--space-xl) 0;
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 14px;
  }

  .empty-state svg {
    opacity: 0.3;
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Track list */
  .track-list {
    display: flex;
    flex-direction: column;
  }

  .track-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background 0.12s;
  }

  .track-item:hover {
    background: var(--tune-surface-hover);
  }

  .track-thumb {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .track-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .track-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .track-title {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text);
    min-width: 0;
  }

  .track-meta {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }


  .track-duration {
    font-family: var(--font-label);
    font-size: 12px;
    color: var(--tune-text-muted);
    flex-shrink: 0;
    min-width: 40px;
    text-align: right;
  }

  .action-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.12s, color 0.12s;
    font-family: var(--font-body);
    font-size: 16px;
    font-weight: 600;
  }

  .track-item:hover .action-btn {
    opacity: 0.7;
  }

  .action-btn:hover {
    opacity: 1 !important;
    color: var(--tune-text);
  }

  .remove-btn {
    background: none;
    border: none;
    color: #ef4444;
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.12s;
  }

  .track-item:hover .remove-btn {
    opacity: 0.6;
  }

  .remove-btn:hover {
    opacity: 1 !important;
  }

  /* Albums grid */
  .albums-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--space-lg);
  }

  .album-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    cursor: pointer;
    transition: transform 0.12s;
  }

  .album-card:hover {
    transform: translateY(-2px);
  }

  .album-card-art {
    aspect-ratio: 1;
    background: var(--tune-grey2);
    border-radius: var(--radius-md);
    overflow: hidden;
    position: relative;
  }

  .album-cover-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .play-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s;
    border: none;
    cursor: pointer;
    border-radius: var(--radius-md);
  }

  .album-card:hover .play-overlay {
    opacity: 1;
  }

  .remove-overlay {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 28px;
    height: 28px;
    background: rgba(0, 0, 0, 0.6);
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ef4444;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
    z-index: 2;
  }

  .album-card:hover .remove-overlay {
    opacity: 1;
  }

  /* Provenance badge overlaid on album cover (matches SearchView pattern) */
  .cover-badge {
    position: absolute;
    bottom: 6px;
    left: 6px;
    z-index: 1;
  }

  .album-card-title {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text);
  }

  .album-card-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  /* Artists grid */
  .artists-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: var(--space-lg);
  }

  .artist-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    position: relative;
  }

  .artist-card-avatar {
    width: 100px;
    height: 100px;
    border-radius: 50%;
    background: var(--tune-grey2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    color: var(--tune-text-muted);
    overflow: hidden;
  }

  .artist-card-name {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text);
    text-align: center;
    max-width: 100%;
  }

  .artist-remove-btn {
    position: absolute;
    top: 0;
    right: 10px;
    width: 24px;
    height: 24px;
    background: rgba(0, 0, 0, 0.6);
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ef4444;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .artist-card:hover .artist-remove-btn {
    opacity: 1;
  }

  @media (max-width: 768px) {
    .favorites-view {
      padding: var(--space-md) 16px;
    }

    .favorites-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .favorites-header h2 {
      font-size: 22px;
    }

    .albums-grid {
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    }
  }
</style>
