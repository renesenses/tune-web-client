/**
 * Les GESTES des menus d'objets — une seule implémentation pour tous les écrans.
 *
 * `lib/actionsPochette` décide QUELLES entrées un objet reçoit ; ce module dit
 * COMMENT chacune se fait, à partir de l'objet seul. C'est la moitié qui
 * manquait à la parité : tant que chaque écran fournissait ses gestes, le même
 * album avait quatre menus différents selon l'écran qui le montrait (mesuré le
 * 26/09/2026, voir `actionsPochette`). Ici, l'écran ne donne que l'OBJET.
 *
 * ## 🔴 Aucun geste nouveau côté serveur
 *
 * Chaque geste ci-dessous emprunte une route que le client appelait déjà
 * ailleurs, citée à côté. Ce qui n'a pas de route n'est pas simulé (voir
 * `actionsPochette`, « Ce qui manque côté SERVEUR »).
 *
 * ## Ce qui reste au COMPOSANT
 *
 * Trois gestes ouvrent une fenêtre qui vit dans un composant : les étiquettes
 * (`EtiquettesPanneau`), les crédits (`CreditsTiroir`) et l'éditeur de règles
 * (`PlaylistSmartEditeurV2`, `CollectionSmartEditeurV2`). `MenuObjetV2` les
 * fournit lui-même ; ce module donne de quoi les ouvrir (`cibleEtiquetteObjet`,
 * `pistesDe`).
 */
import { get } from 'svelte/store';
import { tick } from 'svelte';
import * as api from './api';
import { t } from './i18n';
import { notifications } from './stores/notifications';
import { dialogs } from './stores/dialogs';
import { playAndSync } from './stores/zones';
import { rangLireEnsuite } from './stores/queue';
import {
  activeView,
  gestesNavigationService,
  pendingLibraryAlbum,
  pendingModeModifier,
  vueDeRetour,
} from './stores/navigation';
import {
  favoriteAlbumIds,
  favoriteArtistIds,
  favoriteCollectionIds,
  favoritePlaylistIds,
  favoriteSmartCollectionIds,
  favoriteSmartPlaylistIds,
  favoriteStreamingKeys,
  favoriteTrackIds,
} from './stores/profile';
import { pendingPlaylistId } from './stores/playlists';
import { concertsCharge } from './stores/concerts';
import { convertisseurCharge } from './stores/convertisseurPlaylists';
import { ouvrirLeRepertoire } from './stores/repertoireCible';
import { zoneRequise } from './zoneRequise';
import { signalerEchecLecture } from './echecLecture';
import { corpsDeFileListe, estPisteLocale } from './pisteFile';
import { lireListe, lireListeAleatoire } from './lectureEnMasse';
import { basculerFavoriLocal, estFavoriLocal, type RefLocale } from './favorisLocaux';
import { favKeyOf, refFavoriDeVignette, toggleStreamingFavorite, type StreamingItemType } from './streamingFavorites';
import {
  cibleDeService,
  cibleEtiquetteAlbum,
  cibleEtiquettePlaylist,
  cibleSmartPlaylist,
  type CibleEtiquette,
} from './cibleEtiquette';
import { serviceACredits } from './creditsService';
import { ouvrirArtisteDepuis } from './ouvrirArtisteDepuis';
import { ouvrirCollection, ouvrirParRaccourci, ouvrirSmartPlaylist } from './ouvrirParRaccourci';
import { chargerCollectionsCibles, entreesAjoutCollection, lignesMenuEnRayons } from './albumVersCollection';
import { destinationsDeLaCollection, rafraichirRayons } from './rayonsCollections';
import { dossierDeLAlbum } from './dossierAlbum';
import { shareLink } from './playlistShare';
import { cleServeur } from './ongletsStreaming';
import { estDeBibliotheque } from './provenanceBibliotheque';
import {
  entreesPochette,
  type CapacitesPochette,
  type EntreePochette,
  type GestesPochette,
  type SousEntreePochette,
  type TypePochette,
} from './actionsPochette';
import type { StreamingTrackInfo, Track } from './types';

/**
 * L'objet d'un menu, tel que l'écran le connaît — et rien de plus.
 *
 * Une forme PLATE, commune aux sept natures : les écrans reçoivent des objets
 * de formes très diverses (`Album`, `StreamAlbum`, `Playlist`, élément de
 * widget…), les constructeurs `objetAlbum` & co. les ramènent ici une fois.
 */
