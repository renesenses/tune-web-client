<script lang="ts">
  import { onMount } from 'svelte';
  import { activeView } from '../lib/stores/navigation';
  import { libraryTab, selectedAlbum, albumTracks, selectedArtist, artistAlbums, libraryLoading } from '../lib/stores/library';
  import { playbackHistory } from '../lib/stores/history';
  import { currentZone, currentZoneId, zones, playAndSync } from '../lib/stores/zones';
  import { currentTrackId } from '../lib/stores/nowPlaying';
  import { playFromHere } from '../lib/playback';
  import { activeStreamingService, pendingStreamingAlbum, streamingServices as streamingServicesStore, streamingAlbumOrigin } from '../lib/stores/streaming';
  import { currentProfileId } from '../lib/stores/profile';
  import { get } from 'svelte/store';
  import { formatDuration, formatNumber } from '../lib/utils';
  import {
    ouvrirAlbum as navigateToAlbum,
    ouvrirArtiste as navigateToArtist,
    ouvrirArtisteParNom as navigateArtistByName,
    ouvrirBibliotheque as goToLibrary,
  } from '../lib/libraryNavigation';
  import { t } from '../lib/i18n';
  // Utilisé plus bas (relance de station, piste introuvable) sans jamais avoir
  // été importé : les deux appels levaient un ReferenceError au moment précis
  // où l'utilisateur avait besoin du message. Repéré par le garde-fou
  // svelte-check ajouté dans cette même PR — troisième occurrence du jour
  // après streamingRef (#1335) et albumWall (onglet Albums en 0.9.62).
  import { notifications } from '../lib/stores/notifications';
  import * as api from '../lib/api';
  import { tuneWS } from '../lib/websocket';
  import AlbumArt from './AlbumArt.svelte';
  import ServiceBadge from './ServiceBadge.svelte';
  import RecommendationsSection from './RecommendationsSection.svelte';
  import type { Album, Track, Source, TopTrack, TopArtist } from '../lib/types';

  let activeStreamingServices = $derived(
    Object.entries($streamingServicesStore)
      .filter(([, s]) => s.enabled && s.authenticated)
      .map(([name]) => name)
  );

  let zone = $derived($currentZone);
  let currentTrack = $derived(zone?.current_track);
  let stats: { tracks: number; albums: number; artists: number } | null = $state(null);

  // Now Listening across zones
  let nowListeningLoaded = $state(true);
  let nowListening = $derived(
    ($zones as any[])
      // Show paused zones too (state !== 'stopped'), so pausing doesn't make
      // the "En cours d'écoute" card vanish and shift the page below it.
      .filter((z: any) => z.state !== 'stopped' && (z.now_playing || z.current_track))
      .map((z: any) => {
        const np = z.now_playing ?? z.current_track ?? {};
        return {
          zone_id: z.id,
          zone_name: z.name,
          track_title: np.title ?? '',
          artist_name: np.artist_name ?? '',
          cover_path: np.cover_path ?? null,
          album_id: np.album_id ?? null,
          state: z.state ?? 'playing',
        };
      })
  );
  let recentAlbums: Album[] = $state([]);
  let recentTab = $state<'played' | 'added'>('played');
  let newInLibrary: Album[] = $state([]);
  let newInLibraryLoaded = $state(false);
  // « Nouveautes de vos artistes ». `null` tant que la reponse n'est pas
  // revenue : la section ne doit pas clignoter au chargement de l'accueil.
  let artistReleases: api.ArtistReleaseGroup[] | null = $state(null);
  // « Autres versions de vos ecoutes du jour ». `null` tant que la reponse
  // n'est pas revenue : la section ne doit pas clignoter au chargement.
  let otherVersions: api.OtherVersionGroup[] | null = $state(null);
  let favoriteAlbums: Album[] = $state([]);
  let favoritesLoaded = $state(false);

  // Recommendations

  // Home API sections
  let continueListening: any[] = $state([]);
  let continueListeningLoaded = $state(false);
  let homeProfile: string = $state('');

  // Dashboard

  function goToZoneNowPlaying(zoneId: number) {
    currentZoneId.set(zoneId);
    activeView.set('nowplaying');
  }

  function greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return $t('home.morning');
    if (h < 18) return $t('home.afternoon');
    return $t('home.evening');
  }

  async function loadStats() {
    try {
      stats = await api.getLibraryStats();
    } catch (e) {
      console.error('Load stats error:', e);
    }
  }

  async function loadRecentAlbums() {
    try {
      recentAlbums = await api.getRecentAlbums(20);
    } catch (e) {
      console.error('Load recent albums error:', e);
    }
  }


  async function playAlbum(albumId: number) {
    if (!zone?.id) return;
    try {
      await playAndSync(zone.id, { album_id: albumId });
    } catch (e) {
      console.error('Play album error:', e);
    }
  }

  // Ouvrir une entrée « Continuer l'écoute » : même résolution que le titre
  // cliquable sous la pochette — l'entrée ne porte pas toujours d'album_id
  // (source streaming, ou piste isolée), il faut alors la retrouver.
  async function openContinueEntry(item: any) {
    if (item.album_id) { navigateToAlbum(item.album_id); return; }
    const q = (item.title ?? item.album_title ?? '').trim();
    if (!q) return;
    const results = await api.searchLibrary(`${q} ${item.artist_name ?? ''}`, 5);
    const match = results.albums?.find((a: any) => a.title?.toLowerCase() === q.toLowerCase());
    if (match?.id) navigateToAlbum(match.id);
  }

  // Lecture d'une entrée « Continuer l'écoute » — ce que faisait la pochette
  // entière jusqu'ici, désormais réservé au bouton de lecture.
  async function playContinueEntry(item: any) {
    if (!zone?.id) return;
    const src = item.source;
    if (src && src !== 'local' && src !== 'radio') {
      const q = `${item.title ?? item.album_title ?? ''} ${item.artist_name ?? ''}`.trim();
      try {
        const results = await api.searchStreaming(src as Source, q, 5);
        const match = results.albums?.find((a: any) => a.title?.toLowerCase() === (item.title ?? item.album_title)?.toLowerCase())
          ?? results.tracks?.[0];
        if (match?.source_id) {
          await playAndSync(zone.id, { source: src as Source, streaming_album_id: match.source_id });
        }
      } catch {}
    } else if (item.album_id) {
      await playAndSync(zone.id, { album_id: item.album_id });
    } else {
      const q = `${item.title ?? item.album_title ?? ''} ${item.artist_name ?? ''}`.trim();
      if (q) {
        const results = await api.searchLibrary(q, 5);
        const match = results.tracks?.find((t: Track) => t.album_id);
        if (match?.album_id) {
          await playAndSync(zone.id, { album_id: match.album_id });
        }
      }
    }
  }



  async function playTrack(trackId: number) {
    if (!zone?.id) return;
    try {
      await playAndSync(zone.id, { track_id: trackId });
    } catch (e) {
      console.error('Play track error:', e);
    }
  }

  interface RecentAlbumEntry {
    id: number | null;
    title: string;
    artist_id?: number | null;
    artist_name: string;
    cover_path?: string | null;
    source?: string | null;
    source_id?: string | null;
    firstTrack: Track;
  }

  async function playRecentEntry(album: RecentAlbumEntry) {
    if (!zone?.id) return;
    try {
      // Radio entries must be replayed as the STATION, never resolved by title:
      // a radio's now-playing carries live ICY metadata (the current song's
      // title/artist), so falling through to a local title search plays an
      // unrelated track (Bilou: clicking a radio history line played
      // "Mother Nature"/"Episode"). Detect radio at album OR firstTrack level.
      const isRadio = album.source === 'radio' || album.firstTrack?.source === 'radio';
      if (isRadio) {
        const radioId = album.firstTrack?.source_id ? parseInt(album.firstTrack.source_id) : NaN;
        if (!isNaN(radioId)) {
          await api.playRadio(radioId, zone.id);
        } else {
          // No station id captured (ICY metadata overwrote it) — send the user
          // to Radios rather than fabricating a wrong local record.
          activeView.set('radios');
          notifications.info($t('home.relaunchStation'));
        }
        return;
      }
      if (album.source && album.source !== 'local' && album.firstTrack.source_id) {
        await playAndSync(zone.id, { source: album.source as Source, source_id: album.firstTrack.source_id });
      } else if (album.source && album.source !== 'local') {
        const q = `${album.firstTrack.title ?? album.title} ${album.firstTrack.artist_name ?? album.artist_name ?? ''}`.trim();
        const results = await api.searchStreaming(album.source as Source, q, 5);
        const match = results.tracks?.find((t: any) =>
          t.title?.toLowerCase() === (album.firstTrack.title ?? album.title)?.toLowerCase()
        );
        if (match?.source_id) {
          await playAndSync(zone.id, { source: album.source as Source, source_id: match.source_id });
        } else {
          notifications.error(`${$t('home.trackNotFoundOn')} ${album.source}`);
        }
      } else if (album.id && (!album.source || album.source === 'local')) {
        await playAndSync(zone.id, { album_id: album.id });
      } else if (album.firstTrack.id) {
        await playAndSync(zone.id, { track_id: album.firstTrack.id });
      } else if (typeof album.firstTrack.file_path === 'string' && /^https?:\/\//.test(album.firstTrack.file_path)) {
        // Stream/URL-backed entry (radio-like) — replay the URL directly rather
        // than searching the local library by title, which matches unrelated tracks.
        await playAndSync(zone.id, { file_path: album.firstTrack.file_path });
      } else {
        // No DB id — try search by title first (more reliable than stale URLs)
        const searchTitle = album.firstTrack.album_title || album.title;
        if (searchTitle) {
          const results = await api.searchLibrary(searchTitle);
          if (results.tracks && results.tracks.length > 0) {
            const match = results.tracks.find((t: Track) => t.album_id);
            if (match?.album_id) {
              await playAndSync(zone.id, { album_id: match.album_id });
              return;
            }
            if (results.tracks[0].id) {
              await playAndSync(zone.id, { track_id: results.tracks[0].id });
              return;
            }
          }
        }
        // Last resort: direct file_path (may be stale for media server URLs)
        if (album.firstTrack.file_path) {
          await playAndSync(zone.id, { file_path: album.firstTrack.file_path });
        }
      }
    } catch (e) {
      console.error('Play recent entry error:', e);
    }
  }

  async function navigateRecentEntry(album: RecentAlbumEntry) {
    if (album.id) {
      navigateToAlbum(album.id);
    } else if (album.source === 'radio') {
      activeView.set('radios');
    } else if (album.source && album.source !== 'local') {
      activeStreamingService.set(album.source);
      // L'historique ne porte que le source_id de la PISTE ; la vue album
      // streaming attend l'id d'ALBUM du service. On le retrouve par recherche
      // (même repli que playRecentEntry) et on arme pendingStreamingAlbum pour
      // que StreamingView ouvre la fiche — sinon on retombe sur le catalogue.
      try {
        const q = `${album.title} ${album.artist_name ?? ''}`.trim();
        const results = await api.searchStreaming(album.source as Source, q, 10);
        const wanted = album.title.toLowerCase();
        const match = results.albums?.find((a: Album) => a.title?.toLowerCase() === wanted)
          ?? results.albums?.find((a: Album) => a.title?.toLowerCase().startsWith(wanted));
        if (match?.source_id) {
          pendingStreamingAlbum.set({ ...match, source: match.source ?? album.source });
        }
      } catch (e) {
        console.error('Resolve streaming album error:', e);
      }
      activeView.set('streaming');
    } else {
      // Search local library to find the album — try album_title first, then album.title
      const candidates = [
        album.firstTrack?.album_title,
        album.title,
        album.firstTrack?.artist_name,
      ].filter(Boolean) as string[];

      for (const query of candidates) {
        try {
          const results = await api.searchLibrary(query);
          // Exact album title match
          const exactTitle = album.firstTrack?.album_title || album.title;
          const match = results.tracks?.find((t: Track) => t.album_id && t.album_title === exactTitle);
          if (match?.album_id) {
            navigateToAlbum(match.album_id);
            return;
          }
          // Album match from results
          const albumMatch = results.albums?.find((a: Album) => a.title === exactTitle);
          if (albumMatch?.id) {
            navigateToAlbum(albumMatch.id);
            return;
          }
          // Fallback: any track with album_id
          const fallback = results.tracks?.find((t: Track) => t.album_id);
          if (fallback?.album_id) {
            navigateToAlbum(fallback.album_id);
            return;
          }
        } catch (e) {
          console.error('Navigate recent entry error:', e);
        }
      }
    }
  }

  function navigateArtist(album: RecentAlbumEntry) {
    if (album.artist_id) {
      navigateToArtist(album.artist_id);
    } else if (album.source && album.source !== 'local') {
      activeView.set('streaming');
    }
  }

  function isPlaying(album: RecentAlbumEntry): boolean {
    if (!currentTrack || !zone || zone.state !== 'playing') return false;
    // La piste en lecture s'identifie par `track_id` dans la charge utile de
    // /zones ; l'ancien `currentTrack.id` n'existe pas et ne matchait jamais.
    if (album.firstTrack.id && $currentTrackId === album.firstTrack.id) return true;
    // Album : NowPlaying ne transporte aucun id d'album (playback/mod.rs), donc
    // l'ancienne comparaison sur `album_id` était morte par construction. On
    // retombe sur titre + artiste — le même repli que playRecentEntry utilise
    // déjà pour retrouver un album dépourvu d'id.
    if (album.title && currentTrack.album_title === album.title
        && (currentTrack.artist_name ?? '') === (album.artist_name ?? '')) return true;
    if (album.firstTrack.source_id && currentTrack.source_id === album.firstTrack.source_id && currentTrack.source === album.source) return true;
    return false;
  }

  // Derive unique recently played albums from history
  // Use a string key to dedupe: "local:{album_id}" or "streaming:{source}:{source_id}"
  let recentlyPlayed = $derived.by(() => {
    const seen = new Set<string>();
    const albums: RecentAlbumEntry[] = [];
    for (const entry of $playbackHistory) {
      const t = entry.track;
      const albumId = t.album_id;
      // Build a dedup key — prefer album_id for local, fallback to source+album_title, file_path, or title
      let key: string | null = null;
      if (albumId) {
        key = `local:${albumId}`;
      } else if (t.source && t.album_title) {
        key = `stream:${t.source}:${t.album_title}`;
      } else if (t.source && t.source_id) {
        key = `stream:${t.source}:${t.source_id}`;
      } else if (t.file_path) {
        key = `url:${t.file_path}`;
      } else if (t.title) {
        key = `title:${t.title}:${t.artist_name ?? ''}`;
      }
      if (!key || seen.has(key)) continue;
      seen.add(key);
      albums.push({
        id: albumId ?? null,
        title: t.album_title ?? t.title,
        artist_id: t.artist_id ?? null,
        artist_name: t.artist_name ?? '',
        cover_path: t.cover_path ?? null,
        source: t.source ?? null,
        source_id: t.source_id ?? null,
        firstTrack: t,
      });
      if (albums.length >= 20) break;
    }
    return albums;
  });

  // Scroll handling for carousel
  let playedCarousel: HTMLElement;
  let addedCarousel: HTMLElement;
  let continueCarousel: HTMLElement;
  let newInLibraryCarousel: HTMLElement;
  let favoritesCarousel: HTMLElement;

  function scrollCarousel(el: HTMLElement, dir: number) {
    el.scrollBy({ left: dir * 600, behavior: 'smooth' });
  }







  async function loadContinueListening() {
    try {
      continueListening = await api.getContinueListening();
      continueListeningLoaded = true;
    } catch (e) {
      console.error('Load continue listening error:', e);
      continueListeningLoaded = true;
    }
  }

  async function loadOtherVersions() {
    try {
      otherVersions = await api.getOtherVersions();
    } catch (e) {
      console.error('Load other versions error:', e);
      // Un echec vaut « rien a montrer » : la section disparait plutot que
      // d'afficher une erreur pour une rubrique secondaire.
      otherVersions = [];
    }
  }

  async function loadArtistReleases() {
    try {
      artistReleases = await api.getArtistReleases();
    } catch (e) {
      console.error('Load artist releases error:', e);
      // Aucun service connecte, ou un service en echec : « rien a montrer »
      // plutot qu'une erreur pour une rubrique secondaire.
      artistReleases = [];
    }
  }

  async function loadNewInLibrary() {
    try {
      newInLibrary = await api.getNewInLibrary();
      newInLibraryLoaded = true;
    } catch (e) {
      console.error('Load new in library error:', e);
      newInLibraryLoaded = true;
    }
  }

  async function loadFavorites() {
    try {
      const pid = get(currentProfileId);
      if (!pid) {
        favoritesLoaded = true;
        return;
      }
      const favs = await api.getFavorites(pid);
      favoriteAlbums = favs.albums ?? [];
      favoritesLoaded = true;
    } catch (e) {
      console.error('Load favorites error:', e);
      favoritesLoaded = true;
    }
  }



  async function loadHomeProfile() {
    try {
      const data = await api.getHomePage();
      if (data && (data as any).profile_name) {
        homeProfile = (data as any).profile_name;
      }
    } catch {
      // Home API may not be available yet, ignore
    }
  }




  // Use onMount (not $effect) to load data exactly once on component
  // creation.  $effect can re-trigger on batch flushes in certain
  // Svelte 5 runtime versions, flooding the server with API calls.
  onMount(() => {
    loadStats();
    loadRecentAlbums();
    loadContinueListening();
    loadNewInLibrary();
    loadOtherVersions();
    loadArtistReleases();
    loadFavorites();
    loadHomeProfile();

    // "Nouveautes" is the one place a user watches after a scan, and it was
    // the one place that never heard about it: the sections stayed as they
    // were until the page was reloaded by hand (Eric, #1393).
    return tuneWS.onEvent((event) => {
      if (event.type === 'library.scan.completed') {
        loadNewInLibrary();
        loadRecentAlbums();
        loadStats();
      }
    });
  });

  /**
   * Ouvrir une parution de « Nouveautés de vos artistes ».
   *
   * La section n'était PAS cliquable : tout y était en div, sans un seul
   * `onclick` ni le moindre bouton (FabienM, point 4 sur la v0.9.102, puis
   * Bertrand sur le .18). On voyait des nouveautés sans pouvoir les ouvrir.
   *
   * ⚠️ Aucun chevron dans les commentaires de ce bloc script : le compilateur
   * Svelte les lit comme des balises et désynchronise tout l'analyseur. Le
   * message d'erreur tombe alors des dizaines de lignes plus bas, sur du code
   * parfaitement valide.
   *
   * Contrairement au bloc « récemment joué » juste au-dessus, aucune recherche
   * n'est nécessaire ici : le serveur renvoie déjà le `source_id` de l'ALBUM,
   * pas celui d'une piste. On arme donc `pendingStreamingAlbum` directement —
   * c'est le store que `StreamingView` consomme à l'ouverture.
   */
  /**
   * Vue « liste » ou « grille » des nouveautés, mémorisée d'un passage à l'autre.
   *
   * La liste tient dans une bande horizontale et convient quand un artiste n'a
   * qu'une ou deux parutions. La grille montre les pochettes en grand — c'est
   * ce qu'on regarde en premier — et encaisse un artiste qui en sort dix.
   * Demandé par Bertrand ; ni l'une ni l'autre n'est bonne dans tous les cas,
   * donc on laisse le choix plutôt que d'en imposer une.
   */
  // ⚠️ Ne PAS passer un type littéral en paramètre générique de $state : le
  // compilateur Svelte lit le chevron ouvrant comme le début d'une balise et
  // rend « Expected a valid element or component name ». On annote la variable
  // à la place. Et pour la même raison, ce commentaire n'écrit aucun chevron —
  // ma première version en contenait, et elle déclenchait le défaut qu'elle
  // décrivait.
  // La préférence survit d'une visite à l'autre. Pas de type littéral en
  // paramètre générique de $state : le compilateur Svelte lit le chevron
  // ouvrant comme une balise. On annote la variable.
  type VueNouveautes = 'liste' | 'grille';
  const vueLue =
    typeof localStorage !== 'undefined'
      ? (localStorage.getItem('tune.home.artistReleasesView') as VueNouveautes | null)
      : null;
  let vueNouveautes: VueNouveautes = $state(vueLue === 'grille' ? 'grille' : 'liste');

  function basculerVueNouveautes() {
    vueNouveautes = vueNouveautes === 'liste' ? 'grille' : 'liste';
    try {
      localStorage.setItem('tune.home.artistReleasesView', vueNouveautes);
    } catch (_e) {
      // Mode privé : la préférence ne survit pas, l'affichage marche quand même.
    }
  }

  // ── Tri des nouveautés ──
  // Le serveur ne fournit que l'ANNÉE d'une parution : « date de sortie »
  // se trie donc à l'année près. « Pertinence » = l'ordre du serveur
  // (favoris d'abord, puis récence).
  type TriNouveautes = 'pertinence' | 'artiste' | 'annee';
  const triLu =
    typeof localStorage !== 'undefined'
      ? (localStorage.getItem('tune.home.artistReleasesSort') as TriNouveautes | null)
      : null;
  let triNouveautes: TriNouveautes = $state(
    triLu === 'artiste' || triLu === 'annee' ? triLu : 'pertinence'
  );
  function retenirTriNouveautes() {
    try {
      localStorage.setItem('tune.home.artistReleasesSort', triNouveautes);
    } catch (_e) {
      // Mode privé : la préférence ne survit pas, l'affichage marche quand même.
    }
  }
  function anneeDuGroupe(g: api.ArtistReleaseGroup): number {
    return g.releases.reduce((max, r) => Math.max(max, r.year ?? 0), 0);
  }
  const groupesTries = $derived.by(() => {
    const gs = artistReleases ?? [];
    if (triNouveautes === 'artiste') {
      return [...gs].sort((a, b) => a.artist_name.localeCompare(b.artist_name));
    }
    if (triNouveautes === 'annee') {
      return [...gs].sort((a, b) => anneeDuGroupe(b) - anneeDuGroupe(a));
    }
    return gs;
  });
  const parutionsTriees = $derived.by(() => {
    const plates = (artistReleases ?? []).flatMap((groupe) =>
      groupe.releases.map((parution) => ({ groupe, parution }))
    );
    if (triNouveautes === 'artiste') {
      return plates.sort(
        (a, b) =>
          a.groupe.artist_name.localeCompare(b.groupe.artist_name) ||
          (b.parution.year ?? 0) - (a.parution.year ?? 0)
      );
    }
    if (triNouveautes === 'annee') {
      return plates.sort(
        (a, b) =>
          (b.parution.year ?? 0) - (a.parution.year ?? 0) ||
          a.groupe.artist_name.localeCompare(b.groupe.artist_name)
      );
    }
    return plates;
  });

  function ouvrirVersionStreaming(v: {
    service: string;
    source_id?: string | null;
    album_id?: string | null;
    album_title?: string | null;
    title: string;
    artist_name?: string | null;
    cover_path?: string | null;
    url?: string | null;
  }) {
    // Bandcamp n'a pas de fiche album dans Tune : on ouvre la page publique.
    if (v.service === 'bandcamp') {
      if (v.url) window.open(v.url, '_blank', 'noopener');
      return;
    }
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
    streamingAlbumOrigin.set('home');
    activeView.set('streaming');
  }

  function ouvrirParution(groupe: any, parution: any) {
    if (!parution?.service || !parution?.source_id) return;
    activeStreamingService.set(parution.service);
    pendingStreamingAlbum.set({
      id: parution.source_id,
      source_id: parution.source_id,
      source: parution.service,
      title: parution.title,
      artist_name: groupe?.artist_name ?? null,
      cover_path: parution.cover_path ?? null,
      year: parution.year ?? null,
    } as any);
    streamingAlbumOrigin.set('home');
    activeView.set('streaming');
  }
