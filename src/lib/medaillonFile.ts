import { formaterPluriel } from './pluriel';
/**
 * web#2389 — FabienM (fil 2431, rc7) : « comme sur l'appli Android, mettre le
 * médaillon du nombre de titres sur le bouton file d'attente de la barre de
 * lecture ». Discussion renesenses/tune-server-rust#7461, go de Bertrand du
 * 12/11/2026 (rc12).
 *
 * Le nombre porté est la LONGUEUR TOTALE de la file (`queueTracks.length`),
 * ce qu'affiche l'appli Android, et non les seuls titres à venir. Le
 * médaillon disparaît quand la file est vide ; au-delà de 99, « 99+ » pour
 * ne pas élargir la barre.
 */

/** Texte du médaillon, ou `null` quand il n'y a rien à afficher. */
export function texteMedaillonFile(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 99 ? '99+' : String(Math.floor(n));
}

/** Infobulle et nom accessible du bouton : le nom de la file et son nombre de titres. */
export function libelleBoutonFile(traduire: (cle: string) => string, n: number, langue = 'fr'): string {
  if (!Number.isFinite(n) || n <= 0) return traduire('nav.queue');
  return formaterPluriel(traduire('transport.queueCountN'), Math.floor(n), langue);
}
