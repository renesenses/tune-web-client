/**
 * Le panneau FILE de la vue mini — les règles, isolées pour être éprouvées
 * sans monter le panneau.
 *
 * Bertrand, essai réel du 01/11/2026 sur le .18 : « affichage file d'attente
 * pourri, en mode mini ». Le panneau montait `QueueV2`, l'écran de bureau, avec
 * ses colonnes : à 360 px elles se chevauchaient. Le panneau a désormais sa
 * propre liste : une ligne par titre, hauteur FIXE (ce qui rend la
 * virtualisation exacte, sans mesure), titre en cours en carte au-dessus de
 * la liste « À suivre », toujours visible à l'ouverture.
 */

/** Hauteur d'une ligne du panneau, en px. Fixe : la CSS la pose telle quelle. */
export const HAUTEUR_LIGNE_FILE = 56;

/**
 * Le rang d'arrivée d'une ligne qu'on glisse, d'après le déplacement vertical
 * du doigt depuis le début du geste. Borné à la file.
 */
export function rangDArrivee(depart: number, deltaY: number, total: number, hauteurLigne: number = HAUTEUR_LIGNE_FILE): number {
  if (!(total > 0)) return 0;
  const pas = Math.round(deltaY / hauteurLigne);
  return Math.max(0, Math.min(total - 1, depart + pas));
}

/** Durée compacte : `9:22`, `1:02:05`. Vide sans durée. */
export function dureeCompacte(ms: number | null | undefined): string {
  if (!ms || !(ms > 0)) return '';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
