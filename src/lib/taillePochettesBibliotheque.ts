/**
 * Taille des pochettes dans la grille de la Bibliothèque — go de Bertrand du
 * 17/11/2026 pour la rc13 (forum, fil 2897, web#3189).
 *
 * Les pochettes de la grille sont trop petites par défaut, et le réglage de
 * taille du texte ne les agrandit pas : il ne joue que sur les polices. Un
 * curseur dans la barre d'outils de la Bibliothèque règle la largeur minimale
 * d'une case ; la grille garde `auto-fill`, donc moins de colonnes et des
 * pochettes plus grandes.
 *
 * ## Une ÉCHELLE, pas une largeur
 *
 * Le curseur parle en pixels de la grille des Albums (148 par défaut). Ce
 * qui descend en CSS est une échelle (`--v2-lib-pochette-echelle`) : chaque
 * grille de l'écran garde SA base (148 pour Albums, Labels et Artistes, 150
 * pour Ajouts récents et Coffrets) et ne bouge pas tant qu'on n'a rien
 * choisi.
 *
 * ## Deux colonnes au moins
 *
 * La case est plafonnée à `50% - (gouttière / 2 + 1 px)` de la boîte de
 * contenu de la grille : le pourcentage s'y lit APRÈS le padding et après le
 * rail A–Z (frère de la grille), et deux cases plus une gouttière tiennent
 * toujours. `colonnesGrille` refait ce calcul pour les tests ; il suit la
 * règle CSS `minmax(min(calc(<base> * échelle), calc(50% - <marge>)), 1fr)`.
 *
 * ## Règle de #1650
 *
 * Rien n'est ÉCRIT au montage : on n'écrit que sur un geste (fin du geste,
 * `change`, pas chaque `input`).
 */
import { ecrireChoix, lireNombre } from './preferencesEcran';

export const CLE_TAILLE_POCHETTES_BIBLIOTHEQUE = 'lib.taillePochettes';

/** Bornes du curseur, en pixels de la grille Albums. Le défaut est la taille d'avant (148). */
export const BORNES_TAILLE_POCHETTES = { min: 112, max: 320, pas: 8, defaut: 148 } as const;

export function bornerTaillePochettes(n: number): number {
  const b = BORNES_TAILLE_POCHETTES;
  if (!Number.isFinite(n)) return b.defaut;
  return Math.min(b.max, Math.max(b.min, Math.round(n)));
}

/** La taille retenue, bornée ; illisible ou absente : le défaut. */
export function lireTaillePochettes(): number {
  const n = lireNombre(CLE_TAILLE_POCHETTES_BIBLIOTHEQUE);
  return n == null ? BORNES_TAILLE_POCHETTES.defaut : bornerTaillePochettes(n);
}

export function ecrireTaillePochettes(n: number): number {
  const v = bornerTaillePochettes(n);
  ecrireChoix(CLE_TAILLE_POCHETTES_BIBLIOTHEQUE, String(v));
  return v;
}

/** L'échelle descendue en CSS : 1 à la taille d'avant. */
export function echellePochettes(taille: number): number {
  return Math.round((bornerTaillePochettes(taille) / BORNES_TAILLE_POCHETTES.defaut) * 10000) / 10000;
}

/** Ce que le plafond retranche à la demi-largeur : la demi-gouttière, plus un pixel d'arrondi. */
export function margeDeuxColonnes(gouttiere: number): number {
  return gouttiere / 2 + 1;
}

/**
 * Les colonnes que dessine `repeat(auto-fill, minmax(min(calc(base × échelle),
 * calc(50% − marge)), 1fr))` dans une boîte de contenu de `largeur` px.
 */
export function colonnesGrille(largeur: number, base: number, taille: number, gouttiere: number): number {
  const voulue = base * echellePochettes(taille);
  const plafond = largeur / 2 - margeDeuxColonnes(gouttiere);
  const min = Math.max(1, Math.min(voulue, plafond));
  return Math.max(1, Math.floor((largeur + gouttiere) / (min + gouttiere)));
}
