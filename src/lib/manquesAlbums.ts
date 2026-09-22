/**
 * Ce qui manque à un album, et sur quoi on peut agir.
 *
 * Demandé par Bertrand le 18/09/2026 : « présenter les albums sans cover,
 * sans genre, sans année, et proposer des outils de correction des manques ».
 *
 * L'onglet « Manquants » donnait déjà les trois COMPTEURS et deux passes
 * automatiques. Il ne disait jamais QUELS albums, donc rien ne pouvait être
 * corrigé à la main quand la passe automatique échouait.
 */
import type { Album } from './types';
import { ordreNaturel } from './ordreNaturel';

export type Manque = 'cover' | 'genre' | 'year';

/**
 * Un champ vide ou blanc compte comme absent, un `0` d'année aussi.
 *
 * 🔴 `genre` seul ne suffit pas : la base porte AUSSI `genres`, la liste
 * multiple (#1821). Un album qui n'a que `genres` renseigné n'est pas sans
 * genre — le compter ferait proposer une correction à qui n'en a pas besoin,
 * et écraser une liste par une valeur unique.
 */
export function manqueA(a: Album, quoi: Manque): boolean {
  switch (quoi) {
    case 'cover':
      return !(a.cover_path ?? '').trim();
    case 'genre':
      return !(a.genre ?? '').trim() && !(a.genres ?? '').trim();
    case 'year':
      return !a.year;
  }
}

/**
 * Les albums à corriger, les plus fournis d'abord.
 *
 * 🔴 **Locaux seulement.** Un album servi par Qobuz ou Tidal n'a pas de
 * pochette à réparer chez soi : sa fiche vient du service, et l'écrire ne
 * mènerait nulle part. Les lister serait promettre une correction impossible.
 *
 * L'ordre met en tête ce qui pèse : un coffret de quarante pistes corrigé vaut
 * quarante pistes, un single en vaut une.
 */
export function albumsAvecManque(albums: Album[], quoi: Manque): Album[] {
  return albums
    .filter((a) => (a.source ?? 'local') === 'local' && manqueA(a, quoi))
    .sort(
      (x, y) =>
        (y.track_count ?? 0) - (x.track_count ?? 0) ||
        ordreNaturel(x.title, y.title),
    );
}

/** Les genres déjà présents dans la bibliothèque, triés — pour la saisie. */
export function genresConnus(albums: Album[]): string[] {
  const s = new Set<string>();
  for (const a of albums) {
    const g = (a.genre ?? '').trim();
    if (g) s.add(g);
  }
  return [...s].sort((x, y) => x.localeCompare(y));
}

/**
 * Le genre d'un artiste, quand il n'y en a QU'UN dans toute la bibliothèque.
 *
 * Bertrand, 18/09/2026 — arbitrage : « proposer, je valide ». Mesuré sur sa
 * bibliothèque le même jour : sur 1 188 albums sans genre, **168** ont un
 * artiste qui en porte un ailleurs, dont **138** où cet artiste n'en a qu'un
 * seul.
 *
 * 🔴 Un artiste qui porte DEUX genres est écarté, pas arbitré. Prendre le plus
 * fréquent poserait « Rock » sur l'album de jazz d'un rocker — la déduction
 * serait fausse précisément là où elle est intéressante. Même règle que pour
 * l'année : en cas de désaccord, on ne pose rien et on le dit.
 */
export function genreParArtiste(albums: Album[]): Map<number, string> {
  const vus = new Map<number, Set<string>>();
  for (const a of albums) {
    const g = (a.genre ?? '').trim();
    if (!g || a.artist_id == null) continue;
    let s = vus.get(a.artist_id);
    if (!s) { s = new Set(); vus.set(a.artist_id, s); }
    s.add(g);
  }
  const uniques = new Map<number, string>();
  for (const [id, s] of vus) if (s.size === 1) uniques.set(id, [...s][0]);
  return uniques;
}

/**
 * Ce qu'on proposerait pour ces albums : `album_id → genre`.
 *
 * Rien n'est proposé pour un album qui a déjà un genre, ni pour un artiste
 * dont le genre n'est pas unique — ou qui n'en a aucun ailleurs.
 */
export function propositionsGenre(
  cibles: Album[],
  parArtiste: Map<number, string>,
): Map<number, string> {
  const p = new Map<number, string>();
  for (const a of cibles) {
    if (a.id == null || a.artist_id == null) continue;
    if (!manqueA(a, 'genre')) continue;
    const g = parArtiste.get(a.artist_id);
    if (g) p.set(a.id, g);
  }
  return p;
}

/**
 * Les propositions retenues, rangées par genre — un appel d'édition en lot par
 * valeur distincte.
 *
 * L'édition en lot du serveur écrit UNE valeur pour tous les albums donnés :
 * envoyer les 138 d'un coup leur poserait à tous le même genre. On groupe donc,
 * et le nombre d'appels est le nombre de genres, pas le nombre d'albums.
 */
export function grouperParGenre(
  propositions: Map<number, string>,
  retenus: Set<number>,
): Map<string, number[]> {
  const par = new Map<string, number[]>();
  for (const [id, g] of propositions) {
    if (!retenus.has(id)) continue;
    const l = par.get(g);
    if (l) l.push(id); else par.set(g, [id]);
  }
  return par;
}