export interface ObjetMenu {
  type: TypePochette;
  /** Identifiant de BIBLIOTHÈQUE (dans l'espace de SON type). */
  id?: number | null;
  /** Service d'origine, en clé SERVEUR (`qobuz`, `bandcamp`…). */
  service?: string | null;
  /** Identifiant chez le service. */
  sourceId?: string | null;
  /** Le nom STOCKÉ (titre d'album, nom de playlist, valeur de label). */
  nom?: string | null;
  pochette?: string | null;
  /** Album : l'artiste — un `i64` local, ou l'identifiant chez le service. */
  artisteId?: number | string | null;
  artisteNom?: string | null;
}

// ── Constructeurs ─────────────────────────────────────────────────────────

const texte = (v: unknown): string | null => (v == null || v === '' ? null : String(v));

/** Un album : de la bibliothèque (son `id`), ou d'un service (sa paire). */
export function objetAlbum(a: any, ongletActif: string | null = null): ObjetMenu {
  const base = {
    type: 'album' as const,
    nom: texte(a?.title ?? a?.titre),
    pochette: texte(a?.cover_path ?? a?.cover_url),
    artisteNom: texte(a?.artist_name ?? a?.artist ?? a?.artiste),
  };
  if (a && estDeBibliotheque(a) && Number.isInteger(a.id)) {
    return { ...base, id: a.id, artisteId: typeof a.artist_id === 'number' ? a.artist_id : null };
  }
  const service = cleServeur(texte(a?.source) ?? ongletActif);
  const sourceId = texte(a?.source_id ?? (service === 'bandcamp' ? a?.url : null));
  if (service && sourceId && !estDeBibliotheque({ id: 1, source: service })) {
    return { ...base, service, sourceId, artisteId: texte(a?.artist_id) };
  }
  // Un dépôt distant, ou un objet sans désignation : ni id, ni service.
  return base;
}

/** Un artiste : de la bibliothèque, ou d'un service. */
export function objetArtiste(a: any): ObjetMenu {
  const nom = texte(a?.name ?? a?.nom);
  if (a && estDeBibliotheque(a) && Number.isInteger(a.id)) return { type: 'artiste', id: a.id, nom };
  const service = cleServeur(texte(a?.source));
  const sourceId = texte(a?.source_id);
  if (service && sourceId && !estDeBibliotheque({ id: 1, source: service })) {
    return { type: 'artiste', service, sourceId, nom };
  }
  return { type: 'artiste', nom };
}

/** Une playlist : locale (son `id`), ou d'un service (`service` + `source_id`). */
export function objetPlaylist(pl: any, service: string | null = null): ObjetMenu {
  const nom = texte(pl?.name ?? pl?.nom);
  const svc = cleServeur(texte(pl?.source) ?? service);
  if (svc && !estDeBibliotheque({ id: 1, source: svc })) {
    return { type: 'playlist', service: svc, sourceId: texte(pl?.source_id ?? pl?.id), nom };
  }
  return { type: 'playlist', id: Number.isInteger(pl?.id) ? pl.id : null, nom };
}

export function objetPlaylistIntelligente(sp: any): ObjetMenu {
  return { type: 'playlistIntelligente', id: Number.isInteger(sp?.id) ? sp.id : null, nom: texte(sp?.name ?? sp?.nom) };
}

export function objetCollection(c: any, intelligente: boolean): ObjetMenu {
  return {
    type: intelligente ? 'collectionIntelligente' : 'collection',
    id: Number.isInteger(c?.id) ? c.id : null,
    nom: texte(c?.name ?? c?.nom),
  };
}

export function objetLabel(nom: string | null | undefined): ObjetMenu {
  return { type: 'label', nom: texte(nom?.trim()) };
}

// ── Désignations ──────────────────────────────────────────────────────────

const local = (o: ObjetMenu) => o.id != null;
const deService = (o: ObjetMenu) => o.id == null && !!o.service && !!o.sourceId;

/** La référence de favori LOCAL, ou `null`. */
function refLocale(o: ObjetMenu): RefLocale | null {
  if (o.id == null) return null;
  switch (o.type) {
    case 'album': return { albumId: o.id };
    case 'artiste': return { artistId: o.id };
    case 'playlist': return { playlistId: o.id };
    case 'playlistIntelligente': return { smartPlaylistId: o.id };
    case 'collection': return { collectionId: o.id };
    case 'collectionIntelligente': return { smartCollectionId: o.id };
    default: return null;
  }
}

const TYPE_FAVORI_SERVICE: Partial<Record<TypePochette, StreamingItemType>> = {
  album: 'album',
  artiste: 'artist',
  playlist: 'playlist',
};

/** La référence de favori DE SERVICE, ou `null` (`lib/streamingFavorites`). */
function refService(o: ObjetMenu) {
  const itemType = TYPE_FAVORI_SERVICE[o.type];
  if (!itemType || !deService(o)) return null;
  const ref = refFavoriDeVignette(itemType, { source: o.service, source_id: o.sourceId }, null);
  return favKeyOf(ref) ? ref : null;
}

