import type { FederatedSearchResult } from './types';

/**
 * #3189 — Recherche : la liste est coupée à 50 pistes sans que rien ne le dise.
 *
 * jfpaquet (forum 1644, 0.9.130, 77 291 pistes) cherche « Autumn Leaves » :
 * l'écran affiche « Pistes 50 » — la longueur de la page reçue, pas le nombre
 * de correspondances. Depuis la 0.9.132 le serveur rend, sous `local`,
 * `totals` (un COUNT sur le même prédicat que la liste), `totals_capped`
 * (le total est une borne inférieure) et `has_more`, et accepte `?offset=`
 * pour la bibliothèque locale (`routes/search.rs`). L'écran ne lisait rien
 * de tout cela. Ce module tient la logique hors du composant, où elle se
 * prouve.
 *
 * Les services de streaming ne sont PAS paginés côté serveur : `limit` leur
 * est passé tel quel, sans `offset`. La suite ne concerne donc que la
 * bibliothèque locale, et se demande avec `sources=local` pour ne pas
 * recevoir une seconde fois la première page des services.
 */

export interface TotalPistes {
  total: number;
  /** Le total est « au moins N » : le serveur a cessé de compter au plafond. */
  auMoins: boolean;
}

/**
 * Le nombre réel de pistes trouvées : total local (plus les pistes rendues en
 * supplément par métadonnées, hors du COUNT) plus ce que les services ont
 * rendu. `null` quand le serveur ne compte pas (antérieur à la 0.9.132) : on
 * n'invente pas un total.
 */
export function totalPistes(r: FederatedSearchResult | null | undefined): TotalPistes | null {
  const local = r?.local;
  const compte = local?.totals?.tracks;
  if (typeof compte !== 'number') return null;
  let total = compte + (local?.totals?.tracks_via_metadata ?? 0);
  for (const s of Object.values(r?.services ?? {})) total += s?.tracks?.length ?? 0;
  return { total, auMoins: local?.totals_capped?.tracks === true };
}

/**
 * « 50 » quand tout est là ou que le serveur ne compte pas ; « 50 sur 731 »
 * sinon ; « 50 sur au moins 5000 » quand le compte est plafonné. Les gabarits
 * viennent de l'i18n (`search.shownOf`, `search.shownOfAtLeast`).
 */
export function libelleComptePistes(
  affiches: number,
  total: TotalPistes | null,
  gabarits: { sur: string; surAuMoins: string },
): string {
  if (!total || total.total <= affiches) return String(affiches);
  const g = total.auMoins ? gabarits.surAuMoins : gabarits.sur;
  return g.replace('{shown}', String(affiches)).replace('{total}', String(total.total));
}

/** Une suite existe pour les pistes locales — quand le serveur le dit, et seulement alors. */
export function laSuiteExiste(r: FederatedSearchResult | null | undefined): boolean {
  return r?.local?.has_more?.tracks === true;
}

/**
 * Le rang de la page suivante : `offset + limit`, ce que le prédicat a
 * parcouru — pas la longueur de la liste, qui peut porter des pistes en
 * supplément (métadonnées) sur la première page.
 */
export function rangDeLaSuite(r: FederatedSearchResult): number {
  const l = r.local;
  if (typeof l?.offset === 'number' && typeof l?.limit === 'number') return l.offset + l.limit;
  return l?.tracks?.length ?? 0;
}

/**
 * La page suivante à la suite de la liste. Ne mute rien ; ne touche ni aux
 * artistes, ni aux albums, ni aux services (la suite ne porte que les pistes
 * locales). Une piste déjà présente n'est pas ajoutée deux fois. `has_more`
 * des pistes est relu sur la page ; les autres familles gardent le leur.
 */
export function fusionnerLaSuite(prev: FederatedSearchResult, page: FederatedSearchResult): FederatedSearchResult {
  const vus = new Set(prev.local.tracks.map((t) => t.id).filter((id) => id != null));
  const nouvelles = (page.local?.tracks ?? []).filter((t) => t.id == null || !vus.has(t.id));
  return {
    ...prev,
    local: {
      ...prev.local,
      tracks: [...prev.local.tracks, ...nouvelles],
      totals: page.local?.totals ?? prev.local.totals,
      totals_capped: page.local?.totals_capped ?? prev.local.totals_capped,
      has_more: { ...(prev.local.has_more ?? {}), tracks: page.local?.has_more?.tracks === true },
      limit: page.local?.limit ?? prev.local.limit,
      offset: page.local?.offset ?? prev.local.offset,
    },
  };
}
