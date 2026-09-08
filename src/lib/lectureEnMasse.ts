/**
 * « Tout lire » et « Lecture aléatoire », une fois pour toutes les surfaces.
 *
 * Réf. `renesenses/tune-server-rust#1947` — « des boutons Tout lire et Lecture
 * aléatoire dans Collections, Listes de lecture, et les listes Qobuz / Tidal /
 * YouTube ». Le triage du ticket l'a établi : rien ne manque côté serveur,
 * c'est une lacune d'interface, absente selon les vues.
 *
 * ## Ce que ce module tranche, et pourquoi il existe
 *
 * Le geste « rassembler des pistes puis lancer » était recopié à la main dans
 * six écrans, avec QUATRE mélanges différents :
 *
 *   - `LibraryView` (deux fois) et `CollectionsView` : Fisher-Yates réécrit
 *     à chaque endroit ;
 *   - `FavoritesView` / `PlaylistsView` : `melangee`, le module ;
 *   - `AlbumDetailV2` : `(i * 7 + 3) % (i + 1)`, un mélange DÉTERMINISTE —
 *     « la meme permutation pour un meme nombre de pistes » ;
 *   - `MediaServersView` : `sort(() => Math.random() - 0.5)`, précisément le
 *     mélange biaisé que `lib/shuffle` documente comme à proscrire.
 *
 * Deux d'entre eux ne mélangent donc pas. Ce module n'en garde qu'un, celui de
 * `lib/shuffle`.
 *
 * ## 🔴 « Lecture aléatoire » n'ARME PAS le drapeau de la zone
 *
 * Le triage de #1947 posait la question, en la reliant à #2055 (« un drapeau
 * `shuffle` resté armé sans que l'utilisateur l'ait demandé »). La réponse est
 * déjà celle du code, et elle est gardée :
 *
 *   - l'en-tête Bibliothèque est une ACTION sans état → `api.shuffleAll` ;
 *   - la barre de transport est une BASCULE qui porte un état → `api.setShuffle`.
 *
 * C'est mot pour mot ce que tient `bibliothequeAleatoireAffordance.test.ts`,
 * né du signalement de Jean Valjean (#2261) : il cliquait le bouton de la
 * Bibliothèque en croyant ÉTEINDRE le mode, et relançait une lecture. Aucun
 * point d'entrée ajouté ici ne touche `setShuffle`.
 *
 * ## Deux voies, et laquelle prendre
 *
 * Quand le SERVEUR connaît la portée — album, artiste, genre, répertoire — il
 * tire lui-même, sur la portée ENTIÈRE : `POST /playback/shuffle-all`. C'est la
 * seule voie exacte quand la vue ne tient qu'une page de résultats. Les quatre
 * portées existent déjà dans `api.shuffleAll` ; trois d'entre elles
 * (`album_id`, `artist_id`, `genre`) n'avaient encore aucun appelant.
 *
 * Sinon — une liste de lecture, une collection, des titres trouvés — la portée
 * n'a pas de nom côté serveur : on mélange la liste qu'on a, et on l'envoie.
 */
import type { AddToQueueRequest } from './api';
import { corpsDeFileListe, corpsDeLecture, estPisteLocale } from './pisteFile';
import { melangee } from './shuffle';
import type { Track } from './types';
/** Les portées que `POST /playback/shuffle-all` sait tirer lui-même. */
export interface PorteeServeur {
  album_id?: number;
  artist_id?: number;
  genre?: string;
  folder?: string;
  search_query?: string;
}
/** Ce qu'il faut envoyer pour lancer une liste. */
export type PlanLecture =
  /** Aucune piste désignable : on n'envoie rien plutôt qu'une requête refusée. */
  | { voie: 'rien' }
  /** Liste entièrement LOCALE : un seul aller-retour, la file part d'un coup. */
  | { voie: 'lot'; corps: { track_ids: number[] }; pistes: number }
  /**
   * Liste mixte ou de service : la tête lance la lecture (et remplace la file),
   * le reste s'enfile derrière en UNE requête. C'est le geste que recopiaient
   * déjà `FavoritesView`, `PlaylistsView` et `AlbumDetailV2`.
   */
  | { voie: 'tete-et-reste'; tete: Record<string, unknown>; reste: AddToQueueRequest | null; pistes: number };
/** Les pistes qu'on sait désigner — les autres ne partiraient nulle part. */
export function pistesJouables(liste: readonly Track[]): Track[] {
  return liste.filter((t) => corpsDeLecture(t) != null);
}
/**
 * Le plan de lecture d'une liste, dans SON ordre. Fonction pure : la garde
 * l'appelle, elle ne lit pas le texte d'un composant.
 */
export function planDeLecture(liste: readonly Track[]): PlanLecture {
  const jouables = pistesJouables(liste);
  if (!jouables.length) return { voie: 'rien' };
  if (jouables.every((t) => estPisteLocale(t))) {
    return {
      voie: 'lot',
      corps: { track_ids: jouables.map((t) => t.id!) },
      pistes: jouables.length,
    };
  }
  return {
    voie: 'tete-et-reste',
    tete: corpsDeLecture(jouables[0])!,
    reste: corpsDeFileListe(jouables.slice(1)),
    pistes: jouables.length,
  };
}
/** Le même plan, sur la liste MÉLANGÉE. Aucun drapeau de zone n'est touché. */
export function planAleatoire(liste: readonly Track[]): PlanLecture {
  return planDeLecture(melangee(pistesJouables(liste)));
}
/** Une portée est utilisable si elle porte au moins un critère renseigné. */
export function porteeUtilisable(p: PorteeServeur | null | undefined): boolean {
  if (!p) return false;
  return Object.values(p).some((v) => v != null && v !== '');
}
/** Ce que l'appelant doit fournir : le module ne connaît ni l'API ni les zones. */
export interface GestesLecture {
  lire: (corps: Record<string, unknown>) => Promise<unknown>;
  enfiler: (corps: AddToQueueRequest) => Promise<unknown>;
}
/**
 * Exécute un plan. Rend le nombre de pistes envoyées — zéro veut dire « rien
 * n'était désignable », et c'est à l'écran de le dire.
 */
export async function executer(plan: PlanLecture, g: GestesLecture): Promise<number> {
  if (plan.voie === 'rien') return 0;
  if (plan.voie === 'lot') {
    await g.lire(plan.corps as Record<string, unknown>);
    return plan.pistes;
  }
  await g.lire(plan.tete);
  if (plan.reste) await g.enfiler(plan.reste);
  return plan.pistes;
}
/** « Tout lire » : la liste, dans son ordre. */
export function lireListe(liste: readonly Track[], g: GestesLecture): Promise<number> {
  return executer(planDeLecture(liste), g);
}
/** « Lecture aléatoire » : la MÊME liste, mélangée. Jamais `setShuffle`. */
export function lireListeAleatoire(liste: readonly Track[], g: GestesLecture): Promise<number> {
  return executer(planAleatoire(liste), g);
}
