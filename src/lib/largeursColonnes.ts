/**
 * Les LARGEURS de colonnes réglées à la main — web#2584.
 *
 * Un testeur Windows de longue date (visio du 01/11/2026, point 5, « Taille
 * Colonne ») veut tirer le bord d'une colonne du tableau des pistes pour
 * l'élargir, comme dans l'Explorateur Windows ou foobar2000. Go de Bertrand le
 * 01/11 : « essaye rc10 ».
 *
 * ## Ce que ce module décide
 *
 *  - les BORNES d'une largeur (un plancher par colonne, un plafond commun) ;
 *  - le GABARIT qui en résulte : une colonne réglée passe en pixels fixes, une
 *    colonne non réglée garde sa largeur de catalogue — la largeur
 *    AUTOMATIQUE, qui reste le comportement par défaut ;
 *  - la MÉMOIRE : par écran (`album`, `playlist`, `titres`…) et par colonne,
 *    dans les préférences d'affichage du navigateur (`lib/preferencesEcran`),
 *    comme le tri ou l'onglet retenus.
 *
 * ## Le Titre n'a pas de poignée : il prend le reste
 *
 * Le Titre reste en `minmax(…, 2fr)` : c'est la colonne élastique du tableau.
 * Élargir une autre colonne la lui retire, la rétrécir la lui rend. Lui donner
 * une poignée en ferait une colonne fixe de plus, et la dernière colonne `fr`
 * — l'Artiste, souvent — deviendrait celle qui « prend le reste » sans que
 * personne l'ait choisi.
 *
 * ## Pas d'ascenseur horizontal inutile
 *
 * Une colonne réglée compte pour sa largeur exacte dans `largeurMinimale`
 * (#853) — comme toute colonne en pixels. Le tableau ne défile donc que si la
 * somme des largeurs voulues dépasse vraiment la fenêtre ; sans réglage, le
 * gabarit est EXACTEMENT celui d'avant.
 */
import { writable, get } from 'svelte/store';
import type { CleColonne, Colonne } from './colonnesPistes';
import { effacerChoix, ecrireChoix, lireTexte } from './preferencesEcran';

/** Les écrans qui retiennent leurs largeurs, chacun pour soi. */
// ⚠️ Pas d'Oxygen ici : son tableau de pistes (`v2-heritage/OxygenView`) est
// un `<table>` à lui, qui ne passe pas par `ListePistesV2`.
export type EcranColonnes = 'album' | 'playlist' | 'titres';
export const ECRANS_COLONNES: readonly EcranColonnes[] = ['album', 'playlist', 'titres'];

/** Largeurs réglées d'un écran : colonne → pixels. Une colonne absente est automatique. */
export type Largeurs = Partial<Record<CleColonne, number>>;

/** Le pas des flèches gauche et droite, sur une poignée qui a le focus. */
export const PAS_CLAVIER_PX = 16;
/** Le plafond commun : au-delà, une colonne ne sert plus qu'à pousser les autres hors de l'écran. */
export const LARGEUR_MAX_PX = 900;
/** Le plancher d'une colonne de chiffres : de quoi lire « 12:34 » ou « 2024 ». */
export const LARGEUR_MIN_PX = 40;
/**
 * Les planchers propres à une colonne. Une colonne de TEXTE en dessous de
 * 80 px ne montre plus que « Ab… » ; la Qualité, en dessous de 72 px, n'est
 * plus qu'une pastille sans chiffre.
 */
const MIN_PAR_CLE: Partial<Record<CleColonne, number>> = {
  num: 32,
  artist: 80, composer: 80, album: 80, albumArtist: 80, genre: 80, label: 80,
  comments: 80, discSubtitle: 80, path: 80,
  quality: 72,
};

/** Le plancher d'une colonne. */
export function largeurMin(cle: CleColonne): number {
  return MIN_PAR_CLE[cle] ?? LARGEUR_MIN_PX;
}

/** Seule la colonne élastique n'a pas de poignée — voir l'en-tête du module. */
export function redimensionnable(c: Pick<Colonne, 'cle' | 'verrouillee'>): boolean {
  return !c.verrouillee;
}

/** Borne une largeur voulue, arrondie au pixel. Une valeur illisible rend le plancher. */
export function bornerLargeur(cle: CleColonne, px: number): number {
  if (!Number.isFinite(px)) return largeurMin(cle);
  return Math.min(LARGEUR_MAX_PX, Math.max(largeurMin(cle), Math.round(px)));
}

/**
 * La largeur NOMINALE d'une colonne, en pixels : la valeur fixe, ou le plancher
 * d'un `minmax(Npx, …)`. Sert de point de départ quand la largeur rendue n'a
 * pas pu être mesurée (jsdom, colonne pas encore peinte).
 */
