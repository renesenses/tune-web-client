/**
 * « Ces albums ne sont pas des doublons » (#1276) — l'arbitrage de
 * l'utilisateur, côté client.
 *
 * # Ce que le serveur porte déjà (v0.9.127)
 *
 * Une table `album_distinct_pairs` **sans clé étrangère**, avec un instantané
 * d'identité (titre + artiste des deux côtés) figé à l'arbitrage. C'était tout
 * l'enjeu du correctif : la paire survit au rescan, au déplacement de racine,
 * et à la mort/renaissance d'une ligne `albums`. Trois routes l'exposent :
 *
 * * `GET    /library/albums/distinct`                  — la liste de révision ;
 * * `POST   /library/albums/{id}/distinct/{other_id}`  — poser l'arbitrage ;
 * * `DELETE /library/albums/{id}/distinct/{other_id}`  — le révoquer.
 *
 * Les deux écritures sont **idempotentes** et **insensibles à l'ordre** des
 * deux identifiants ; le serveur normalise en `(min, max)`.
 *
 * # Ce que ce module fait, et pourquoi il doit exister
 *
 * L'écran Métadonnées ne lit PAS `GET /library/albums/grouped` : il regroupe
 * lui-même `allAlbums` par `titre||artiste||fréquence||profondeur`. Un
 * arbitrage posé sur le serveur ne changerait donc rien à ce que l'écran
 * affiche — la paire écartée reviendrait à la ligne suivante, et l'utilisateur
 * conclurait que le bouton est mort.
 *
 * On applique donc côté client EXACTEMENT la règle du serveur
 * (`variantes_retenues`, `routes/library/albums.rs`) :
 *
 * 1. la comparaison se fait contre l'**original** du groupe — celui que
 *    l'écran propose de garder, c'est-à-dire le premier ;
 * 2. une variante déclarée distincte de l'original sort du groupe ;
 * 3. un groupe vidé de ses variantes n'est plus signalé du tout.
 *
 * Un groupe de trois dont une seule paire est arbitrée garde donc les deux
 * autres membres rapprochés : on retire la paire nommée, on n'invente aucun
 * nouveau rapprochement.
 */

/** Une paire arbitrée, telle que `GET /library/albums/distinct` la rend.
 *
 *  Les titres sont VIVANTS si les albums existent encore, et retombent sinon
 *  sur l'instantané figé — c'est ce qui garde la liste lisible, donc l'arbitrage
 *  révocable, pendant qu'une racine est démontée. */
export interface PaireDistincte {
  album_a_id: number;
  album_b_id: number;
  a_title: string;
  a_artist: string | null;
  b_title: string;
  b_artist: string | null;
  created_at: string | null;
  /** `false` = au moins un des deux identifiants ne désigne plus d'album
   *  vivant, en attente de réconciliation par le serveur. */
  resolved: boolean;
}

/** La clé normalisée d'une paire : l'ordre des deux albums est indifférent,
 *  comme côté serveur. */
export function clePaire(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** L'ensemble interrogeable des paires arbitrées — une lecture `Set`, aucun
 *  appel réseau par candidat. */
export function ensembleDistinct(paires: readonly PaireDistincte[]): Set<string> {
  return new Set(paires.map((p) => clePaire(p.album_a_id, p.album_b_id)));
}

export function estDistinct(ensemble: Set<string>, a: number, b: number): boolean {
  return ensemble.has(clePaire(a, b));
}

/** Le minimum qu'un groupe doit offrir pour être arbitrable : des albums avec
 *  un identifiant. */
interface MembreDeGroupe {
  id?: number | null;
}

/**
 * Les paires à déclarer pour écarter tout un groupe : l'original contre chaque
 * variante.
 *
 * C'est la traduction fidèle de la règle serveur — le groupe n'est pas « effacé »,
 * ce sont N−1 arbitrages nommés, chacun révocable séparément.
 */
export function pairesDuGroupe<T extends MembreDeGroupe>(groupe: readonly T[]): Array<[number, number]> {
  const original = groupe[0]?.id;
  if (original == null) return [];
  const paires: Array<[number, number]> = [];
  for (const membre of groupe.slice(1)) {
    if (membre.id != null && membre.id !== original) paires.push([original, membre.id]);
  }
  return paires;
}

/**
 * Le groupe amputé de ses variantes arbitrées, ou `null` si plus rien n'y est
 * signalé.
 *
 * Miroir de `variantes_retenues` côté serveur : l'original reste, les variantes
 * déclarées distinctes DE LUI sortent, et un groupe sans variante disparaît.
 */
export function groupeRetenu<T extends MembreDeGroupe>(
  groupe: readonly T[],
  ensemble: Set<string>,
): T[] | null {
  const original = groupe[0];
  const oid = original?.id;
  if (oid == null || ensemble.size === 0) return groupe.length > 1 ? [...groupe] : null;
  const retenues = groupe.slice(1).filter((v) => v.id == null || !estDistinct(ensemble, oid, v.id));
  if (retenues.length === 0) return null;
  return [original, ...retenues];
}

/** Tous les groupes, filtrés par la même règle. */
export function groupesRetenus<T extends MembreDeGroupe>(
  groupes: readonly (readonly T[])[],
  ensemble: Set<string>,
): T[][] {
  const gardes: T[][] = [];
  for (const groupe of groupes) {
    const retenu = groupeRetenu(groupe, ensemble);
    if (retenu) gardes.push(retenu);
  }
  return gardes;
}

/** Le nombre de copies EN TROP restant à traiter — ce que le compteur de
 *  l'onglet doit annoncer une fois les arbitrages appliqués. */
export function copiesEnTrop<T extends MembreDeGroupe>(groupes: readonly (readonly T[])[]): number {
  return groupes.reduce((total, g) => total + Math.max(0, g.length - 1), 0);
}
