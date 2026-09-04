import type { Track } from '../types';

/**
 * Sections GROUPING d'un album (#2130).
 *
 * Le tag GROUPING (TIT1 / ©grp / GROUPING) découpe les pistes en sections
 * À L'INTÉRIEUR d'un disque — mouvements, ensembles, titres bonus — là où
 * DISCSUBTITLE nomme le disque entier. Il est lu au scan et rangé dans
 * `track_metadata` depuis longtemps ; jusqu'à #2130 aucune vue ne le ressortait.
 *
 * C'est un champ libre, et il est presque toujours absent : relevé à 0 piste
 * sur 1568 fichiers relus tag par tag (deux bibliothèques, 96 000 pistes,
 * échantillons aléatoires + échantillons « classique »). La règle ci-dessous
 * est donc taillée pour ne RIEN afficher tant que le tag n'apprend rien :
 *
 *  - un disque dont toutes les pistes portent la même valeur — ou aucune — ne
 *    reçoit aucun en-tête : une section unique ne découpe rien ;
 *  - les pistes sans GROUPING restent hors section ;
 *  - deux blocs disjoints portant le même libellé font deux sections, parce
 *    que l'ordre des pistes prime sur le regroupement par nom.
 *
 * @param discTracks les pistes d'UN disque, déjà dans l'ordre d'affichage.
 * @returns id de piste → libellé de section à poser juste avant elle.
 */
export function sectionHeadsForDisc(discTracks: Track[]): Map<number, string> {
  const heads = new Map<number, string>();
  const values = discTracks.map(t => (t.grouping ?? '').trim());
  // Une seule valeur distincte (y compris « aucune ») : rien à découper.
  if (new Set(values).size < 2) return heads;
  let prev = '';
  discTracks.forEach((t, i) => {
    const cur = values[i];
    if (cur && cur !== prev && t.id != null) heads.set(t.id, cur);
    prev = cur;
  });
  return heads;
}

/** Même règle, appliquée disque par disque : une section ne traverse jamais
 *  une frontière de disque. */
export function sectionHeads(tracksByDisc: Track[][]): Map<number, string> {
  const heads = new Map<number, string>();
  for (const discTracks of tracksByDisc) {
    for (const [id, label] of sectionHeadsForDisc(discTracks)) heads.set(id, label);
  }
  return heads;
}
