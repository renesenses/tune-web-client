/**
 * Le contenu du menu « … » d'une ligne de piste — pour les DEUX clients.
 *
 * Bertrand, 07/09/2026, capture du client ACTUEL à l'appui : « continue sur le
 * bouton … je veux à minima le contenu de la v0 ».
 *
 * ## Pourquoi un module, et pas un `$derived` dans le composant
 *
 * Parce qu'une garde écrite contre le composant ne peut que lire son TEXTE, et
 * qu'un texte présent ne prouve pas qu'il s'exécute : la première version de
 * cette garde restait verte quand on préfixait la ligne d'un `if (false)`
 * (constaté le 07/09/2026, contre-épreuve n° 1). En sortant la liste ici, la
 * garde appelle la fonction et regarde ce qui en sort.
 *
 * ## Deux clients, une seule liste — `renesenses/tune-server-rust#1848`
 *
 * « Le menu contextuel n'existe que dans la bibliothèque, jamais sur une piste
 * de service » (Dominique Comet). Le fond de sa remarque : deux chemins
 * d'accès à la même chose n'offrent pas les mêmes gestes. Depuis le 07/09/2026
 * ce module sert AUSSI `TrackContextMenu` (client actuel), qui rendait sa
 * liste en dur, dans un autre ordre, sans « Lire ensuite » ni « Étiquettes ».
 * L'ordre, les libellés et les conditions ne vivent plus qu'ici.
 *
 * ## Capacités et gestes : deux questions différentes
 *
 * Les CAPACITÉS disent ce que la PISTE permet — elle porte, ou non, un
 * identifiant de bibliothèque. Les GESTES disent ce que la SURFACE sait faire
 * — l'onglet « Titres » du client actuel n'a pas la ligne dépliante qui
 * affiche les autres versions, et y brancher l'entrée donnerait un geste MUET,
 * « pire qu'une entrée absente » (garde #2574). Une entrée n'apparaît donc que
 * si sa capacité tient ET que l'appelant a fourni le geste.
 *
 * ## Ce qui ne s'applique pas est ABSENT, pas grisé
 *
 * La règle déjà tenue par la barre d'icônes. Une piste de service n'a pas
 * d'identifiant de bibliothèque : ni voisins acoustiques, ni champs du
 * fichier — ces routes prennent un `i64`. Les étiquettes passent par la paire
 * `source` + `source_id` (#1238) et, depuis le 23/09/2026, « Autres versions »
 * par le TITRE et l'ARTISTE (`versionsParTitre`).
 */
