/**
 * « Voir plus sur <Service> » — la page SUIVANTE d'un seul service, dans la
 * recherche fédérée (renesenses/tune-server-rust#4803, web #1757).
 *
 * Décision de Bertrand (29/09/2026) : sous chaque section de type (Artistes,
 * Albums, Titres), un bouton par service qui a encore des résultats pour ce
 * type. Le regroupement par type est conservé ; ce bouton cohabite avec le
 * « Voir plus » local (#4663, `rechercheSuiteLocale`).
 *
 * Le serveur (v0.9.164, `tune-server/src/routes/search.rs`) pagine à la
 * demande. Avec `paged=true` ou `service_offsets`, chaque bloc
 * `services.<nom>` gagne À CÔTÉ de ses tableaux :
 *
 *     offset    le décalage de cette page
 *     limit     la taille SERVIE (bornée par le plafond du service)
 *     total     { tracks, albums, artists, playlists } — 0 = « n'annonce rien »
 *     has_more  un booléen GLOBAL au bloc : au moins une famille a une suite
 *     truncated la page a été écourtée par un plafond
 *
 * Rien ici ne nomme un service : un bouton naît de ce que le bloc DIT. Quand
 * TIDAL ou Deezer pagineront côté serveur, leur bouton apparaîtra sans
 * changer une ligne du web. Un serveur plus ancien ne rend ni `has_more` ni
 * `offset` : aucun bouton, aucune erreur.
 */
import type { SearchResult } from './types';
import { ordonnerSources } from './rechercheClassement';

/** Taille d'une page de service demandée par « Voir plus » (Bertrand, 29/09). */
export const PAGE_SERVICE = 50;

export type FamilleService = 'artists' | 'albums' | 'tracks';

/** Les champs de pagination d'un bloc de service, tels que le serveur les pose. */
interface Pagination {
  offset: number;
  limit: number;
  has_more: boolean;
  total?: Partial<Record<FamilleService | 'playlists', number>>;
}

/** Le bloc porte-t-il une pagination lisible ? Sinon, il n'a pas de suite. */
function paginationDe(bloc: SearchResult | null | undefined): Pagination | null {
  const b = bloc as any;
  if (!b || typeof b.has_more !== 'boolean') return null;
  if (typeof b.offset !== 'number' || typeof b.limit !== 'number' || b.limit <= 0) return null;
  const total = b.total && typeof b.total === 'object' ? b.total : undefined;
  return { offset: b.offset, limit: b.limit, has_more: b.has_more, total };
}

/**
 * Ce service a-t-il encore des résultats POUR CETTE FAMILLE ?
 *
 * `has_more` est global au bloc : vrai tant qu'une seule famille a une suite.
 * Le total de la famille tranche quand le service en annonce un :
 *
 * - `total > 0` : suite si `offset + limit < total`. C'est aussi ce qui écarte
 *   un service SANS pagination dont la page unique est pleine : le serveur y
 *   met `has_more: true`, mais `total` vaut ce qui a été rendu — la page
 *   suivante serait vide, le bouton serait un mensonge.
 * - `total = 0` : le service n'annonce rien (règle du serveur). Une famille
 *   vide n'a pas de suite ; une famille non vide se fie à `has_more`.
 */
export function aUneSuite(bloc: SearchResult | null | undefined, famille: FamilleService): boolean {
  const p = paginationDe(bloc);
  if (!p || !p.has_more) return false;
  const total = p.total?.[famille];
  if (typeof total === 'number' && total > 0) return p.offset + p.limit < total;
  return ((bloc as any)?.[famille]?.length ?? 0) > 0;
}

/** Le décalage de la page suivante : là où la page servie s'arrête. */
export function decalageSuivant(bloc: SearchResult | null | undefined): number | null {
  const p = paginationDe(bloc);
  return p ? p.offset + p.limit : null;
}

/** Les services qui ont une suite pour cette famille, dans l'ordre de préférence. */
export function servicesAvecSuite(
  blocs: Record<string, SearchResult> | null | undefined,
  famille: FamilleService,
): string[] {
  return ordonnerSources(
    Object.entries(blocs ?? {}).filter(([, bloc]) => aUneSuite(bloc, famille)),
    (e) => e[0],
  ).map(([svc]) => svc);
}

/** Les paramètres de la requête qui charge la suite d'UN service. */
export function parametresSuite(svc: string, decalage: number) {
  return {
    sources: [svc],
    serviceOffsets: { [svc]: decalage },
    serviceLimits: { [svc]: PAGE_SERVICE },
  };
}

const cle = (x: any): string => String(x?.source_id ?? x?.id ?? '');

function ajouterSansDoublon<T>(avant: readonly T[] | undefined, apres: readonly T[] | undefined): T[] {
  const vus = new Set((avant ?? []).map(cle).filter(Boolean));
  const out = [...(avant ?? [])];
  for (const x of apres ?? []) {
    const k = cle(x);
    if (k && vus.has(k)) continue;
    if (k) vus.add(k);
    out.push(x);
  }
  return out;
}

/**
 * Le bloc de service après sa page suivante : les résultats à la SUITE, sans
 * doublon, et la pagination de la NOUVELLE page — c'est elle qui dit s'il
 * reste quelque chose. `has_more` à faux éteint donc le bouton.
 *
 * Un NOUVEL objet : Svelte 5 suit l'affectation, pas l'écriture dans l'objet.
 */
export function fusionnerSuiteService(bloc: SearchResult, page: SearchResult | null | undefined): SearchResult {
  if (!page) return { ...(bloc as any), has_more: false } as SearchResult;
  const b = bloc as any, p = page as any;
  return {
    ...b,
    artists: ajouterSansDoublon(b.artists, p.artists),
    albums: ajouterSansDoublon(b.albums, p.albums),
    tracks: ajouterSansDoublon(b.tracks, p.tracks),
    playlists: ajouterSansDoublon(b.playlists, p.playlists),
    offset: p.offset,
    limit: p.limit,
    total: p.total,
    has_more: p.has_more === true,
    truncated: p.truncated,
  } as SearchResult;
}
