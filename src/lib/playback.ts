import { get } from 'svelte/store';
import { currentZone, playAndSync } from './stores/zones';
import * as api from './api';
import { notifications } from './stores/notifications';
import { queueTracks, queuePosition } from './stores/queue';
import { t } from './i18n';

/**
 * A row a list can offer to "play from here": local (numeric `id`) or streaming
 * (`source` + `source_id`). Favorites, search results and Bandcamp lists mix
 * both in the same list.
 *
 * ⚠️ `title`, `artist_name` et `album_title` acceptent `null`, et ce n'est pas
 * de la complaisance : c'est ainsi que `Track` les déclare (`types.ts`), et les
 * six vues qui appellent `playFromHere` lui passent des `Track[]`. Les avoir
 * typés `string | undefined` rendait chacun de ces six appels invalide — sans
 * casser le build, puisque esbuild transpile sans résoudre les types, mais en
 * laissant `check-svelte` rouge sur `main`, donc en bloquant toute PR web.
 */
export type PlayableRow = {
  id?: number | null;
  source?: string | null;
  source_id?: string | null;
  title?: string | null;
  artist_name?: string | null;
  album_title?: string | null;
  cover_path?: string | null;
  duration_ms?: number;
};

function estStreaming(t?: PlayableRow | null): boolean {
  return !!(t && t.source && t.source_id);
}

/** Start one row, whichever kind it is. */
async function lireUneLigne(zoneId: number, t: PlayableRow): Promise<void> {
  if (estStreaming(t)) {
    await playAndSync(zoneId, {
      source: t.source as any, source_id: t.source_id as string,
      title: t.title, artist_name: t.artist_name,
      album_title: t.album_title, cover_path: t.cover_path,
    } as any);
  } else {
    await playAndSync(zoneId, { track_id: t.id as number });
  }
}

/** Append one row to the queue, whichever kind it is. */
async function enfilerUneLigne(zoneId: number, t: PlayableRow): Promise<void> {
  if (estStreaming(t)) {
    await api.addToQueue(zoneId, {
      source: t.source as any, source_id: t.source_id as string,
      // `?? undefined` et non le `null` brut : `JSON.stringify` supprime une
      // clé `undefined` mais transmet `null`. Une ligne sans artiste connu doit
      // OMETTRE le champ, comme le déclare `addToQueue`, pas affirmer un
      // artiste nul.
      title: t.title, artist_name: t.artist_name ?? undefined,
      album_title: t.album_title ?? undefined,
      cover_path: t.cover_path, duration_ms: t.duration_ms,
    });
  } else {
    await api.addToQueue(zoneId, { track_id: t.id as number });
  }
}

/**
 * Play an ordered list starting at `index` ("Play from here").
 *
 * An all-local list goes out in one call, queue included, exactly as before.
 *
 * A list that carries streaming rows cannot: `POST /play` takes either
 * `track_ids` (local only) or ONE `source`+`source_id`, never a mixed list.
 * The previous version simply dropped every non-local row — so clicking a
 * streaming track played `ids[0]`, i.e. the TOP of the list instead of the row
 * clicked (#1488, Tades: an emptied queue restarted on "Lazarus"), and a list
 * with no local row at all returned in silence. Here we start the clicked row
 * and enqueue what follows it, the same compromise `playAllTracks` already
 * makes in FavoritesView.
 */
export async function playFromHere(
  tracks: PlayableRow[],
  index: number,
  defaultSource?: string,
): Promise<void> {
  const zone = get(currentZone);
  if (!zone || typeof zone.id !== 'number') {
    notifications.error(get(t)('library.noZoneSelectedSelectZone'));
    return;
  }
  const zoneId = zone.id;
  // Les réponses « favoris » connaissent leur service par la route qui les a
  // produites et ne répètent pas toujours `source` sur chaque piste. Conserver
  // ce contexte explicite évite de rejeter une liste Qobuz pourtant jouable.
  const liste = defaultSource
    ? tracks.map((track) =>
        !track.source && track.source_id ? { ...track, source: defaultSource } : track,
      )
    : tracks;
  const cliquee = liste[index];
  const jouable = (t?: PlayableRow | null) => !!t && (typeof t.id === 'number' || estStreaming(t));
  if (!jouable(cliquee)) {
    notifications.error(get(t)('library.playbackError'));
    return;
  }

  try {
    // All-local: one call, start_index — unchanged behaviour.
    if (liste.every(t => typeof t?.id === 'number')) {
      const ids = liste.map(t => t.id as number);
      await playAndSync(zoneId, { track_ids: ids, start_index: Math.max(0, index) });
      return;
    }

    // Mixed or streaming: start on the row actually clicked, then queue the rest.
    await lireUneLigne(zoneId, cliquee);
    const suite = liste.slice(index + 1).filter(jouable);
    if (suite.length > 0 && suite.every(estStreaming)) {
      // Une liste de favoris est 100 % streaming : un seul appel conserve
      // l'ordre et évite une requête HTTP par piste (#2140).
      await api.addToQueue(zoneId, {
        tracks: suite.map((track) => ({
          source: track.source as any,
          source_id: track.source_id as string,
          title: track.title,
          artist_name: track.artist_name,
          album_title: track.album_title,
          cover_path: track.cover_path,
          duration_ms: track.duration_ms,
        })),
      });
    } else {
      for (const track of suite) await enfilerUneLigne(zoneId, track);
    }
    // The queue view follows `POST /play`'s zone, not our appends: re-read it,
    // otherwise "up next" stays empty until the next WebSocket event.
    try {
      const qs = await api.getQueue(zoneId);
      queueTracks.set(qs.tracks);
      queuePosition.set(qs.position);
    } catch { /* affichage seul : ne pas faire échouer une lecture qui a démarré */ }
  } catch (e) {
    console.error('Play from here error:', e);
    notifications.error(get(t)('library.playbackError'));
  }
}

