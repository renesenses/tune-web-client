/**
 * Trier une liste de favoris — pistes, albums, artistes, playlists ou labels
 * (#2001).
 *
 * Tades : « j'ai enregistré mes favoris dans le mauvais ordre et aurais aimé
 * les écouter dans l'ordre séquentiel. Ne parvenant pas à les déplacer par une
 * manœuvre de souris… » Sa manœuvre était la bonne : la vue n'offrait ni
 * glisser-déposer ni tri, et son silence ne lui disait pas laquelle des deux
 * explications valait.
 *
 * Un tri, et non un ordre manuel : il répond au besoin exprimé — écouter dans
 * un ordre choisi — sans exiger une colonne d'ordre côté serveur, par profil,
 * pour les favoris locaux *et* de service.
 *
 * Sorti du composant pour être éprouvé : les règles qui suivent (accents,
 * champs absents, sens de tri) sont exactement celles qu'on croit évidentes et
 * qu'on écrit de travers.
 *
 * ── Deuxième passe (#2001, second volet) ─────────────────────────────────
 *
 * La première livraison (v0.9.96) proposait titre, artiste et album. Elle
 * laissait dehors les deux moitiés qui concernaient précisément Tades :
 *
 *  - **la date d'ajout n'était pas une clé.** La pastille « Date d'ajout »
 *    désignait `defaut`, qui rend la liste TELLE QUE le serveur l'a donnée,
 *    donc du plus récent au plus ancien — et le bouton de sens est masqué sur
 *    `defaut`. « L'ordre séquentiel » qu'il cherchait est le plus ANCIEN
 *    d'abord : l'écran ne savait pas le rendre ;
 *  - **`defaut` n'est même pas chronologique.** La liste affichée est la
 *    concaténation de trois blocs — favoris locaux, favoris de service posés
 *    dans Tune, favoris pris chez le service — chacun trié de son côté. Trier
 *    vraiment demande la date, pas le rang.
 *
 * Et la table des favoris est POLYMORPHE : #2503 y a fait entrer la playlist
 * locale et le label (par facette). Le tri vaut désormais pour les cinq types.
 */

export type CleDeTri = 'defaut' | 'titre' | 'artiste' | 'album' | 'ajout';

/** Les cinq onglets de l'écran Favoris. */
export type OngletFavoris = 'tracks' | 'albums' | 'artists' | 'playlists' | 'labels';

/**
 * La valeur comparée pour une clé, selon la forme de l'élément.
 *
 * Les formes ne portent pas les mêmes champs : un album n'a pas
 * d'`album_title`, un artiste n'a qu'un `name`, et un LABEL n'a ni l'un ni
 * l'autre — `favorite_facets` le désigne par sa `value`, une chaîne, faute
 * d'identité côté serveur. Sans ce dernier repli, l'onglet Labels rendait ''
 * pour toutes ses entrées et la pastille de tri restait sans effet, en
 * silence : le mal exact que ce ticket décrit.
 *
 * On rend une chaîne vide plutôt que d'inventer une valeur — c'est `trier` qui
 * décidera de son sort.
 */
export function valeurDeTri(x: unknown, cle: CleDeTri): string {
  const o = (x ?? {}) as Record<string, unknown>;
  const texte = (v: unknown): string => (typeof v === 'string' ? v : '');
  switch (cle) {
    case 'titre':
      return texte(o.title) || texte(o.name) || texte(o.value);
    case 'artiste':
      return texte(o.artist_name) || texte(o.name);
    case 'album':
      return texte(o.album_title) || texte(o.title);
    default:
      return '';
  }
}

/**
 * La date à laquelle le favori a été posé, ou '' si on ne la connaît pas.
 *
 * Deux noms, parce que deux chemins :
 *
 *  - `favorite_added_at` — les favoris LOCAUX. `getFavorites` relit chaque
 *    favori par son identifiant et rendait l'objet de bibliothèque seul ; il
 *    reporte maintenant le `created_at` de la ligne de favori sous ce nom, qui
 *    ne peut se confondre avec le `created_at` d'un album ou d'une piste ;
 *  - `created_at` — les favoris de SERVICE (`streaming_favorites`) et de
 *    FACETTE (`favorite_facets`), qui arrivent tels quels, sans ré-hydratation.
 *
 * Les favoris pris chez le service (« starred » côté Qobuz/Tidal) n'ont, eux,
 * aucune date connue de Tune : ils rendent '' et finiront la liste.
 *
 * Le serveur écrit de l'ISO-8601 zéro-complété (`strftime` / `to_char`) : la
 * comparaison de chaînes y est chronologique. C'est ce que verrouille le test
 * « le 9 avant le 10 ».
 */
export function dateDeTri(x: unknown): string {
  const o = (x ?? {}) as Record<string, unknown>;
  const texte = (v: unknown): string => (typeof v === 'string' ? v : '');
  return texte(o.favorite_added_at) || texte(o.created_at);
}

/**
 * Trier sans toucher à la liste d'origine.
 *
 * `defaut` la rend telle quelle — l'ordre d'ajout rendu par le serveur, celui
 * d'avant ce correctif. Le tri est une option, pas un changement imposé à qui
 * s'y retrouvait déjà : le sens même est ignoré sur cette clé, il n'y a pas de
 * sens sur « tel quel ».
 *
 * `sensitivity: 'base'` pour que « Édith » se range avec « Edith » : sans
 * cela un tri français relègue tous les accents en fin de liste, ce qu'aucun
 * utilisateur ne comprend. `numeric` pour que « Volume 2 » précède
 * « Volume 10 ».
 *
 * Un champ absent ne remonte jamais en tête, **quel que soit le sens** : en
 * ordre décroissant, une poignée de titres vides — ou de favoris sans date —
 * ouvrant la liste ressemble à une liste cassée.
 */
export function trier<T>(liste: T[], cle: CleDeTri, descendant = false): T[] {
  if (cle === 'defaut') return liste;
  const sens = descendant ? -1 : 1;
  if (cle === 'ajout') {
    return [...liste].sort((a, b) => {
      const da = dateDeTri(a).trim();
      const db = dateDeTri(b).trim();
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      // Croissant = le plus ANCIEN d'abord, l'ordre dans lequel les favoris
      // ont été posés. C'est la demande, mot pour mot.
      return da < db ? -sens : da > db ? sens : 0;
    });
  }
  return [...liste].sort((a, b) => {
    const va = valeurDeTri(a, cle).trim();
    const vb = valeurDeTri(b, cle).trim();
    if (!va && !vb) return 0;
    if (!va) return 1;
    if (!vb) return -1;
    return sens * va.localeCompare(vb, undefined, { sensitivity: 'base', numeric: true });
  });
}

/**
 * Les clés qui ont un sens sur un onglet donné.
 *
 * Proposer « album » sur la liste des artistes ne trierait rien et ferait
 * douter du reste de l'écran. À l'inverse, `defaut` et `ajout` valent pour les
 * CINQ onglets : tout favori, quel que soit son type, a été posé à une date.
 *
 * `defaut` ouvre toujours la liste — c'est le réglage de départ, et il doit se
 * retrouver du premier coup d'œil.
 */
export function clesPourOnglet(onglet: OngletFavoris): CleDeTri[] {
  switch (onglet) {
    case 'tracks':
      return ['defaut', 'titre', 'artiste', 'album', 'ajout'];
    case 'albums':
      return ['defaut', 'titre', 'artiste', 'ajout'];
    default:
      // Artistes (`name`), playlists (`name`) et labels (`value`) : un seul
      // champ texte, donc une seule clé alphabétique.
      return ['defaut', 'titre', 'ajout'];
  }
}
