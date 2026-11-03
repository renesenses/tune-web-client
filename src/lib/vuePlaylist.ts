/**
 * Écran d'une playlist : liste ou pochettes, taille des vignettes, en-tête
 * compact — web#2601 (go de Bertrand du 01/11/2026, rc11).
 *
 * Un testeur (fil forum 2592) regarde son iMac 21,5 pouces à 90 cm : les
 * vignettes de la playlist sont trop petites, et la grande vignette de
 * l'en-tête mange la place de 4 à 5 lignes.
 *
 * ## Pas de mécanisme neuf
 *
 * Ni la Bibliothèque ni Oxygen ne portent de curseur de taille : leurs
 * « petites / grandes vignettes / liste » sont des choix discrets rangés par
 * `lib/preferencesEcran` (cf. `basculeAffichagePlaylists2057`). On reprend CE
 * rangement (même préfixe, mêmes lectures validées) ; seul le curseur est
 * nouveau, parce que c'est ce que le go demande.
 *
 * ## Règle de #1650
 *
 * Rien n'est ÉCRIT au montage : un défaut écrit se figerait en faux choix.
 * On n'écrit que sur un geste de l'utilisateur.
 */
import { lireChoix, ecrireChoix, lireNombre } from './preferencesEcran';

export type VuePlaylist = 'liste' | 'pochettes';
export const VUES_PLAYLIST: readonly VuePlaylist[] = ['liste', 'pochettes'];

export const CLE_VUE_PLAYLIST = 'v2.playlist.vue';
export const CLE_TAILLE_LISTE = 'v2.playlist.tailleListe';
export const CLE_TAILLE_POCHETTES = 'v2.playlist.taillePochettes';
export const CLE_ENTETE_PLAYLIST = 'v2.playlist.entete';

/** Bornes du curseur, en pixels. Le défaut de la liste est la taille d'avant (36). */
export const BORNES_TAILLE: Record<VuePlaylist, { min: number; max: number; pas: number; defaut: number }> = {
  liste: { min: 36, max: 96, pas: 4, defaut: 36 },
  pochettes: { min: 96, max: 320, pas: 8, defaut: 160 },
};

export function bornerTaille(vue: VuePlaylist, n: number): number {
  const b = BORNES_TAILLE[vue];
  if (!Number.isFinite(n)) return b.defaut;
  return Math.min(b.max, Math.max(b.min, Math.round(n)));
}

export function lireVuePlaylist(): VuePlaylist {
  return lireChoix(CLE_VUE_PLAYLIST, VUES_PLAYLIST, 'liste');
}
export function ecrireVuePlaylist(v: VuePlaylist): void {
  ecrireChoix(CLE_VUE_PLAYLIST, v);
}

const cleTaille = (v: VuePlaylist) => (v === 'liste' ? CLE_TAILLE_LISTE : CLE_TAILLE_POCHETTES);

/** La taille retenue pour cette vue, bornée ; illisible ou absente : le défaut. */
export function lireTaille(vue: VuePlaylist): number {
  const n = lireNombre(cleTaille(vue));
  return n == null ? BORNES_TAILLE[vue].defaut : bornerTaille(vue, n);
}
export function ecrireTaille(vue: VuePlaylist, n: number): number {
  const v = bornerTaille(vue, n);
  ecrireChoix(cleTaille(vue), String(v));
  return v;
}

export function lireEnteteCompact(): boolean {
  return lireChoix(CLE_ENTETE_PLAYLIST, ['compact', 'normal'] as const, 'normal') === 'compact';
}
export function ecrireEnteteCompact(compact: boolean): void {
  ecrireChoix(CLE_ENTETE_PLAYLIST, compact ? 'compact' : 'normal');
}