/** Ce qu'un geste « poser ces pistes sur la zone » a réellement fait. */
export type DecisionFile = 'lecture' | 'ajout';

/**
 * Les trois gestes serveur dont dépend la décision, injectables : la garde peut
 * ainsi observer LEQUEL a été appelé, sans réseau ni composant monté.
 */
export interface PortesFile {
  /** `GET /zones/{id}/queue` — l'état réel de la file, celui qui fait foi. */
  lireFile: (
    zoneId: number,
  ) => Promise<{ tracks?: unknown[]; length?: number } | null | undefined>;
  /** `POST /zones/{id}/play` — REMPLACE la file de bout en bout. */
  lire: (zoneId: number, ids: number[]) => Promise<unknown>;
  /** `POST /zones/{id}/queue/add` — ajoute en fin de file, n'écrase jamais. */
  ajouter: (zoneId: number, ids: number[]) => Promise<unknown>;
}

const portesReelles: PortesFile = {
  lireFile: (zoneId) => api.getQueue(zoneId),
  lire: (zoneId, ids) => playAndSync(zoneId, { track_ids: ids }),
  ajouter: (zoneId, ids) => api.addToQueue(zoneId, { track_ids: ids }),
};

/**
 * La file du serveur est-elle RÉELLEMENT vide ?
 *
 * Trois réponses possibles, deux seulement sont « vide » :
 * - un compte lisible à zéro ⇒ vide, on peut remplacer sans rien perdre ;
 * - un compte lisible non nul ⇒ pleine ;
 * - pas de réponse, ou une réponse illisible ⇒ **doute**, traité comme pleine.
 *
 * Le doute penche du côté qui ne détruit rien : au pire on ajoute à une file
 * vide — l'utilisateur voit ses titres et appuie sur lecture — là où l'erreur
 * inverse efface ce qu'il écoutait, sans erreur ni trace.
 *
 * `length` et `tracks.length` sont lus tous les deux, et c'est le PLUS GRAND
 * qui décide : si l'un des deux annonce quelque chose, la file n'est pas vide.
 */
async function fileServeurVide(
  zoneId: number,
  lireFile: PortesFile['lireFile'],
): Promise<boolean> {
  let etat: Awaited<ReturnType<PortesFile['lireFile']>>;
  try {
    etat = await lireFile(zoneId);
  } catch {
    return false;
  }
  const compte = typeof etat?.length === 'number' ? etat.length : null;
  const pistes = Array.isArray(etat?.tracks) ? etat.tracks.length : null;
  if (compte === null && pistes === null) return false;
  return Math.max(compte ?? 0, pistes ?? 0) === 0;
}

/**
 * Poser une liste de pistes locales sur une zone : les jouer si la file est
 * vide, les ajouter sinon — la décision prise sur l'état du SERVEUR (#528).
 *
 * Deux écrans (« Mood Mix » de `NowPlaying` et de `QueueView`) tranchaient sur
 * `$queueTracks`, un cache client. Ce cache est vide dans quatre situations où
 * la file du serveur ne l'est pas : l'écran n'a jamais été ouvert et rien ne
 * l'a hydraté, le premier rendu précède la réponse de `getQueue`, la zone
 * vient de changer, ou un autre client — téléphone, tablette, second
 * navigateur, télécommande — a enfilé des titres depuis. La branche « vide »
 * appelait alors `POST /play`, qui remplace délibérément la file côté serveur :
 * ce que l'auditeur écoutait disparaissait, et le message annonçait « ajoutées ».
 *
 * Relire la file coûte un aller-retour ; il est fait AVANT de choisir, et il
 * n'y a plus qu'une seule lecture d'état, la bonne. La fenêtre restante — un
 * autre client qui enfile entre la lecture et le `POST /play` — se compte en
 * millisecondes et demanderait une route conditionnelle côté serveur ; le
 * défaut corrigé ici, lui, est permanent dès que l'écran n'a pas été ouvert.
 */
export async function lireOuAjouter(
  zoneId: number,
  ids: number[],
  portes: PortesFile = portesReelles,
): Promise<DecisionFile> {
  if (await fileServeurVide(zoneId, portes.lireFile)) {
    await portes.lire(zoneId, ids);
    return 'lecture';
  }
  await portes.ajouter(zoneId, ids);
  return 'ajout';
}
