import { formaterPluriel } from './pluriel';
/**
 * web#2389 — FabienM (fil 2431, rc7) : « comme sur l'appli Android, mettre le
 * médaillon du nombre de titres sur le bouton file d'attente de la barre de
 * lecture ». Discussion renesenses/tune-server-rust#7461, go de Bertrand du
 * 12/11/2026 (rc12).
 *
 * Recette rc12 du 13/11 sur le .18 : la page File disait « 9 à suivre » et le
 * médaillon « 18 » (album de 18 titres, 9e en cours). Le médaillon portait la
 * LONGUEUR TOTALE de la file, titres déjà joués compris. Il porte désormais
 * les titres À SUIVRE (`upNextCount`, le même dérivé que la page File et le
 * bandeau de Lecture en cours) : il décroît pendant l'écoute et disparaît
 * quand plus rien ne suit. Au-delà de 99, « 99+ » pour ne pas élargir la barre.
 */

/** Texte du médaillon (titres à suivre), ou `null` quand il n'y a rien à afficher. */
export function texteMedaillonFile(aSuivre: number): string | null {
  if (!Number.isFinite(aSuivre) || aSuivre <= 0) return null;
  return aSuivre > 99 ? '99+' : String(Math.floor(aSuivre));
}

/**
 * Infobulle et nom accessible du bouton : la file, son nombre total de titres
 * (nommé comme tel) et, s'il en reste, le nombre à suivre — celui du médaillon.
 * « File d'attente · 18 titres · 9 à suivre ».
 */
export function libelleBoutonFile(
  traduire: (cle: string) => string,
  total: number,
  aSuivre: number,
  langue = 'fr'
): string {
  if (!Number.isFinite(total) || total <= 0) return traduire('nav.queue');
  const base = formaterPluriel(traduire('transport.queueCountN'), Math.floor(total), langue);
  if (!Number.isFinite(aSuivre) || aSuivre <= 0) return base;
  return `${base} · ${traduire('v2.queue.upNextCount').replace('{n}', String(Math.floor(aSuivre)))}`;
}
