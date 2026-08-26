/**
 * Où mène le bouton « Retour » d'un service de streaming.
 *
 * Sandro, forum fil 1553 : dans Qobuz, ouvrir la fiche d'un artiste puis un de
 * ses albums, et faire « Retour » — l'interface retombait à la racine du
 * service au lieu de revenir à la discographie.
 *
 * Le bouton n'y était pour rien. `selectAlbum()` écrasait `selectedArtist` à
 * `null` à l'instant même où l'album s'ouvrait : au retour, il n'y avait plus
 * de niveau intermédiaire à retrouver, et `goBack()` remettait les trois
 * niveaux à `null` d'un coup, sans jamais dépiler. `LibraryView` avait déjà
 * rencontré et réglé ce défaut pour la bibliothèque locale (« bug Fabien-1 »,
 * #1144) ; la vue streaming n'avait jamais reçu le même traitement, si bien
 * que le même geste donnait deux résultats différents selon qu'on naviguait en
 * local ou dans Qobuz.
 *
 * La décision est isolée ici, hors du composant, parce que c'est la seule
 * partie où quelque chose se DÉCIDE — le reste de `goBack()` n'est que des
 * affectations. Isolée, elle se prouve sans monter la vue.
 */

/** Les niveaux ouverts au moment du retour. */
export type NiveauxStreaming = {
  /**
   * L'écran d'où la fiche a été ouverte (`streamingAlbumOrigin`), quand elle
   * ne vient pas de la vue elle-même : accueil, raccourci, lien profond.
   */
  provenance: string | null;
  /** Un album est ouvert. */
  album: boolean;
  /**
   * Une fiche artiste est ouverte SOUS l'album, c'est-à-dire que l'album a été
   * ouvert depuis la discographie. L'invariant est tenu par `selectAlbum`, qui
   * ne conserve `selectedArtist` que dans ce cas précis.
   */
  artiste: boolean;
};

export type ActionRetour =
  /** Quitter la vue streaming pour l'écran d'origine. */
  | { action: 'quitter-la-vue'; vers: string }
  /** Ne refermer que l'album : la discographie de l'artiste réapparaît. */
  | { action: 'remonter-a-l-artiste' }
  /** Tout refermer : en-tête du service, recherche et sections mises en avant. */
  | { action: 'racine-du-service' };

export function actionRetour(niveaux: NiveauxStreaming): ActionRetour {
  // Une fiche ouverte depuis un autre écran : le premier retour y ramène. Ce
  // contrat précède le dépilage et reste prioritaire sur lui.
  if (niveaux.provenance) {
    return { action: 'quitter-la-vue', vers: niveaux.provenance };
  }
  // Le cas de Sandro : on ne dépile qu'UN niveau.
  if (niveaux.album && niveaux.artiste) {
    return { action: 'remonter-a-l-artiste' };
  }
  return { action: 'racine-du-service' };
}
