import { sourceCorrespond } from './provenanceBibliotheque';
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

/**
 * Les filtres de la bibliothèque.
 *
 * ## Plusieurs valeurs par facette — #898
 *
 * Cyrille Moutia, fil 1665 : « je sélectionne aiff + flac et je filtre aussi
 * sur des fréquences d'échantillonnage différentes ». Arbitrage de Bertrand du
 * 11/09/2026 : OU À L'INTÉRIEUR d'une facette, ET ENTRE les facettes.
 *
 * Les facettes à valeurs listées portent donc un TABLEAU, et non plus un
 * scalaire. `[]` est l'absence de filtre — jamais `null` : une facette absente
 * et une facette vide se lisent pareil, et un seul cas vaut mieux que deux.
 *
 * 🔴 Les quatre autres champs ne sont pas des facettes à valeurs listées, et
 * restent scalaires à dessein :
 *  - `annee` est piloté par la FRISE (survol, curseur, navigation alphabétique)
 *    — un tableau y demanderait un autre geste que le clic, donc un autre
 *    écran ;
 *  - `compilation` est une bascule à une seule valeur offerte (voir plus bas) ;
 *  - `provenance` est partagée avec les onglets Artistes et Pistes, qui ne
 *    savent pas encore croiser plusieurs sources ;
 *  - `recherche` est du texte libre, pas une facette.
 * Ces quatre-là restent à instruire ; ce contrat-ci ne les tranche pas.
 */
export interface FiltresBibliotheque {
  /** Paliers de qualité cochés. `[]` = pas de filtre. */
  qualite: string[];
  /** Fréquences d'échantillonnage cochées, en Hz. `[]` = pas de filtre. */
  frequence: number[];
  annee: number | null;
  /** Formats cochés, en MAJUSCULES. `[]` = pas de filtre. */
  format: string[];
  /** Quantifications cochées, en bits. `[]` = pas de filtre. */
  profondeur: number[];
  recherche: string;
  /**
   * Compilations seulement (#1957). `null` = pas de filtre.
   *
   * 🔴 `false` n'est volontairement PAS proposé à l'écran, alors que le
   * serveur l'accepte (`?compilation=false`, `albums.rs`). La colonne est
   * écrite au scan et jamais devinée pour l'existant : sur une bibliothèque
   * indexée avant la v0.9.95, TOUS les albums valent `false`. Un filtre
   * « hors compilations » rendrait donc la bibliothèque entière et passerait
   * pour cassé, alors que « compilations » rendant peu ou rien se lit
   * correctement — il n'y en a pas encore de repérée.
   *
   * Le type reste `boolean | null` : le jour où le drapeau est fiable pour
   * l'existant, la valeur `false` marche déjà, seul le rendu est à ouvrir.
   */
  compilation: boolean | null;
  /**
   * D'OÙ vient l'album — le disque, ou UN serveur UPnP indexé (#4152).
   * `null` = toutes les sources, l'absence de filtre.
   *
   * 🔴 Le nom est `provenance`, et ce n'est pas un détail. Deux autres choses
   * s'appellent déjà « source » dans ce produit :
   *  - la facette `source` de `/library/tracks`, qui porte sur `source_media`
   *    — le SUPPORT d'origine (CD, vinyle) ;
   *  - le mode d'année « origine » de cet écran même (`v2.lib.yearOrigin`),
   *    qui oppose l'année d'ORIGINE à celle de l'édition.
   * Le libellé affiché reste « Source », qui est le mot de l'utilisateur ; le
   * nom du code est distinct pour qu'on ne les confonde jamais.
   *
   * Valeurs : `'local'`, ou `'upnp:<udn>'`.
   */
  provenance: string | null;
}

/** Les facettes qui portent un compte. */
export type Facette =
  'qualite' | 'frequence' | 'annee' | 'format' | 'profondeur' | 'compilation' | 'provenance';

export interface Outils {
  /** Le palier de qualité d'un album, tel que l'écran le calcule. */
  qualiteDe: (a: Album, cle: string) => boolean;
  /** L'année retenue, qui dépend du mode choisi par l'utilisateur. */
  anneeDe: (a: Album) => number | null;
  /** Repli de casse et d'accents, partagé avec la recherche de l'écran. */
  plier: (s: string | null | undefined) => string;
  /**
   * La provenance d'un album : `'local'`, ou `'upnp:<udn>'` (#4152).
   *
   * Passée en OUTIL et non déduite ici, comme `qualiteDe` : la règle est celle
   * de l'écran, qui sait que l'UDN est le préfixe de `source_id` avant `'|'`
   * (convention posée par l'indexation, côté serveur).
   */
  provenanceDe: (a: Album) => string;
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
  // Une facette cochée est satisfaite par UNE de ses valeurs (OU) ; deux
  // facettes cochées doivent l'être toutes les deux (ET) — #898.
  if (sauf !== 'qualite' && f.qualite.length
      && !f.qualite.some((c) => o.qualiteDe(a, c))) return false;
  if (sauf !== 'frequence' && f.frequence.length
      && !f.frequence.includes(a.sample_rate ?? 0)) return false;
  if (sauf !== 'annee' && f.annee != null && o.anneeDe(a) !== f.annee) return false;
  if (sauf !== 'format' && f.format.length
      && !f.format.includes(a.format?.trim().toUpperCase() ?? '')) return false;
  if (sauf !== 'profondeur' && f.profondeur.length
      && !f.profondeur.includes(a.bit_depth ?? 0)) return false;
  // `?? false` : un album servi par une route qui ne porte pas le champ, ou
  // par un serveur antérieur à la v0.9.95, n'est pas une compilation CONNUE.
  // C'est la même convention que le serveur, qui décode `NULL` en « non ».
  if (sauf !== 'compilation' && f.compilation != null
      && (a.is_compilation ?? false) !== f.compilation) return false;
  if (sauf !== 'provenance' && !sourceCorrespond(o.provenanceDe(a), f.provenance)) return false;
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

/**
 * Combien de COMPILATIONS parmi les albums qui satisfont les autres filtres.
 *
 * Une seule valeur, et non une paire : voir `FiltresBibliotheque.compilation`.
 * Le compte est ce qui rend la puce honnête — à zéro, elle ne s'affiche pas,
 * plutôt que de promettre un filtre qui ne rendrait rien parce que la
 * bibliothèque n'a pas été re-scannée depuis la v0.9.95.
 */
export function comptesCompilation(
  albums: readonly Album[], f: FiltresBibliotheque, o: Outils,
): number {
  return assiette(albums, f, o, 'compilation')
    .reduce((n, a) => n + (a.is_compilation ? 1 : 0), 0);
}

/**
 * Les provenances PRÉSENTES, avec leur compte, du plus fourni au moins fourni
 * (#4152) — « Local » d'abord quand il existe, parce que c'est la
 * bibliothèque de l'utilisateur et que la reléguer derrière un serveur voisin
 * se lirait comme un classement.
 *
 * Une provenance reste proposée à zéro après application des autres filtres.
 * Les abonnements sans album visible sont ajoutés par la vue.
 */
export function comptesProvenance(
  albums: readonly Album[], f: FiltresBibliotheque, o: Outils,
): [string, number][] {
  const m = new Map<string, number>(albums.map(a => [o.provenanceDe(a), 0]));
  for (const a of assiette(albums, f, o, 'provenance')) {
    const v = o.provenanceDe(a);
    if (v) m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()].sort((x, z) => {
    if (x[0] === 'local') return -1;
    if (z[0] === 'local') return 1;
    return z[1] - x[1] || x[0].localeCompare(z[0]);
  });
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
