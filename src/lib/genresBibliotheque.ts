/**
 * #1722 (fil 2013, point 8) — les genres d'un album, comme le SERVEUR les lit.
 *
 * Le panneau Genres de l'Accueil (et les Favoris) envoie un libellé de
 * `GET /library/genres`. Le serveur y découpe les valeurs multiples et
 * fusionne les graphies d'un même genre ; l'onglet Genres de la Bibliothèque
 * groupait, lui, sur la chaîne brute `albums.genre`. Résultat : « Rock; Pop »
 * ne tombait jamais sous « Rock », « Trip Hop » et « Trip-Hop » faisaient
 * deux groupes, et un libellé sans égal exact laissait la LISTE à l'écran.
 *
 * Copie fidèle, et seulement ça, de tune-server-rust :
 *   - `genres_de_l_album` (`tune-server/src/routes/library/genres.rs`) ;
 *   - `split_genre_tag`, `normalize_genre`, `genre_key`
 *     (`tune-core/src/metadata/mod.rs`) ;
 *   - le libellé affiché de `list_genres` : la graphie la plus fréquente,
 *     égalité tranchée par la plus petite.
 */

const JETONS_MAJUSCULES = ['R&B', 'DJ', 'UK', 'US', 'MC', 'TV', 'AC', 'DC', 'EDM', 'II', 'III', 'IV'];

function motEnTitre(mot: string): string {
  for (const j of JETONS_MAJUSCULES) if (mot.toLowerCase() === j.toLowerCase()) return j;
  const [premier, ...reste] = [...mot];
  return premier === undefined ? '' : premier.toUpperCase() + reste.join('').toLowerCase();
}

/** `normalize_genre` : casse de titre, mot par mot et de part et d'autre d'un tiret. */
export function normaliserGenre(genre: string): string {
  return genre
    .split('/')
    .map((p) => p.split(/\s+/).filter(Boolean).map((m) => m.split('-').map(motEnTitre).join('-')).join(' '))
    .join('/');
}

/** `split_genre_tag` : `;`, `/`, `\` ou octet nul. */
export function decouperGenre(brut: string): string[] {
  return brut
    .split(/[;/\\\0]/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map(normaliserGenre);
}

/** `genre_key` : insensible à la casse et à l'écart espace / tiret (#1161). */
export function cleGenre(genre: string): string {
  return genre.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(Boolean).join(' ');
}

/**
 * `genres_de_l_album` : la liste JSON `genres` d'abord (#1821), sinon la
 * colonne héritée `genre` découpée ; dédoublonnée par clé dans l'album.
 */
export function genresDeLAlbum(genre: string | null | undefined, genres: string | null | undefined): { cle: string; nom: string }[] {
  let noms: string[] = [];
  if (typeof genres === 'string' && genres !== '') {
    try {
      const arr = JSON.parse(genres);
      if (Array.isArray(arr)) noms = arr.filter((g): g is string => typeof g === 'string').map((g) => g.trim()).filter(Boolean);
    } catch { /* illisible : on retombe sur la colonne héritée, comme le serveur */ }
  }
  if (!noms.length && typeof genre === 'string') noms = decouperGenre(genre);
  const vues = new Set<string>();
  const out: { cle: string; nom: string }[] = [];
  for (const nom of noms) {
    const cle = cleGenre(nom);
    if (cle && !vues.has(cle)) { vues.add(cle); out.push({ cle, nom }); }
  }
  return out;
}

/**
 * Regroupe des albums par genre. Un album sous CHACUN de ses genres ; un
 * album sans genre sous `vide` (libellé de remplacement, `reel: false`).
 * L'ordre des albums de chaque groupe est celui d'entrée.
 */
export function grouperParGenre<A extends { genre?: string | null; genres?: string | null }>(
  albums: A[],
  vide: string,
): { key: string; albums: A[]; reel: boolean }[] {
  const groupes = new Map<string, { albums: A[]; graphies: Map<string, number> }>();
  const sans: A[] = [];
  for (const a of albums) {
    const gs = genresDeLAlbum(a.genre, a.genres);
    if (!gs.length) { sans.push(a); continue; }
    for (const { cle, nom } of gs) {
      let g = groupes.get(cle);
      if (!g) { g = { albums: [], graphies: new Map() }; groupes.set(cle, g); }
      g.albums.push(a);
      g.graphies.set(nom, (g.graphies.get(nom) ?? 0) + 1);
    }
  }
  const out = [...groupes.values()].map((g) => {
    let nom = '';
    let n = -1;
    for (const [graphie, c] of g.graphies) {
      if (c > n || (c === n && graphie < nom)) { nom = graphie; n = c; }
    }
    return { key: nom, albums: g.albums, reel: true };
  });
  if (sans.length) {
    // Un vrai genre qui porterait le libellé de remplacement : un seul groupe
    // (deux clés égales casseraient le `{#each … (g.key)}`), comme avant.
    const homonyme = out.find((g) => g.key === vide);
    if (homonyme) homonyme.albums.push(...sans);
    else out.push({ key: vide, albums: sans, reel: false });
  }
  return out;
}
