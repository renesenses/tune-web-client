/**
 * Fil 2094 — ce qui DISTINGUE deux albums candidats dans le sélecteur
 * Métadonnées › Coffret.
 *
 * Vingt-sept « Arkhangelsk » s'y affichaient à l'identique : même titre, même
 * artiste, même nombre de pistes. Ce qui les sépare, c'est leur dossier
 * (`…/Arkhangelsk/CD07`) et leur numéro de disque — que `GET
 * /library/albums-detailed` transmet désormais (`folder`, `disc_number`).
 */

/** Les `segments` derniers éléments d'un chemin, `/` comme `\` : la fin
 *  qui se lit dans une ligne, précédée de « … » quand elle est coupée. */
export function finDeDossier(dossier: string | null | undefined, segments = 2): string | null {
  const brut = (dossier ?? '').trim().replace(/[\\/]+$/, '');
  if (!brut) return null;
  const parties = brut.split(/[\\/]+/).filter((p) => p !== '');
  if (!parties.length) return null;
  const fin = parties.slice(-segments).join('/');
  return parties.length > segments ? `…/${fin}` : fin;
}