/** La cible des étiquettes (`lib/cibleEtiquette`), ou `null`. */
export function cibleEtiquetteObjet(o: ObjetMenu): CibleEtiquette | null {
  switch (o.type) {
    case 'album':
      return cibleEtiquetteAlbum({
        id: o.id ?? null, source: o.service ?? null, source_id: o.sourceId ?? null,
        title: o.nom, artist_name: o.artisteNom, cover_path: o.pochette,
      });
    case 'artiste':
      if (o.id != null) return { itemType: 'artist', itemId: o.id };
      return deService(o) ? cibleDeService('artist', { source: o.service, source_id: o.sourceId, name: o.nom }) : null;
    case 'playlist':
      return cibleEtiquettePlaylist({ id: o.id ?? null, source_id: o.sourceId, name: o.nom }, o.service ?? null);
    case 'playlistIntelligente':
      return o.id != null ? cibleSmartPlaylist(o.id) : null;
    case 'collection':
      return o.id != null ? { itemType: 'collection', itemId: o.id } : null;
    case 'collectionIntelligente':
      return o.id != null ? { itemType: 'smart_collection', itemId: o.id } : null;
    default:
      return null;
  }
}

/** Ce que l'objet permet — la moitié « capacités » du catalogue. */
export function capacitesObjet(o: ObjetMenu, options: { dansCollectionManuelle?: boolean } = {}): CapacitesPochette {
  const c: CapacitesPochette = {
    type: o.type,
    idBibliotheque: o.id ?? null,
    service: o.id == null ? (o.service ?? null) : null,
  };
  if (o.type === 'label') c.jouable = !!o.nom;
  else if (o.id == null) c.jouable = deService(o);
  const ref = refLocale(o);
  if (ref) {
    c.favori = estFavoriLocal(
      ref,
      get(favoriteTrackIds),
      get(favoriteAlbumIds),
      get(favoriteArtistIds),
      get(favoritePlaylistIds),
      get(favoriteCollectionIds),
      get(favoriteSmartCollectionIds),
      get(favoriteSmartPlaylistIds),
    );
  } else {
    const rs = refService(o);
    if (rs) c.favori = get(favoriteStreamingKeys).has(favKeyOf(rs)!);
  }
  c.etiquetable = cibleEtiquetteObjet(o) != null;
  if (o.type === 'album') {
    c.artisteConnu = o.artisteId != null || !!o.artisteNom;
    if (deService(o)) c.creditsDeService = serviceACredits(o.service);
  }
  if (o.type === 'artiste') c.greffonConcerts = get(concertsCharge);
  if (o.type === 'playlist') c.greffonConvertisseur = get(convertisseurCharge);
  if (options.dansCollectionManuelle) c.dansCollectionManuelle = true;
  return c;
}

// ── Lecture ───────────────────────────────────────────────────────────────

/**
 * Les pistes de l'objet, pour la lecture en masse, la file et les crédits.
 *
 * Mêmes routes que les écrans qui le faisaient déjà : `getArtistTracks`
 * (`ArtisteServiceV2`), `getSmartPlaylistTracks` (`PlaylistsV2.lireSmart`, 500
 * premières), `getAlbumTracksBatch` (`CollectionsV2.pistesDeLaCollection`),
 * `/library/tracks?label=` (le filtre Label d'Oxygen).
 */
export async function pistesDe(o: ObjetMenu): Promise<Track[]> {
  const tableau = (v: unknown): Track[] => (Array.isArray(v) ? (v as Track[]) : []);
  switch (o.type) {
    case 'album':
      if (o.id != null) return tableau(await api.getAlbumTracks(o.id));
      return deService(o) ? tableau(await api.getStreamingAlbumTracks(o.service!, o.sourceId!)) : [];
    case 'artiste':
      if (o.id != null) return tableau(await api.getArtistTracks(o.id));
      return deService(o) ? tableau(await api.getStreamingArtistTopTracks(o.service!, o.sourceId!)) : [];
    case 'playlist':
      if (o.id != null) return tableau(await api.getPlaylistTracks(o.id));
      return deService(o) ? tableau(await api.getStreamingPlaylistTracks(o.service!, o.sourceId!)) : [];
    case 'playlistIntelligente':
      return o.id != null ? tableau(await api.getSmartPlaylistTracks(o.id)).slice(0, 500) : [];
    case 'collection':
    case 'collectionIntelligente': {
      if (o.id == null) return [];
      const albums: any[] = tableau(
        o.type === 'collectionIntelligente'
          ? await api.getSmartCollectionAlbums(o.id)
          : await api.getCollectionAlbums(o.id),
      ) as any[];
      const ids = albums.map((a) => a?.id).filter((x): x is number => Number.isInteger(x));
      const services = albums.filter((a) => a?.id == null && a?.source && a?.source_id != null);
      const [locales, distantes] = await Promise.all([
        ids.length ? api.getAlbumTracksBatch(ids) : Promise.resolve({ tracks: [] as Track[], failedAlbums: 0 }),
        Promise.allSettled(services.map((a) => api.getStreamingAlbumTracks(a.source, String(a.source_id)))),
      ]);
      return [
        ...locales.tracks,
        ...distantes.flatMap((r) => (r.status === 'fulfilled' ? tableau(r.value) : [])),
      ];
    }
    case 'label':
      return o.nom ? (await api.getFilteredTracks({ label: o.nom, limit: 2000 })).items : [];
    default:
      return [];
  }
}

