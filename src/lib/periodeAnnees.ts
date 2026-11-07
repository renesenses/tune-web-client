/**
 * UNE PÉRIODE SUR LA FRISE DES ANNÉES — web#2695.
 *
 * Bertrand, 07/11/2026 (pré-release rc11 sur le .18) : dans Bibliothèque ›
 * Albums › vue Années, choisir une période — année de début, année de fin —
 * par deux champs « De » / « À » et par deux poignées sur la frise.
 *
 * Ce module ne porte que les RÈGLES, sans écran :
 *  - une borne absente (`null`) laisse la période ouverte de ce côté ;
 *  - les deux bornes sont COMPRISES ;
 *  - « De 1979 À 1970 » se lit comme « De 1970 À 1979 » : l'ordre de saisie
 *    ne vide pas la grille ;
 *  - un album SANS année (dans le mode retenu, voir `anneeAlbum`) n'est dans
 *    aucune période : on ne situe pas ce qu'on ne sait pas dater. L'écran
 *    annonce combien il en écarte.
 *
 * L'ANNÉE elle-même n'est pas lue ici : l'appelant passe celle du mode retenu
 * (`anneeAlbum(a, modeAnnee)`), la même que la frise et la grille.
 */

export interface Periode {
  de: number | null;
  a: number | null;
}

export const SANS_PERIODE: Periode = { de: null, a: null };

/** Bornes de vraisemblance d'une saisie, celles d'`anneeAlbum`. */
const MIN = 1800;
const MAX = 2200;

/** Une période est-elle posée ? Une seule borne suffit. */
export function periodePosee(p: Periode): boolean {
  return p.de != null || p.a != null;
}

/** Les bornes dans l'ordre croissant. */
export function bornesPeriode(p: Periode): { de: number | null; a: number | null } {
  if (p.de != null && p.a != null && p.de > p.a) return { de: p.a, a: p.de };
  return { de: p.de, a: p.a };
}

/** L'année est-elle dans la période ? Sans période, tout y est. */
export function dansPeriode(annee: number | null, p: Periode): boolean {
  if (!periodePosee(p)) return true;
  if (annee == null) return false;
  const { de, a } = bornesPeriode(p);
  if (de != null && annee < de) return false;
  if (a != null && annee > a) return false;
  return true;
}

/** Une saisie de champ en année, ou `null` (vide ou invraisemblable). */
export function anneeSaisie(v: unknown): number | null {
  const s = String(v ?? '').trim();
  if (!/^\d{1,4}$/.test(s)) return null;
  const n = Number(s);
  return n > MIN && n < MAX ? n : null;
}

/**
 * Le pas d'une touche sur une poignée (`role="slider"`), ou `null` si la
 * touche ne la règle pas. Flèches : un an ; Page : dix ans ; Début / Fin :
 * les extrémités.
 */
export function anneeAuClavier(touche: string, valeur: number, min: number, max: number): number | null {
  let v: number;
  switch (touche) {
    case 'ArrowLeft': case 'ArrowDown': v = valeur - 1; break;
    case 'ArrowRight': case 'ArrowUp': v = valeur + 1; break;
    case 'PageDown': v = valeur - 10; break;
    case 'PageUp': v = valeur + 10; break;
    case 'Home': v = min; break;
    case 'End': v = max; break;
    default: return null;
  }
  return Math.min(max, Math.max(min, v));
}

/**
 * L'année sous le pointeur, sur une frise de `nb` années à partir de `min`,
 * large de `largeur` px. Bornée aux extrémités : tirer la poignée au-delà de
 * la frise la pose sur la première ou la dernière année.
 */
export function anneeSousLePointeur(x: number, largeur: number, min: number, nb: number): number {
  if (largeur <= 0 || nb <= 0) return min;
  const i = Math.floor((x / largeur) * nb);
  return min + Math.min(nb - 1, Math.max(0, i));
}

/** Le paramètre de l'adresse : `?annees=1970-1979`, `?annees=1970-`, `?annees=-1979`. */
export const PARAM_PERIODE = 'annees';

/** La période portée par la partie `?…` de l'adresse. */
export function lirePeriode(search: string | null | undefined): Periode {
  const brut = new URLSearchParams(search ?? '').get(PARAM_PERIODE);
  if (!brut) return SANS_PERIODE;
  const m = /^\s*(\d{0,4})\s*-\s*(\d{0,4})\s*$/.exec(brut);
  if (!m) return SANS_PERIODE;
  return { de: anneeSaisie(m[1]), a: anneeSaisie(m[2]) };
}

/**
 * La partie `?…` de l'adresse avec cette période — ou sans elle. Les AUTRES
 * paramètres (`?v2=0`, `?vue=mini`, `?lang=`) sont gardés tels quels.
 */
export function ecrirePeriode(search: string | null | undefined, p: Periode): string {
  const params = new URLSearchParams(search ?? '');
  if (periodePosee(p)) params.set(PARAM_PERIODE, `${p.de ?? ''}-${p.a ?? ''}`);
  else params.delete(PARAM_PERIODE);
  const s = params.toString();
  return s ? `?${s}` : '';
}
