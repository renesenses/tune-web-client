/**
 * Remettre en tête de file les titres qui PRÉCÈDENT le titre cliqué (#5770).
 *
 * « Lire à partir d'ici » lance le titre cliqué puis enfile la suite. Les
 * titres d'avant n'entraient jamais dans la file : le titre cliqué y était en
 * tête, et un second « Précédent » le rejouait au lieu de reculer.
 *
 * Deux chemins mènent à ce geste, et partagent ce module :
 *   - `playback.playFromHere` (anciens écrans) ;
 *   - `lectureEnMasse.lireListeDepuis` (écrans V2 : Favoris, Recherche,
 *     Bibliothèque, Streaming, `ListePistesV2`…).
 *
 * Une liste 100 % locale n'en a pas besoin : `POST /zones/{id}/play` prend la
 * liste entière en `track_ids` et part de `start_index`. Une liste de service
 * ou mixte ne le peut pas (`/play` ne prend qu'UNE piste de service) : on la
 * lance, on enfile la suite, puis on insère ce qui précède en `position: 0`.
 */
import type { AddToQueueRequest } from './api';
import { corpsDeFile, corpsDeFileListe, estPisteLocale } from './pisteFile';
import type { Track } from './types';

/**
 * Ce serveur fait-il suivre la piste en cours quand on insère AVANT elle ?
 *
 * tune-server-rust#5770 : depuis ce correctif, `queue_add` décale le curseur
 * et le dit par un champ additif, `queue_position`. Un serveur plus ancien ne
 * l'envoie pas et garde l'ancien curseur : une insertion en tête lui ferait
 * désigner une ligne insérée au lieu de la piste qui joue. On ne remet donc
 * les titres précédents en tête que si la réponse porte le champ.
 *
 * Mémorisé pour la session : la PREMIÈRE réponse suffit, et c'est elle qui
 * permet de trancher quand le titre cliqué est le dernier de la liste (aucune
 * suite à enfiler, donc aucune réponse à lire avant l'insertion en tête).
 */
let serveurSuitLeCurseur: boolean | null = null;

/** Relever, dans une réponse de `POST /zones/{id}/queue/add`, ce que sait le serveur. */
export function noterReponseAjout(rep: unknown): void {
  if (rep && typeof rep === 'object') {
    serveurSuitLeCurseur = typeof (rep as { queue_position?: unknown }).queue_position === 'number';
  }
}

/** Le serveur a-t-il annoncé `queue_position` ? Inconnu vaut non. */
export function peutRemettreEnTete(): boolean {
  return serveurSuitLeCurseur === true;
}

/** Pour les épreuves seulement : repartir d'un serveur inconnu. */
export function oublierCapaciteCurseur(): void {
  serveurSuitLeCurseur = null;
}

/**
 * Combien de titres PRÉCÉDENTS « Lire à partir d'ici » remet dans la file
 * (#5758, point 1).
 *
 * La file reçoit la liste entière pour que « Précédent » remonte la liste.
 * Mais une liste peut être très longue (les Titres d'une grande bibliothèque,
 * des milliers de favoris) : cliquer le 4 000ᵉ titre enverrait 3 999 titres
 * que personne ne remontera un par un, et, sur une liste mixte, autant de
 * segments à insérer. On garde donc les `PRECEDENTS_MAX` titres qui précèdent
 * IMMÉDIATEMENT le titre cliqué ; au-delà, la file commence plus bas dans la
 * liste. La SUITE n'est pas bornée : c'était déjà le cas avant ce correctif,
 * et la borner retirerait des titres qu'on entendait jusqu'ici.
 *
 * 200 : vingt fois plus que les « Précédent » d'une écoute ordinaire, et une
 * requête qui reste petite (200 identifiants).
 */
export const PRECEDENTS_MAX = 200;

/** Les `PRECEDENTS_MAX` derniers éléments de `avant`, dans leur ordre. */
export function bornerPrecedents<T>(avant: readonly T[]): T[] {
  return avant.slice(Math.max(0, avant.length - PRECEDENTS_MAX));
}

/**
 * Découpe une liste en segments CONSÉCUTIFS homogènes (tout local, ou tout
 * service), dans l'ordre.
 *
 * Dans une même requête `queue/add`, le serveur range les pistes locales APRÈS
 * les pistes de service : une liste mixte envoyée d'un bloc perdrait son ordre.
 * Un segment homogène, lui, le garde. Une liste qui alterne (local, service,
 * local) fait autant de segments que de changements, jamais plus.
 */
export function segmentsHomogenes(liste: readonly Track[]): Track[][] {
  const segments: Track[][] = [];
  let courant: Track[] = [];
  let local: boolean | null = null;
  for (const t of liste) {
    const l = estPisteLocale(t);
    if (local !== null && l !== local) {
      segments.push(courant);
      courant = [];
    }
    courant.push(t);
    local = l;
  }
  if (courant.length) segments.push(courant);
  return segments;
}

/** Le corps d'ajout d'un segment homogène, au rang donné. */
function corpsDuSegment(segment: readonly Track[], position?: number): AddToQueueRequest | null {
  return segment.length === 1 ? corpsDeFile(segment[0], position) : corpsDeFileListe([...segment], position);
}

/**
 * Les requêtes qui remettent `avant` en tête, dans l'ordre : un appel par
 * segment homogène, aux rangs 0, n₁, n₁ + n₂… (rangs NOMINAUX : à
 * l'exécution, `remettreLesPrecedents` les recale sur ce que le serveur a
 * réellement inséré).
 */
export function corpsDesPrecedents(avant: readonly Track[]): AddToQueueRequest[] {
  const corps: AddToQueueRequest[] = [];
  let rang = 0;
  for (const segment of segmentsHomogenes(avant)) {
    const c = corpsDuSegment(segment, rang);
    if (c) corps.push(c);
    rang += segment.length;
  }
  return corps;
}

/** Ce que la réponse de `queue/add` dit avoir inséré, si elle le dit. */
function insere(rep: unknown, defaut: number): number {
  const n = rep && typeof rep === 'object' ? (rep as { added?: unknown }).added : undefined;
  return typeof n === 'number' && n >= 0 ? n : defaut;
}

/**
 * Enfiler `liste` à la FIN de la file, segment par segment, dans l'ordre.
 * Chaque réponse est relevée par `noterReponseAjout`.
 */
export async function enfilerDansLOrdre(
  liste: readonly Track[],
  enfiler: (corps: AddToQueueRequest) => Promise<unknown>,
): Promise<void> {
  for (const segment of segmentsHomogenes(liste)) {
    const c = corpsDuSegment(segment);
    if (c) noterReponseAjout(await enfiler(c));
  }
}

/**
 * Insérer `avant` en tête si le serveur garde la piste en cours sous le
 * curseur. Rend `true` si l'insertion a été envoyée.
 *
 * Le rang du segment suivant est celui que le serveur a RÉELLEMENT atteint
 * (`added` de la réponse) : une piste locale disparue de la bibliothèque
 * n'est pas insérée, et un rang nominal glisserait alors d'une ligne.
 */
export async function remettreLesPrecedents(
  avant: readonly Track[],
  enfiler: (corps: AddToQueueRequest) => Promise<unknown>,
): Promise<boolean> {
  if (!avant.length || !peutRemettreEnTete()) return false;
  let rang = 0;
  let envoye = false;
  for (const segment of segmentsHomogenes(avant)) {
    const c = corpsDuSegment(segment, rang);
    if (!c) continue;
    rang += insere(await enfiler(c), segment.length);
    envoye = true;
  }
  return envoye;
}