const gestesDeLecture = (zid: number) => ({
  lire: (c: any) => playAndSync(zid, c),
  enfiler: (c: any) => api.addToQueue(zid, c),
});

/** Le corps de lecture DIRECT, quand le serveur sait lire l'objet d'un coup. */
function corpsDirect(o: ObjetMenu): Record<string, unknown> | null {
  if (o.type === 'album') {
    if (o.id != null) return { album_id: o.id };
    if (deService(o)) return { streaming_album_id: o.sourceId, source: o.service };
  }
  if (o.type === 'playlist') {
    if (o.id != null) return { playlist_id: o.id };
    // `source` va TOUJOURS avec l'identifiant (`PlaylistsV2.playStreaming`).
    if (deService(o)) return { streaming_playlist_id: o.sourceId, source: o.service };
  }
  return null;
}

async function lire(o: ObjetMenu, aleatoire: boolean): Promise<void> {
  const zid = zoneRequise();
  if (zid == null) return;
  const traduire = get(t);
  try {
    if (!aleatoire) {
      const corps = corpsDirect(o);
      if (corps) { await playAndSync(zid, corps as any); return; }
    } else if (o.id != null && (o.type === 'artiste' || o.type === 'album')) {
      // Le mélange CÔTÉ SERVEUR, déjà offert par la fiche artiste
      // (`ArtisteServiceV2`, `shuffleAll({ artist_id })`) ; la route accepte
      // aussi `album_id`.
      await api.shuffleAll(zid, o.type === 'artiste' ? { artist_id: o.id } : { album_id: o.id });
      return;
    }
    const pistes = await pistesDe(o);
    const n = aleatoire
      ? await lireListeAleatoire(pistes, gestesDeLecture(zid))
      : await lireListe(pistes, gestesDeLecture(zid));
    if (!n) notifications.error(traduire('collections.noTracks' as any));
  } catch (e) {
    signalerEchecLecture(e);
  }
}

/** « Lire ensuite » (avec rang) et « Ajouter à la file » (sans) — le geste
 *  de la fiche album (`AlbumDetailV2.enfiler`), pour tous les objets. */
async function enfiler(o: ObjetMenu, position: number | undefined): Promise<void> {
  const zid = zoneRequise();
  if (zid == null) return;
  const traduire = get(t);
  try {
    // L'album LOCAL part par son identifiant : le serveur applique alors le
    // rattrapage de la ligne sœur (Pascal, v0.9.21 — voir la fiche).
    const corps =
      o.type === 'album' && o.id != null
        ? { album_id: o.id, ...(position != null ? { position } : {}) }
        : corpsDeFileListe(await pistesDe(o), position);
    if (!corps) {
      notifications.error(traduire('collections.noTracks' as any));
      return;
    }
    await api.addToQueue(zid, corps);
    const cle = position != null ? 'v2.album.queuedNext' : 'v2.album.queued';
    notifications.success(traduire(cle as any).replace('{title}', o.nom ?? ''));
  } catch {
    notifications.error(traduire('v2.pa.queueError' as any));
  }
}

// ── Aller ─────────────────────────────────────────────────────────────────

