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
  // Le cas de Sandro : on ne dépile qu'UN niveau, et ce dépilage passe AVANT
  // la sortie de la vue.
  //
  // L'ordre inverse tenait tant que seul l'accueil annonçait une provenance :
  // il n'ouvre que des albums, jamais de fiche artiste, donc les deux niveaux
  // ne pouvaient pas coexister avec une provenance. La recherche globale, elle,
  // entre par la fiche ARTISTE (fil 1553, second parcours) et l'auditeur
  // descend d'un cran de plus. Sortir aussitôt lui ferait sauter la
  // discographie — l'exact contraire de ce que le premier correctif de ce fil
  // venait d'obtenir pour l'onglet Qobuz, et le même bouton donnerait deux
  // résultats selon la porte d'entrée.
  if (niveaux.album && niveaux.artiste) {
    return { action: 'remonter-a-l-artiste' };
  }
  // Plus rien à dépiler : une fiche ouverte depuis un autre écran y ramène.
  if (niveaux.provenance) {
    return { action: 'quitter-la-vue', vers: niveaux.provenance };
  }
  return { action: 'racine-du-service' };
}

/* -------------------------------------------------------------------------- */
/* Rétablissement d'une position après un aller-retour hors de la vue          */
/* -------------------------------------------------------------------------- */

/**
 * Les niveaux qui étaient ouverts dans l'instantané de position sauvegardé par
 * `StreamingView` (`saveViewContext('streaming', …)`).
 */
export type PositionStreaming = {
  /** Un fil de navigation par genres était ouvert. */
  genres: boolean;
  /** Un album était ouvert. */
  album: boolean;
  /** Une fiche artiste était ouverte (sous l'album, le cas échéant). */
  artiste: boolean;
  /** Une playlist du service était ouverte. */
  playlist: boolean;
  /** Une recherche était en cours, sur l'onglet Recherche. */
  recherche: boolean;
};

/** Un niveau à rouvrir, dans l'ordre. */
export type EtapeRestauration =
  | { etape: 'genres' }
  | { etape: 'artiste' }
  | { etape: 'album'; depuisArtiste: boolean }
  | { etape: 'playlist' }
  | { etape: 'recherche' };

/**
 * Ce qu'il faut rouvrir pour se retrouver exactement où l'on était.
 *
 * `StreamingView` est monté dans la chaîne `{#if $activeView === …}` de
 * `App.svelte` : quitter le service DÉTRUIT le composant et perd son `$state`.
 * D'où l'instantané de position, rejoué au montage suivant.
 *
 * Le point qui compte, et qui manquait : quand l'album avait été ouvert DEPUIS
 * la discographie, l'instantané contient les DEUX niveaux et il faut rouvrir
 * les deux. N'en rouvrir qu'un ramenait le défaut de Sandro (fil 1553) dès
 * qu'on était passé par la file d'attente ou le lecteur avant d'appuyer sur
 * « Retour » : `selectAlbum` sans provenance remet `selectedArtist` à `null`,
 * et le retour suivant retombe à la racine du service.
 *
 * L'ORDRE est porteur de sens : `selectArtist` referme l'album au passage, donc
 * l'artiste se rouvre d'abord et l'album ensuite, en annonçant sa provenance.
 */
export function etapesDeRestauration(position: PositionStreaming): EtapeRestauration[] {
  // Le fil de genres est une navigation à part, rétablie par son propre fil
  // d'Ariane ; il prime, comme avant.
  if (position.genres) return [{ etape: 'genres' }];

  if (position.album) {
    return position.artiste
      ? [{ etape: 'artiste' }, { etape: 'album', depuisArtiste: true }]
      : [{ etape: 'album', depuisArtiste: false }];
  }
  if (position.artiste) return [{ etape: 'artiste' }];
  if (position.playlist) return [{ etape: 'playlist' }];
  // Rien d'ouvert par-dessus : on rejoue la recherche pour retrouver la grille
  // de résultats sous la barre de recherche.
  if (position.recherche) return [{ etape: 'recherche' }];
  return [];
}
