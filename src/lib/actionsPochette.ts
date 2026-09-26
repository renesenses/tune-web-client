/**
 * Le contenu du menu d'actions d'une POCHETTE — pour les treize écrans.
 *
 * Bertrand, 26/09/2026 : « Un catalogue d'actions PARTAGÉ, par type d'objet.
 * Les treize écrans y puisent au lieu de construire chacun son tableau. »
 *
 * ## Pourquoi un module, et pas un tableau dans chaque écran
 *
 * La même raison que `lib/menuPiste`, mot pour mot : une garde écrite contre un
 * composant ne peut que lire son TEXTE, et un texte présent ne prouve pas qu'il
 * s'exécute — la première version de la garde de `menuPiste` restait verte
 * quand on préfixait la ligne d'un `if (false)`. En sortant la liste ici, la
 * garde APPELLE la fonction et regarde ce qui en sort.
 *
 * Et la raison propre à ce chantier : `PochetteActions` habille **vingt-trois
 * emplacements** répartis sur treize écrans. Treize écrans qui composent chacun
 * son tableau, ce sont treize vérités. Mesuré sur `main` le 26/09/2026, avant
 * ce module :
 *
 *  - une PLAYLIST INTELLIGENTE offrait « Lire en aléatoire » + « Supprimer »
 *    dans `PlaylistsV2`, et « Supprimer » seul dans `SmartPlaylistsView`. Le
 *    même objet, deux chemins, pas les mêmes gestes ;
 *  - un ALBUM de la bibliothèque offrait « Ajouter à une collection » dans
 *    `LibraryV2`, « Ajouter à la file » dans `FavoritesV2`, « Retirer de cette
 *    collection » dans `CollectionsV2`, et RIEN dans `SearchV2`,
 *    `EtiquettesV2`, `DiscographieCommune` et `PageWidgets` — quatre écrans qui
 *    montrent le même album.
 *
 * C'est exactement le défaut que Dominique Comet avait relevé sur le menu de
 * piste (`renesenses/tune-server-rust#1848`, 07/09/2026) : « deux chemins
 * d'accès à la même chose n'offrent pas les mêmes gestes ». L'ordre, les
 * libellés et les conditions ne vivent plus qu'ici.
 *
 * ## Capacités et gestes : deux questions différentes
 *
 * Les **CAPACITÉS** disent ce que l'OBJET permet — porte-t-il un identifiant de
 * bibliothèque ? vient-il d'un service ? est-il montré dans une collection
 * manuelle dont on peut le retirer ? Les **GESTES** disent ce que la SURFACE
 * sait faire : `EtiquettesV2` ne sait pas retirer un album d'une collection, et
 * y brancher l'entrée donnerait un geste MUET, « pire qu'une entrée absente »
 * (garde #2574). Une entrée n'apparaît donc que si sa capacité tient ET que
 * l'appelant a fourni le geste.
 *
 * ## Ce qui ne s'applique pas est ABSENT, pas grisé
 *
 * La règle que Bertrand a posée dans `PochetteActions` le 02/09/2026. Le menu
 * en était la seule exception : présent et grisé, libellé « Autres actions —
 * bientôt », sur les huit écrans qui ne lui passaient rien. L'exception avait
 * été accordée « en attendant la modale de Levente » et a duré 24 jours.
 * Depuis le 26/09/2026 : **aucune entrée, aucun bouton.**
 *
 * Un type sans geste disponible n'a donc plus de bouton du tout — le PODCAST,
 * la RADIO, l'ARTISTE, tout objet d'un SERVICE. Ce n'est pas un échec du
 * catalogue, c'est son résultat : aucune de ces natures d'objet n'a aujourd'hui
 * de geste que l'application sache déjà faire et qu'un autre bouton de la
 * pochette n'offre pas déjà.
 *
 * ## 🔴 AUCUN GESTE NOUVEAU
 *
 * Le catalogue ne contient que des gestes que l'application savait DÉJÀ faire,
 * et chacun est daté ci-dessous par l'endroit qui l'offrait. Une fonction
 * nouvelle serait une feature, et une feature demande l'accord de Bertrand.
 */

