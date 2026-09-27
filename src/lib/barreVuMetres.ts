import { BAS_FACE, HAUT_FACE } from './dessinVuMetre';

/**
 * LA BARRE DE LECTURE À VU-MÈTRES — Bertrand, 27/09/2026, maquette de Levente.
 *
 * « Une seconde transport bar via toggle réglages qui affiche les vu-mètres à
 * gauche et droite ». Un cadran L entre le titre et les commandes, un cadran R
 * entre les commandes et les réglages de zone.
 *
 * Ce module ne porte que les DEUX règles que le test peut appeler. Le dessin
 * est dans `dessinVuMetre.ts`, l'échelle dans `tvVuScale.ts`.
 */

/**
 * Le côté du cadran, en pixels de CSS. La toile en déduit sa hauteur.
 *
 * La géométrie est celle du Grand écran, à l'identique : là-bas les deux
 * cadrans partagent une toile large de `w`, chacun d'un rayon de `0,42 · w/2`.
 * Un cadran SEUL dans une toile large de `t` est donc le même dessin avec
 * `t = w/2`, d'où le rayon `0,42 t`.
 *
 * 🔴 Sa HAUTEUR, en revanche, ne se recopie pas du Grand écran : elle se déduit
 * de la face (`cadreCadran`). Recopiée, elle coupait le haut du cadran et
 * laissait du vide en bas — invisible sur un cadran de 235 px, criant sur un
 * cadran de 35.
 */
export const TAILLE_VU_BARRE = 84;

/** Le rayon de la face, en fraction du côté. C'est la cote du Grand écran. */
export const RAYON_VU = 0.42;

/**
 * Le rapport hauteur/largeur d'un cadran seul.
 *
 * 🔴 Il n'est plus écrit à la main — il se DÉDUIT de la face. Écrit à la main
 * il valait 0,68, recopié du Grand écran ; or cette hauteur-là laissait du vide
 * en bas et coupait le haut de la face, ce que Bertrand a vu tout de suite sur
 * le .18 (« mal centrés… en hauteur ! »). Une cote recopiée d'une surface où le
 * défaut ne se voyait pas est une cote fausse qui voyage.
 */
export const RATIO_VU = (HAUT_FACE + BAS_FACE) * RAYON_VU;

/**
 * 🔴 EN DESSOUS DE CETTE LARGEUR DE BARRE, ON RETOMBE SUR LA BARRE NORMALE.
 *
 * Arbitrage de Bertrand du 27/09/2026, choisi parmi trois : ni cadrans
 * rétrécis (sous une certaine taille, une aiguille et ses graduations ne se
 * lisent plus), ni cadran unique (on garderait l'instrument en perdant la
 * stéréo, qui est tout son sujet).
 *
 * ⚠️ La mesure porte sur la largeur de LA BARRE, pas sur celle de la fenêtre.
 * La colonne latérale prend ~280 px : à fenêtre large, la barre peut être
 * étroite. Le fichier de styles de la barre le dit déjà pour ses propres
 * seuils (`container-type: inline-size`), et se tromper de mesure ici
 * rétablirait les cadrans précisément là où il n'y a pas la place.
 *
 * 1280 : deux cadrans et leurs marges prennent ~200 px, et la barre est déjà
 * déclarée à l'étroit sous 1080 px par sa propre requête de conteneur.
 */
export const SEUIL_VU_PX = 1280;

/**
 * Les cadrans doivent-ils être affichés ?
 *
 * 🔴 `largeur === 0` rend `false` : c'est la valeur AVANT la première mesure,
 * et non une barre de zéro pixel. Afficher les cadrans par défaut pour les
 * masquer à la première image donnerait un sursaut de mise en page à chaque
 * montage — et le contraire (les cacher puis les montrer) n'en donne qu'un
 * seul, au premier affichage, sur une barre qui vient d'apparaître.
 */
export function vuMetresVisibles(regle: boolean | undefined, largeurBarre: number): boolean {
  if (!regle) return false;
  return largeurBarre >= SEUIL_VU_PX;
}
