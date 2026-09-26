/**
 * Le contenu du menu « … » d'un OBJET — album, artiste, playlist, playlist
 * intelligente, collection, collection intelligente, label. Une seule règle,
 * pour les vignettes ET pour les lignes, sur tous les écrans.
 *
 * Bertrand, 26/09/2026 : « Un catalogue d'actions PARTAGÉ, par type d'objet.
 * Les treize écrans y puisent au lieu de construire chacun son tableau. »
 * Puis, le même jour : « Il doit y avoir un menu contextuel pour : artistes,
 * playlists, collections, labels » — sur le modèle du menu « … » des PISTES
 * (`lib/menuPiste`) — et pour les ALBUMS, avec la même règle et le même
 * composant.
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
 * emplacements** répartis sur treize écrans. Mesuré sur `main` le 26/09/2026,
 * avant ce module : une PLAYLIST INTELLIGENTE offrait « Lire en aléatoire » +
 * « Supprimer » dans `PlaylistsV2`, et « Supprimer » seul dans
 * `SmartPlaylistsView` ; un ALBUM offrait « Ajouter à une collection » dans
 * `LibraryV2`, « Ajouter à la file » dans `FavoritesV2`, RIEN dans quatre
 * autres écrans. C'est le défaut que Dominique Comet avait relevé sur le menu
 * de piste (`renesenses/tune-server-rust#1848`) : « deux chemins d'accès à la
 * même chose n'offrent pas les mêmes gestes ».
 *
 * ## Capacités et gestes : deux questions différentes
 *
 * Les **CAPACITÉS** disent ce que l'OBJET permet — porte-t-il un identifiant de
 * bibliothèque ? vient-il d'un service ? est-il une règle (intelligente) ? le
 * greffon qu'il faudrait est-il chargé ? Les **GESTES** disent comment on le
 * fait. Une entrée n'apparaît que si sa capacité tient ET qu'un geste est
 * fourni : un geste muet est « pire qu'une entrée absente » (garde #2574).
 *
 * 🔴 Depuis les menus d'objets (26/09/2026), les gestes COMMUNS ne sont plus
 * fournis écran par écran : `lib/gestesObjet` les construit une fois pour tous,
 * à partir de l'objet seul. C'est ce qui fait la parité — le même album montre
 * les mêmes entrées dans la Bibliothèque, l'Accueil, la Recherche et les
 * Favoris, parce qu'aucun de ces écrans ne compose plus sa liste. Un écran ne
 * fournit que ce qui n'existe QUE chez lui (« Retirer de cette collection »,
 * dans la collection ouverte).
 *
 * ## Ce qui ne s'applique pas est ABSENT, pas grisé
 *
 * La règle que Bertrand a posée dans `PochetteActions` le 02/09/2026. Un objet
 * de service n'a ni « Renommer » ni « Supprimer » ; une collection
 * intelligente n'a pas « Retirer de cette collection » ; « Concerts » n'existe
 * que si le greffon Concerts est là.
 *
 * ## Ce qui manque côté SERVEUR n'est pas inventé ici
 *
 * Trois entrées demandées n'ont aucune route pour les tenir, et n'ont donc pas
 * de place dans ce catalogue (voir la PR des menus d'objets) :
 *
 *  - « Radio / Plus comme ça » d'un ARTISTE : `/tracks/{id}/similar` prend une
 *    piste, rien ne prend un artiste ;
 *  - « Autres versions » d'un ALBUM : `/library/other-versions` est un
 *    classement global de l'Accueil, sans paramètre d'album ;
 *  - « Importer / Ajouter à la bibliothèque » d'un album de SERVICE : aucune
 *    route n'enregistre un album de service dans la bibliothèque.
 */

/** Une ligne d'un SOUS-MENU — « Ajouter à une collection », « Déplacer vers ». */
export interface SousEntreePochette {
  /** Clé stable de la ligne (boucle, gardes). */
  cle: string;
  libelle: string;
  /** Retrait visuel : la profondeur du rayon qui la contient (web#1591). */
  profondeur?: number;
  /** Absent = un INTERTITRE (un rayon), qui se lit et ne se clique pas. */
  faire?: () => void;
}

/** Une entrée du menu, prête à peindre. */
export interface EntreePochette {
  /**
   * La clé i18n du geste — son IDENTITÉ, la même depuis tous les écrans.
   *
   * C'est ce que les gardes comparent : « le même geste porte-t-il le même
   * libellé depuis deux écrans différents ? » se lit sur cette clé, pas sur un
   * texte traduit qui changerait avec la langue.
   */
  cle: string;
  /** Le texte à peindre : `traduire(cle)`. */
  libelle: string;
  /** Teinte l'entrée : partager pose un jeton PUBLIC, supprimer ne revient pas. */
  danger?: boolean;
  faire: () => void;
  /**
   * L'entrée ouvre un SOUS-MENU au lieu d'agir : les lignes sont lues AU CLIC
   * (les collections, les rayons), jamais au survol d'une vignette — une grille
   * de 800 albums ne doit pas partir en 800 requêtes.
   */
  sous?: () => Promise<SousEntreePochette[]>;
}

