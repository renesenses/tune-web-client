/**
 * renesenses/tune-web-client#2645 — la carte du monde de la Bibliothèque.
 *
 * Fonctions pures : de la facette `country` du serveur à une teinte par pays,
 * et d'un point cliqué sur le globe au pays qu'il désigne. Le dessin et l'écran
 * sont dans `CartePaysBibliothequeV2.svelte`.
 *
 * 🔴 Ce que la facette dit vraiment. `GET /library/facets?fields=country` lit
 * `release_country` (balise RELEASECOUNTRY, ou MusicBrainz) et compte des
 * MORCEAUX (`COUNT(DISTINCT track_id)`). C'est le pays de PARUTION de
 * l'édition, pas le pays d'origine de l'artiste, que le serveur ne stocke pas
 * encore. L'écran le dit tel quel ; le pays d'origine de l'artiste est demandé
 * côté serveur (voir la PR).
 *
 * MusicBrainz emploie aussi des pseudo-codes (`XE` Europe, `XW` monde entier,
 * `XU` inconnu) qui ne sont sur aucune carte : ils sont comptés à part, jamais
 * teints au hasard sur un pays.
 */
import type { FacetValue } from './api';
import { CODES_PAYS } from './paysMonde';
import { decoderPointsTerre, DEG } from './champCercle/globe';
import { POINTS_TERRE } from './champCercle/pointsTerre';
import { PAYS_TERRE } from './champCercle/paysTerre';

export interface PaysDeLaBibliotheque {
  /** Code ISO 3166-1 alpha-2, en majuscules. */
  code: string;
  /** Nombre de morceaux de la facette, toutes casses réunies. */
  n: number;
  /** Les valeurs EXACTES de la facette réunies sous ce code : c'est elles que
   *  le filtre renvoie au serveur, qui compare la valeur telle qu'écrite. */
  valeurs: string[];
}

export interface AgregatPays {
  /** Les pays de la carte, du plus fourni au moins fourni. */
  pays: PaysDeLaBibliotheque[];
  /** Morceaux dont le pays n'est sur aucune carte (`XE`, `XW`, valeur libre). */
  horsCarte: number;
  /** Le plus grand compte, qui fixe la teinte la plus forte. */
  max: number;
}

/** De la facette `country` brute aux pays de la carte. */
export function agregerPays(facette: readonly FacetValue[] | null | undefined): AgregatPays {
  const parCode = new Map<string, PaysDeLaBibliotheque>();
  let horsCarte = 0;
  for (const f of facette ?? []) {
    if (!f || typeof f.value !== 'string') continue;
    const n = Number.isFinite(f.count) && f.count > 0 ? f.count : 0;
    if (!n) continue;
    const code = f.value.trim().toUpperCase();
    if (!CODES_PAYS.has(code)) { horsCarte += n; continue; }
    const p = parCode.get(code);
    if (p) { p.n += n; if (!p.valeurs.includes(f.value)) p.valeurs.push(f.value); }
    else parCode.set(code, { code, n, valeurs: [f.value] });
  }
  const pays = [...parCode.values()].sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
  return { pays, horsCarte, max: pays[0]?.n ?? 0 };
}

/** Nombre de paliers de teinte (de 0, le plus pâle, à 4). */
export const PALIERS = 5;
/** Opacité de chaque palier. */
export const FORCES = [0.3, 0.45, 0.6, 0.8, 1] as const;

/**
 * Le palier d'un pays, RELATIF à la bibliothèque : une échelle logarithmique
 * entre 1 et le plus grand compte. Des seuils fixes ne vaudraient rien ici —
 * 200 morceaux, c'est beaucoup dans une petite bibliothèque et rien dans une
 * grande. Le pays le plus fourni est toujours au palier le plus fort.
 */
export function palier(n: number, max: number): number {
  if (!(n > 0) || !(max > 0)) return 0;
  if (n >= max) return PALIERS - 1;
  const r = Math.log1p(n) / Math.log1p(max);
  return Math.max(0, Math.min(PALIERS - 1, Math.floor(r * PALIERS)));
}

/** Les points de terre, décodés une fois, en radians, avec leur pays. */
let terre: { lat: number; lon: number; code: string }[] | null = null;
export function pointsDeTerre(): { lat: number; lon: number; code: string }[] {
  if (!terre) {
    terre = decoderPointsTerre(POINTS_TERRE).map(([lat, lon], i) => ({
      lat, lon, code: PAYS_TERRE.slice(i * 2, i * 2 + 2),
    }));
  }
  return terre;
}

/**
 * Au-delà de cet écart (en degrés d'arc) du point de terre le plus proche, le
 * clic est en mer. La grille est de 1,6° : un peu plus de sa diagonale.
 */
const ECART_MAX = 2.5 * DEG;

/** Le pays sous un lieu (en DEGRÉS, comme le rend `deprojeter`) ; `null` en mer
 *  ou sur une terre sans pays attribué. */
export function paysAuLieu(latDeg: number, lonDeg: number): string | null {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const sl = Math.sin(lat);
  const cl = Math.cos(lat);
  let meilleur = -2;
  let code: string | null = null;
  for (const p of pointsDeTerre()) {
    // Cosinus de l'écart angulaire : le plus grand est le plus proche.
    const c = sl * Math.sin(p.lat) + cl * Math.cos(p.lat) * Math.cos(lon - p.lon);
    if (c > meilleur) { meilleur = c; code = p.code; }
  }
  if (meilleur < Math.cos(ECART_MAX) || !code || !CODES_PAYS.has(code)) return null;
  return code;
}