/** Le chemin par défaut vers la fiche de l'objet — celui des autres écrans. */
function ouvrirParDefaut(o: ObjetMenu): (() => void) | undefined {
  switch (o.type) {
    case 'album':
      if (o.id != null) {
        const id = o.id;
        // Le contrat que `LibraryV2` lit déjà (« Aller à l'album » d'une piste).
        return () => { pendingLibraryAlbum.set(id); activeView.set('library'); };
      }
      if (deService(o)) {
        return () =>
          get(gestesNavigationService)?.ouvrirAlbum({
            service: o.service!, albumId: o.sourceId!, titre: o.nom ?? '', pochette: o.pochette ?? null,
            artiste: o.artisteNom ?? null, artisteId: typeof o.artisteId === 'string' ? o.artisteId : null,
          });
      }
      return undefined;
    case 'artiste':
      if (o.id == null && !deService(o) && !o.nom) return undefined;
      return () =>
        void ouvrirArtisteDepuis(
          o.id != null ? { id: o.id, name: o.nom } : deService(o) ? { source: o.service, source_id: o.sourceId, name: o.nom } : { name: o.nom },
          get(activeView),
        );
    case 'playlist':
      // Une playlist de SERVICE s'ouvre dans le calque de l'écran qui la montre
      // (`PlaylistsV2`, `StreamingV2`) : aucune route commune n'y mène d'ailleurs.
      if (o.id == null) return undefined;
      return () => void ouvrirParRaccourci('playlists', `playlists:${o.id}`, o.id!, o.nom ?? '');
    case 'playlistIntelligente':
      return o.id != null ? () => ouvrirSmartPlaylist({ id: o.id, name: o.nom }) : undefined;
    case 'collection':
    case 'collectionIntelligente':
      return o.id != null
        ? () => ouvrirCollection({ id: o.id, name: o.nom, smart: o.type === 'collectionIntelligente' })
        : undefined;
    case 'label':
      if (!o.nom) return undefined;
      // Le chemin des Favoris vers une facette (`tune:v2-facette`, `LibraryV2`).
      return () => {
        activeView.set('library');
        void tick().then(() =>
          window.dispatchEvent(new CustomEvent('tune:v2-facette', { detail: { onglet: 'labels', valeur: o.nom } })),
        );
      };
    default:
      return undefined;
  }
}

function allerArtiste(o: ObjetMenu): (() => void) | undefined {
  if (o.type !== 'album' || (o.artisteId == null && !o.artisteNom)) return undefined;
  return () => {
    const depuis = get(activeView);
    if (typeof o.artisteId === 'number') {
      void ouvrirArtisteDepuis({ id: o.artisteId, name: o.artisteNom }, depuis);
    } else if (deService(o) && o.artisteId) {
      void ouvrirArtisteDepuis({ source: o.service, source_id: o.artisteId, name: o.artisteNom }, depuis);
    } else if (deService(o) && o.artisteNom) {
      get(gestesNavigationService)?.ouvrirArtiste({ service: o.service!, nom: o.artisteNom, depuis });
    } else {
      void ouvrirArtisteDepuis({ name: o.artisteNom }, depuis);
    }
  };
}

// ── Ranger ────────────────────────────────────────────────────────────────

async function basculerFavori(o: ObjetMenu): Promise<void> {
  const ref = refLocale(o);
  if (ref) { await basculerFavoriLocal(ref); return; }
  const rs = refService(o);
  if (rs) {
    await toggleStreamingFavorite({
      ...rs, title: o.nom ?? undefined, artist: o.artisteNom ?? undefined, coverUrl: o.pochette ?? undefined,
    });
  }
}

/**
 * Le sous-menu « Ajouter à une collection » — celui de la fiche album
 * (`AlbumDetailV2.basculerMenuCollection`) : collections relues au clic, rangées
 * sous leurs rayons (web#1591), et l'état vide qui mène à l'écran Collections.
 */
export async function sousMenuCollections(albumId: number): Promise<SousEntreePochette[]> {
  const traduire = get(t);
  const [cibles, rayons] = await Promise.all([
    chargerCollectionsCibles(),
    rafraichirRayons(api.getCollectionFolders),
  ]);
  const entrees = entreesAjoutCollection(cibles, albumId, (k) => traduire(k as any), () => {});
  if (!entrees.length) {
    return [{ cle: 'vide', libelle: traduire('v2.album.noCollection' as any), faire: () => activeView.set('collections') }];
  }
  return lignesMenuEnRayons(entrees, rayons, traduire('v2.rayons.unfiled' as any)).map((l) =>
    l.sorte === 'rayon'
      ? { cle: l.cle, libelle: l.nom, profondeur: l.profondeur }
      : { cle: l.cle, libelle: l.entree.libelle, profondeur: l.profondeur, faire: l.entree.faire },
  );
}

/**
 * Le sous-menu « Déplacer vers… » d'une collection — les destinations de
 * l'arbre des rayons (`ArbreRayons`, #4853), avec la RACINE quand elle est
 * rangée quelque part.
 */
