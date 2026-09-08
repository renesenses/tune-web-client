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

/**
 * #3623 — la moitié ALBUMS n'avait pas été réparée, et les ARTISTES n'ont
 * jamais rien affiché du tout (`slice(0, 12)`, sans compte ni accès au reste).
 *
 * Le serveur, lui, rend les trois familles depuis la même 0.9.132 :
 * `totals.{artists,albums,tracks}`, `totals_capped` et `has_more` par famille,
 * et `search_page(q, limit, offset)` est appelée pour les trois. La donnée
 * était là, une famille sur trois la lisait. Ce module se décline donc PAR
 * FAMILLE, et les trois entrées historiques (`totalPistes`, `laSuiteExiste`,
 * `fusionnerLaSuite`) ne sont plus que le cas `tracks`.
 *
 * ⚠️ Un piège de la route : le serveur n'a QU'UN `offset`, partagé par les
 * trois familles. Le rang de la page suivante ne peut donc pas se relire dans
 * la réponse une fois qu'une famille a avancé seule — c'est à l'appelant de
 * tenir un rang par famille (voir `SearchView.rangSuite`).
 */
export type FamilleRecherche = 'artists' | 'albums' | 'tracks';

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
export function totalFamille(
  r: FederatedSearchResult | null | undefined,
  famille: FamilleRecherche,
): TotalPistes | null {
  const local = r?.local;
  const compte = local?.totals?.[famille];
  if (typeof compte !== 'number') return null;
  // `tracks_via_metadata` ne concerne que les pistes : ce sont des lignes
  // rendues EN SUPPLÉMENT du prédicat que `offset`/`limit` parcourent.
  let total = compte + (famille === 'tracks' ? (local?.totals?.tracks_via_metadata ?? 0) : 0);
  for (const s of Object.values(r?.services ?? {})) total += s?.[famille]?.length ?? 0;
  return { total, auMoins: local?.totals_capped?.[famille] === true };
}

/** Le cas `tracks` de {@link totalFamille}. */
export function totalPistes(r: FederatedSearchResult | null | undefined): TotalPistes | null {
  return totalFamille(r, 'tracks');
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

/** Une suite existe pour cette famille — quand le serveur le dit, et seulement alors. */
export function suiteExiste(
  r: FederatedSearchResult | null | undefined,
  famille: FamilleRecherche,
): boolean {
  return r?.local?.has_more?.[famille] === true;
}

/** Le cas `tracks` de {@link suiteExiste}. */
export function laSuiteExiste(r: FederatedSearchResult | null | undefined): boolean {
  return suiteExiste(r, 'tracks');
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
export function fusionnerLaSuiteFamille(
  prev: FederatedSearchResult,
  page: FederatedSearchResult,
  famille: FamilleRecherche,
): FederatedSearchResult {
  const anciennes: { id?: number | null }[] = (prev.local as any)[famille] ?? [];
  const vus = new Set(anciennes.map((x) => x.id).filter((id) => id != null));
  const recues: { id?: number | null }[] = (page.local as any)?.[famille] ?? [];
  const nouvelles = recues.filter((x) => x.id == null || !vus.has(x.id));
  return {
    ...prev,
    local: {
      ...prev.local,
      [famille]: [...anciennes, ...nouvelles],
      totals: page.local?.totals ?? prev.local.totals,
      totals_capped: page.local?.totals_capped ?? prev.local.totals_capped,
      // SEULE la famille chargée voit son `has_more` relu : les deux autres
      // n'ont pas avancé, et écraser leur drapeau avec celui d'une page
      // demandée pour une autre famille ferait disparaître leur bouton.
      has_more: {
        ...(prev.local.has_more ?? {}),
        [famille]: (page.local?.has_more as any)?.[famille] === true,
      },
      limit: page.local?.limit ?? prev.local.limit,
      offset: page.local?.offset ?? prev.local.offset,
    } as typeof prev.local,
  };
}

/** Le cas `tracks` de {@link fusionnerLaSuiteFamille}. */
export function fusionnerLaSuite(prev: FederatedSearchResult, page: FederatedSearchResult): FederatedSearchResult {
  return fusionnerLaSuiteFamille(prev, page, 'tracks');
}
