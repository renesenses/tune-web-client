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
 * Les requêtes qui remettent `avant` en tête, dans l'ordre.
 *
 * Une liste homogène part en un appel. Une liste mixte part ligne par ligne,
 * aux rangs 0, 1, 2… : dans une même requête, le serveur range les pistes
 * locales APRÈS les pistes de service, ce qui briserait l'ordre.
 */
export function corpsDesPrecedents(avant: readonly Track[]): AddToQueueRequest[] {
  if (!avant.length) return [];
  const locales = avant.filter((t) => estPisteLocale(t));
  if (locales.length === avant.length || locales.length === 0) {
    const corps = corpsDeFileListe([...avant], 0);
    return corps ? [corps] : [];
  }
  return avant
    .map((t, i) => corpsDeFile(t, i))
    .filter((c): c is AddToQueueRequest => c != null);
}

/**
 * Insérer `avant` en tête si le serveur garde la piste en cours sous le
 * curseur. Rend `true` si l'insertion a été envoyée.
 */
export async function remettreLesPrecedents(
  avant: readonly Track[],
  enfiler: (corps: AddToQueueRequest) => Promise<unknown>,
): Promise<boolean> {
  if (!avant.length || !peutRemettreEnTete()) return false;
  const corps = corpsDesPrecedents(avant);
  if (!corps.length) return false;
  for (const c of corps) await enfiler(c);
  return true;
}
