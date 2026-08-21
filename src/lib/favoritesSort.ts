/**
 * Trier une liste de favoris — pistes, albums ou artistes (#2001).
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
 */

export type CleDeTri = 'defaut' | 'titre' | 'artiste' | 'album';

/**
 * La valeur comparée pour une clé, selon la forme de l'élément.
 *
 * Les trois formes ne portent pas les mêmes champs : un album n'a pas
 * d'`album_title`, un artiste n'a qu'un `name`. On rend une chaîne vide plutôt
 * que d'inventer une valeur — c'est `comparer` qui décidera de son sort.
 */
export function valeurDeTri(x: unknown, cle: CleDeTri): string {
  const o = (x ?? {}) as Record<string, unknown>;
  const texte = (v: unknown): string => (typeof v === 'string' ? v : '');
  switch (cle) {
    case 'titre':
      return texte(o.title) || texte(o.name);
    case 'artiste':
      return texte(o.artist_name) || texte(o.name);
    case 'album':
      return texte(o.album_title) || texte(o.title);
    default:
      return '';
  }
}

/**
 * Trier sans toucher à la liste d'origine.
 *
 * `defaut` la rend telle quelle — l'ordre d'ajout, celui d'avant ce
 * correctif. Le tri est une option, pas un changement imposé à qui s'y
 * retrouvait déjà.
 *
 * `sensitivity: 'base'` pour que « Édith » se range avec « Edith » : sans
 * cela un tri français relègue tous les accents en fin de liste, ce qu'aucun
 * utilisateur ne comprend. `numeric` pour que « Volume 2 » précède
 * « Volume 10 ».
 *
 * Un champ absent ne remonte jamais en tête, **quel que soit le sens** : en
 * ordre décroissant, une poignée de titres vides ouvrant la liste ressemble à
 * une liste cassée.
 */
export function trier<T>(liste: T[], cle: CleDeTri, descendant = false): T[] {
  if (cle === 'defaut') return liste;
  const sens = descendant ? -1 : 1;
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
 * douter du reste de l'écran.
 */
export function clesPourOnglet(onglet: 'tracks' | 'albums' | 'artists'): CleDeTri[] {
  switch (onglet) {
    case 'tracks':
      return ['defaut', 'titre', 'artiste', 'album'];
    case 'albums':
      return ['defaut', 'titre', 'artiste'];
    default:
      return ['defaut', 'titre'];
  }
}