export function largeurNominale(c: Pick<Colonne, 'largeur'>): number {
  const fixe = /^([0-9.]+)px$/.exec(c.largeur);
  if (fixe) return parseFloat(fixe[1]);
  const mm = /^minmax\(([0-9.]+)px,/.exec(c.largeur);
  return mm ? parseFloat(mm[1]) : LARGEUR_MIN_PX;
}

/**
 * Applique les largeurs réglées au jeu de colonnes : une colonne réglée passe
 * en `Npx` (bornés), les autres sont rendues TELLES QUELLES — même objet, donc
 * même gabarit qu'avant le réglage. Le Titre n'est jamais touché.
 */
export function appliquerLargeurs<C extends Colonne>(colonnes: readonly C[], largeurs: Largeurs | null | undefined): C[] {
  if (!largeurs) return colonnes.slice();
  return colonnes.map((c) => {
    const px = largeurs[c.cle];
    if (px == null || !redimensionnable(c)) return c;
    return { ...c, largeur: `${bornerLargeur(c.cle, px)}px` };
  });
}

// ── Mémoire, par écran ──────────────────────────────────────────────────────

const cleStockage = (ecran: EcranColonnes) => `largeurs_colonnes_${ecran}`;

/**
 * Relit les largeurs d'un écran. ⚠️ On VALIDE chaque entrée : une valeur
 * écrite par une autre version (colonne renommée, nombre corrompu) est
 * écartée plutôt que de casser la grille.
 */
export function lireLargeurs(ecran: EcranColonnes): Largeurs {
  const brut = lireTexte(cleStockage(ecran));
  if (!brut) return {};
  try {
    const objet = JSON.parse(brut);
    if (!objet || typeof objet !== 'object' || Array.isArray(objet)) return {};
    const sortie: Largeurs = {};
    for (const [cle, v] of Object.entries(objet)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        sortie[cle as CleColonne] = bornerLargeur(cle as CleColonne, v);
      }
    }
    return sortie;
  } catch {
    return {};
  }
}

function ecrire(ecran: EcranColonnes, l: Largeurs): void {
  if (Object.keys(l).length) ecrireChoix(cleStockage(ecran), JSON.stringify(l));
  else effacerChoix(cleStockage(ecran));
}

/**
 * Le magasin partagé : deux listes du même écran (ou les Réglages qui
 * rétablissent) voient le même état sans relire le stockage.
 */
export const largeursColonnes = writable<Partial<Record<EcranColonnes, Largeurs>>>({});

/**
 * Règle une colonne. `retenir` à faux pendant le glisser : la grille suit le
 * doigt, mais le stockage n'est écrit qu'au relâcher.
 */
export function fixerLargeur(ecran: EcranColonnes, cle: CleColonne, px: number, retenir = true): number {
  const borne = bornerLargeur(cle, px);
  let suivant: Largeurs = {};
  largeursColonnes.update((m) => {
    suivant = { ...(m[ecran] ?? lireLargeurs(ecran)), [cle]: borne };
    return { ...m, [ecran]: suivant };
  });
  if (retenir) ecrire(ecran, suivant);
  return borne;
}

/** Retient l'état courant d'un écran (fin d'un glisser). */
export function retenirLargeurs(ecran: EcranColonnes): void {
  ecrire(ecran, largeursDe(get(largeursColonnes), ecran));
}

/**
 * Les largeurs d'un écran vues depuis l'état du magasin : celles du magasin
 * si l'écran y est déjà, sinon celles du stockage. Une LECTURE pure — un
 * `$derived` peut l'appeler sans écrire dans le magasin.
 */
export function largeursDe(etat: Partial<Record<EcranColonnes, Largeurs>>, ecran: EcranColonnes): Largeurs {
  return etat[ecran] ?? lireLargeurs(ecran);
}

/** Rend à UNE colonne sa largeur automatique (double-clic sur la poignée). */
export function retablirLargeur(ecran: EcranColonnes, cle: CleColonne): void {
  let suivant: Largeurs = {};
  largeursColonnes.update((m) => {
    const { [cle]: _retiree, ...reste } = m[ecran] ?? lireLargeurs(ecran);
    suivant = reste;
    return { ...m, [ecran]: suivant };
  });
  ecrire(ecran, suivant);
}

/** « Rétablir les largeurs » : un écran, ou tous. */
export function retablirLargeurs(ecran?: EcranColonnes): void {
  const ecrans = ecran ? [ecran] : ECRANS_COLONNES;
  largeursColonnes.update((m) => {
    const suivant = { ...m };
    for (const e of ecrans) suivant[e] = {};
    return suivant;
  });
  for (const e of ecrans) effacerChoix(cleStockage(e));
}
