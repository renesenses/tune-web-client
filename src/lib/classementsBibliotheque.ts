/**
 * LES CLASSEMENTS DE LA BIBLIOTHÈQUE — tune-server-rust#8264 (demande #7781).
 *
 * jfpaquet (fils 2634 et 2733) : « combien de titres de Jean-Sébastien Bach ?
 * combien de titres du genre concertos pour violon ? » — un classement des
 * artistes et des genres par nombre de pistes, du plus fourni au moins fourni.
 *
 * `GET /library/stats` porte une clé ADDITIVE `rankings` :
 *
 * ```json
 * { "by_artist": { "items": [{ "value": "Johann Sebastian Bach", "tracks": 20244 }, …], "total": 6812 },
 *   "by_genre":  { "items": [{ "value": "Violin Concerto", "tracks": 1416 }, …], "total": 312 } }
 * ```
 *
 * `items` est plafonné par le serveur (les premiers seulement) ; `total` dit
 * combien il y en a en tout. Un classement à `null` (lecture échouée côté
 * serveur) ou une clé absente (serveur plus ancien) donnent `null` : l'écran
 * n'en montre alors pas la carte. Tout est PUR ici.
 */

export type CleClassement = 'by_artist' | 'by_genre';

export const CLES_CLASSEMENT: CleClassement[] = ['by_artist', 'by_genre'];

export interface EntreeClassement {
  value: string;
  tracks: number;
}

export interface Classement {
  items: EntreeClassement[];
  total: number;
}

export type Classements = Record<CleClassement, Classement | null>;

function entier(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function classement(brut: unknown): Classement | null {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null;
  const o = brut as Record<string, unknown>;
  if (!Array.isArray(o.items)) return null;
  const items: EntreeClassement[] = [];
  for (const e of o.items) {
    if (!e || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    if (typeof r.value !== 'string' || !r.value.trim()) continue;
    items.push({ value: r.value, tracks: entier(r.tracks) });
  }
  return { items, total: Math.max(entier(o.total), items.length) };
}

/** Les classements d'une réponse de `/library/stats`, ou `null` sans la clé. */
export function lireClassements(stats: unknown): Classements | null {
  if (!stats || typeof stats !== 'object') return null;
  const r = (stats as Record<string, unknown>).rankings;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const o = r as Record<string, unknown>;
  const c = { by_artist: classement(o.by_artist), by_genre: classement(o.by_genre) };
  return c.by_artist || c.by_genre ? c : null;
}

/** Le classement est-il TRONQUÉ (les premiers seulement) ? */
export function estTronque(c: Classement): boolean {
  return c.total > c.items.length;
}

/*
 * CHERCHER DANS TOUT LE CLASSEMENT — go de Bertrand du 13/11 (lot rc12).
 *
 * Les cartes ne montrent que les cent premiers (« Les 100 premiers sur
 * 2 957 ») : un artiste ou un genre plus loin n'y était pas trouvable.
 * `GET /library/stats/rankings?by=artist|genre&q=…&limit=…` cherche dans le
 * classement ENTIER, côté serveur, et rend le RANG de chaque entrée dans ce
 * classement complet :
 *
 * ```json
 * { "by": "artist", "items": [{ "rank": 151, "value": "Antonín Dvořák", "tracks": 12 }],
 *   "matched": 1, "total": 2957 }
 * ```
 *
 * Serveur plus ancien (route absente) : la recherche se replie sur les
 * entrées déjà reçues (`filtrerLocalement`), et l'écran le dit.
 */

/** Le paramètre `by` de la route, pour chaque carte. */
export const PARAM_CLASSEMENT: Record<CleClassement, 'artist' | 'genre'> = {
  by_artist: 'artist',
  by_genre: 'genre',
};

export interface EntreeTrouvee extends EntreeClassement {
  /** Rang dans le classement COMPLET, à partir de 1. */
  rank: number;
}

export interface ResultatRecherche {
  items: EntreeTrouvee[];
  /** Combien d'entrées correspondent en tout (au-delà de `items`). */
  matched: number;
  /** Taille du classement complet. */
  total: number;
}

/** La réponse de `/library/stats/rankings`, ou `null` si elle est illisible. */
export function lireRecherche(brut: unknown): ResultatRecherche | null {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null;
  const o = brut as Record<string, unknown>;
  if (!Array.isArray(o.items)) return null;
  const items: EntreeTrouvee[] = [];
  for (const e of o.items) {
    if (!e || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    if (typeof r.value !== 'string' || !r.value.trim()) continue;
    const rank = entier(r.rank);
    if (!rank) continue;
    items.push({ value: r.value, tracks: entier(r.tracks), rank });
  }
  return {
    items,
    matched: Math.max(entier(o.matched), items.length),
    total: Math.max(entier(o.total), items.length),
  };
}

/** Accents et casse repliés : « dvorak » trouve « Dvořák ». */
export function plier(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Repli sans la route (serveur plus ancien) : chercher parmi les entrées
 * reçues, dans l'ordre du classement, rang = position + 1. `q` vide : tout.
 */
export function filtrerLocalement(c: Classement, q: string): ResultatRecherche {
  const aiguille = plier(q.trim());
  const items = c.items
    .map((e, i) => ({ ...e, rank: i + 1 }))
    .filter((e) => !aiguille || plier(e.value).includes(aiguille));
  return { items, matched: items.length, total: c.total };
}

/** Les lignes d'une carte sans recherche : les premiers, numérotés. */
export function numeroter(c: Classement): EntreeTrouvee[] {
  return c.items.map((e, i) => ({ ...e, rank: i + 1 }));
}
