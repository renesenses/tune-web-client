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