export async function sousMenuRayons(o: ObjetMenu, apres?: () => void): Promise<SousEntreePochette[]> {
  const traduire = get(t);
  if (o.id == null) return [];
  const id = o.id;
  const kind = o.type === 'collectionIntelligente' ? 'smart' : 'collection';
  const etat = await rafraichirRayons(api.getCollectionFolders);
  if (etat.mode !== 'arbre') return [{ cle: 'plat', libelle: traduire('v2.rayons.error' as any) }];
  const arbre = etat.arbre;
  let dossier: number | null = null;
  const chercher = (fs: typeof arbre.folders) => {
    for (const f of fs) {
      if (f.collections?.some((c) => c.kind === kind && c.id === id)) dossier = f.id;
      chercher(f.folders ?? []);
    }
  };
  chercher(arbre.folders);
  return destinationsDeLaCollection(arbre, dossier).map((d) => ({
    cle: d ? `r:${d.id}` : 'racine',
    libelle: d ? `${'· '.repeat(Math.max(0, d.depth - 1))}${d.name}` : traduire('v2.rayons.root' as any),
    faire: () => {
      void (async () => {
        try {
          await api.placeCollectionInFolder(kind, id, d?.id ?? null);
        } catch (e: any) {
          notifications.error(`${traduire('v2.rayons.error' as any)} : ${e?.message ?? ''}`);
        }
        await rafraichirRayons(api.getCollectionFolders);
        apres?.();
      })();
    },
  }));
}

// ── Album : corriger, localiser ───────────────────────────────────────────

/**
 * « Ré-identifier » — le geste de la fiche album (#2128), sorti ici pour que le
 * menu et la fiche disent la MÊME chose. Rend `true` quand l'album a changé :
 * la fiche le relit alors.
 */
export async function reidentifierAlbum(albumId: number): Promise<boolean> {
  const traduire = get(t);
  const tid = notifications.info(traduire('library.reidentifying' as any), 0);
  try {
    const r = await api.reidentifyAlbum(albumId);
    notifications.dismiss(tid);
    // Le verdict est rendu tel quel, y compris décevant : « même pressage »
    // et « rien trouvé » sont des réponses (fil forum #1455).
    if (r.verdict === 'no_tracks') { notifications.error(traduire('library.reidentifyNoTracks' as any)); return false; }
    if (r.verdict === 'not_found') {
      notifications.error(traduire('library.reidentifyNotFound' as any).replace('{title}', r.searched_title ?? ''));
      return false;
    }
    if (r.verdict === 'unchanged') { notifications.info(traduire('library.reidentifyUnchanged' as any), 9000); return false; }
    let msg = traduire('library.reidentifySuccess' as any)
      .replace('{title}', r.release_title ?? '')
      .replace('{matched}', String(r.tracks_matched ?? 0))
      .replace('{total}', String(r.tracks_total ?? 0));
    if (r.fields_left_as_is?.length) {
      msg += ` — ${traduire('library.reidentifyKept' as any).replace('{fields}', r.fields_left_as_is.join(', '))}`;
    }
    notifications.success(msg, 9000);
    return true;
  } catch (e: any) {
    notifications.dismiss(tid);
    notifications.error(`${traduire('library.reidentifyFailed' as any)} : ${e?.message || e}`);
    return false;
  }
}

/**
 * « Localiser sur le disque » — le geste de la fiche album (#854) : le chemin
 * retour posé AVANT de partir, pour que le Retour de l'écran Répertoires
 * rouvre l'album au lieu de remonter l'arborescence.
 */
export function allerAuDossierDeLAlbum(albumId: number | null, dossier: string): void {
  if (albumId != null) pendingLibraryAlbum.set(albumId);
  vueDeRetour.set('library');
  ouvrirLeRepertoire(dossier);
  activeView.set('browse');
}

async function localiser(albumId: number): Promise<void> {
  try {
    const dossier = dossierDeLAlbum(await api.getAlbumTracks(albumId));
    if (!dossier) { notifications.error(get(t)('menuObjet.noFolder' as any)); return; }
    allerAuDossierDeLAlbum(albumId, dossier);
  } catch (e: any) {
    notifications.error(e?.message ?? get(t)('common.error' as any));
  }
}

// ── Playlists, collections : organiser ───────────────────────────────────

/** « Partager (lien public) » — `POST /playlists/{id}/share`, le lien copié. */
export async function partagerPlaylist(id: number): Promise<void> {
  const traduire = get(t);
  try {
    const r = await api.sharePlaylist(id);
    // `shareLink` LÈVE sur une réponse sans jeton : jamais un lien en `undefined`.
    const url = shareLink(r, window.location.origin);
    await navigator.clipboard.writeText(url);
    notifications.success(traduire('v2.pl.shared' as any));
  } catch (e: any) {
    notifications.error(e?.message ?? traduire('common.error' as any));
  }
}