/** Une entrée du menu, prête à peindre. */
export interface EntreePochette {
  /**
   * La clé i18n du geste — son IDENTITÉ, la même depuis les treize écrans.
   *
   * C'est ce que les gardes comparent : « le même geste porte-t-il le même
   * libellé depuis deux écrans différents ? » se lit sur cette clé, pas sur un
   * texte traduit qui changerait avec la langue.
   */
  cle: string;
  /**
   * Le texte à peindre. Égal à `traduire(cle)`, SAUF pour les cibles de
   * collection, dont le libellé porte le nom de la collection — c'est
   * `lib/albumVersCollection` qui le compose, et il le compose déjà.
   */
  libelle: string;
  /** Teinte l'entrée : partager pose un jeton PUBLIC, supprimer ne revient pas. */
  danger?: boolean;
  faire: () => void;
}

/**
 * Les natures d'objet qu'une pochette habille.
 *
 * Pas « album de service » et « album local » : c'est la MÊME nature, et ce
 * qui les distingue est une capacité (`idBibliotheque`), pas un type. Les
 * confondre en deux types aurait obligé chaque écran à choisir — et
 * `SearchV2` montre les deux dans la même grille.
 *
 * 🔴 Les deux sortes de COLLECTION, en revanche, sont bien deux types. Leurs
 * espaces d'identifiants se RECOUVRENT (l'id 1 est à la fois la collection
 * « favorites » et l'intelligente « 💎 Audiophile », mesuré le 02/09/2026) et
 * leurs routes de suppression diffèrent. Même raison pour les playlists.
 */
export type TypePochette =
  | 'album'
  | 'artiste'
  | 'playlist'
  | 'playlistIntelligente'
  | 'collection'
  | 'collectionIntelligente'
  | 'radio'
  | 'podcast';

/** Ce que l'OBJET permet — décidé par l'appelant, seul à connaître le contexte. */
export interface CapacitesPochette {
  type: TypePochette;
  /**
   * L'identifiant de l'objet dans NOTRE bibliothèque, ou `null`.
   *
   * `null` couvre trois cas que rien ne distingue du point de vue des gestes :
   * l'objet vient d'un SERVICE (Qobuz, Tidal, Bandcamp…), il vient d'un DÉPÔT
   * Tune distant, ou il n'est pas encore enregistré. Dans les trois cas les
   * routes qui prennent un `i64` ne s'appliquent pas.
   */
  idBibliotheque?: number | null;
  /**
   * L'objet est montré DANS une collection MANUELLE ouverte, d'où on peut le
   * retirer — la grille de `CollectionsV2`, et elle seule.
   *
   * Absent ailleurs, et absent pour une collection INTELLIGENTE : son contenu
   * est une règle, on n'en retire pas un album à la main.
   */
  dansCollectionManuelle?: boolean;
}

/**
 * Les gestes, fournis par la surface : le catalogue ne sait pas les faire.
 *
 * Tous FACULTATIFS. Voir « Capacités et gestes » plus haut : une surface qui ne
 * sait pas tenir un geste ne le fournit pas, et l'entrée disparaît — au lieu
 * d'ouvrir sur rien.
 */
