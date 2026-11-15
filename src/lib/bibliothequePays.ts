/**
 * renesenses/tune-web-client#2645 — la carte du monde de la Bibliothèque.
 *
 * Fonctions pures : des facettes de pays du serveur à une teinte par pays,
 * et d'un point cliqué sur le globe au pays qu'il désigne. Le dessin et l'écran
 * sont dans `CartePaysBibliothequeV2.svelte`.
 *
 * #2800 (serveur #8090) — deux pays, comptés en ALBUMS :
 * - `artist_country` : pays de l'ARTISTE principal de l'album (MusicBrainz),
 *   code ISO en majuscules ; filtre `artist_country=<code>`. Le choix par défaut.
 * - `country_albums` : pays de PARUTION de l'édition (`release_country`,
 *   balise RELEASECOUNTRY ou MusicBrainz), valeur telle qu'écrite ; filtre
 *   `country=<valeurs>`.
 * Un serveur antérieur (rc11) ne rend ni l'une ni l'autre : la carte retombe
 * alors sur l'ancienne facette `country` (édition, comptée en MORCEAUX), sans
 * choix ni message d'erreur.
 *
 * MusicBrainz emploie aussi des pseudo-codes (`XE` Europe, `XW` monde entier,
 * `XU` inconnu) qui ne sont sur aucune carte : ils sont comptés à part, jamais
 * teints au hasard sur un pays.
 */
import type { FacetParam, FacetValue } from './api';
import { CODES_PAYS } from './paysMonde';
import { decoderPointsTerre, DEG } from './champCercle/globe';
import { POINTS_TERRE } from './champCercle/pointsTerre';
import { PAYS_TERRE } from './champCercle/paysTerre';

/** #2800 — quel pays la carte montre. */
export type SourcePays = 'artiste' | 'edition';
/** Le paramètre de filtre que le serveur attend pour ce pays. */
export type ParamPays = 'artist_country' | 'country';
/** Ce que comptent les effectifs : des albums (#8090), ou des morceaux (serveur antérieur). */
export type UnitePays = 'albums' | 'morceaux';

/** #2800 — la facette demandée pour chaque source (comptée en albums). */
export const FACETTE_PAYS: Record<SourcePays, string> = { artiste: 'artist_country', edition: 'country_albums' };
/** #2800 — le paramètre de filtre de chaque source. */
export const FILTRE_PAYS: Record<SourcePays, ParamPays> = { artiste: 'artist_country', edition: 'country' };

export interface PaysDeLaBibliotheque {
  /** Code ISO 3166-1 alpha-2, en majuscules. */
  code: string;
  /** Effectif de la facette (albums, ou morceaux sur un serveur antérieur), toutes casses réunies. */
  n: number;
  /** Les valeurs EXACTES de la facette réunies sous ce code : c'est elles que
   *  le filtre renvoie au serveur, qui compare la valeur telle qu'écrite. */
  valeurs: string[];
  /** #2800 — le paramètre de filtre de ces valeurs (`artist_country` ou `country`). */
  filtre: ParamPays;
}

export interface AgregatPays {
  /** Les pays de la carte, du plus fourni au moins fourni. */
  pays: PaysDeLaBibliotheque[];
  /** Effectif dont le pays n'est sur aucune carte (`XE`, `XW`, valeur libre). */
  horsCarte: number;
  /** Le plus grand compte, qui fixe la teinte la plus forte. */
  max: number;
  /** #2800 — ce que comptent `n` et `horsCarte`. */
  unite: UnitePays;
}

/** De la facette brute aux pays de la carte. Par défaut, l'ancienne facette
 *  `country` (édition, en morceaux) d'un serveur antérieur. */
export function agregerPays(
  facette: readonly FacetValue[] | null | undefined,
  filtre: ParamPays = 'country',
  unite: UnitePays = 'morceaux',
): AgregatPays {
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
    else parCode.set(code, { code, n, valeurs: [f.value], filtre });
  }
  const pays = [...parCode.values()].sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
  return { pays, horsCarte, max: pays[0]?.n ?? 0, unite };
}

/** Ce que rend `chargerPays`. */
export interface PaysCharges {
  agregat: AgregatPays;
  /** `true` : serveur antérieur à #8090, la carte montre l'ancienne facette
   *  `country` et l'écran ne propose pas le choix artiste / édition. */
  ancien: boolean;
}

