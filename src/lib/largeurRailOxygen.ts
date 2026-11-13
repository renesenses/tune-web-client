/**
 * La largeur de la colonne des FACETTES d'Oxygen, réglée à la main.
 *
 * Recette de Bertrand sur le .18 (rc12, 13/11/2026) : à 220 px fixes, les
 * valeurs longues des facettes — artistes, labels, genres, chemins de
 * dossiers — finissent toutes en « … ». On tire désormais le bord droit de la
 * colonne pour l'élargir, comme les colonnes du tableau des pistes (web#2584).
 *
 * ## Ce que ce module décide
 *
 *  - les BORNES : 180 à 480 px, et jamais au point de laisser moins de
 *    `LISTE_MIN_PX` à la liste centrale ;
 *  - la MÉMOIRE : par navigateur, dans les préférences d'affichage
 *    (`lib/preferencesEcran`), comme le repli de la barre latérale ou les
 *    largeurs de colonnes — la place à l'écran dépend de l'écran, pas du
 *    profil ;
 *  - le PAS du clavier (flèches gauche et droite).
 *
 * La largeur VOULUE (celle qu'on a réglée et qu'on retient) et la largeur
 * APPLIQUÉE (bornée par la place du moment) restent distinctes : rétrécir la
 * fenêtre comprime la colonne sans effacer le réglage, qui revient quand la
 * fenêtre s'élargit.
 */
import { effacerChoix, ecrireChoix, lireTexte } from './preferencesEcran';

export const RAIL_MIN_PX = 180;
export const RAIL_MAX_PX = 480;
/** Un peu plus large que les 220 px d'avant. */
export const RAIL_DEFAUT_PX = 260;
/** La liste centrale garde toujours au moins cette largeur. */
export const LISTE_MIN_PX = 360;
/** Le pas des flèches gauche et droite, comme les poignées du tableau des pistes. */
export const RAIL_PAS_CLAVIER_PX = 16;

const CLE = 'oxygen_largeur_facettes';

/**
 * Le plafond effectif quand `place` pixels sont à partager entre le rail et la
 * liste : `RAIL_MAX_PX`, sauf si la liste passait sous `LISTE_MIN_PX` — mais
 * jamais sous `RAIL_MIN_PX` (une fenêtre trop étroite comprime la liste, pas
 * le rail en dessous de son plancher).
 */
export function plafondRail(place?: number | null): number {
  if (place == null || !Number.isFinite(place) || place <= 0) return RAIL_MAX_PX;
  return Math.max(RAIL_MIN_PX, Math.min(RAIL_MAX_PX, Math.floor(place - LISTE_MIN_PX)));
}

/** Borne une largeur voulue, arrondie au pixel. Une valeur illisible rend la largeur par défaut. */
export function bornerLargeurRail(px: number, place?: number | null): number {
  const v = Number.isFinite(px) ? Math.round(px) : RAIL_DEFAUT_PX;
  return Math.min(plafondRail(place), Math.max(RAIL_MIN_PX, v));
}

/**
 * La largeur après une touche. `null` : la touche ne règle pas la largeur
 * (l'appelant la laisse passer). Origine/Fin vont aux bornes.
 */
export function largeurRailAuClavier(touche: string, actuelle: number, place?: number | null): number | null {
  switch (touche) {
    case 'ArrowLeft': return bornerLargeurRail(actuelle - RAIL_PAS_CLAVIER_PX, place);
    case 'ArrowRight': return bornerLargeurRail(actuelle + RAIL_PAS_CLAVIER_PX, place);
    case 'Home': return RAIL_MIN_PX;
    case 'End': return plafondRail(place);
    default: return null;
  }
}

/** La largeur retenue, bornée à 180–480 ; absente, illisible ou stockage indisponible : la largeur par défaut. */
export function lireLargeurRail(): number {
  const brut = lireTexte(CLE);
  if (brut == null || brut.trim() === '') return RAIL_DEFAUT_PX;
  const n = Number(brut);
  return Number.isFinite(n) ? bornerLargeurRail(n) : RAIL_DEFAUT_PX;
}

/** Retient une largeur (bornée sans tenir compte de la place du moment). */
export function ecrireLargeurRail(px: number): number {
  const v = bornerLargeurRail(px);
  ecrireChoix(CLE, String(v));
  return v;
}

/** Oublie le réglage (double-clic sur la poignée) et rend la largeur par défaut. */
export function retablirLargeurRail(): number {
  effacerChoix(CLE);
  return RAIL_DEFAUT_PX;
}
