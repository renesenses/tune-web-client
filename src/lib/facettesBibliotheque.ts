/**
 * Comptes des filtres de la bibliothèque, à jour des AUTRES filtres actifs.
 *
 * ## Le défaut
 *
 * Bertrand, 04/09/2026 : « les filtres cumulatifs ne modifient pas les valeurs
 * d'albums correspondants sur les filtres restants ». Exact, et de deux façons.
 *
 *  - `Format` et `Profondeur` affichaient un compte calculé sur TOUTE la
 *    bibliothèque. Filtrer sur Hi-Res laissait « FLAC 3 049 » alors que la
 *    combinaison n'en donne qu'une poignée.
 *  - `Qualité` et `Fréquence` n'affichaient AUCUN compte : leurs valeurs sont
 *    des listes en dur, dont la plupart ne correspondent à rien sur une
 *    bibliothèque donnée. On pouvait choisir « 384 kHz » et tomber sur zéro.
 *
 * Dans les deux cas le filtre PROMET des albums qu'il ne rendra pas.
 *
 * ## La règle : chaque facette se compte SANS elle-même
 *
 * Le compte d'une valeur de `Format` s'établit sur les albums qui satisfont
 * tous les filtres SAUF `Format`. C'est ce qui permet de passer de FLAC à WAV
 * sans repasser par zéro : si `Format` se comptait avec lui-même, choisir FLAC
 * mettrait toutes les autres valeurs à 0 et le menu deviendrait un cul-de-sac.
 *
 * C'est la règle des recherches à facettes, et elle n'est pas cosmétique : sans
 * elle, le seul geste possible après un filtre est de le retirer.
 */
import type { Album } from './types';

export interface FiltresBibliotheque {
  qualite: string | null;
  frequence: number | null;
  annee: number | null;
  format: string | null;
  profondeur: number | null;
  recherche: string;
}

/** Les facettes qui portent un compte. */
export type Facette = 'qualite' | 'frequence' | 'annee' | 'format' | 'profondeur';

export interface Outils {
  /** Le palier de qualité d'un album, tel que l'écran le calcule. */
  qualiteDe: (a: Album, cle: string) => boolean;
  /** L'année retenue, qui dépend du mode choisi par l'utilisateur. */
  anneeDe: (a: Album) => number | null;
  /** Repli de casse et d'accents, partagé avec la recherche de l'écran. */
  plier: (s: string | null | undefined) => string;
}

/**
 * L'album satisfait-il tous les filtres, SAUF celui qu'on est en train de
 * compter ?
 *
 * `sauf` à `null` veut dire « tous les filtres », ce qui donne la liste
 * réellement affichée.
 */
export function correspond(
  a: Album,
  f: FiltresBibliotheque,
  o: Outils,
  sauf: Facette | null = null,
): boolean {
  if (sauf !== 'qualite' && f.qualite && !o.qualiteDe(a, f.qualite)) return false;
  if (sauf !== 'frequence' && f.frequence && (a.sample_rate ?? 0) !== f.frequence) return false;
  if (sauf !== 'annee' && f.annee != null && o.anneeDe(a) !== f.annee) return false;
  if (sauf !== 'format' && f.format && (a.format?.trim().toUpperCase() ?? '') !== f.format) return false;
  if (sauf !== 'profondeur' && f.profondeur != null && (a.bit_depth ?? 0) !== f.profondeur) return false;
  // La RECHERCHE n'est pas une facette : elle ne s'exclut jamais. Compter les
  // formats d'albums qui ne correspondent pas au texte tapé n'aurait aucun sens.
  if (f.recherche && !o.plier(a.title).includes(o.plier(f.recherche))
      && !o.plier(a.artist_name).includes(o.plier(f.recherche))) return false;
  return true;
}

/** Albums à considérer pour compter une facette donnée. */
function assiette(albums: readonly Album[], f: FiltresBibliotheque, o: Outils, facette: Facette): Album[] {
  return albums.filter((a) => correspond(a, f, o, facette));
}

/** Combien d'albums pour chaque palier de qualité, l'un après l'autre. */
export function comptesQualite(
  albums: readonly Album[], f: FiltresBibliotheque, o: Outils, cles: readonly string[],
): Map<string, number> {
  const base = assiette(albums, f, o, 'qualite');
  return new Map(cles.map((c) => [c, base.reduce((n, a) => n + (o.qualiteDe(a, c) ? 1 : 0), 0)]));
}

/** Combien d'albums pour chaque fréquence proposée. */
export function comptesFrequence(
  albums: readonly Album[], f: FiltresBibliotheque, o: Outils, valeurs: readonly number[],
): Map<number, number> {
  const base = assiette(albums, f, o, 'frequence');
  return new Map(valeurs.map((v) => [v, base.reduce((n, a) => n + ((a.sample_rate ?? 0) === v ? 1 : 0), 0)]));
}

/** Les formats PRÉSENTS, avec leur compte, du plus fourni au moins fourni. */
export function comptesFormat(
  albums: readonly Album[], f: FiltresBibliotheque, o: Outils,
): [string, number][] {
  const m = new Map<string, number>();
  for (const a of assiette(albums, f, o, 'format')) {
    const v = a.format?.trim().toUpperCase();
    if (v) m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()].sort((x, z) => z[1] - x[1] || x[0].localeCompare(z[0]));
}

/** Les profondeurs PRÉSENTES, avec leur compte, par ordre croissant. */
export function comptesProfondeur(
  albums: readonly Album[], f: FiltresBibliotheque, o: Outils,
): [number, number][] {
  const m = new Map<number, number>();
  for (const a of assiette(albums, f, o, 'profondeur')) {
    const d = a.bit_depth ?? 0;
    if (d > 0) m.set(d, (m.get(d) ?? 0) + 1);
  }
  return [...m.entries()].sort((x, z) => x[0] - z[0]);
}
