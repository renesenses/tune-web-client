/**
 * Le Dynamic Range d'un album, et **d'où il sort** (#1388).
 *
 * ## Ce que le serveur rend, mesuré sur `v0.9.142`
 *
 * `GET /library/albums/{id}` pose DEUX clés, qui apparaissent et disparaissent
 * ENSEMBLE (`tune-server/src/routes/library/albums.rs`, ~ligne 350) :
 *
 *  - `dynamic_range` — la valeur, en chiffres seuls, jamais `null` : quand
 *    aucune piste n'est taguée, la clé est ABSENTE. `"0"` est une vraie
 *    mesure, celle d'un master écrasé, et non une absence.
 *  - `dynamic_range_source` — `"album_tag"` quand au moins une piste porte
 *    `ALBUM DYNAMIC RANGE`, `"track_average"` quand Tune l'a déduite de la
 *    moyenne arrondie des `DYNAMIC RANGE` des pistes.
 *
 * La règle de départage est dans `DR_ALBUM_VALUE` :
 * `COALESCE(MAX(dr_album), ROUND(AVG(dr_track)))` — **le tag d'album prime**,
 * et la moyenne des pistes n'est calculée qu'à défaut.
 *
 * ## Pourquoi une mesure et une déduction ne doivent pas se ressembler
 *
 * Un album tagué `ALBUM DYNAMIC RANGE=12` et un album dont les dix pistes
 * moyennent 12 affichent le même nombre. Le premier est une mesure écrite par
 * un mesureur, le second un calcul de Tune. Un testeur l'a demandé sur le
 * forum en ces termes : de quel Dynamic Range parle-t-on, celui de l'album ou
 * celui des pistes ?
 *
 * ## La marque retenue : un tilde, et une infobulle qui le dit
 *
 * `DR 12` reste `DR 12` — le badge d'aujourd'hui, inchangé pour une mesure.
 * Une déduction s'écrit `DR ~12` et porte un soulignement pointillé.
 *
 *  - Le tilde est le signe universel de l'« environ ». Il ne demande aucune
 *    traduction, tient en un caractère et n'alourdit donc pas une liste
 *    d'albums, et ne change PAS la valeur : `~12`, c'est toujours 12.
 *  - Le soulignement est tracé en `currentColor` : lisible dans les deux
 *    thèmes par construction, sans jeton de couleur ni contraste à régler.
 *  - Une teinte seule aurait été invisible à un daltonien et muette pour un
 *    lecteur d'écran ; un mot (« estimé ») aurait pris la place d'une
 *    métadonnée entière sur la ligne, dans onze langues.
 *
 * ## Le serveur ANTÉRIEUR à la v0.9.142
 *
 * Il rend `dynamic_range` SANS `dynamic_range_source`. On retombe alors
 * exactement sur l'affichage d'avant — valeur nue, infobulle d'origine, qui
 * dit « lue dans les tags des fichiers » et reste vraie dans les deux cas.
 * Inventer « déduite » faute de savoir serait pire que se taire.
 */

