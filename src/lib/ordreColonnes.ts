/**
 * L'ORDRE des colonnes du tableau des pistes — web#2599 (rc11).
 *
 * Après les largeurs réglables (#2584), le même testeur Windows veut
 * déplacer les colonnes : glisser l'en-tête à la souris, ou Alt + flèches au
 * clavier. L'ordre est retenu PAR ÉCRAN (`album`, `playlist`, `titres`), avec
 * la même mécanique de stockage que les largeurs (`lib/preferencesEcran`).
 *
 * ## Ce que ce module décide
 *
 *  - `appliquerOrdre` : le jeu de colonnes réordonné selon l'ordre retenu ;
 *  - la MÉMOIRE : une liste de clés, validée à la lecture ;
 *  - le DÉPLACEMENT d'une colonne (vers un rang, d'un cran, avant/après une
 *    autre) ;
 *  - « Rétablir l'ordre par défaut » : un écran, ou tous.
 *
 * ## Une colonne ajoutée plus tard apparaît quand même
 *
 * L'ordre retenu ne liste que les colonnes qui étaient AFFICHÉES au moment du
 * déplacement. Une colonne qu'il ne connaît pas (cochée ensuite dans les
 * Réglages, ou ajoutée par une version ultérieure) n'est jamais écartée : elle
 * se place juste après sa voisine précédente dans l'ordre PAR DÉFAUT. Une
 * clé retenue mais plus affichée est ignorée.
 */
import { writable, get } from 'svelte/store';
import type { CleColonne, Colonne } from './colonnesPistes';
import { ECRANS_COLONNES, type EcranColonnes } from './largeursColonnes';
import { effacerChoix, ecrireChoix, lireTexte } from './preferencesEcran';

/** L'ordre retenu d'un écran : une liste de clés. Vide = ordre par défaut. */
export type Ordre = CleColonne[];

/**
 * Réordonne `colonnes` (donnés dans l'ordre par défaut) selon `ordre`.
 * Sans ordre, rend une copie à l'identique. Aucune colonne n'est perdue ni
 * dupliquée, quoi que contienne `ordre`.
 */
export function appliquerOrdre<C extends { cle: string }>(colonnes: readonly C[], ordre: readonly string[] | null | undefined): C[] {
  if (!ordre || !ordre.length) return colonnes.slice();
  const parCle = new Map(colonnes.map((c) => [c.cle, c]));
  const retenues: string[] = [];
  for (const cle of ordre) {
    if (parCle.has(cle) && !retenues.includes(cle)) retenues.push(cle);
  }
  const sortie: string[] = retenues.slice();
  // Les colonnes inconnues de l'ordre : après leur voisine précédente par défaut.
  let precedente: string | null = null;
  for (const c of colonnes) {
    if (!retenues.includes(c.cle)) {
      const rang: number = precedente == null ? 0 : sortie.indexOf(precedente) + 1;
      sortie.splice(rang, 0, c.cle);
    }
    precedente = c.cle;
  }
  return sortie.map((cle) => parCle.get(cle)!);
}

/** Déplace `cle` au rang `vers` (borné) dans `cles`. Rend une nouvelle liste. */
export function deplacerVers(cles: readonly CleColonne[], cle: CleColonne, vers: number): CleColonne[] {
  const de = cles.indexOf(cle);
  if (de < 0) return cles.slice();
  const reste = cles.filter((k) => k !== cle);
  const cible = Math.max(0, Math.min(reste.length, Math.round(vers)));
  reste.splice(cible, 0, cle);
  return reste;
}

/** Déplace `cle` d'un cran (-1 vers la gauche, +1 vers la droite). */
export function deplacerDUnCran(cles: readonly CleColonne[], cle: CleColonne, sens: -1 | 1): CleColonne[] {
  const de = cles.indexOf(cle);
  return de < 0 ? cles.slice() : deplacerVers(cles, cle, de + sens);
}

/** Pose `cle` juste avant (ou après) `cible`. Rend une nouvelle liste. */
export function deplacerAupres(cles: readonly CleColonne[], cle: CleColonne, cible: CleColonne, apres: boolean): CleColonne[] {
  if (cle === cible || !cles.includes(cle) || !cles.includes(cible)) return cles.slice();
  const reste = cles.filter((k) => k !== cle);
  reste.splice(reste.indexOf(cible) + (apres ? 1 : 0), 0, cle);
  return reste;
}

// ── Mémoire, par écran ──────────────────────────────────────────────────────

const cleStockage = (ecran: EcranColonnes) => `ordre_colonnes_${ecran}`;

/** Relit l'ordre d'un écran. Une valeur illisible ou étrangère est écartée. */
export function lireOrdre(ecran: EcranColonnes): Ordre {
  const brut = lireTexte(cleStockage(ecran));
  if (!brut) return [];
  try {
    const liste = JSON.parse(brut);
    if (!Array.isArray(liste)) return [];
    const vus = new Set<string>();
    const sortie: Ordre = [];
    for (const k of liste) {
      if (typeof k === 'string' && k && !vus.has(k)) { vus.add(k); sortie.push(k as CleColonne); }
    }
    return sortie;
  } catch {
    return [];
  }
}

function ecrire(ecran: EcranColonnes, o: Ordre): void {
  if (o.length) ecrireChoix(cleStockage(ecran), JSON.stringify(o));
  else effacerChoix(cleStockage(ecran));
}

/** Le magasin partagé : deux listes du même écran voient le même ordre. */
export const ordresColonnes = writable<Partial<Record<EcranColonnes, Ordre>>>({});

/** L'ordre d'un écran vu depuis l'état du magasin (lecture pure). */
export function ordreDe(etat: Partial<Record<EcranColonnes, Ordre>>, ecran: EcranColonnes): Ordre {
  return etat[ecran] ?? lireOrdre(ecran);
}

/** Retient l'ordre d'un écran. */
export function fixerOrdre(ecran: EcranColonnes, ordre: readonly CleColonne[]): void {
  const o = ordre.slice();
  ordresColonnes.update((m) => ({ ...m, [ecran]: o }));
  ecrire(ecran, o);
}

/** « Rétablir l'ordre par défaut » : un écran, ou tous. */
export function retablirOrdre(ecran?: EcranColonnes): void {
  const ecrans = ecran ? [ecran] : ECRANS_COLONNES;
  ordresColonnes.update((m) => {
    const suivant = { ...m };
    for (const e of ecrans) suivant[e] = [];
    return suivant;
  });
  for (const e of ecrans) effacerChoix(cleStockage(e));
}

/** Vrai si un ordre est retenu pour l'écran (pour griser « Rétablir »). */
export function ordreRetenu(ecran: EcranColonnes): boolean {
  return ordreDe(get(ordresColonnes), ecran).length > 0;
}
