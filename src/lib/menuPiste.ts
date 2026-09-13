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
 * d'identifiant de bibliothèque : ni voisins acoustiques, ni autres versions,
 * ni étiquettes — les trois routes prennent un `i64`.
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
  albumDeService?: { service: string; albumId: string; titre: string } | null;
  /**
   * L'artiste de la piste chez son service. Un NOM, pas un identifiant :
   * `StreamTrack` ne porte pas d'identifiant d'artiste — c'est à la coquille
   * de le résoudre. Voir `GestesNavigationService`.
   */
  artisteDeService?: { service: string; nom: string } | null;
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
  pousser(deLaBibliotheque, 'library.playSimilar', ICONES.similar, g.plusCommeCa);
  pousser(deLaBibliotheque, 'library.otherVersions', ICONES.versions, g.autresVersions);
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
  pousser(deLaBibliotheque, 'nowplaying.addToPlaylist', ICONES.playlist, g.ajouterAPlaylist);
  /**
   * « Aller à l'artiste » et « Aller à l'album » — #3777, famille C.
   *
   * FabienM, fil 1739 : « 3 entrées contre 9 » sur un titre Qobuz. Six
   * absences, TROIS familles, et les confondre serait l'erreur :
   *
   *   A. Plus comme ça, Autres versions, Étiquettes — les trois routes prennent
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
  pousser(deLaBibliotheque, 'v2.cover.tags', ICONES.tag, g.etiqueter);
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
   */
  pousser(deLaBibliotheque, 'trackTags.title', ICONES.champs, g.champsDuFichier);
  return e;
}
