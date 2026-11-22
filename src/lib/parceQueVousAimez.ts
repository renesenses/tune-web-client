/**
 * « Parce que vous aimez <artiste> » — renesenses/tune-web-client#3118
 * (demande de FabienM, fil 2864 ; go de Bertrand le 16/11/2026, rc13).
 *
 * Le serveur compose (`GET /home/because-you-like`, tune-server-rust) :
 * jusqu'à cinq playlists de vingt titres, une par artiste parmi les plus
 * écoutés du profil — bibliothèque d'abord, services connectés en complément.
 * Les playlists sont refaites tous les trois jours (`refresh_days`) : entre
 * deux, un rafraîchissement de l'accueil ne rebat pas les cartes. Décision de
 * Bertrand du 17/11/2026 (FabienM, fil 2864) : 20 titres et 3 jours, l'esprit
 * d'un « mix pour vous ».
 *
 * Ce module ne fait que trois choses : traduire les titres du serveur en
 * `Track` (pour `lectureEnMasse`), lancer la lecture, et enregistrer la
 * playlist générée comme une playlist Tune.
 */
import { writable } from 'svelte/store';
import * as api from './api';
import { lireListeDepuis } from './lectureEnMasse';
import type { StreamingTrackInfo, Track } from './types';

/** Un titre tel que le serveur le rend : local, ou d'un service. */
export interface TitreGenere {
  source: string;
  track_id?: number | null;
  source_id?: string | null;
  title: string;
  artist_name?: string | null;
  album_title?: string | null;
  album_id?: number | null;
  duration_ms?: number | null;
  cover_path?: string | null;
}

/** Une playlist générée. */
export interface PlaylistGeneree {
  /** Stable pour un artiste : `pvaa-<hachage>`. */
  id: string;
  /** L'artiste « que vous aimez ». */
  artist: string;
  plays?: number;
  track_count: number;
  duration_ms?: number;
  /** Les premiers artistes proches présents dans la liste (5 au plus). */
  similar_artists: string[];
  /** Jusqu'à quatre pochettes distinctes, pour la mosaïque. */
  covers: string[];
  /** `local`, puis les services qui ont complété. */
  sources: string[];
  tracks: TitreGenere[];
  /** Tous les combien de jours le serveur refait les playlists (posé par
   *  `chargerPlaylistsGenerees` depuis la réponse). */
  refresh_days?: number | null;
}

export interface ReponseParceQueVousAimez {
  /** Le calcul n'a pas fini dans le délai : il continue côté serveur. */
  pending?: boolean;
  /** Premier jour de la période en cours. */
  date?: string;
  /** Durée de la période, en jours (3). */
  refresh_days?: number;
  playlists: PlaylistGeneree[];
}

/** Ce que rend la route, ou une liste vide quand la forme est inattendue ou
 *  que le serveur ne connaît pas la route (404 : serveur antérieur). */
export async function chargerPlaylistsGenerees(limite?: number, signal?: AbortSignal): Promise<PlaylistGeneree[]> {
  return (await chargerGenerees(limite, signal)).playlists;
}

/**
 * Les playlists, et si le serveur les PRÉPARE encore (`pending`) : le premier
 * calcul d'une période peut dépasser le délai d'un widget ; il continue côté
 * serveur et l'affichage suivant le lit.
 */
export async function chargerGenerees(
  limite?: number,
  signal?: AbortSignal,
): Promise<{ playlists: PlaylistGeneree[]; pending: boolean }> {
  // Un serveur antérieur n'a pas la route : 404 veut dire « fonction
  // absente », pas « panne ». Liste vide, et le widget (`masqueSiVide`) se
  // cache au lieu d'afficher sa carte d'échec. Toute autre erreur (abandon
  // #1763 compris) remonte telle quelle.
  const r = await api
    .getBecauseYouLike(limite, signal)
    .catch((e) => ((e as api.ApiError | null)?.status === 404 ? null : Promise.reject(e)));
  return { playlists: normaliser(r), pending: r?.pending === true };
}

/**
 * UNE relance, ~60 s après une réponse « en cours » — jamais une boucle :
 * une seconde réponse « en cours » n'en programme pas d'autre, jusqu'à ce
 * qu'une vraie réponse arrive. `PageWidgets` écoute ce compteur et recharge
 * le widget.
 */
export const DELAI_RELANCE_MS = 60_000;
/** L'identifiant du widget, celui que `PageWidgets` recharge. */
export const ID_PARCE_QUE_VOUS_AIMEZ = 'parce-que-vous-aimez';
export const relanceDemandee = writable(0);
let relanceProgrammee = false;
let relanceFaite = false;

/** Programme la relance unique. Rend `false` si elle est déjà prise. */
export function programmerRelance(delai = DELAI_RELANCE_MS): boolean {
  if (relanceProgrammee || relanceFaite) return false;
  relanceProgrammee = true;
  setTimeout(() => {
    relanceProgrammee = false;
    relanceFaite = true;
    relanceDemandee.update((n) => n + 1);
  }, delai);
  return true;
}

/** Une vraie réponse est arrivée : la prochaine attente aura sa relance. */
export function relanceTerminee(): void {
  relanceFaite = false;
}