export interface GestesPochette {
  /**
   * « Lire en aléatoire » — `library.shuffle`.
   *
   * Existait sur la vignette de playlist (locale : `lireLocalAleatoire`,
   * `PlaylistsV2`) et de playlist intelligente (`lireSmart(sp, true)`), et sur
   * le bouton d'en-tête de `SmartPlaylistsView` (`playShuffle`) — mais PAS sur
   * sa vignette : c'est la divergence que ce module referme.
   */
  lireAleatoire?: () => void;
  /**
   * « Ajouter à la file » — `queue.addToQueue`.
   *
   * Existait sur la vignette d'album de `FavoritesV2` (`queueAlbum`) et sur la
   * fiche album (`AlbumDetailV2.addQueue`). Nulle part ailleurs, alors que sept
   * emplacements montrent un album de la bibliothèque. Voir
   * `lib/enfilerAlbum`, qui porte le geste pour tous.
   */
  enfiler?: () => void;
  /**
   * « Ajouter à une collection » — une entrée PAR collection manuelle.
   *
   * Le seul geste dont le nombre d'entrées dépend des données : c'est
   * `lib/albumVersCollection.entreesAjoutCollection` qui les compose, avec leur
   * libellé (« Ajouter à X », ou « Déjà dans X »). Le catalogue n'en décide que
   * la CONDITION et la PLACE ; les recomposer ici aurait été la seconde copie
   * que ce module-là existe précisément pour éviter.
   *
   * La surface ne le fournit que si elle tient la liste des collections
   * manuelles AVEC leur contenu (`album_ids`, qui dit « il y est déjà ») :
   * `LibraryV2` la charge par `chargerCollectionsCibles`, les six autres
   * emplacements d'album non. `CollectionsV2` lit bien
   * `GET /library/collections`, mais n'en garde que de quoi peindre ses
   * vignettes. Leur faire déclencher une requête pour peupler un menu au survol
   * d'une vignette, dans une grille de 800 albums, serait un défaut — pas une
   * fonctionnalité.
   */
  ciblesCollection?: () => readonly { libelle: string; faire: () => void }[];
  /**
   * « Partager (lien public) » — `v2.pl.share`, teinté DANGER.
   *
   * Existait sur la vignette de playlist locale de `PlaylistsV2` (`partager`
   * → `api.sharePlaylist` + presse-papier). `danger` n'est pas décoratif :
   * le geste pose un jeton PUBLIC.
   */
  partager?: () => void;
  /**
   * « Retirer de cette collection » — `v2.col.removeAlbum`, teinté DANGER.
   *
   * Existait sur la grille d'une collection ouverte (`CollectionsV2`,
   * `retirerDeLaCollection` → `api.removeAlbumFromCollection`).
   */
  retirerDeCollection?: () => void;
  /**
   * « Supprimer » — `common.delete`, teinté DANGER.
   *
   * Existait sur la vignette de collection et de collection intelligente
   * (`CollectionsV2.supprimerCollection`) et de playlist intelligente
   * (`PlaylistsV2.supprimerSmart`, `SmartPlaylistsView.handleDelete`). Pour une
   * playlist LOCALE, il existait sur sa FICHE (`PlaylistDetailV2`, bouton
   * `v2.pl.delete` → `api.deletePlaylist`) et pas sur sa vignette : même
   * divergence que l'aléatoire des intelligentes, même correction.
   *
   * 🔴 Le libellé du catalogue est `common.delete`, celui des trois menus qui
   * existaient. `v2.pl.delete` reste celui de la fiche ; les unifier est une
   * question de vocabulaire, pas de catalogue, et n'a pas été tranchée.
   */
  supprimer?: () => void;
}

/**
 * Les natures d'objet qu'on sait lire DANS LE DÉSORDRE.
 *
 * 🔴 L'ALBUM n'en fait pas partie, et ce n'est pas un oubli. Une playlist, une
 * collection et une règle sont des SÉLECTIONS : leur ordre est arbitraire, et
 * `lireListeAleatoire` leur est offert depuis leurs vignettes et leurs en-têtes.
 * Un album est un DISQUE : son ordre est celui de l'œuvre, et l'application ne
 * l'a jamais proposé en aléatoire nulle part — seule la bibliothèque ENTIÈRE
 * l'est (`LibraryV2.shuffleAll`), ce qui est un autre geste sur un autre objet.
 * L'y déclarer aurait ouvert la porte à une entrée que personne n'a demandée.
 */
function seLitEnAleatoire(type: TypePochette): boolean {
  return (
    type === 'playlist' ||
    type === 'playlistIntelligente' ||
    type === 'collection' ||
    type === 'collectionIntelligente'
  );
}