</script>

<div class="home-view">
  <div class="home-title-row">
    <h1 class="greeting">{greeting()}{#if homeProfile}, {homeProfile}{/if}</h1>
  </div>

  <!-- Now Listening across zones -->
  {#if nowListeningLoaded && nowListening.length > 0}
    <div class="now-listening-section">
      <h2 class="section-title">{$t('home.nowListening')}</h2>
      <div class="now-listening-row">
        {#each nowListening as item}
          <button class="nl-card" onclick={() => goToZoneNowPlaying(item.zone_id)}>
            <div class="nl-cover">
              <AlbumArt coverPath={item.cover_path} albumId={item.album_id} size={48} alt={item.track_title ?? ''} />
            </div>
            <div class="nl-info">
              <span class="nl-zone">{item.zone_name}</span>
              <span class="nl-track truncate">{item.track_title ?? item.title ?? ''}</span>
              <span class="nl-artist truncate">{item.artist_name ?? ''}</span>
            </div>
            <span class="nl-playing-indicator">
              <span class="eq-bars" class:paused={item.state === 'paused'}><span></span><span></span><span></span></span>
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Continue Listening (from home API) -->
  {#if continueListeningLoaded && continueListening.length > 0}
    <div class="top-section">
      <h2 class="section-title">{$t('home.continueListening')}</h2>
      <div class="carousel-wrapper">
        <button class="carousel-arrow left" onclick={() => scrollCarousel(continueCarousel, -1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div class="carousel carousel-scrollable" bind:this={continueCarousel}>
          {#each continueListening as item}
            <div class="carousel-card">
              <div class="carousel-cover-wrap">
                <button class="carousel-cover" type="button" onclick={() => openContinueEntry(item)}
                        title={$t('home.openAlbum')} aria-label={$t('home.openAlbum')}>
                  <AlbumArt coverPath={item.cover_path} albumId={item.album_id ?? item.id} size={160} alt={item.title ?? item.album_title ?? ''} />
                </button>
                <button class="play-badge" type="button" onclick={() => playContinueEntry(item)}
                        title={$t('library.playAlbum')} aria-label={$t('library.playAlbum')}>
                  <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8 5v14l11-7z" /></svg>
                </button>
              </div>
              <button class="carousel-title truncate" type="button" onclick={() => openContinueEntry(item)}>{item.title ?? item.album_title ?? ''}</button>
              <button class="carousel-artist truncate" type="button" onclick={() => {
                if (item.artist_name) navigateArtistByName(item.artist_name);
              }}>{item.artist_name ?? ''}</button>
              {#if item.progress_percent != null}
                <div class="continue-progress">
                  <div class="continue-progress-bar" style="width: {item.progress_percent}%"></div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
        <button class="carousel-arrow right" onclick={() => scrollCarousel(continueCarousel, 1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
    </div>
  {/if}

  <!-- Nouveautés de vos artistes -->
  {#if artistReleases && artistReleases.length > 0}
    <div class="recent-section">
      <div class="artist-releases-head">
        <h2 class="section-title">{$t('home.artistReleases')}</h2>
        <select
          class="tri-nouveautes"
          bind:value={triNouveautes}
          onchange={retenirTriNouveautes}
          title={$t('home.sortReleases')}
          aria-label={$t('home.sortReleases')}
        >
          <option value="pertinence">{$t('home.sortRelevance')}</option>
          <option value="artiste">{$t('home.sortArtist')}</option>
          <option value="annee">{$t('home.sortYear')}</option>
        </select>
        <button
          class="vue-toggle"
          onclick={basculerVueNouveautes}
          title={vueNouveautes === 'liste' ? $t('home.gridView') : $t('home.listView')}
          aria-label={vueNouveautes === 'liste' ? $t('home.gridView') : $t('home.listView')}
        >
          {#if vueNouveautes === 'liste'}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
          {/if}
        </button>
      </div>
      {#if vueNouveautes === 'grille'}
        <!-- La grille est PLATE, comme Bibliothèque / Albums : toutes les
             pochettes à la même taille, artistes mélangés (Bertrand, 25/08).
             Le regroupement par artiste n'existe qu'en vue liste. -->
        <div class="nouveautes-grille">
          {#each parutionsTriees as { groupe, parution }}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="nouveaute-carte"
                onclick={() => ouvrirParution(groupe, parution)}
                title={$t('home.openAlbum')}
              >
                <div class="nouveaute-carte-art">
                  <!-- Pas de `size` : le mode `fill` d'AlbumArt épouse la case.
                       Un `size` fixe pose un style inline de 200 px que le CSS
                       ne peut pas battre — les pochettes débordaient sur leurs
                       voisines (captures du 25/08). -->
                  <AlbumArt coverPath={parution.cover_path} alt={parution.title} />
                </div>
                <span class="nouveaute-carte-titre truncate" title={parution.title}>{parution.title}</span>
                <button
                  class="nouveaute-carte-artiste truncate"
                  onclick={(e) => { e.stopPropagation(); navigateArtistByName(groupe.artist_name); }}
                  title={$t('home.openArtist')}
                >{groupe.artist_name}</button>
                <span class="nouveaute-carte-sub">
                  <ServiceBadge source={parution.service} compact />
                  {#if parution.year}<span class="artist-release-year">{parution.year}</span>{/if}
                </span>
              </div>
          {/each}
        </div>
      {:else}
      <div class="artist-releases">
        {#each groupesTries as groupe}
          <div class="artist-group" class:favorite={groupe.is_favorite}>
            <div class="artist-group-head">
              <div class="artist-group-name truncate">
                <button
                  class="artist-group-link"
                  onclick={() => navigateArtistByName(groupe.artist_name)}
                  title={$t('home.openArtist')}
                >{groupe.artist_name}</button>
                <span class="artist-count">
                  {groupe.releases.length} {$t('home.newReleases')}
                </span>
              </div>
              <!--
                Le « pourquoi » de la maquette, en une ligne et sans inventer :
                le serveur ne renvoie que ce qu'il sait — favori, et nombre
                d'albums possédés. Une phrase plus riche demanderait des
                données qu'on n'a pas.
              -->
              <div class="artist-group-why">
                {#if groupe.is_favorite}{$t('home.inYourFavorites')}{/if}
                {#if groupe.is_favorite && groupe.library_albums > 0} · {/if}
                {#if groupe.library_albums > 0}
                  {groupe.library_albums} {$t('common.albums').toLowerCase()}
                {/if}
              </div>
            </div>
            <div class="artist-releases-row">
              {#each groupe.releases as parution}
                <button
                  class="artist-release"
                  onclick={() => ouvrirParution(groupe, parution)}
                  title={$t('home.openAlbum')}
                >
                  <AlbumArt coverPath={parution.cover_path} size={72} alt={parution.title} />
                  <div class="artist-release-text">
                    <div class="artist-release-title truncate">{parution.title}</div>
                    <div class="artist-release-sub">
                      <ServiceBadge source={parution.service} compact />
                      {#if parution.year}<span class="artist-release-year">{parution.year}</span>{/if}
                    </div>
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
      {/if}
    </div>
  {/if}

  <!-- Stats cards -->
  {#if stats}
    <div class="stats-cards">
      <button class="stat-card" onclick={() => goToLibrary('albums')}>
        <span class="stat-number">{formatNumber(stats.albums)}</span>
        <span class="stat-name">{$t('common.albums')}</span>
      </button>
      <button class="stat-card" onclick={() => goToLibrary('artists')}>
        <span class="stat-number">{formatNumber(stats.artists)}</span>
        <span class="stat-name">{$t('common.artists')}</span>
      </button>
      <button class="stat-card" onclick={() => goToLibrary('tracks')}>
        <span class="stat-number">{formatNumber(stats.tracks)}</span>
        <span class="stat-name">{$t('home.tracks')}</span>
      </button>
      {#if (stats as any).listens > 0}
        <button class="stat-card" onclick={() => activeView.set('dashboard')}>
          <span class="stat-number">{formatNumber((stats as any).listens)}</span>
          <span class="stat-name">{$t('home.listens')}</span>
        </button>
      {/if}
      {#if (stats as any).total_duration_ms > 0}
        <button class="stat-card" onclick={() => activeView.set('dashboard')}>
          <span class="stat-number">{Math.round((stats as any).total_duration_ms / 3600000)}h</span>
          <span class="stat-name">{$t('home.libraryDuration')}</span>
        </button>
      {/if}
    </div>
  {/if}

  <!-- Recently section -->
  <div class="recent-section">
    <div class="recent-tabs">
      <button class="recent-tab" class:active={recentTab === 'played'} onclick={() => recentTab = 'played'}>
        {$t('home.recentlyPlayed')}
      </button>
      <button class="recent-tab" class:active={recentTab === 'added'} onclick={() => recentTab = 'added'}>
        {$t('home.recentlyAdded')}
      </button>
    </div>

    {#if recentTab === 'played'}
      {#if recentlyPlayed.length > 0}
        <div class="carousel-wrapper">
          <button class="carousel-arrow left" onclick={() => scrollCarousel(playedCarousel, -1)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div class="carousel" bind:this={playedCarousel}>
            {#each recentlyPlayed as album}
              <div class="carousel-card" class:now-playing={isPlaying(album)}>
                <button class="carousel-cover" onclick={() => playRecentEntry(album)}>
                  <AlbumArt coverPath={album.cover_path} albumId={album.id} size={160} alt={album.title} />
                  {#if isPlaying(album)}
                    <span class="play-overlay playing">
                      <span class="eq-bars"><span></span><span></span><span></span></span>
                    </span>
                  {:else}
                    <span class="play-overlay"><svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5v14l11-7z" /></svg></span>
                  {/if}
                </button>
                <button class="carousel-title truncate" onclick={() => navigateRecentEntry(album)}>{album.title}</button>
                <span class="carousel-artist-row"><button class="carousel-artist truncate" onclick={() => navigateArtist(album)}>{album.artist_name}</button><ServiceBadge source={album.source} compact /></span>
              </div>
            {/each}
          </div>
          <button class="carousel-arrow right" onclick={() => scrollCarousel(playedCarousel, 1)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      {:else}
        <div class="empty-state-card">
          <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
          <p class="empty-state-hint">{$t('home.emptyState.hint')}</p>
          <div class="empty-state-links">
            <button class="empty-state-btn" onclick={() => goToLibrary('albums')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              {$t('home.emptyState.browseLibrary')}
            </button>
            <button class="empty-state-btn" onclick={() => activeView.set('radios')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5"/></svg>
              {$t('home.emptyState.discoverRadios')}
            </button>
            {#each activeStreamingServices as svc}
              <button class="empty-state-btn" onclick={() => { activeStreamingService.set(svc); activeView.set('streaming'); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                {$t('home.explore')} {svc.charAt(0).toUpperCase() + svc.slice(1)}
              </button>
            {/each}
          </div>
          {#if stats}
            <div class="empty-state-stats">
              <span class="empty-stat"><strong>{formatNumber(stats.albums)}</strong> {$t('common.albums')}</span>
              <span class="empty-stat-sep">·</span>
              <span class="empty-stat"><strong>{formatNumber(stats.artists)}</strong> {$t('common.artists')}</span>
              <span class="empty-stat-sep">·</span>
              <span class="empty-stat"><strong>{formatNumber(stats.tracks)}</strong> {$t('home.tracks').toLowerCase()}</span>
            </div>
          {/if}
        </div>
      {/if}

    {:else}
      {#if recentAlbums.length > 0}
        <div class="carousel-wrapper">
          <button class="carousel-arrow left" onclick={() => scrollCarousel(addedCarousel, -1)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div class="carousel" bind:this={addedCarousel}>
            {#each recentAlbums as album}
              <div class="carousel-card">
                <button class="carousel-cover" onclick={() => album.id && playAlbum(album.id)}>
                  <AlbumArt coverPath={album.cover_path} size={160} alt={album.title} />
                  <span class="play-overlay"><svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5v14l11-7z" /></svg></span>
                </button>
                {#if album.id}
                  <button class="carousel-title truncate" onclick={() => navigateToAlbum(album.id!)}>{album.title}</button>
                {:else}
                  <span class="carousel-title truncate">{album.title}</span>
                {/if}
                {#if album.artist_id}
                  <button class="carousel-artist truncate" onclick={() => navigateToArtist(album.artist_id!)}>{album.artist_name ?? ''}</button>
                {:else}
                  <span class="carousel-artist truncate">{album.artist_name ?? ''}</span>
                {/if}
              </div>
            {/each}
          </div>
          <button class="carousel-arrow right" onclick={() => scrollCarousel(addedCarousel, 1)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      {:else}
        <p class="empty-recent">{$t('home.noAlbums')}</p>
      {/if}
    {/if}
  </div>

  <!-- New in your library -->
  {#if newInLibraryLoaded && newInLibrary.length > 0}
    <div class="recent-section">
      <h2 class="section-title">{$t('home.newInLibrary')}</h2>
      <div class="carousel-wrapper">
        <button class="carousel-arrow left" onclick={() => scrollCarousel(newInLibraryCarousel, -1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div class="carousel" bind:this={newInLibraryCarousel}>
          {#each newInLibrary as album}
            <div class="carousel-card">
              <button class="carousel-cover" onclick={() => album.id && playAlbum(album.id)}>
                <AlbumArt coverPath={album.cover_path} albumId={album.id} size={160} alt={album.title} />
                <span class="play-overlay"><svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5v14l11-7z" /></svg></span>
              </button>
              {#if album.id}
                <button class="carousel-title truncate" onclick={() => navigateToAlbum(album.id!)}>{album.title}</button>
              {:else}
                <span class="carousel-title truncate">{album.title}</span>
              {/if}
              <span class="carousel-artist-row">
                {#if album.artist_id}
                  <button class="carousel-artist truncate" onclick={() => navigateToArtist(album.artist_id!)}>{album.artist_name ?? ''}</button>
                {:else}
                  <span class="carousel-artist truncate">{album.artist_name ?? ''}</span>
                {/if}
                <ServiceBadge source={album.source} compact />
              </span>
            </div>
          {/each}
        </div>
        <button class="carousel-arrow right" onclick={() => scrollCarousel(newInLibraryCarousel, 1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
    </div>
  {/if}

  <!-- Autres versions de vos écoutes du jour -->
  <!--
    La section n'existe que si elle a quelque chose à dire : `otherVersions`
    vaut `null` tant que la réponse n'est pas revenue, et un tableau vide
    quand il n'y a rien. Aucun des deux ne doit dessiner un cadre creux — mais
    aucun des deux ne doit non plus faire clignoter la page au chargement,
    d'où les deux états distincts plutôt qu'un simple `.length`.
  -->
  {#if otherVersions && otherVersions.length > 0}
    <div class="recent-section">
      <h2 class="section-title">{$t('home.otherVersions')}</h2>
      <div class="versions-list">
        {#each otherVersions as groupe}
          {@const reprises = (groupe.streaming ?? []).filter((v) => v.kind === 'reprise')}
          {@const versionsStreaming = (groupe.streaming ?? []).filter((v) => v.kind === 'version')}
          <div class="version-group">
            <div class="version-head">
              <div class="version-head-text">
                <div class="version-title truncate">{groupe.title}</div>
                <div class="version-sub truncate">
                  {groupe.artist_name}
                  <span class="version-played-from">· {$t('home.playedToday')} : {groupe.played_album}</span>
                </div>
              </div>
            </div>
            <div class="version-tuiles">
              {#each groupe.versions as v}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="version-tuile" onclick={() => v.album_id && navigateToAlbum(v.album_id)}>
                  <div class="version-tuile-art">
                    <AlbumArt coverPath={v.cover_path} alt={v.album_title ?? ''} />
                  </div>
                  <span class="version-tuile-titre truncate">{v.album_title ?? ''}</span>
                  <span class="version-tuile-sub">
                    {#if v.duration_ms}<span>{formatDuration(v.duration_ms)}</span>{/if}
                  </span>
                </div>
              {/each}
              {#each versionsStreaming as v}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="version-tuile" onclick={() => ouvrirVersionStreaming(v)}>
                  <div class="version-tuile-art">
                    <AlbumArt coverPath={v.cover_path} alt={v.album_title ?? v.title} />
                  </div>
                  <span class="version-tuile-titre truncate">{v.album_title ?? v.title}</span>
                  <span class="version-tuile-sub">
                    <ServiceBadge source={v.service} compact />
                  </span>
                </div>
              {/each}
              {#each reprises as v}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="version-tuile reprise" onclick={() => ouvrirVersionStreaming(v)}>
                  <div class="version-tuile-art">
                    <AlbumArt coverPath={v.cover_path} alt={v.title} />
                    <span class="reprise-chip">{$t('home.coverVersion')}</span>
                  </div>
                  <span class="version-tuile-titre truncate">{v.artist_name}</span>
                  <span class="version-tuile-sub">
                    <ServiceBadge source={v.service} compact />
                    <span class="truncate">{v.album_title ?? ''}</span>
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Your favorites -->
  {#if favoritesLoaded && favoriteAlbums.length > 0}
    <div class="recent-section">
      <h2 class="section-title">{$t('home.yourFavorites')}</h2>
      <div class="carousel-wrapper">
        <button class="carousel-arrow left" onclick={() => scrollCarousel(favoritesCarousel, -1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div class="carousel" bind:this={favoritesCarousel}>
          {#each favoriteAlbums as album}
            <div class="carousel-card">
              <button class="carousel-cover" onclick={() => album.id && playAlbum(album.id)}>
                <AlbumArt coverPath={album.cover_path} albumId={album.id} size={160} alt={album.title} />
                <span class="play-overlay"><svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5v14l11-7z" /></svg></span>
              </button>
              {#if album.id}
                <button class="carousel-title truncate" onclick={() => navigateToAlbum(album.id!)}>{album.title}</button>
              {:else}
                <span class="carousel-title truncate">{album.title}</span>
              {/if}
              <span class="carousel-artist-row">
                {#if album.artist_id}
                  <button class="carousel-artist truncate" onclick={() => navigateToArtist(album.artist_id!)}>{album.artist_name ?? ''}</button>
                {:else}
                  <span class="carousel-artist truncate">{album.artist_name ?? ''}</span>
                {/if}
                <ServiceBadge source={album.source} compact />
              </span>
            </div>
          {/each}
        </div>
        <button class="carousel-arrow right" onclick={() => scrollCarousel(favoritesCarousel, 1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
    </div>
  {/if}

  <!-- Recommandations — EN BAS : une invitation a decouvrir, apres avoir
       parcouru ce qu'on possede deja. Elle etait partie dans le Tableau de bord
       avec les classements, mais elle n'a pas leur nature : un classement se
       date et gagne au selecteur de periode, une recommandation non
       (Bertrand, 24/08/2026). -->
  <RecommendationsSection />

</div>

<style>
  .home-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-xl) 32px;
    padding-bottom: calc(var(--space-xl) + 24px);
    overflow-y: auto;
    gap: var(--space-xl);
  }

  .greeting {
    font-family: var(--font-display);
    font-size: 42px;
    font-weight: 600;
    color: var(--tune-text);
    line-height: 1.1;
  }

  .stats-cards {
    display: flex;
    gap: var(--space-md);
  }

  .stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-lg) var(--space-xl);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.15s ease-out;
    flex: 1;
    min-width: 120px;
    color: var(--tune-text);
  }

  .stat-card:hover {
    border-color: var(--tune-accent);
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .stat-number {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 700;
  }

  .stat-name {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
  }

  .recent-section {
    flex: 1;
  }

  .recent-tabs {
    display: flex;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }

  .recent-tab {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    padding: var(--space-xs) 0;
    border-bottom: 2px solid transparent;
    transition: all 0.12s;
  }

  .recent-tab.active {
    color: var(--tune-accent);
    border-bottom-color: var(--tune-accent);
  }

  .recent-tab:hover {
    color: var(--tune-text);
  }

  .carousel-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .carousel {
    display: flex;
    gap: var(--space-md);
    overflow-x: auto;
    scroll-behavior: smooth;
    padding: var(--space-sm) 0;
    flex: 1;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .carousel::-webkit-scrollbar {
    display: none;
  }

  .carousel-scrollable {
    scrollbar-width: thin;
    scrollbar-color: var(--tune-text-muted) transparent;
  }
  .carousel-scrollable::-webkit-scrollbar {
    display: block;
    height: 4px;
  }
  .carousel-scrollable::-webkit-scrollbar-thumb {
    background: var(--tune-text-muted);
    border-radius: 2px;
  }

  .carousel-arrow {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--tune-text-secondary);
    flex-shrink: 0;
    transition: all 0.12s;
    z-index: 1;
  }

  .carousel-arrow:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .carousel-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    text-align: left;
    padding: 0;
    color: var(--tune-text);
    flex-shrink: 0;
    width: 160px;
  }

  .carousel-cover {
    position: relative;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .carousel-cover:hover .play-overlay {
    opacity: 1;
  }

  /* Cliquer la pochette OUVRE l'album ; seul ce bouton lance la lecture.
     Avant, l'« icône Play » couvrait toute la pochette (inset: 0) : il n'y
     avait aucune zone distincte, et le moindre clic sur l'image lançait la
     lecture alors qu'on voulait voir les titres (Fabien, 11/08/2026). */
  .carousel-cover-wrap { position: relative; display: block; line-height: 0; }
  .play-badge {
    position: absolute;
    right: 8px;
    bottom: 8px;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 50%;
    background: var(--tune-accent);
    color: #fff;
    cursor: pointer;
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 0.15s, transform 0.15s;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
  }
  .carousel-cover-wrap:hover .play-badge,
  .play-badge:focus-visible { opacity: 1; transform: none; }
  /* Tactile : rien ne survole, le bouton doit rester visible en permanence. */
  @media (hover: none) {
    .play-badge { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .play-badge { transition: none; }
  }

  .play-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    color: white;
    opacity: 0;
    transition: opacity 0.15s;
    border-radius: var(--radius-sm);
  }

  .play-overlay.playing {
    opacity: 1;
    background: rgba(0, 0, 0, 0.5);
  }

  .now-playing .carousel-title {
    color: var(--tune-accent) !important;
  }

  .eq-bars {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 20px;
  }

  .eq-bars span {
    display: block;
    width: 4px;
    background: var(--tune-accent);
    border-radius: 1px;
    animation: eq-bounce 0.8s ease-in-out infinite alternate;
  }

  .eq-bars span:nth-child(1) { height: 60%; animation-delay: 0s; }
  .eq-bars span:nth-child(2) { height: 100%; animation-delay: 0.2s; }
  .eq-bars span:nth-child(3) { height: 40%; animation-delay: 0.4s; }

  /* Paused zone: bars stop bouncing and sit flat (Elie). */
  .eq-bars.paused span {
    animation: none;
    height: 30%;
    transform: none;
    opacity: 0.6;
  }

  @keyframes eq-bounce {
    0% { transform: scaleY(0.3); }
    100% { transform: scaleY(1); }
  }

  button.carousel-title,
  button.carousel-artist {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }

  button.carousel-title:hover {
    color: var(--tune-accent);
  }

  button.carousel-artist:hover {
    color: var(--tune-accent);
  }

  .carousel-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    max-width: 160px;
    color: var(--tune-text);
  }

  .carousel-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    max-width: 160px;
  }

  .empty-recent {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
    padding: var(--space-lg);
    text-align: center;
  }

  /* Top sections */
  .top-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .versions-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .version-group {
    background: var(--surface, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--border, rgba(128, 128, 128, 0.2));
    border-radius: 8px;
    padding: 0.7rem 0.8rem;
  }
  .version-head { display: flex; align-items: center; gap: 0.7rem; }
  /* `min-width: 0` : sans lui, `truncate` ne tronque pas dans un flex — le
     texte pousse le conteneur au lieu de se couper. */
  .version-head-text { min-width: 0; }
  .version-title { font-size: 0.9rem; font-weight: 600; }
  .version-sub { font-size: 0.78rem; opacity: 0.65; }
  .version-played-from { opacity: 0.8; }
  /* La MÊME grille que Bibliothèque / Albums, comme pour les nouveautés
     (Bertrand, 25/08 : « là aussi, une grille idem library / Album »). */
  .version-tuiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    grid-auto-rows: min-content;
    gap: var(--space-lg, 1rem);
    align-items: start;
    margin-top: 0.6rem;
  }
  .version-tuile {
    display: flex; flex-direction: column; gap: 0.3rem;
    cursor: pointer; min-width: 0;
  }
  .version-tuile-art { position: relative; width: 100%; }
  .version-tuile-titre {
    font-size: 0.85rem; font-weight: 600; color: var(--text-primary);
  }
  .version-tuile-sub {
    display: flex; align-items: center; gap: 0.35rem;
    font-size: 0.75rem; color: var(--text-secondary); min-width: 0;
  }
  .reprise-chip {
    position: absolute; top: 6px; left: 6px;
    font-size: 0.62rem; font-weight: 700; letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 0.1rem 0.4rem; border-radius: 4px;
    background: rgba(0, 0, 0, 0.65); color: #fff;
  }

  .artist-releases { display: flex; flex-direction: column; gap: 0.5rem; }
  .artist-group {
    background: var(--surface, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--border, rgba(128, 128, 128, 0.2));
    border-radius: 8px;
    padding: 0.7rem 0.8rem;
  }
  /* Un favori se distingue par une bordure, pas par une couleur de fond :
     le fond porte deja l'etat « en cours de lecture » ailleurs sur l'accueil. */
  .artist-group.favorite { border-color: rgba(212, 160, 23, 0.45); }
  .artist-group-head { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; }
  .artist-group-name { font-size: 0.95rem; font-weight: 600; min-width: 0; }
  .artist-count {
    font-size: 0.66rem; font-weight: 700; letter-spacing: 0.06em;
    text-transform: uppercase; opacity: 0.75; margin-left: 0.4rem;
  }
  .artist-group-why { font-size: 0.78rem; opacity: 0.6; margin-left: auto; }
  .artist-releases-head {
    display: flex; align-items: center; justify-content: space-between; gap: 0.8rem;
  }
  .vue-toggle {
    display: inline-flex; align-items: center; justify-content: center;
    background: none; border: 1px solid var(--tune-border, rgba(128,128,128,0.3));
    border-radius: 6px; padding: 0.3rem; cursor: pointer;
    color: var(--tune-text-secondary); transition: color 0.12s, border-color 0.12s;
  }
  .vue-toggle:hover { color: var(--tune-accent); border-color: var(--tune-accent); }
  .vue-toggle:focus-visible { outline: 2px solid var(--tune-accent); outline-offset: 2px; }

  /* GRILLE — la pochette passe au-dessus et prend toute la largeur de la case.
     `auto-fill` pour que la même vue tienne sur un portable et sur un écran de
     salon, comme la grille Bandcamp dont elle reprend la mesure. */
  /* Grille PLATE, calquée sur Bibliothèque / Albums : mêmes colonnes, mêmes
     proportions. Les artistes se mélangent — c'est voulu (Bertrand, 25/08). */
  .nouveautes-grille {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    grid-auto-rows: min-content;
    gap: var(--space-lg, 1rem);
    align-items: start;
    margin-top: 0.6rem;
  }
  .nouveaute-carte {
    display: flex; flex-direction: column; gap: 0.3rem;
    cursor: pointer; min-width: 0;
  }
  .nouveaute-carte-art { width: 100%; }
  .nouveaute-carte-titre {
    font-size: 0.85rem; font-weight: 600; color: var(--text-primary);
  }
  .nouveaute-carte-artiste {
    background: none; border: none; padding: 0; text-align: left;
    font: inherit; font-size: 0.8rem; color: var(--text-secondary);
    cursor: pointer; min-width: 0;
  }
  .nouveaute-carte-artiste:hover { color: var(--text-primary); text-decoration: underline; }
  .tri-nouveautes {
    margin-left: auto;
    background: var(--bg-secondary, rgba(255, 255, 255, 0.06));
    color: var(--text-secondary);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    border-radius: 6px;
    font: inherit; font-size: 0.78rem;
    padding: 0.2rem 0.4rem;
    cursor: pointer;
  }
  .tri-nouveautes:hover { color: var(--text-primary); }

  .nouveaute-carte-sub {
    display: flex; align-items: center; gap: 0.35rem;
    font-size: 0.75rem; color: var(--text-secondary);
  }

  .artist-releases-row {
    display: flex; gap: 0.8rem; margin-top: 0.6rem;
    overflow-x: auto; padding-bottom: 0.2rem;
  }
  /* `.artist-release` et `.artist-group-link` sont des <button> depuis qu'on
     peut enfin les ouvrir : sans cette remise à zéro, le navigateur y colle sa
     bordure, son fond et sa police. Le survol et le focus sont explicites —
     une zone cliquable qui ne le montre pas ne vaut guère mieux qu'un <div>. */
  .artist-release {
    display: flex; align-items: center; gap: 0.6rem; min-width: 0;
    background: none; border: 0; padding: 0; margin: 0;
    font: inherit; color: inherit; text-align: left; cursor: pointer;
    border-radius: 6px; transition: opacity 0.12s;
  }
  .artist-release:hover .artist-release-title { color: var(--tune-accent); }
  .artist-release:focus-visible,
  .artist-group-link:focus-visible {
    outline: 2px solid var(--tune-accent); outline-offset: 2px;
  }

  .artist-group-link {
    background: none; border: 0; padding: 0; margin: 0;
    font: inherit; color: inherit; cursor: pointer;
    border-radius: 4px; transition: color 0.12s;
  }
  .artist-group-link:hover { color: var(--tune-accent); }
  .artist-release-text { min-width: 0; }
  .artist-release-title { font-size: 0.82rem; max-width: 14rem; }
  .artist-release-sub { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.2rem; }
  .artist-release-year { font-size: 0.74rem; opacity: 0.55; font-variant-numeric: tabular-nums; }

  .section-title {
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text);
    margin: 0;
  }

  @media (max-width: 768px) {
    .top-tracks-list { font-size: 12px; }
    .artist-card { padding: var(--space-xs) var(--space-sm); }
  }

  @media (max-width: 600px) {
    .dash-stats { grid-template-columns: repeat(2, 1fr); }
  }

  /* Continue Listening progress bar */
  .continue-progress {
    width: 100%;
    height: 3px;
    background: var(--tune-border);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 4px;
  }

  .continue-progress-bar {
    height: 100%;
    background: var(--tune-accent);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  /* Now Listening */
  .now-listening-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .now-listening-row {
    display: flex;
    gap: var(--space-md);
    overflow-x: auto;
    padding: var(--space-xs) 0;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .now-listening-row::-webkit-scrollbar { display: none; }

  .nl-card {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    flex-shrink: 0;
    min-width: 220px;
    max-width: 320px;
    cursor: pointer;
    transition: all 0.15s ease-out;
    color: var(--tune-text);
    text-align: left;
  }

  .nl-card:hover {
    border-color: var(--tune-accent);
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .nl-cover {
    flex-shrink: 0;
  }

  .nl-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }

  .nl-zone {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tune-accent);
  }

  .nl-track {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text);
  }

  .nl-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }

  .nl-playing-indicator {
    flex-shrink: 0;
  }

  /* Empty state card (no listening history) */
  .empty-state-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-xl) var(--space-lg);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    text-align: center;
    color: var(--tune-text-secondary);
  }

  .empty-state-icon {
    opacity: 0.3;
    color: var(--tune-text-muted);
  }

  .empty-state-hint {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
    margin: 0;
  }

  .empty-state-links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    justify-content: center;
  }

  .empty-state-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.12s ease-out;
  }

  .empty-state-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
    transform: translateY(-1px);
  }

  .empty-state-stats {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    margin-top: var(--space-sm);
  }

  .empty-stat strong {
    color: var(--tune-text);
    font-weight: 600;
  }

  .empty-stat-sep {
    opacity: 0.4;
  }
</style>
