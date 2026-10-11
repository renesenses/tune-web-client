/**
 * web#1861 — minuteur de sommeil (Levente Toth, fil forum 2068).
 *
 * Deux demandes :
 *  1. pouvoir MASQUER le bouton lune de la barre de transport (réglage
 *     `afficherMinuteurSommeil`, sur le modèle des VU-mètres) ;
 *  2. une DURÉE LIBRE en plus des cinq durées proposées (15 min à 2 h).
 *
 * Côté serveur, rien à changer : `POST /zones/{id}/sleep` prend
 * `{ minutes: u64 }` (`tune-server/src/routes/playback.rs`, `SleepRequest`)
 * et décompte `minutes * 60` secondes. Il accepte donc tout ENTIER de
 * minutes — 5 ou 90 passent tels quels — mais ni seconde ni fraction de
 * minute : la saisie est en minutes entières. `0` y veut dire « annuler »,
 * d'où le minimum à 1.
 */

/** 24 h : au-delà, ce n'est plus un minuteur de sommeil, c'est une faute de frappe. */
export const MINUTES_LIBRES_MAX = 1440;

/**
 * La saisie libre, lue en minutes ENTIÈRES ; `null` si elle n'est pas
 * utilisable (vide, non entière, hors de 1…1440). Une saisie refusée n'envoie
 * rien : mieux vaut ne rien lancer que lancer autre chose que ce qui est écrit.
 */
export function minutesLibres(saisie: string | number | null | undefined): number | null {
  if (saisie == null) return null;
  const texte = String(saisie).trim();
  if (!/^\d+$/.test(texte)) return null;
  const n = Number(texte);
  if (!Number.isSafeInteger(n) || n < 1 || n > MINUTES_LIBRES_MAX) return null;
  return n;
}

/**
 * Le bouton lune est-il dessiné ?
 *
 * Masqué par le réglage, il REVIENT tant qu'une minuterie tourne — posée
 * depuis « Lecture en cours » ou depuis un autre client : sans lui, le
 * compte à rebours et le seul geste d'annulation de la barre disparaîtraient
 * pendant que la musique va s'arrêter toute seule.
 */
export function boutonMinuteurVisible(afficher: boolean | undefined, actif: boolean): boolean {
  return afficher !== false || actif;
}
