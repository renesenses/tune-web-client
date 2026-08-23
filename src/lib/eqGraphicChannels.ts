/**
 * Gauche et droite dans l'égaliseur **graphique**.
 *
 * Le paramétrique règle le canal bande par bande ([[eqChannel]]). Le graphique,
 * lui, n'a pas de bande à sélectionner : il a une grille figée et une courbe.
 * Deux canaux, ce sont donc **deux courbes** sur la même grille — et sur le fil,
 * la grille émise **deux fois**, une passe `channel: 0`, une passe `channel: 1`.
 *
 * Tout est ici plutôt que dans le composant parce que c'est la partie qui se
 * teste : le composant n'a plus qu'à dessiner.
 *
 * ## La règle qui ne doit pas bouger
 *
 * **Courbes liées = une seule passe, SANS le champ `channel`.** Pas `channel: -1`,
 * pas deux passes identiques. Le serveur lit l'absence du champ comme « tous les
 * canaux », et c'est ce qui garde intacts :
 *
 * - les préréglages enregistrés avant cette version, qui n'ont pas ce champ ;
 * - le comportement de quiconque ne délie jamais ses courbes ;
 * - le nombre de biquads — deux passes, c'est deux fois plus de filtres à
 *   calculer par zone, y compris sur le chemin réseau (DLNA, AirPlay).
 */

import type { EqBand } from './api';

/** Gauche et droite, dans l'ordre où on les dessine. */
export const CANAL_GAUCHE = 0;
export const CANAL_DROITE = 1;

/**
 * Les bandes à envoyer au serveur pour une grille graphique.
 *
 * @param grille    les fréquences, dans l'ordre (10, 15 ou 31 points)
 * @param gauche    les gains — la courbe **unique** quand `droite` est `null`
 * @param droite    `null` = courbes liées ; sinon la courbe du canal droit
 * @param q         le Q de la grille
 */
export function bandesGraphiques(
  grille: number[],
  gauche: number[],
  droite: number[] | null,
  q: number,
): EqBand[] {
  if (droite === null) {
    // Liées : exactement ce que le graphique a toujours envoyé.
    return grille.map((freq, i) => ({ freq, gain: gauche[i] ?? 0, q }));
  }
  return [
    ...grille.map((freq, i) => ({ freq, gain: gauche[i] ?? 0, q, channel: CANAL_GAUCHE })),
    ...grille.map((freq, i) => ({ freq, gain: droite[i] ?? 0, q, channel: CANAL_DROITE })),
  ];
}

/**
 * L'opération inverse : retrouver les deux courbes depuis des bandes reçues.
 *
 * Sert au rechargement d'un préréglage. Une bande **sans canal** vise les deux,
 * donc elle alimente les deux courbes — un préréglage d'avant cette version se
 * relit ainsi sans perdre ses gains, et ressort `droite: null`, c'est-à-dire
 * lié, c'est-à-dire inchangé à l'enregistrement suivant.
 */
export function courbesDepuisBandes(
  bandes: EqBand[],
  taille: number,
): { gauche: number[]; droite: number[] | null } {
  const gauche = Array(taille).fill(0) as number[];
  const droite = Array(taille).fill(0) as number[];
  let vuUnCanal = false;

  bandes.forEach((b, i) => {
    // La grille est ordonnée : la i-ème bande d'une passe est le i-ème point.
    const rang = i % taille;
    if (b.channel === CANAL_GAUCHE) {
      gauche[rang] = b.gain;
      vuUnCanal = true;
    } else if (b.channel === CANAL_DROITE) {
      droite[rang] = b.gain;
      vuUnCanal = true;
    } else {
      gauche[rang] = b.gain;
      droite[rang] = b.gain;
    }
  });

  return vuUnCanal ? { gauche, droite } : { gauche, droite: null };
}

/**
 * Délier : la droite part de la gauche, à l'identique.
 *
 * Délier ne doit **rien** changer à ce qu'on entend — c'est une préparation, pas
 * un réglage. L'utilisateur bouge ensuite ce qu'il veut.
 */
export function delier(gauche: number[]): number[] {
  return [...gauche];
}

/**
 * Relier : la courbe qui survit est celle de **gauche**.
 *
 * Il faut en choisir une, et la deviner serait pire : une moyenne inventerait
 * une courbe que l'utilisateur n'a jamais réglée, et prendre la plus forte
 * changerait le niveau. Gauche est le canal 0, celui que l'écran édite par
 * défaut — c'est le choix que l'interface doit annoncer avant de l'appliquer.
 */
export function relier(): null {
  return null;
}
