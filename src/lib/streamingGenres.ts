/**
 * Genres de streaming — les trois décisions, hors du gabarit.
 *
 * Elles vivent ici et pas dans `StreamingV2.svelte` parce qu'elles sont des
 * FAITS, pas de la mise en page, et qu'un fait se teste : « ce service a-t-il
 * un onglet Genres ? », « ce genre ouvre-t-il ses albums ou ses sous-genres ? ».
 * Écrites dans le gabarit, elles n'auraient été vérifiables qu'en lisant du
 * texte source — le genre de garde qui reste verte pendant qu'un écran se vide.
 *
 * Deux motifs du projet dictent leur forme :
 *
 *  1. LE 200 POUR RIEN. `/streaming/{service}/genres` répond 200 avec `[]` chez
 *     les services dont l'amont ne sert rien d'exploitable. Un onglet ouvert
 *     sur du vide promet du contenu et livre une page blanche : la doctrine en
 *     tête de `StreamingV2.svelte` — « seuls les services CONNECTÉS ont un
 *     onglet » — vaut donc aussi pour les genres. Pas de matière, pas d'onglet.
 *
 *  2. `has_children` PLUTÔT QU'UNE LISTE DE SERVICES. Le second niveau existe
 *     chez Qobuz (`/genre/list` accepte `parent_id`) et pas chez Tidal
 *     (`_parent_id` ignoré, liste plate). Coder cette différence en dur, c'est
 *     la figer : le jour où Tidal sert des sous-genres, l'écran continuerait de
 *     les ignorer. `has_children` est le champ prévu pour le dire, on ne
 *     consulte que lui.
 */
import type { StreamingGenre } from './types';

/**
 * Normalise ce que rend le serveur.
 *
 * Un genre sans `id` n'est pas navigable (la route albums en a besoin) et un
 * genre sans `name` n'est pas affichable : ni l'un ni l'autre n'a sa place dans
 * la liste. `has_children` absent vaut `false` — l'absence d'annonce d'enfants
 * n'est pas une promesse d'enfants.
 */
export function normaliserGenres(brut: unknown): StreamingGenre[] {
  if (!Array.isArray(brut)) return [];
  const vus = new Set<string>();
  const out: StreamingGenre[] = [];
  for (const g of brut) {
    const id = g?.id == null ? '' : String(g.id);
    const name = typeof g?.name === 'string' ? g.name.trim() : '';
    if (!id || !name || vus.has(id)) continue;
    vus.add(id);
    out.push({
      id,
      name,
      has_children: g?.has_children === true,
      image_url: g?.image_url ?? null,
    });
  }
  return out;
}

/**
 * Ce service mérite-t-il un onglet Genres ?
 *
 * Uniquement s'il reste de la matière APRÈS normalisation : une liste de dix
 * entrées toutes dépourvues d'`id` ne vaut pas mieux qu'une liste vide.
 */
export function aUnOngletGenres(genres: StreamingGenre[] | null | undefined): boolean {
  return Array.isArray(genres) && genres.length > 0;
}

/** Ce qu'ouvre un clic sur un genre. Rien d'autre que `has_children` ne décide. */
export function ouvertureGenre(g: Pick<StreamingGenre, 'has_children'> | null | undefined): 'sous-genres' | 'albums' {
  return g?.has_children === true ? 'sous-genres' : 'albums';
}

/**
 * Le second niveau réellement servi, une fois retiré ce qui n'en est pas.
 *
 * TIDAL ANNONCE DES ENFANTS ET N'EN SERT PAS. Mesuré dans le serveur, sur
 * `origin/main` :
 *   - `tidal.rs` calcule `has_children` depuis `hasSubgenres` / `subGenres`
 *     (map_genre) — il peut donc valoir `true` ;
 *   - mais `async fn get_genres(&self, _parent_id: Option<&str>)` IGNORE le
 *     paramètre : `?parent_id=X` re-sert la liste RACINE, à l'identique.
 *
 * Sans ce filtre, dérouler « Jazz » chez Tidal affichait la racine entière
 * comme si c'étaient ses sous-genres — une boucle sans fond, et la promesse la
 * plus grossière que l'écran puisse faire. On ne garde donc que ce qui n'est
 * ni le parent, ni un genre déjà présent à la racine. Rien ne reste : il n'y
 * avait pas de second niveau, on ouvre les albums du parent.
 *
 * Chez Qobuz, dont `/genre/list` accepte vraiment `parent_id`, les enfants ont
 * leurs propres identifiants et passent tous.
 */
export function sousGenresUtiles(
  parent: Pick<StreamingGenre, 'id'>,
  racine: StreamingGenre[],
  rendus: StreamingGenre[],
): StreamingGenre[] {
  const aLaRacine = new Set(racine.map((g) => g.id));
  return rendus.filter((g) => g.id !== parent.id && !aLaRacine.has(g.id));
}