export interface EntreeMenuPiste {
  /** Clé i18n du libellé. Jamais un texte : voir `check-i18n`. */
  cle: string;
  /** Le tracé de l'icône, dans une boîte 24×24. */
  icone: string;
  /** `true` quand le tracé se remplit au lieu de se dessiner au trait. */
  plein?: boolean;
  faire: () => void;
}
/** Les tracés, dans une boîte 24×24. */
export const ICONES = {
  play: 'M8 5v14l11-7z',
  next: 'M4 7h9M4 12h9M4 17h6M16 5.6l4.8 2.9-4.8 2.9z',
  queue: 'M4 7h11M4 12h11M4 17h7M18 14.5v6M15 17.5h6',
  similar: 'M4 12a8 8 0 0 1 8-8M20 12a8 8 0 0 1-8 8M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5',
  versions: 'M7 7h14v14H7zM3 17V5a2 2 0 0 1 2-2h12',
  playlist: 'M4 7h11M4 12h11M4 17h7M18 15V8l3 .6M16 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  artist: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  album: 'M3 3h18v18H3zM9 9h6M9 13h4',
  tag: 'M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l8.58-8.58a1 1 0 0 0 0-1.42z',
  /** Une fiche de champs — le tiroir « Tous les champs piste » (#851). */
  champs: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  /** Un cercle barré — « Bannir ce titre » (#4806). */
  ban: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M5.6 5.6l12.8 12.8',
  /** Le même cercle, rouvert — « Débannir ». */
  unban: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M8 12l3 3 5-6',
} as const;
/** Ce que la piste permet, décidé par l'appelant qui seul connaît le contexte. */
export interface CapacitesPiste {
  /** La piste sait se désigner pour la lecture. */
  jouable: boolean;
  /** Piste de la BIBLIOTHÈQUE portant un identifiant numérique. */
  idBibliotheque: number | null;
  artistId: number | null;
  albumId: number | null;
  /**
   * L'album de la piste CHEZ SON SERVICE, quand elle en vient — #3777.
   * `null` pour une piste locale, et pour un service qui n'a pas renseigné
   * l'album de cette piste.
   */
  albumDeService?: {
    service: string; albumId: string; titre: string;
    artiste?: string | null; artisteId?: string | null;
  } | null;
  /**
   * L'artiste de la piste chez son service. Un NOM, pas un identifiant :
   * `StreamTrack` ne porte pas d'identifiant d'artiste — c'est à la coquille
   * de le résoudre. Voir `GestesNavigationService`.
   */
  artisteDeService?: { service: string; nom: string } | null;
  /**
   * La piste peut-elle porter une étiquette ? Absent = seulement une piste de
   * la BIBLIOTHÈQUE (comportement d'origine). #1238 : une piste de service
   * désignée par `source` + `source_id` le peut aussi, par
   * `POST /tags/{id}/streaming-items` — c'est l'appelant qui le sait.
   */
  etiquetable?: boolean;
  /**
   * Le service dont la piste peut rejoindre une playlist DU COMPTE — #1268.
   * `null`/absent : pas de playlist de service possible (piste locale, ou
   * service sans écriture). Voir `lib/playlistService.ts`.
   */
  playlistDeService?: string | null;
  /**
   * La piste est BANNIE (#4806) : l'entrée devient « Débannir ». Absent =
   * pas bannie. N'a de sens que pour une piste de BIBLIOTHÈQUE — une piste de
   * service n'a ni l'une ni l'autre des deux entrées (tranche locale seule,
   * Bertrand 23/09/2026).
   */
  bannie?: boolean;
  /**
   * La piste n'a pas d'identifiant de bibliothèque mais porte un TITRE et un
   * ARTISTE : « Autres versions » se rapproche alors par titre + artiste
   * (`lib/versionsParTitre`, décision de Bertrand du 23/09/2026 — « résultats
   * approximatifs acceptés »). Absent = jamais (comportement d'origine : les
   * versions ne s'ouvraient que par un `i64`).
   */
  versionsParTitre?: boolean;
  /**
   * La piste de SERVICE sait montrer ses champs — fil forum 1906 (FabienM,
   * point 3). Vrai quand elle se désigne par `source` + `source_id` chez un
   * service (radio exclue) : voir `lib/champsPisteService`. Le tiroir « Tous
   * les champs piste » les montre alors en lecture seule, sans jamais appeler
   * la route des tags du fichier (`/library/tracks/{id}/all-tags`, un `i64`).
   */
  champsDeService?: boolean;
  /**
   * La piste de SERVICE a des titres voisins côté serveur — fil forum 1906
   * (FabienM, point 3). Vrai pour un titre QOBUZ seulement :
   * `GET /streaming/{service}/tracks/{id}/similar` répond 501 aux autres.
   * Voir `lib/plusCommeCaService`.
   */
  similairesDeService?: boolean;
}
/**
 * Les gestes, fournis par le composant : le module ne sait pas les faire.
 *
 * 🔴 Tous FACULTATIFS depuis le 07/09/2026 (#1848). Voir « Capacités et
 * gestes » plus haut : une surface qui ne sait pas tenir un geste ne le fournit
 * pas, et l'entrée disparaît — au lieu d'ouvrir sur rien.
 */
