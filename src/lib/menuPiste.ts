/**
 * Le contenu du menu « … » d'une ligne de piste.
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
} as const;

/** Ce que la piste permet, décidé par l'appelant qui seul connaît le contexte. */
export interface CapacitesPiste {
  /** La piste sait se désigner pour la lecture. */
  jouable: boolean;
  /** Piste de la BIBLIOTHÈQUE portant un identifiant numérique. */
  idBibliotheque: number | null;
  artistId: number | null;
  albumId: number | null;
}

/** Les gestes, fournis par le composant : le module ne sait pas les faire. */
export interface GestesPiste {
  lire: () => void;
  ensuite: () => void;
  aLaFile: () => void;
  plusCommeCa: () => void;
  autresVersions: () => void;
  ajouterAPlaylist: () => void;
  allerArtiste: () => void;
  allerAlbum: () => void;
  etiqueter: () => void;
}

export function entreesMenuPiste(
  c: CapacitesPiste,
  g: GestesPiste,
): EntreeMenuPiste[] {
  const e: EntreeMenuPiste[] = [];
  if (c.jouable) {
    e.push({ cle: 'common.play', icone: ICONES.play, plein: true, faire: g.lire });
    e.push({ cle: 'v2.pa.next', icone: ICONES.next, faire: g.ensuite });
    e.push({ cle: 'queue.addToQueue', icone: ICONES.queue, faire: g.aLaFile });
  }
  if (c.idBibliotheque != null) {
    e.push({ cle: 'library.playSimilar', icone: ICONES.similar, faire: g.plusCommeCa });
    e.push({ cle: 'library.otherVersions', icone: ICONES.versions, faire: g.autresVersions });
  }
  if (c.jouable) {
    e.push({ cle: 'nowplaying.addToPlaylist', icone: ICONES.playlist, faire: g.ajouterAPlaylist });
  }
  if (c.artistId != null) e.push({ cle: 'library.goToArtist', icone: ICONES.artist, faire: g.allerArtiste });
  if (c.albumId != null) e.push({ cle: 'library.goToAlbum', icone: ICONES.album, faire: g.allerAlbum });
  if (c.idBibliotheque != null) e.push({ cle: 'v2.cover.tags', icone: ICONES.tag, faire: g.etiqueter });
  return e;
}