/**
 * ## LA MÊME CLÉ PORTE DEUX VOCABULAIRES (#3924)
 *
 * `dynamic_range_source` sort de DEUX surfaces, et ne dit pas la même chose
 * sur chacune. Mesuré sur le tag `v0.9.147` :
 *
 * | surface | route | valeurs |
 * |---|---|---|
 * | ALBUM | `GET /library/albums/{id}` | `album_tag`, `track_average` |
 * | PISTE | `GET /library/albums/{id}/tracks`, `GET /library/tracks` | `tag`, `analysis` |
 *
 * Côté album (`DynamicRangeAlbum::source`, `tune-core/src/db/album_repo.rs`),
 * l'étiquette dit d'où sort l'AGRÉGAT : le tag d'album, ou la moyenne des
 * pistes. Elle ne dit RIEN de la provenance de ces pistes.
 *
 * Côté piste (`albums::provenance_du_dr`, `routes/library/albums.rs:447`),
 * elle répond à l'autre question — celle que Patatorz pose au fil 1683,
 * « mesurés, calculés ou juste reportés » : `tag` quand le scan a lu la valeur
 * dans le fichier, `analysis` quand la passe d'analyse l'a CALCULÉE sur les
 * échantillons (`tune-core/src/audio/replaygain.rs`, depuis la v0.9.145).
 *
 * 🔴 Le client ne connaissait que la première paire. Une valeur `analysis`
 * tombait donc dans la branche par défaut et s'affichait avec l'infobulle
 * « lue dans les tags des fichiers » — un énoncé FAUX, et précisément celui
 * que le testeur cherchait à départager. `tag`, lui, y tombait aussi, mais
 * l'énoncé y était vrai : seul `analysis` mentait.
 *
 * Comme côté serveur, la provenance ne sort JAMAIS sans la valeur : un
 * `dr_track` écrit avant que `dr_source` existe sort sans provenance, et
 * on ne lui en invente pas.
 */
export type SourceDynamicRange = 'album_tag' | 'track_average' | 'tag' | 'analysis';

/** Ce qu'un album porte de Dynamic Range, dans la forme où l'API le rend. */
export interface AlbumAvecDynamicRange {
  dynamic_range?: string | null;
  dynamic_range_source?: string | null;
}

/** Ce que l'écran doit afficher — ou `null` quand il ne doit RIEN afficher. */
export interface AffichageDynamicRange {
  /** La valeur, telle que le serveur l'a rendue. Jamais retouchée. */
  valeur: string;
  /** Le texte du badge : `12` pour une mesure, `~12` pour une déduction. */
  texte: string;
  /** Vrai quand la valeur est la moyenne des pistes, pas une mesure d'album. */
  deduit: boolean;
  /**
   * Vrai quand Tune a CALCULÉ cette valeur sur les échantillons (#3924).
   *
   * Distinct de `deduit`, qui est une moyenne d'autres valeurs. Un calcul
   * d'analyse est une mesure — il ne prend donc PAS le tilde de
   * l'« environ », qui affirmerait une approximation qui n'existe pas. Ce
   * qu'il change, c'est la phrase de l'infobulle.
   */
  calcule: boolean;
  /** Clé d'infobulle. Trois textes distincts, jamais le même. */
  cleInfobulle:
    | 'library.dynamicRangeTip'
    | 'library.dynamicRangeAverageTip'
    | 'library.dynamicRangeAnalysisTip';
}

/**
 * Ce que la fiche doit montrer du Dynamic Range de cet album.
 *
 * Rend `null` quand il n'y a rien à montrer — pas une chaîne vide, pas un
 * zéro : l'appelant teste le `null` et n'écrit alors aucun badge.
 */
export function afficherDynamicRange(
  album: AlbumAvecDynamicRange | null | undefined,
): AffichageDynamicRange | null {
  const brut = album?.dynamic_range;
  // `== null` couvre `null` et `undefined`. La chaîne vide n'est pas une
  // valeur ; `'0'` en est une, et passe.
  if (brut == null) return null;
  const valeur = String(brut).trim();
  if (valeur === '') return null;

  const source = album?.dynamic_range_source;
  const deduit = source === 'track_average';
  // #3924 — la valeur que la passe d'analyse a calculée sur les échantillons.
  // Elle n'est ni un tag ni une moyenne : sans cette branche, elle tombait
  // dans le repli et l'écran affirmait « lue dans les tags des fichiers ».
  const calcule = source === 'analysis';
  return {
    valeur,
    texte: deduit ? `~${valeur}` : valeur,
    deduit,
    calcule,
    cleInfobulle: deduit
      ? 'library.dynamicRangeAverageTip'
      : calcule
        ? 'library.dynamicRangeAnalysisTip'
        : 'library.dynamicRangeTip',
  };
}