export interface GestesPiste {
  lire?: () => void;
  ensuite?: () => void;
  aLaFile?: () => void;
  plusCommeCa?: () => void;
  autresVersions?: () => void;
  ajouterAPlaylist?: () => void;
  allerArtiste?: () => void;
  allerAlbum?: () => void;
  etiqueter?: () => void;
  /** Ouvre le tiroir « Tous les champs piste » — #851, lecture des tags. */
  champsDuFichier?: () => void;
  /** « Bannir ce titre » (#4806) — plus jamais joué automatiquement. */
  bannir?: () => void;
  /** « Débannir » — l'inverse, sur une piste déjà bannie. */
  debannir?: () => void;
}
export function entreesMenuPiste(
  c: CapacitesPiste,
  g: GestesPiste,
): EntreeMenuPiste[] {
  const e: EntreeMenuPiste[] = [];
  const pousser = (
    possible: boolean,
    cle: string,
    icone: string,
    faire: (() => void) | undefined,
    plein = false,
  ) => {
    if (!possible || !faire) return;
    e.push(plein ? { cle, icone, plein: true, faire } : { cle, icone, faire });
  };
  const deLaBibliotheque = c.idBibliotheque != null;
  pousser(c.jouable, 'common.play', ICONES.play, g.lire, true);
  pousser(c.jouable, 'v2.pa.next', ICONES.next, g.ensuite);
  pousser(c.jouable, 'queue.addToQueue', ICONES.queue, g.aLaFile);
  /**
   * « Plus comme ça » — la bibliothèque, et depuis le 24/09/2026 un titre
   * QOBUZ. Fil forum 1906 (FabienM, point 3).
   *
   * Le geste de bibliothèque lit `GET /library/tracks/{id}/similar` (voisins
   * acoustiques, un `i64`) puis lance la file par `track_ids`. Un titre de
   * service se désigne par `source` + `source_id` : il passe par
   * `GET /streaming/{service}/tracks/{id}/similar`, la logique de la reprise
   * automatique de fin de file sortie en route (`poller/radio.rs` →
   * `auto_dj::pistes_similaires_du_service`) — artiste du titre, artistes
   * similaires SELON LE SERVICE, un titre phare par voisin.
   *
   * Seul Qobuz implémente `get_similar_artists` : Tidal, Deezer, Spotify,
   * YouTube, Amazon et Bandcamp n'ont pas de similarité d'artiste, la route
   * leur répond 501, et l'entrée leur reste ABSENTE — pas grisée, pas muette.
   * La règle vit dans `lib/plusCommeCaService` (`plusCommeCaDeServiceDe`).
   */
  pousser(
    deLaBibliotheque || !!c.similairesDeService,
    'library.playSimilar',
    ICONES.similar,
    g.plusCommeCa,
  );
  /**
   * « Autres versions » — par `i64` pour la bibliothèque, par TITRE + ARTISTE
   * pour tout le reste (Bertrand, 23/09/2026). Même libellé, même icône : ce
   * qui change est la façon dont le panneau rapproche, et il le dit dans son
   * en-tête. C'est l'appelant qui pose `versionsParTitre`, par
   * `cibleParTitre(piste)` : une piste sans titre ou sans artiste ne l'a pas.
   */
  pousser(
    deLaBibliotheque || !!c.versionsParTitre,
    'library.otherVersions',
    ICONES.versions,
    g.autresVersions,
  );
  /**
   * 🔴 « Ajouter à une liste de lecture » : réservé à la BIBLIOTHÈQUE.
   *
   * Elle était proposée sur toute piste jouable, pistes de service comprises.
   * Le serveur ne peut pas la tenir : `tune-server/src/routes/playlists.rs`
   * déclare, sur la tête de `renesenses/tune-server-rust` au 07/09/2026,
   *
   *     struct AddTracks { track_ids: Vec<i64>, position: Option<i64> }
   *
   * Le client envoie pourtant `streaming_tracks` (`api.addPlaylistTracks`) :
   * serde l'écarte en silence, la route répond **201 Created**, et le modal
   * annonce « ajoutée » sur une liste restée vide. Ce n'est pas non plus
   * réparable en stockant la piste — `playlist_tracks.track_id` est
   * `NOT NULL REFERENCES tracks(id)` dans les trois définitions de schéma.
   *
   * #1848 tranche : « Cette action doit donc être ABSENTE du menu pour une
   * piste de service, pas grisée. »
   */
  //
  // #1268 : sauf vers une playlist DE SON SERVICE. Une piste Qobuz ne peut
  // pas entrer dans une playlist Tune, mais elle peut entrer dans une playlist
  // Qobuz du compte — `POST /streaming/{service}/playlists/{id}/tracks`. Le
  // même geste ouvre alors la liste des playlists du service, jamais celles
  // de Tune (`AddToPlaylistModal`).
  pousser(
    deLaBibliotheque || !!c.playlistDeService,
    'nowplaying.addToPlaylist',
    ICONES.playlist,
    g.ajouterAPlaylist,
  );
  /**
   * « Aller à l'artiste » et « Aller à l'album » — #3777, famille C.
   *
   * FabienM, fil 1739 : « 3 entrées contre 9 » sur un titre Qobuz. Six
   * absences, TROIS familles, et les confondre serait l'erreur :
   *
   *   A. Plus comme ça, Autres versions, Étiquettes — les trois routes prennent
   *      (Étiquettes : plus depuis #1238, voir `etiquetable` ; Plus comme ça :
   *      plus pour un titre Qobuz depuis le fil 1906, voir `similairesDeService`.)
   *      un `i64` de `tracks`. Une piste de service n'en a pas.
   *   B. Ajouter à une playlist — tranché par #1848 : `playlist_tracks.track_id`
   *      est `NOT NULL REFERENCES tracks(id)`. Évolution de schéma, pas
   *      correctif d'interface.
   *   C. CES DEUX-CI — possibles, et simplement pas branchées.
   *
   * Elles ne dépendaient que des identifiants de BIBLIOTHÈQUE. Or une piste de
   * service porte de quoi désigner son album et son artiste dans le référentiel
   * du SERVICE : `album_id` (cf. `routageAlbum`) et le nom de l'artiste.
   *
   * Le ticket posait en « non établi » que `source_id` d'une piste suffise à
   * ouvrir son album. La réponse est non — et il ne sert pas à ça :
   * `StreamTrack.album_id` porte l'identifiant de l'ALBUM, distinct de celui de
   * la piste, et voyage avec elle. Aucun aller-retour serveur.
   */
  pousser(
    c.artistId != null || c.artisteDeService != null,
    'library.goToArtist',
    ICONES.artist,
    g.allerArtiste,
  );
  pousser(
    c.albumId != null || c.albumDeService != null,
    'library.goToAlbum',
    ICONES.album,
    g.allerAlbum,
  );
  pousser(c.etiquetable ?? deLaBibliotheque, 'v2.cover.tags', ICONES.tag, g.etiqueter);
  /**
   * « Tous les champs piste » — #851 (Pierre M, fil 1671, 10/09/2026).
   *
   *     « Pas de visualisation des Tags des morceaux dans la visu Bibliothèque. »
   *
   * Il parlait des champs du FICHIER : le même message joint une capture de
   * foobar2000 (« Editing Combined Tags From 6 Files » : Artist, Album, Disc,
   * ALBUMARTISTSORT, ISRC, ORGANIZATION…), et sa phrase suivante porte sur
   * « Localiser sur le disque ». Son fil de pensée est le fichier.
   *
   * 🔴 Ce n'est PAS l'entrée « Étiquettes » juste au-dessus. Les deux portent
   * le mot « tags » en français courant et ne montrent pas la même chose :
   * `v2.cover.tags` pose des ÉTIQUETTES Tune sur l'objet, `trackTags.title`
   * lit les CHAMPS du fichier et de la base. Les garder distinctes est le
   * but, pas un oubli — c'est exactement la confusion que l'issue relève
   * comme « non établie ».
   *
   * Le tiroir existe déjà (`TrackTagsDrawer`, « Tous les champs piste ») et
   * sert le client actuel depuis toujours ; il n'était atteignable dans la
   * nouvelle interface que par pochette → Modifier l'album → cliquer une
   * piste, trois gestes que rien ne signale. Il prend un `i64` de `tracks` :
   * réservé à la bibliothèque, comme ses trois voisines de la famille A.
   *
   * 🔴 Fil forum 1906 (FabienM, point 3) : plus seulement. Une piste de
   * SERVICE a des champs aussi — ceux que le client tient déjà, complétés par
   * `GET /streaming/{service}/tracks/{id}` quand le service sait répondre.
   * Même tiroir, en lecture seule, sans la route du fichier.
   */
  pousser(
    deLaBibliotheque || !!c.champsDeService,
    'trackTags.title',
    ICONES.champs,
    g.champsDuFichier,
  );
  /**
   * « Bannir ce titre » / « Débannir » — `renesenses/tune-server-rust#4806`.
   *
   * Bertrand, 23/09/2026 : un titre banni n'est plus jamais joué par une
   * sélection automatique, reste visible mais grisé dans son album, et se
   * débannit depuis le même menu ou depuis l'écran « Titres bannis ».
   *
   * Bibliothèque SEULE pour cette tranche : `POST /library/tracks/{id}/ban`
   * prend un `i64`. Une piste de service n'a AUCUNE des deux entrées —
   * absente, pas grisée, comme ses voisines de la famille A. Et jamais les
   * deux à la fois : la piste est bannie ou ne l'est pas.
   */
  pousser(deLaBibliotheque && !c.bannie, 'ban.ban', ICONES.ban, g.bannir);
  pousser(deLaBibliotheque && c.bannie === true, 'ban.unban', ICONES.unban, g.debannir);
  return e;
}