/**
 * Les natures d'objet qu'un menu habille.
 *
 * Pas « album de service » et « album local » : c'est la MÊME nature, et ce
 * qui les distingue est une capacité (`idBibliotheque`, `service`), pas un
 * type. `SearchV2` montre les deux dans la même grille.
 *
 * 🔴 Les deux sortes de COLLECTION, en revanche, sont bien deux types. Leurs
 * espaces d'identifiants se RECOUVRENT (l'id 1 est à la fois la collection
 * « favorites » et l'intelligente « 💎 Audiophile », mesuré le 02/09/2026) et
 * leurs routes diffèrent. Même raison pour les playlists.
 */
export type TypePochette =
  | 'album'
  | 'artiste'
  | 'playlist'
  | 'playlistIntelligente'
  | 'collection'
  | 'collectionIntelligente'
  | 'label'
  | 'radio'
  | 'podcast';

/** Ce que l'OBJET permet — `lib/gestesObjet.capacitesObjet` le calcule. */
export interface CapacitesPochette {
  type: TypePochette;
  /**
   * L'identifiant de l'objet dans NOTRE bibliothèque, ou `null`.
   *
   * `null` couvre : l'objet vient d'un SERVICE, d'un DÉPÔT Tune distant, ou
   * c'est un LABEL (une valeur, pas une ligne de table). Les routes qui
   * prennent un `i64` ne s'appliquent pas.
   */
  idBibliotheque?: number | null;
  /** Le service d'où vient l'objet (album, artiste, playlist de service). */
  service?: string | null;
  /**
   * L'objet se désigne-t-il pour la LECTURE ? Absent = il le fait s'il porte
   * un identifiant de bibliothèque ou un service ; un label le fait par sa
   * valeur (`/library/tracks?label=`).
   */
  jouable?: boolean;
  /**
   * L'objet est-il en favori ? Absent (`undefined`/`null`) = il ne se met pas
   * en favori — c'est une capacité, pas seulement un état.
   */
  favori?: boolean | null;
  /** L'objet peut-il porter une étiquette (`lib/cibleEtiquette`) ? */
  etiquetable?: boolean;
  /** Album de service dont le service rend des crédits (#4993, Qobuz). */
  creditsDeService?: boolean;
  /** Album : l'artiste se désigne (identifiant local, ou nom chez le service). */
  artisteConnu?: boolean;
  /** Le greffon Concerts est chargé (`concertsCharge`). */
  greffonConcerts?: boolean;
  /** Le greffon Playlists converter est chargé (`convertisseurCharge`). */
  greffonConvertisseur?: boolean;
  /**
   * L'objet est montré DANS une collection MANUELLE ouverte, d'où on peut le
   * retirer — la grille de `CollectionsV2`, et elle seule.
   */
  dansCollectionManuelle?: boolean;
}

/**
 * Les gestes. Tous FACULTATIFS : pas de geste, pas d'entrée.
 *
 * `lib/gestesObjet` fournit les gestes communs ; une surface peut en AJOUTER
 * (retirer de la collection ouverte) ou en remplacer le CHEMIN (ouvrir la fiche
 * dans son propre calque) — jamais changer la liste.
 */
export interface GestesPochette {
  lire?: () => void;
  lireAleatoire?: () => void;
  /** « Lire ensuite » — au rang suivant celui qui joue (`rangLireEnsuite`). */
  ensuite?: () => void;
  /** « Ajouter à la file » — à la fin. */
  enfiler?: () => void;
  ouvrir?: () => void;
  allerArtiste?: () => void;
  basculerFavori?: () => void;
  /** Ouvre le panneau d'étiquettes — fourni par le COMPOSANT qui le montre. */
  etiqueter?: () => void;
  /** Sous-menu des collections manuelles, rangées par rayons (web#1591). */
  ajouterACollection?: () => Promise<SousEntreePochette[]>;
  /** Ouvre le tiroir des crédits — fourni par le composant. */
  credits?: () => void;
  /** Le mode « Modifier » de la fiche album (web#1599). */
  modifier?: () => void;
  reidentifier?: () => void;
  localiser?: () => void;
  concerts?: () => void;
  renommer?: () => void;
  dupliquer?: () => void;
  exporter?: () => void;
  partager?: () => void;
  transferer?: () => void;
  /** Ouvre l'éditeur de règles — fourni par le composant. */
  modifierRegles?: () => void;
  /** Sous-menu des rayons (#4853). */
  deplacerVersRayon?: () => Promise<SousEntreePochette[]>;
  retirerDeCollection?: () => void;
  supprimer?: () => void;
}

const LISTES: readonly TypePochette[] = [
  'playlist',
  'playlistIntelligente',
  'collection',
  'collectionIntelligente',
];