/**
 * Les natures d'objet que l'API sait SUPPRIMER par leur identifiant.
 *
 * `api.deletePlaylist`, `api.deleteSmartPlaylist`, `api.deleteCollection`,
 * `api.deleteSmartCollection` — quatre routes, quatre types. Un ALBUM ne se
 * supprime pas (il vient d'un scan), un ARTISTE non plus, et la suppression
 * d'une RADIO vit dans sa modale d'édition, que le crayon de la pochette ouvre
 * déjà : lui ajouter un raccourci destructeur serait un geste NOUVEAU.
 */
function seSupprime(type: TypePochette): boolean {
  return (
    type === 'playlist' ||
    type === 'playlistIntelligente' ||
    type === 'collection' ||
    type === 'collectionIntelligente'
  );
}

/**
 * Les entrées du menu, dans leur ordre définitif.
 *
 * L'ordre est le même pour tous les types, et il n'est pas arbitraire : ce
 * qu'on fait souvent d'abord, ce qui ne revient pas à la fin. Il reprend celui
 * des cinq menus qui existaient — « Lire en aléatoire » avant « Partager »
 * (`PlaylistsV2`), « Lire en aléatoire » avant « Supprimer » (playlists
 * intelligentes) — de sorte qu'aucun utilisateur ne voie ses entrées changer de
 * place.
 *
 * `traduire` reçoit la clé et rend le texte : le module ne dépend pas de
 * l'abonnement `$t` d'un composant, et une garde peut lui passer l'identité
 * pour lire les CLÉS.
 */
export function entreesPochette(
  c: CapacitesPochette,
  g: GestesPochette,
  traduire: (cle: string) => string,
): EntreePochette[] {
  const sortie: EntreePochette[] = [];
  const deLaBibliotheque = c.idBibliotheque != null;
  const pousser = (
    possible: boolean,
    cle: string,
    faire: (() => void) | undefined,
    danger = false,
  ) => {
    if (!possible || !faire) return;
    const e: EntreePochette = { cle, libelle: traduire(cle), faire };
    if (danger) e.danger = true;
    sortie.push(e);
  };

  pousser(seLitEnAleatoire(c.type) && deLaBibliotheque, 'library.shuffle', g.lireAleatoire);
  /**
   * 🔴 « Ajouter à la file » et « Ajouter à une collection » : l'ALBUM seul,
   * et seulement s'il porte un identifiant de bibliothèque.
   *
   * `POST /playback/{zone}/queue` accepte `{ album_id }` — un `i64` de
   * `albums`. Un album de SERVICE n'en a pas : sa mise en file passe par la
   * liste de ses pistes (`corpsDeFileListe`), que la vignette n'a pas chargées
   * et n'a aucune raison de charger au survol. `AlbumDetailV2` le fait, parce
   * qu'elle les tient déjà.
   *
   * `POST /library/collections/{id}/albums` prend le même `i64`
   * (garde de #1222).
   */
  pousser(c.type === 'album' && deLaBibliotheque, 'queue.addToQueue', g.enfiler);
  if (c.type === 'album' && deLaBibliotheque && g.ciblesCollection) {
    for (const cible of g.ciblesCollection()) {
      // Le libellé est DÉJÀ composé (il porte le nom de la collection) : on ne
      // le retraduit pas. La clé reste celle de la famille, pour les gardes.
      sortie.push({ cle: 'v2.col.addTo', libelle: cible.libelle, faire: cible.faire });
    }
  }
  pousser(c.type === 'playlist' && deLaBibliotheque, 'v2.pl.share', g.partager, true);
  pousser(
    c.type === 'album' && deLaBibliotheque && c.dansCollectionManuelle === true,
    'v2.col.removeAlbum',
    g.retirerDeCollection,
    true,
  );
  pousser(seSupprime(c.type) && deLaBibliotheque, 'common.delete', g.supprimer, true);
  return sortie;
}