async function renommer(o: ObjetMenu, apres?: () => void): Promise<void> {
  if (o.id == null) return;
  const traduire = get(t);
  // Le nom STOCKÉ, jamais un libellé traduit : ce champ est renvoyé tel quel.
  const saisi = await dialogs.prompt(traduire('v2.pl.rename' as any), o.nom ?? '');
  const nom = saisi?.trim();
  if (!nom || nom === o.nom) return;
  try {
    if (o.type === 'playlist') await api.updatePlaylist(o.id, { name: nom });
    else {
      // `PUT /library/collections/{id}` écrit ce qu'on lui envoie : la
      // description part avec le nom, relue juste avant, pour ne pas l'effacer
      // (la modale de `CollectionsV2` envoie les deux, pour la même raison).
      const toutes = await api.getCollections().catch(() => []);
      const actuelle = Array.isArray(toutes) ? toutes.find((c: any) => c?.id === o.id) : null;
      await api.updateCollection(o.id, { name: nom, description: actuelle?.description ?? null });
    }
    apres?.();
  } catch (e: any) {
    notifications.error(e?.message ?? traduire('common.error' as any));
  }
}

/** Les arguments de `addPlaylistTracks` pour une suite de pistes du même genre. */
function infoDeService(p: Track): StreamingTrackInfo {
  return {
    source: p.source!, source_id: p.source_id!, title: p.title,
    artist_name: p.artist_name, album_title: p.album_title, duration_ms: p.duration_ms,
    format: p.format, sample_rate: p.sample_rate, bit_depth: p.bit_depth,
    channels: p.channels, cover_path: p.cover_path,
    album_id: (p as any).album_id_service ?? (p.album_id != null ? String(p.album_id) : null),
  } as StreamingTrackInfo;
}

/**
 * « Dupliquer » — une playlist neuve (`POST /playlists`) remplie des mêmes
 * pistes (`POST /playlists/{id}/tracks`), dans le MÊME ordre : les pistes
 * locales et de service partent par suites homogènes, l'une après l'autre.
 */
async function dupliquer(o: ObjetMenu, apres?: () => void): Promise<void> {
  if (o.id == null) return;
  const traduire = get(t);
  try {
    const pistes = (await api.getPlaylistTracks(o.id)) ?? [];
    const copie = await api.createPlaylist(traduire('menuObjet.copyName' as any).replace('{name}', o.nom ?? ''));
    let i = 0;
    while (i < pistes.length) {
      const localeIci = estPisteLocale(pistes[i]);
      let j = i;
      while (j < pistes.length && estPisteLocale(pistes[j]) === localeIci) j++;
      const suite = pistes.slice(i, j);
      if (localeIci) await api.addPlaylistTracks(copie.id!, suite.map((p) => p.id!));
      else {
        const designees = suite.filter((p) => p.source && p.source_id);
        if (designees.length) await api.addPlaylistTracks(copie.id!, [], undefined, designees.map(infoDeService));
      }
      i = j;
    }
    notifications.success(traduire('menuObjet.duplicated' as any).replace('{name}', copie.name ?? ''));
    apres?.();
  } catch (e: any) {
    notifications.error(e?.message ?? traduire('common.error' as any));
  }
}

async function exporter(id: number): Promise<void> {
  const traduire = get(t);
  try {
    const nom = await api.exportPlaylist(id, 'm3u');
    notifications.success(traduire('v2.pl.exported' as any).replace('{file}', nom));
  } catch {
    notifications.error(traduire('v2.pl.exportError' as any));
  }
}

/**
 * « Supprimer », avec la confirmation du socle `dialogs` (#166), teintée
 * DANGER. Quatre routes pour quatre types : les espaces d'identifiants des
 * sortes simple et intelligente se recouvrent.
 */
async function supprimer(o: ObjetMenu, apres?: () => void): Promise<void> {
  if (o.id == null) return;
  const traduire = get(t);
  const nom = o.nom ?? '';
  const question =
    o.type === 'playlist'
      ? traduire('menuObjet.deletePlaylistAsk' as any).replace('{name}', nom)
      : o.type === 'playlistIntelligente'
        ? traduire('v2.spl.deleteAsk' as any).replace('{name}', nom)
        : traduire('v2.col.deleteAsk' as any).replace('{nom}', nom);
  if (!(await dialogs.confirm(question, { danger: true }))) return;
  try {
    if (o.type === 'playlist') await api.deletePlaylist(o.id);
    else if (o.type === 'playlistIntelligente') await api.deleteSmartPlaylist(o.id);
    else if (o.type === 'collectionIntelligente') await api.deleteSmartCollection(o.id);
    else await api.deleteCollection(o.id);
    notifications.success(
      o.type === 'collection' || o.type === 'collectionIntelligente'
        ? traduire('collections.deleted' as any)
        : traduire('smartPlaylists.deleted' as any).replace('{name}', nom),
    );
    apres?.();
  } catch (e: any) {
    notifications.error(e?.message ?? traduire('common.error' as any));
  }
}

