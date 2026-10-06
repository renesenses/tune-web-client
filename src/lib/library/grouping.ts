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
  sectionsDuDisque(discTracks).forEach((label, i) => {
    const id = discTracks[i].id;
    if (label && id != null) heads.set(id, label);
  });
  return heads;
}

/** La règle sur UN disque, rang par rang : le libellé à poser avant le rang
 *  `i`, ou `null`. Toujours de la longueur de `discTracks`. */
function sectionsDuDisque(discTracks: readonly Track[]): (string | null)[] {
  const values = discTracks.map(t => (t.grouping ?? '').trim());
  // Une seule valeur distincte (y compris « aucune ») : rien à découper.
  if (new Set(values).size < 2) return values.map(() => null);
  let prev = '';
  return values.map((cur) => {
    const head = cur && cur !== prev ? cur : null;
    prev = cur;
    return head;
  });
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

/**
 * 🔴 tune-web-client#1862 — la même règle pour la fiche d'album V2, PAR RANG.
 *
 * Seule l'ancienne fiche (`LibraryView.svelte`) appelait ce module ; elle est
 * partie en v0.9.158 (`d5ed7deb`) et les sections GROUPING avec elle, alors
 * que le serveur joint toujours la balise aux pistes d'un album. La liste V2
 * (`ListePistesV2`) annonce déjà chaque disque PAR RANG (`enTetesDisque`) :
 * elle ne réordonne rien, parce que le rang d'une ligne est ce que la fiche
 * passe à `playAlbum(i)`. Les sections suivent la même discipline :
 *
 *  - un disque = une suite de rangs voisins de même `disc_number` (absent = 1,
 *    comme `enTetesDisque`) ; la liste arrive triée disque puis piste ;
 *  - rang plutôt qu'identifiant : une piste sans `id` garde sa section.
 *
 * @returns pour chaque rang, le libellé de section à poser avant lui, ou `null`.
 */
export function sectionsParRang(pistes: readonly Track[]): (string | null)[] {
  const out: (string | null)[] = [];
  const disqueDe = (p: Track): number => p.disc_number || 1;
  let debut = 0;
  for (let i = 1; i <= pistes.length; i++) {
    if (i === pistes.length || disqueDe(pistes[i]) !== disqueDe(pistes[debut])) {
      out.push(...sectionsDuDisque(pistes.slice(debut, i)));
      debut = i;
    }
  }
  return out;
}
