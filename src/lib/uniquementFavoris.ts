/**
 * tune-server-rust#7586 (FabienM, fil « 1.0.0RC9: Divers bugs », point 13 ;
 * go de Bertrand du 12/11 : rc12) — le filtre « Uniquement favoris » de la
 * Bibliothèque, sur TOUS ses onglets.
 *
 * - Albums, Artistes, Pistes : les objets mis en favori par le profil
 *   (identifiants locaux : un album de service, sans identifiant, n'en est
 *   jamais un — ce sont les favoris de la bibliothèque, pas des services).
 * - Genres, Années, Labels : les VALEURS mises en favori (le cœur de la
 *   liste), lues dans les favoris de facette (`favorite_facets`).
 */
import { facetFavKey } from './stores/profile';

/** Les onglets qui portent la puce. Ni les Ajouts récents ni les coffrets :
 *  ils ont leur propre source. */
export const ONGLETS_UNIQUEMENT_FAVORIS = ['albums', 'artists', 'tracks', 'genres', 'years', 'labels'] as const;

/**
 * Le nom SERVEUR de la facette d'un onglet : « Genres » est un libellé
 * d'interface, la table s'appelle `genre`. Écrire le pluriel enregistrerait
 * des favoris que `/library/facets` ne saurait jamais relire.
 */
export const FACETTE_SERVEUR_DES_ONGLETS: Readonly<Record<string, string>> = {
  genres: 'genre', years: 'year', labels: 'label',
};

/** La valeur `valeur` de l'onglet `onglet` est-elle une facette favorite ? */
export function estFacetteFavoriteDe(onglet: string, valeur: string, cles: ReadonlySet<string>): boolean {
  const f = FACETTE_SERVEUR_DES_ONGLETS[onglet];
  return f ? cles.has(facetFavKey(f, valeur)) : false;
}

/** Les éléments d'identifiant LOCAL mis en favori ; `id` nul : jamais. */
export function seulementFavoris<T extends { id?: number | null }>(liste: readonly T[], ids: ReadonlySet<number>): T[] {
  return liste.filter((x) => x.id != null && ids.has(x.id));
}