// ── Le tout ───────────────────────────────────────────────────────────────

export interface OptionsMenuObjet {
  /** Gestes PROPRES à la surface, ou un autre chemin pour « Ouvrir ». */
  gestes?: GestesPochette;
  /** Relire la liste de l'écran après un geste qui la change. */
  rafraichir?: () => void;
  /** L'objet est montré dans une collection manuelle ouverte (`CollectionsV2`). */
  dansCollectionManuelle?: boolean;
}

/** Les gestes communs de l'objet — la moitié « gestes » du catalogue. */
export function gestesObjet(o: ObjetMenu, options: OptionsMenuObjet = {}): GestesPochette {
  const apres = options.rafraichir;
  const ouvrir = options.gestes?.ouvrir ?? ouvrirParDefaut(o);
  const g: GestesPochette = {
    lire: () => void lire(o, false),
    lireAleatoire: () => void lire(o, true),
    ensuite: () => void enfiler(o, rangLireEnsuite()),
    enfiler: () => void enfiler(o, undefined),
    ouvrir,
    allerArtiste: allerArtiste(o),
    basculerFavori: () => void basculerFavori(o),
  };
  if (o.type === 'album' && o.id != null) {
    const id = o.id;
    g.ajouterACollection = () => sousMenuCollections(id);
    g.reidentifier = () => void reidentifierAlbum(id);
    g.localiser = () => void localiser(id);
    /**
     * « Modifier » ouvre la FICHE en mode Modifier (web#1599) : c'est là que
     * l'édition vit (`EditionAlbumV2`, sondée par la fiche). La fiche lit la
     * demande (`pendingModeModifier`) une fois la sonde revenue.
     */
    if (ouvrir) g.modifier = () => { pendingModeModifier.set(id); ouvrir(); };
  }
  if (o.type === 'artiste') g.concerts = () => activeView.set('concerts');
  if (o.type === 'playlist' && o.id != null) {
    const id = o.id;
    g.renommer = () => void renommer(o, apres);
    g.dupliquer = () => void dupliquer(o, apres);
    g.exporter = () => void exporter(id);
    g.partager = () => void partagerPlaylist(id);
    // L'écran du greffon (`PlaylistManagerView`) ouvre la playlist demandée.
    g.transferer = () => { pendingPlaylistId.set(id); activeView.set('playlistmanager'); };
  }
  if (o.type === 'collection') g.renommer = () => void renommer(o, apres);
  if (o.type === 'collection' || o.type === 'collectionIntelligente') {
    g.deplacerVersRayon = () => sousMenuRayons(o, apres);
  }
  if (o.type !== 'album' && o.type !== 'artiste' && o.type !== 'label') {
    g.supprimer = () => void supprimer(o, apres);
  }
  return g;
}

/**
 * L'objet aura-t-il au moins une entrée ? — sans composer le menu.
 *
 * Vrai dès qu'il se lit (bibliothèque, service, label nommé) ou s'ouvre : ces
 * deux familles d'entrées ne dépendent d'aucune autre condition. C'est ce que
 * lisent les listes pour poser leur bouton « … » — composer le menu de chaque
 * ligne d'une bibliothèque de 6 704 albums (fil 1919) coûterait des milliers
 * de lectures de magasins pour peindre une liste.
 */
export function objetAUnMenu(o: ObjetMenu, gestes: GestesPochette = {}): boolean {
  if (o.type === 'radio' || o.type === 'podcast') return false;
  if (o.type === 'label') return !!o.nom;
  return o.id != null || deService(o) || !!gestes.ouvrir || ouvrirParDefaut(o) != null;
}

/**
 * LE menu d'un objet : capacités + gestes communs + gestes de la surface.
 *
 * Les gestes de la surface REMPLACENT un geste commun de même nom (le chemin
 * d'« Ouvrir » dans son calque) ou en AJOUTENT un qu'elle seule sait faire ;
 * ils ne décident jamais de la liste — c'est `entreesPochette` qui la décide.
 */
export function entreesObjet(
  o: ObjetMenu,
  traduire: (cle: string) => string,
  options: OptionsMenuObjet = {},
): EntreePochette[] {
  // Un geste de surface ABSENT (`undefined`) ne masque pas le geste commun :
  // seul un geste fourni le remplace.
  const propres = Object.fromEntries(
    Object.entries(options.gestes ?? {}).filter(([, f]) => f != null),
  ) as GestesPochette;
  return entreesPochette(capacitesObjet(o, options), { ...gestesObjet(o, options), ...propres }, traduire);
}
