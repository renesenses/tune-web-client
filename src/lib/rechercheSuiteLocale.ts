/**
 * LA SUITE LOCALE DE L'ÉCRAN RECHERCHE — renesenses/tune-server-rust#4663.
 *
 * jfpaquet (fil 1878, 0.9.161, 79 614 pistes) cherche « autumn leaves » :
 * `Tracks 40`, pour 119 correspondances. Le 40 était la limite que l'écran
 * demande à `/library/search` ; la pastille affichait la longueur reçue, et
 * « Voir plus » ne RÉVÈLE que ce qui est déjà là : avec 40 reçues et 40
 * affichées, il ne paraissait même pas. Le correctif de #3189/#3623 vivait
 * dans l'écran de l'ancienne interface, supprimé le 19/09.
 *
 * Depuis le même correctif côté serveur, `/library/search` rend `totals`,
 * `totals_capped`, `has_more` et accepte `?offset=` — le contrat de `/search`
 * sous `local`. Ce module en tire, par famille :
 *
 *  - combien de lignes LOCALES restent à demander (`restantLocal`) — ce que la
 *    pastille ajoute à son compte, et ce que le bouton annonce ;
 *  - le rang de la page suivante (`rangSuivant`) — le serveur n'a qu'UN
 *    `offset` pour les trois familles, c'est à l'appelant de tenir le sien ;
 *  - la fusion de la page reçue (`fusionnerSuite`), sans doublon, QUE pour la
 *    famille demandée : les deux autres de la même réponse sont à un autre
 *    rang que le leur.
 *
 * Un serveur antérieur ne rend pas `totals` : tout rend `null` / 0, et l'écran
 * se comporte exactement comme avant.
 */
import type { SearchResult } from './types';

export type FamilleLocale = 'artists' | 'albums' | 'tracks';

/** Les pistes trouvées par leurs seules métadonnées : hors du prédicat que
 *  `offset` parcourt, première page seulement. */
const viaMetadonnees = (local: SearchResult | null | undefined, f: FamilleLocale) =>
  f === 'tracks' ? Number(local?.totals?.tracks_via_metadata ?? 0) : 0;

const recues = (local: SearchResult | null | undefined, f: FamilleLocale) =>
  (local?.[f] as unknown[] | undefined)?.length ?? 0;

/** Les lignes locales pas encore reçues, ou `null` si le serveur ne compte pas. */
export function restantLocal(
  local: SearchResult | null | undefined,
  f: FamilleLocale,
): { n: number; auMoins: boolean } | null {
  const total = local?.totals?.[f];
  if (typeof total !== 'number') return null;
  const n = Math.max(0, total + viaMetadonnees(local, f) - recues(local, f));
  const auMoins = local?.totals_capped?.[f] === true;
  // Au plafond, le total ne sait plus compter : c'est `has_more` qui dit s'il
  // reste quelque chose, même quand l'arithmétique rend 0.
  if (auMoins && n === 0 && local?.has_more?.[f]) return { n: 1, auMoins };
  return { n, auMoins };
}

/** Le rang de la première ligne de la page suivante, pour cette famille. */
export function rangSuivant(local: SearchResult | null | undefined, f: FamilleLocale): number {
  return Math.max(0, recues(local, f) - viaMetadonnees(local, f));
}

const cle = (x: any) => String(x?.id ?? x?.source_id ?? x?.name ?? '');

/**
 * La réponse locale augmentée de la page reçue, pour la seule famille `f`.
 * `totals`, `totals_capped` et `has_more` de la famille sont repris de la page
 * (le compte n'a pas changé ; `has_more` dit s'il reste encore une suite).
 */
export function fusionnerSuite(
  local: SearchResult,
  page: SearchResult | null | undefined,
  f: FamilleLocale,
): SearchResult {
  const deja = new Set(((local[f] as unknown[]) ?? []).map(cle));
  const neuves = ((page?.[f] as unknown[]) ?? []).filter((x) => !deja.has(cle(x)));
  return {
    ...local,
    [f]: [...((local[f] as unknown[]) ?? []), ...neuves],
    has_more: { ...(local.has_more ?? {}), [f]: page?.has_more?.[f] ?? false },
  } as SearchResult;
}
