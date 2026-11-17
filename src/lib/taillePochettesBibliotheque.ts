/**
 * Taille des pochettes dans la grille de la Bibliothèque — go de Bertrand du
 * 17/11/2026 pour la rc13 (demande du forum, fil 2897).
 *
 * Les pochettes de la grille sont trop petites par défaut, et le réglage de
 * taille du texte ne les agrandit pas : il ne joue que sur les polices. Un
 * curseur dans la barre d'outils de la Bibliothèque règle la largeur minimale
 * d'une case ; la grille garde `auto-fill`, donc moins de colonnes et des
 * pochettes plus grandes.
 *
 * ## Pas de mécanisme neuf
 *
 * Même rangement que le curseur de l'écran d'une playlist (web#2601,
 * `lib/vuePlaylist`) : `lib/preferencesEcran`, dans le navigateur. La place à
 * l'écran dépend de l'écran, pas du profil.
 *
 * ## Règle de #1650
 *
 * Rien n'est ÉCRIT au montage : on n'écrit que sur un geste.
 *
 * ## Téléphone
 *
 * La borne haute est plafonnée en CSS (`min(<taille>, 42vw)`) : sur un écran
 * étroit, la grille garde au moins deux colonnes quel que soit le réglage.
 */
import { ecrireChoix, lireNombre } from './preferencesEcran';

export const CLE_TAILLE_POCHETTES_BIBLIOTHEQUE = 'lib.taillePochettes';

/** Bornes du curseur, en pixels. Le défaut est la taille d'avant (148). */
export const BORNES_TAILLE_POCHETTES = { min: 112, max: 320, pas: 8, defaut: 148 } as const;

/** Plafond relatif à la largeur de la fenêtre : deux colonnes au moins sur un téléphone. */
export const PLAFOND_ECRAN_ETROIT = '42vw';

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

/** La valeur de la variable CSS `--v2-lib-pochette`, plafonnée sur écran étroit. */
export function largeurCasePochette(taille: number): string {
  return `min(${bornerTaillePochettes(taille)}px, ${PLAFOND_ECRAN_ETROIT})`;
}