/**
 * Les entrées du menu, dans leur ordre définitif.
 *
 * L'ordre est le même pour tous les types, et c'est celui du menu de piste :
 * la lecture d'abord (Lire, Aléatoire, Lire ensuite, Ajouter à la file), puis
 * aller quelque part, puis ranger (favori, étiquettes, collection), puis
 * consulter et corriger, puis organiser, et ce qui ne revient pas à la fin.
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
  const deService = !deLaBibliotheque && !!c.service;
  const jouable = c.jouable ?? (deLaBibliotheque || deService);
  const album = c.type === 'album';
  const albumLocal = album && deLaBibliotheque;
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
  const sousMenu = (
    possible: boolean,
    cle: string,
    sous: (() => Promise<SousEntreePochette[]>) | undefined,
  ) => {
    if (!possible || !sous) return;
    sortie.push({ cle, libelle: traduire(cle), faire: () => {}, sous });
  };
  const liste = LISTES.includes(c.type);
  // La radio et le podcast gardent leurs propres boutons (lecture au centre,
  // abonnement à part, suppression dans la modale d'édition) : ce catalogue
  // ne leur donne rien, comme avant — et leur bouton reste absent.
  if (c.type === 'radio' || c.type === 'podcast') return sortie;

  // ── Lire ────────────────────────────────────────────────────────────────
  const lisible = jouable;
  pousser(lisible, 'common.play', g.lire);
  /**
   * « Lire en aléatoire » — y compris sur un ALBUM depuis le 26/09/2026.
   *
   * Le catalogue l'en écartait (« un album est un disque, son ordre est celui
   * de l'œuvre »), mais la fiche album a son bouton « Aléatoire » depuis
   * toujours (`AlbumDetailV2.shuffle`), et Bertrand l'a demandé pour le menu
   * de l'album. Même geste, même objet : même entrée.
   */
  pousser(lisible, 'library.shuffle', g.lireAleatoire);
  pousser(lisible, 'v2.pa.next', g.ensuite);
  pousser(lisible, 'queue.addToQueue', g.enfiler);

  // ── Aller ───────────────────────────────────────────────────────────────
  pousser(true, 'common.open', g.ouvrir);
  pousser(album && !!c.artisteConnu, 'library.goToArtist', g.allerArtiste);

  // ── Ranger ──────────────────────────────────────────────────────────────
  if (c.favori != null) {
    pousser(true, c.favori ? 'v2.cover.unfavorite' : 'v2.cover.favorite', g.basculerFavori);
  }
  pousser(!!c.etiquetable, 'v2.cover.tags', g.etiqueter);
  /**
   * « Ajouter à une collection » — un album de la BIBLIOTHÈQUE seulement :
   * `POST /library/collections/{id}/albums` prend son `i64` (garde de #1222).
   * Un SOUS-MENU, rangé par rayons comme celui de la fiche (web#1591) — et
   * non plus une entrée par collection dans le menu lui-même, que seule la
   * Bibliothèque savait composer.
   */
  sousMenu(albumLocal, 'v2.album.addToCollection', g.ajouterACollection);

  // ── Consulter, corriger (album) ─────────────────────────────────────────
  pousser(albumLocal || (album && !!c.creditsDeService), 'credits.see', g.credits);
  pousser(albumLocal, 'v2.cover.edit', g.modifier);
  pousser(albumLocal, 'library.reidentify', g.reidentifier);
  pousser(albumLocal, 'v2.album.locate', g.localiser);

  // ── Artiste ─────────────────────────────────────────────────────────────
  pousser(c.type === 'artiste' && !!c.greffonConcerts, 'nav.concerts', g.concerts);

  // ── Organiser (playlists, collections) ──────────────────────────────────
  const playlistLocale = c.type === 'playlist' && deLaBibliotheque;
  const collectionLocale = c.type === 'collection' && deLaBibliotheque;
  const intelligente =
    (c.type === 'playlistIntelligente' || c.type === 'collectionIntelligente') && deLaBibliotheque;
  /**
   * Renommer : une playlist locale et une collection MANUELLE. Le nom d'une
   * intelligente vit dans son éditeur de règles, avec elles — « Modifier les
   * règles » l'ouvre.
   */
  pousser(playlistLocale || collectionLocale, 'v2.pl.rename', g.renommer);
  pousser(playlistLocale, 'menuObjet.duplicate', g.dupliquer);
  pousser(playlistLocale, 'v2.pl.export', g.exporter);
  pousser(intelligente, 'menuObjet.editRules', g.modifierRegles);
  sousMenu(
    (c.type === 'collection' || c.type === 'collectionIntelligente') && deLaBibliotheque,
    'v2.rayons.move',
    g.deplacerVersRayon,
  );
  pousser(playlistLocale && !!c.greffonConvertisseur, 'menuObjet.transfer', g.transferer);
  pousser(playlistLocale, 'v2.pl.share', g.partager, true);

  // ── Ce qui ne revient pas ───────────────────────────────────────────────
  pousser(
    albumLocal && c.dansCollectionManuelle === true,
    'v2.col.removeAlbum',
    g.retirerDeCollection,
    true,
  );
  pousser(liste && deLaBibliotheque, 'common.delete', g.supprimer, true);
  return sortie;
}
