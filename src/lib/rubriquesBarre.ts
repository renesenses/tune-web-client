/**
 * Rubriques PLAYLISTS et COLLECTIONS de la barre latérale (thème Néomorphique,
 * demande de Bertrand du 28/11/2026) : les CINQ premiers éléments seulement,
 * les plus utilisés ou les plus récents, puis un lien « Tout voir ».
 *
 * L'ordre suit la donnée LA PLUS FIABLE que l'API fournit, dans cet ordre de
 * préférence :
 *   1. dernière écoute / dernier usage (`last_played_at`, `last_used_at`) ;
 *   2. nombre d'écoutes (`play_count`) ;
 *   3. date de modification ou de création (`updated_at`, `created_at`) ;
 *   4. à défaut, l'identifiant (auto-incrémenté par le serveur : le plus grand
 *      est le plus récemment créé).
 * Constat au 28/11 (serveur) : `GET /playlists` ne rend que `id`, `name`,
 * `description`, `track_count` — c'est donc l'identifiant qui ordonne les
 * playlists ; `GET /library/collections` rend `created_at` pour les
 * collections. Si le serveur publie un jour l'écoute, elle l'emporte sans
 * changer ce code.
 */
export const MAX_RUBRIQUE = 5;

type Element = { id?: number | string | null; [cle: string]: unknown };

function date(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  if (typeof v === 'string' && v.trim()) {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}
function nombre(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** La clé de tri d'un élément : [rang du critère, valeur]. Plus petit rang = critère préféré. */
function cle(e: Element): [number, number] {
  const ecoute = date(e.last_played_at) ?? date(e.last_used_at);
  if (ecoute != null) return [0, ecoute];
  const n = nombre(e.play_count);
  if (n != null) return [1, n];
  const modif = date(e.updated_at) ?? date(e.created_at);
  if (modif != null) return [2, modif];
  const id = typeof e.id === 'number' ? e.id : Number(e.id);
  return [3, Number.isFinite(id) ? id : -Infinity];
}

/**
 * Les `max` premiers éléments, du plus utilisé ou récent au moins. Les
 * éléments qui portent un critère préféré passent devant ceux qui n'en ont
 * qu'un moins fiable ; à valeur égale, l'ordre d'origine est gardé.
 */
export function premiersDeRubrique<T extends Element>(liste: readonly T[] | null | undefined, max = MAX_RUBRIQUE): T[] {
  return (liste ?? [])
    .filter((e) => e && e.id != null)
    .map((e, i) => ({ e, i, k: cle(e) }))
    .sort((a, b) => a.k[0] - b.k[0] || b.k[1] - a.k[1] || a.i - b.i)
    .slice(0, Math.max(0, max))
    .map((x) => x.e);
}
