// tune-server-rust#7840 — recul appliqué à la reprise d'un podcast, borné à
// 0–60 s (décision du 04/11). Le serveur refuse au-delà et relit à 60 une
// valeur enregistrée sous l'ancienne borne (300 s) : le champ des Réglages
// suit la même borne, pour ne jamais proposer ce que le serveur refusera.
export const RECUL_PODCAST_MIN = 0;
export const RECUL_PODCAST_MAX = 60;

/** La saisie du champ, en secondes entières dans 0–60 ; `null` sinon. */
export function reculPodcastSaisi(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < RECUL_PODCAST_MIN || value > RECUL_PODCAST_MAX) return null;
  return value;
}
