/**
 * Filtrer les favoris par source, et les trier.
 *
 * ## Deux origines dans une seule liste
 *
 * L'écran Favoris fusionne deux tables : les favoris de la BIBLIOTHÈQUE
 * (`getFavorites`) et ceux des SERVICES (`streaming_favorites`). Un objet de
 * service porte `id: null` et un couple `source` / `source_id` ; un objet de
 * bibliothèque porte un `id` numérique. C'est ce qui distingue les deux, et
 * c'est aussi ce qui donne la source à afficher.
 *
 * ## Deux unités de temps, et le piège
 *
 * Les dates ne sont NI du même type NI de la même unité :
 *
 *  - service : `created_at`, chaîne ISO — mesuré sur le .18 le 04/09/2026,
 *    « 2026-09-03T21:59:50Z » ;
 *  - bibliothèque : `added_at`, nombre en **secondes** — mesuré sur le .18,
 *    1418673220 pour un album de décembre 2014. `LibraryView.svelte` le
 *    multiplie déjà par 1000.
 *
 * Comparer les deux bruts placerait TOUJOURS le streaming en tête : 1,7e12
 * contre 1,7e9. Le tri paraîtrait marcher — les services d'abord, la
 * bibliothèque ensuite, dans le bon ordre chacun — et serait faux.
 *
 * ## Ce que « date » veut dire n'est pas la même chose des deux côtés
 *
 * Pour un favori de service, `created_at` est le moment où on a posé le cœur.
 * Pour un album de la bibliothèque, `added_at` est le moment où il est entré
 * dans la bibliothèque : `getFavorites` rend les objets développés, pas les
 * lignes de favoris, donc la date du cœur n'existe pas de ce côté. Les deux
 * répondent à « quand est-ce arrivé chez moi », ce qui est le sens du tri —
 * mais ce n'est pas la même mesure, et le savoir évite de conclure à un bogue.
 */

/** Les tris proposés. */
export type TriFavoris = 'alpha' | 'alphaInverse' | 'recent' | 'ancien';

/** Source conventionnelle des objets qui viennent de la bibliothèque. */
export const SOURCE_BIBLIOTHEQUE = 'library';

/** Objet de favori, dans la forme que les trois onglets manipulent déjà. */
interface Favori {
  id?: number | null;
  title?: string | null;
  name?: string | null;
  source?: string | null;
  created_at?: string | null;
  added_at?: number | null;
}

/** Bibliothèque ou service : c'est l'`id` qui tranche, pas `source`. */
export function sourceDe(o: Favori): string {
  if (o?.id != null) return SOURCE_BIBLIOTHEQUE;
  return o?.source || SOURCE_BIBLIOTHEQUE;
}

/**
 * Sources réellement présentes, bibliothèque d'abord puis les services par
 * ordre alphabétique.
 *
 * On ne propose PAS une liste fixe de services : une puce « Tidal » sur un
 * écran sans aucun favori Tidal promet un filtre qui ne rendra rien, et laisse
 * croire que les favoris ont disparu.
 */
export function sourcesPresentes(items: readonly Favori[]): string[] {
  const vues = new Set(items.map(sourceDe));
  const services = [...vues].filter((s) => s !== SOURCE_BIBLIOTHEQUE).sort();
  return vues.has(SOURCE_BIBLIOTHEQUE) ? [SOURCE_BIBLIOTHEQUE, ...services] : services;
}

/**
 * Date d'arrivée, en millisecondes, ou `null` si l'objet n'en porte pas.
 *
 * `added_at` est publié en secondes. Le seuil distingue les deux unités sans
 * dépendre du champ lu : au-delà de 1e11, la valeur est déjà en
 * millisecondes ; en deçà, c'est une date en secondes (1e11 s tomberait en
 * l'an 5138, aucune bibliothèque n'en portera).
 */
export function dateDe(o: Favori): number | null {
  if (typeof o?.created_at === 'string' && o.created_at) {
    const t = Date.parse(o.created_at);
    if (!Number.isNaN(t)) return t;
  }
  const n = o?.added_at;
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
    return n < 1e11 ? n * 1000 : n;
  }
  return null;
}

/** Le libellé qui sert au tri : `title` pour un album ou un titre, `name` pour un artiste. */
export function titreDe(o: Favori): string {
  return (o?.title ?? o?.name ?? '').trim();
}

function comparerTitres(a: Favori, b: Favori): number {
  // `localeCompare` en base : « Édith » se range à É, pas après Z, et « 2 »
  // avant « 10 ».
  return titreDe(a).localeCompare(titreDe(b), 'fr', { sensitivity: 'base', numeric: true });
}

/**
 * Filtre par source puis trie. Ne modifie pas la liste reçue.
 *
 * `source` à `null` veut dire « toutes ». Un objet sans date part TOUJOURS en
 * fin de liste, dans les deux sens du tri par date : le ranger avec les plus
 * anciens laisserait croire qu'on connaît sa date.
 */
export function trierEtFiltrer<T extends Favori>(
  items: readonly T[],
  source: string | null,
  tri: TriFavoris,
): T[] {
  const gardes = source ? items.filter((o) => sourceDe(o) === source) : [...items];

  if (tri === 'alpha') return gardes.sort(comparerTitres);
  if (tri === 'alphaInverse') return gardes.sort((a, b) => comparerTitres(b, a));

  const recent = tri === 'recent';
  return gardes.sort((a, b) => {
    const da = dateDe(a);
    const db = dateDe(b);
    if (da == null && db == null) return comparerTitres(a, b);
    if (da == null) return 1;
    if (db == null) return -1;
    return (recent ? db - da : da - db) || comparerTitres(a, b);
  });
}
