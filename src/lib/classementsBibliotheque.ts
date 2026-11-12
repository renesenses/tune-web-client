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