type LireFacettes = (fields: string[], filtres?: Record<string, FacetParam>, limit?: number) =>
  Promise<Record<string, FacetValue[]> | null | undefined>;

/**
 * #2800 — les pays d'une source. La facette en albums d'abord ; si le serveur
 * ne la connaît pas (clé ABSENTE de la réponse : rc11), l'ancienne facette
 * `country`. Une clé présente et vide (pays de l'artiste pas encore remplis)
 * reste une réponse : la carte le dit, sans retomber sur l'édition.
 */
export async function chargerPays(
  lire: LireFacettes,
  source: SourcePays,
  filtres: Record<string, FacetParam>,
): Promise<PaysCharges> {
  const champ = FACETTE_PAYS[source];
  const r = await lire([champ], filtres, 0);
  const facette = r?.[champ];
  if (Array.isArray(facette)) {
    return { agregat: agregerPays(facette, FILTRE_PAYS[source], 'albums'), ancien: false };
  }
  const v = await lire(['country'], filtres, 0);
  return { agregat: agregerPays(v?.country, 'country', 'morceaux'), ancien: true };
}

/** tune-server-rust#8668 — le nom de chaque source pour `GET /library/album-countries`. */
export const SOURCE_SERVEUR: Record<SourcePays, 'artist' | 'release'> = { artiste: 'artist', edition: 'release' };

/**
 * tune-server-rust#8668 — les pays des SEULS albums que la grille garde.
 *
 * Les filtres de la grille (source, qualité, fréquence, favoris, recherche…)
 * s'appliquent sur place, dans le client ; les facettes du serveur ne les
 * connaissent pas. La carte annonçait donc « États-Unis 20 albums » avec
 * Source · QOBUZ posée, et le clic montrait 0. Ici, le pays de chaque album
 * (`[id, pays]`, rendu par le serveur) est croisé avec les albums retenus :
 * la carte compte ce que la grille montrera. Un album compte UNE fois par
 * pays, toutes casses réunies ; un album dont aucune valeur n'est sur la
 * carte (`XE`, `XW`) compte « hors carte ».
 */
export function agregerPaysDesAlbums(
  paires: readonly (readonly [number, string])[],
  retenus: ReadonlySet<number>,
  source: SourcePays,
): AgregatPays {
  const parCode = new Map<string, { albums: Set<number>; valeurs: string[] }>();
  const surLaCarte = new Set<number>();
  const ailleurs = new Set<number>();
  for (const [id, valeur] of paires) {
    if (!retenus.has(id) || typeof valeur !== 'string') continue;
    const code = valeur.trim().toUpperCase();
    if (!code) continue;
    if (!CODES_PAYS.has(code)) { ailleurs.add(id); continue; }
    surLaCarte.add(id);
    const p = parCode.get(code);
    if (p) { p.albums.add(id); if (!p.valeurs.includes(valeur)) p.valeurs.push(valeur); }
    else parCode.set(code, { albums: new Set([id]), valeurs: [valeur] });
  }
  const filtre = FILTRE_PAYS[source];
  const pays = [...parCode.entries()]
    .map(([code, p]) => ({ code, n: p.albums.size, valeurs: p.valeurs, filtre }))
    .sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
  let horsCarte = 0;
  for (const id of ailleurs) if (!surLaCarte.has(id)) horsCarte++;
  return { pays, horsCarte, max: pays[0]?.n ?? 0, unite: 'albums' };
}

/** tune-server-rust#8668 — le drapeau d'un code ISO (indicateurs régionaux
 *  Unicode) ; `''` pour un code qui n'est pas un pays de la carte. */
export function drapeauPays(code: string | null | undefined): string {
  const c = (code ?? '').trim().toUpperCase();
  if (!CODES_PAYS.has(c)) return '';
  return String.fromCodePoint(...[...c].map((l) => 0x1f1e6 + l.charCodeAt(0) - 65));
}

/** tune-server-rust#8668 — le pays de l'artiste choisi depuis sa fiche : le
 *  filtre « Pays de l'artiste » de la Bibliothèque, sans passer par la carte. */
export function paysArtisteChoisi(code: string): PaysDeLaBibliotheque {
  const c = code.trim().toUpperCase();
  return { code: c, n: 0, valeurs: [c], filtre: 'artist_country' };
}

/** #2800 — le filtre serveur d'un pays choisi. */
export function filtreDuPays(p: PaysDeLaBibliotheque): Record<string, FacetParam> {
  return { [p.filtre]: p.valeurs };
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