function normaliser(r: ReponseParceQueVousAimez | null | undefined): PlaylistGeneree[] {
  const liste = Array.isArray(r?.playlists) ? r.playlists : [];
  const periode = typeof r?.refresh_days === 'number' && r.refresh_days > 0 ? Math.floor(r.refresh_days) : null;
  return liste
    .filter((p) => p && typeof p.artist === 'string' && Array.isArray(p.tracks) && p.tracks.length > 0)
    .map((p) => ({ ...p, refresh_days: periode }));
}

/** Un titre local porte `track_id` ; un titre de service, la paire `source` + `source_id`. */
export function estLocal(t: TitreGenere): boolean {
  return (t.source ?? 'local') === 'local' && typeof t.track_id === 'number' && t.track_id > 0;
}

/** Les titres en `Track`, la forme que lisent la lecture en masse et la file. */
export function versPistes(p: PlaylistGeneree): Track[] {
  const pistes: Track[] = [];
  for (const t of p.tracks ?? []) {
    const commun = {
      title: t.title,
      artist_name: t.artist_name ?? null,
      album_title: t.album_title ?? null,
      duration_ms: t.duration_ms ?? 0,
      cover_path: t.cover_path ?? null,
    };
    if (estLocal(t)) {
      pistes.push({ ...commun, id: t.track_id!, source: 'local', album_id: t.album_id ?? null } as unknown as Track);
    } else if (t.source && t.source_id) {
      pistes.push({ ...commun, id: null, source: t.source, source_id: String(t.source_id) } as unknown as Track);
    }
  }
  return pistes;
}

/**
 * « Lire » : la liste dans son ordre, sur la zone donnée.
 *
 * `lireListeDepuis(…, 0, …)` et non `lireListe` : sur une liste MIXTE (locale
 * + Qobuz/TIDAL), `lireListe` enfile toute la suite en UNE requête qui mêle
 * `track_ids` et `tracks`, que le serveur range par nature — l'ordre composé
 * serait perdu. `lireListeDepuis` enfile par segments homogènes
 * (`enfilerDansLOrdre`), comme le fait l'enregistrement (`segments`).
 */
export function lirePlaylistGeneree(zoneId: number, p: PlaylistGeneree): Promise<number> {
  return lireListeDepuis(versPistes(p), 0, {
    lire: (c) => api.play(zoneId, c as any),
    enfiler: (c) => api.addToQueue(zoneId, c),
  });
}

/**
 * Les titres par SEGMENTS de même nature, dans l'ordre : une requête qui mêle
 * `track_ids` et `streaming_tracks` range les locaux d'abord, et l'ordre
 * composé par le serveur serait perdu.
 */
export function segments(p: PlaylistGeneree): Array<{ ids: number[]; services: StreamingTrackInfo[] }> {
  const sortie: Array<{ ids: number[]; services: StreamingTrackInfo[] }> = [];
  let courant: { ids: number[]; services: StreamingTrackInfo[] } | null = null;
  let localCourant: boolean | null = null;
  for (const t of p.tracks ?? []) {
    const local = estLocal(t);
    if (!local && !(t.source && t.source_id)) continue;
    if (courant == null || local !== localCourant) {
      courant = { ids: [], services: [] };
      sortie.push(courant);
      localCourant = local;
    }
    if (local) courant.ids.push(t.track_id!);
    else
      courant.services.push({
        source: t.source as any,
        source_id: String(t.source_id),
        title: t.title,
        artist_name: t.artist_name ?? null,
        album_title: t.album_title ?? null,
        duration_ms: t.duration_ms ?? 0,
        cover_path: t.cover_path ?? null,
      });
  }
  return sortie;
}

/**
 * La playlist a été créée, mais un ajout de titres a échoué : elle existe,
 * INCOMPLÈTE. L'appelant le dit et propose de la supprimer.
 */
export class EnregistrementPartiel extends Error {
  constructor(
    readonly playlistId: number,
    readonly origine: unknown,
  ) {
    super('playlist_partially_saved');
    this.name = 'EnregistrementPartiel';
  }
}

/**
 * « Enregistrer comme playlist » : une playlist Tune neuve, nommée `nom`, qui
 * reçoit les titres dans l'ordre. Rend l'identifiant de la playlist créée.
 * Un ajout qui échoue après la création lève [`EnregistrementPartiel`].
 */
export async function enregistrerPlaylistGeneree(
  p: PlaylistGeneree,
  nom: string,
  description?: string,
): Promise<number> {
  const creee: any = await api.createPlaylist(nom, description);
  const id = Number(creee?.id);
  if (!Number.isFinite(id) || id <= 0) throw new Error('playlist_not_created');
  try {
    for (const s of segments(p)) {
      await api.addPlaylistTracks(id, s.ids, undefined, s.services.length ? s.services : undefined);
    }
  } catch (e) {
    throw new EnregistrementPartiel(id, e);
  }
  return id;
}

/** La ligne sous la vignette : « avec A, B, C », ou rien. */
export function texteVoisins(p: PlaylistGeneree, modele: string, max = 3): string | null {
  const noms = (p.similar_artists ?? []).filter((n) => typeof n === 'string' && n.trim()).slice(0, max);
  return noms.length ? modele.replace('{artistes}', noms.join(', ')) : null;
}
