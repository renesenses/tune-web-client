/**
 * Categories de podcasts de l'onglet Decouvrir.
 *
 * Les identifiants sont ceux des genres de l'iTunes Store, que l'API interroge
 * telles quelles. Les libelles, eux, passent par une CLE de traduction et
 * jamais par une chaine en dur : ils etaient ecrits ici en francais sans
 * accents (« Actualites », « Societe »), si bien qu'une interface anglaise
 * affichait des categories francaises, mal orthographiees — et que les deux
 * garde-fous les manquaient (le controle i18n ne lit que le balisage, et son
 * detecteur de francais cherche les accents).
 *
 * Extrait dans un module a part pour que les tests interrogent la liste
 * elle-meme plutot que d'analyser le composant a coups d'expressions
 * regulieres.
 */
export interface PodcastGenre {
  /** Identifiant de genre iTunes ; `null` = toutes categories. */
  id: number | null;
  /** Cle de traduction — resolue par `$t()` a l'affichage. */
  key: string;
}

export const PODCAST_GENRES: readonly PodcastGenre[] = [
  { id: null, key: 'podcasts.genre.all' },
  { id: 1311, key: 'podcasts.genre.news' },
  { id: 1324, key: 'podcasts.genre.society' },
  { id: 1301, key: 'podcasts.genre.artsCulture' },
  { id: 1310, key: 'podcasts.genre.music' },
  { id: 1303, key: 'podcasts.genre.comedy' },
  { id: 1315, key: 'podcasts.genre.science' },
  { id: 1326, key: 'podcasts.genre.history' },
  { id: 1325, key: 'podcasts.genre.trueCrime' },
  { id: 1304, key: 'podcasts.genre.education' },
  { id: 1321, key: 'podcasts.genre.business' },
  { id: 1318, key: 'podcasts.genre.tech' },
  { id: 1316, key: 'podcasts.genre.sport' },
  { id: 1401, key: 'podcasts.genre.fiction' },
] as const;

/** Titres de palmares : le pays vient du selecteur, il n'est jamais en dur. */
export const PODCAST_HEADING_KEYS = {
  trendingIn: 'podcasts.trendingIn',
  topIn: 'podcasts.topIn',
  topGenre: 'podcasts.topGenre',
} as const;

/**
 * Sous-categories iTunes, par genre parent.
 *
 * 🔴 CHAQUE identifiant a ete interroge le 02/09/2026 sur
 * `itunes.apple.com/fr/rss/toppodcasts/…/genre=<id>/json`, et retenu seulement
 * si le libelle rendu par Apple correspondait. Ce n'est pas une precaution de
 * style : plusieurs identifiants tires de memoire etaient FAUX, et un
 * identifiant faux ne rate pas — il rend un classement plausible mais d'une
 * tout autre categorie.
 *
 *     1413 → « Actualites » et non Gestion          → ecarte
 *     1502 → « Jeux, Loisirs » et non Langues       → ecarte
 *     1503 → « Automobile » et non Developpement    → ecarte
 *     1545/1546/1547/1548 → du SPORT                → ecartes
 *     1495 et 1496 : inverses par rapport a ce que je croyais
 *
 * Les libelles ci-dessous reprennent MOT POUR MOT ceux qu'Apple rend en
 * francais, pour que la puce annonce ce que la liste contient.
 *
 * ⚠️ Elles n'ont d'effet QUE depuis le correctif serveur du meme jour : le
 * point d'entree « marketing tools » d'Apple IGNORE `genre`, et le filtre etait
 * purement decoratif dans les deux clients.
 *
 * Un genre absent de cette table n'a pas de sous-categorie connue : on
 * n'invente pas une arborescence pour la symetrie.
 */
export const PODCAST_SUBGENRES: Readonly<Record<number, readonly PodcastGenre[]>> = {
  // Arts & Culture — les six mesurees.
  1301: [
    { id: 1482, key: 'podcasts.sub.books' },
    { id: 1402, key: 'podcasts.sub.design' },
    { id: 1459, key: 'podcasts.sub.fashion' },
    { id: 1306, key: 'podcasts.sub.food' },
    { id: 1405, key: 'podcasts.sub.performingArts' },
    { id: 1406, key: 'podcasts.sub.visualArts' },
  ],
  // Musique
  1310: [
    { id: 1523, key: 'podcasts.sub.musicCommentary' },
    { id: 1524, key: 'podcasts.sub.musicHistory' },
    { id: 1525, key: 'podcasts.sub.musicInterviews' },
  ],
  // Humour — 1495 est l'IMPROVISATION et 1496 les interviews, l'inverse de ce
  // que laisse croire la documentation officieuse.
  1303: [
    { id: 1495, key: 'podcasts.sub.improv' },
    { id: 1496, key: 'podcasts.sub.comedyInterviews' },
    { id: 1497, key: 'podcasts.sub.standUp' },
  ],
  // Affaires — seules deux ont ete confirmees.
  1321: [
    { id: 1410, key: 'podcasts.sub.careers' },
    { id: 1412, key: 'podcasts.sub.investing' },
  ],
  // Education
  1304: [
    { id: 1501, key: 'podcasts.sub.courses' },
    { id: 1500, key: 'podcasts.sub.selfImprovement' },
  ],
  // Culture et societe
  1324: [{ id: 1544, key: 'podcasts.sub.relationships' }],
} as const;

/** Sous-categories d'un genre, ou liste vide s'il n'en a pas de connue. */
export function sousCategories(genre: number | null): readonly PodcastGenre[] {
  return genre == null ? [] : (PODCAST_SUBGENRES[genre] ?? []);
}
