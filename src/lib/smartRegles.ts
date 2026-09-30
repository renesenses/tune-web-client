/**
 * La GRAMMAIRE des règles d'une collection intelligente.
 *
 * Elle vivait dans `SmartCollectionEditor.svelte` — l'éditeur du client
 * actuel — et nulle part ailleurs. Bertrand a demandé le 05/09/2026 un éditeur
 * dans le nouveau client ; recopier vingt-deux champs et huit familles
 * d'opérateurs aurait donné deux vocabulaires qui divergent à la première
 * addition, et le serveur n'en accepte qu'un.
 *
 * Ce module ne rend rien : il décrit ce qu'une règle PEUT dire. Les deux
 * éditeurs y puisent.
 */

/** Le type d'un champ décide des opérateurs proposés ET du contrôle de saisie. */
export type TypeChamp =
  | 'text' | 'int' | 'nullable' | 'timestamp' | 'count'
  | 'credit' | 'collection_ref' | 'playlist_ref' | 'favorite' | 'folder'
  // La PROVENANCE, choisie dans une liste (#4299) — voir `lib/sourcesRegle`.
  | 'source'
  // Une ÉTIQUETTE de l'utilisateur, choisie dans une liste. Valeur : `tags.id`.
  | 'tag_ref';

/**
 * Ce que l'éditeur ÉDITE : une collection porte sur des ALBUMS, une playlist
 * sur des PISTES. Même découpe que le serveur (`tune-smart-http/src/criteres.rs`).
 */
export type Niveau = 'collection' | 'playlist';

export interface Champ {
  /** Le nom du champ dans une règle de COLLECTION. */
  value: string;
  labelKey: string;
  type: TypeChamp;
  /**
   * Le nom du champ dans une règle de PLAYLIST, quand il diffère — tune-server-rust#5547.
   *
   * Absent : le même nom. Deux champs seulement ont un autre nom au niveau de
   * la piste, et ce sont des noms que les playlists déjà enregistrées portent :
   * `artist` (et non `artist_name`) et `album` pour le titre de l'album — dans
   * une playlist, `title` est le titre de la PISTE (`regles_sql::colonne_piste`).
   */
  piste?: string;
  /**
   * Le critère n'existe qu'à UN niveau. Rien d'autre ne peut diverger entre
   * les deux listes : la garde `criteresPartages5547.test.ts` échoue sur toute
   * entrée propre à un niveau qui n'est pas nommée dans sa liste d'exceptions.
   */
  seulement?: Niveau;
}

export const CHAMPS: readonly Champ[] = [
  { value: 'artist_name',    labelKey: 'smartCollection.fieldArtist',      type: 'text', piste: 'artist' },
  { value: 'title',          labelKey: 'smartCollection.fieldAlbumTitle',  type: 'text', piste: 'album' },
  { value: 'genre',          labelKey: 'smartCollection.fieldGenre',       type: 'text' },
  { value: 'composer',       labelKey: 'smartCollection.fieldComposer',    type: 'text' },
  { value: 'label',          labelKey: 'smartCollection.fieldLabel',       type: 'text' },
  { value: 'format',         labelKey: 'smartCollection.fieldFormat',      type: 'text' },
  { value: 'source',         labelKey: 'smartCollection.fieldSource',      type: 'source' },
  // La LOCALISATION sur le disque, à côté de la provenance : les deux
  // répondent à « d'où sort ce morceau ». Son propre type parce que sa saisie
  // est une navigation, pas une frappe.
  { value: 'folder',         labelKey: 'smartCollection.fieldFolder',      type: 'folder' },
  { value: 'year',           labelKey: 'smartCollection.fieldYear',        type: 'int' },
  { value: 'sample_rate',    labelKey: 'smartCollection.fieldSampleRate',  type: 'int' },
  { value: 'bit_depth',      labelKey: 'smartCollection.fieldBitDepth',    type: 'int' },
  { value: 'track_count',    labelKey: 'smartCollection.fieldTrackCount',  type: 'int' },
  { value: 'duration',       labelKey: 'smartCollection.fieldDuration',    type: 'int' },
  { value: 'track_number',   labelKey: 'smartCollection.fieldTrackNumber', type: 'int' },
  { value: 'disc_number',    labelKey: 'smartCollection.fieldDiscNumber',  type: 'int' },
  { value: 'bpm',            labelKey: 'smartCollection.fieldBpm',         type: 'int' },
  // « Note » : la note de l'ALBUM pour le profil actif (`album_ratings`) ;
  // dans une playlist, celle de l'album de chaque piste. Un album sans note ne
  // passe aucune comparaison (décision de Bertrand, 30/09/2026, #5547).
  { value: 'rating',         labelKey: 'smartCollection.fieldRating',      type: 'int' },
  { value: 'cover_path',     labelKey: 'smartCollection.fieldCover',       type: 'nullable' },
  { value: 'added_at',       labelKey: 'smartCollection.fieldAddedAt',     type: 'timestamp' },
  { value: 'credit',         labelKey: 'smartCollection.fieldCredit',      type: 'credit' },
  { value: 'play_count',     labelKey: 'smartCollection.fieldPlayCount',   type: 'count' },
  { value: 'last_played_at', labelKey: 'smartCollection.fieldLastPlayed',  type: 'timestamp' },
  // Références : « dans la collection / playlist X », classique OU smart.
  // Valeurs `classic:<id>` / `smart:<id>` (module serveur `smart_refs`).
  { value: 'in_collection',  labelKey: 'smartCollection.fieldInCollection', type: 'collection_ref' },
  { value: 'in_playlist',    labelKey: 'smartCollection.fieldInPlaylist',   type: 'playlist_ref' },
  { value: 'favorite',       labelKey: 'smartCollection.fieldFavorite',     type: 'favorite' },
  // Bertrand, 21/09/2026 : « impossible de choisir un tag comme règle de smart
  // collection ». Les étiquettes existaient, aucune règle ne les lisait — ni
  // ici, ni côté serveur (`smart_refs`, champ `tag`). L'album correspond s'il
  // porte l'étiquette, ou si son ARTISTE la porte.
  { value: 'tag',            labelKey: 'smartCollection.fieldTag',          type: 'tag_ref' },
  // --- Propres aux PLAYLISTS : ce qui ne se dit que d'une piste. ---
  // Le titre du MORCEAU. À l'album, `title` est déjà le titre de l'album.
  { value: 'title',          labelKey: 'smartCollection.fieldTrackTitle',   type: 'text', seulement: 'playlist' },
  // Le commentaire d'une piste (étiquette COMMENT du fichier) ; les albums
  // n'en ont pas, et `build_album_query` ne le connaît pas.
  { value: 'comments',       labelKey: 'smartPlaylists.fieldComments',      type: 'text', seulement: 'playlist' },
];

/** Le nom qu'un champ porte dans une règle de ce niveau. */
export function nomAuNiveau(c: Champ, niveau: Niveau): string {
  return niveau === 'playlist' ? (c.piste ?? c.value) : c.value;
}

/**
 * LA liste des champs d'un niveau, tirée de la seule définition ci-dessus
 * (tune-server-rust#5547).
 *
 * Bertrand, 30/09/2026 : « l'éditeur des playlists intelligentes n'offre pas
 * les mêmes critères que celui des collections — il manque les étiquettes.
 * Harmonise ! » Il y avait deux listes : quatorze champs pour les playlists,
 * vingt-quatre pour les collections. Il n'y en a plus qu'une, et chaque
 * niveau en lit sa part.
 */
export function champsDe(niveau: Niveau): readonly Champ[] {
  return CHAMPS
    .filter((c) => !c.seulement || c.seulement === niveau)
    .map((c) => ({ ...c, value: nomAuNiveau(c, niveau) }));
}

/**
 * Les types qu'un éditeur sait SAISIR. `credit` reste dans la grammaire — une
 * règle qui l'utilise s'ouvre et s'enregistre sans le perdre — mais il demande
 * un contrôle à trois valeurs (rôle, nom, instrument) qu'aucun éditeur n'a
 * encore. Une seule liste pour les trois éditeurs (tune-server-rust#5547) :
 * c'est elle qui décide de ce que le menu propose, donc de ce qui peut
 * diverger.
 */
export const SAISISSABLES: readonly TypeChamp[] = [
  'text', 'int', 'nullable', 'timestamp', 'count', 'favorite',
  'collection_ref', 'playlist_ref', 'folder', 'source', 'tag_ref',
];

/** Les champs qu'un éditeur de ce niveau propose dans son menu. */
export function champsSaisissables(niveau: Niveau): readonly Champ[] {
  return champsDe(niveau).filter((c) => SAISISSABLES.includes(c.type));
}

export interface Operateur {
  value: string;
  /** Symbole affiché tel quel (`≥`), quand traduire n'apporte rien. */
  label?: string;
  labelKey?: string;
}

export const OPERATEURS: Record<TypeChamp, readonly Operateur[]> = {
  int: [
    { value: '=', label: '=' }, { value: '!=', label: '≠' },
    { value: '>=', label: '≥' }, { value: '>', label: '>' },
    { value: '<=', label: '≤' }, { value: '<', label: '<' },
    { value: 'between', labelKey: 'smartCollection.opBetween' },
  ],
  text: [
    { value: '=', label: '=' }, { value: '!=', label: '≠' },
    { value: 'contains', labelKey: 'smartCollection.opContains' },
    { value: 'starts_with', labelKey: 'smartCollection.opStartsWith' },
    { value: 'in', labelKey: 'smartCollection.opIn' },
    { value: 'is_null', labelKey: 'smartCollection.opIsEmpty' },
    { value: 'is_not_null', labelKey: 'smartCollection.opIsNotEmpty' },
  ],
  // Une source se choisit dans une liste : « est » ou « n'est pas ». Le
  // serveur ne ramène les favoris d'un service que sur une règle POSITIVE.
  source: [
    { value: '=', label: '=' }, { value: '!=', label: '≠' },
  ],
  // Un répertoire n'a que deux questions sensées.
  //
  // « Est dans » compile en PRÉFIXE côté serveur, donc il attrape les
  // sous-dossiers : /Musique/Jazz ramène aussi /Musique/Jazz/Vocal. C'est ce
  // qu'on attend d'un dossier, et c'est le choix par défaut.
  //
  // Pas d'ÉGALITÉ, volontairement : la colonne comparée est `tracks.file_path`,
  // le chemin d'un FICHIER. Une égalité ne pourrait matcher qu'un chemin de
  // fichier complet — une règle qui rendrait UNE piste alors que l'utilisateur
  // croit désigner un dossier.
  folder: [
    { value: 'starts_with', labelKey: 'smartCollection.opInFolder' },
    { value: 'contains', labelKey: 'smartCollection.opContains' },
  ],
  nullable: [
    { value: 'is_null', labelKey: 'smartCollection.opIsEmpty' },
    { value: 'is_not_null', labelKey: 'smartCollection.opIsNotEmpty' },
  ],
  timestamp: [
    { value: '>', labelKey: 'smartCollection.opAfter' },
    { value: '<', labelKey: 'smartCollection.opBefore' },
    { value: 'between', labelKey: 'smartCollection.opBetween' },
    { value: 'is_null', labelKey: 'smartCollection.opNever' },
  ],
  credit: [{ value: 'has', labelKey: 'smartCollection.opContains' }],
  collection_ref: [
    { value: 'in', labelKey: 'smartCollection.opRefIn' },
    { value: 'not_in', labelKey: 'smartCollection.opRefNotIn' },
  ],
  playlist_ref: [
    { value: 'in', labelKey: 'smartCollection.opRefIn' },
    { value: 'not_in', labelKey: 'smartCollection.opRefNotIn' },
  ],
  favorite: [
    { value: 'is', labelKey: 'smartCollection.opRefIn' },
    { value: 'is_not', labelKey: 'smartCollection.opRefNotIn' },
  ],
  // « porte » / « ne porte pas » — `is` / `is_not`, les deux seuls que
  // `smart_refs` sait nier proprement.
  tag_ref: [
    { value: 'is', labelKey: 'smartCollection.opHasTag' },
    { value: 'is_not', labelKey: 'smartCollection.opHasNotTag' },
  ],
  count: [
    { value: '>=', label: '≥' }, { value: '>', label: '>' },
    { value: '<', label: '<' }, { value: '=', label: '=' },
    { value: 'between', labelKey: 'smartCollection.opBetween' },
  ],
};

export function typeDuChamp(champ: string, niveau: Niveau = 'collection'): TypeChamp {
  // Les alias que les deux moteurs lisent aussi (`artist_name` dans une
  // playlist, `album` dans une collection) retrouvent leur type.
  const alias: Record<string, string> = niveau === 'playlist'
    ? { artist_name: 'artist', album_title: 'album' }
    : { artist: 'artist_name', album: 'title', album_title: 'title' };
  const nom = alias[champ] ?? champ;
  return champsDe(niveau).find((f) => f.value === nom)?.type ?? 'text';
}

/** Les opérateurs légaux pour un champ. Jamais vide : `text` sert de repli. */
export function operateursDe(champ: string, niveau: Niveau = 'collection'): readonly Operateur[] {
  return OPERATEURS[typeDuChamp(champ, niveau)] ?? OPERATEURS.text;
}

/**
 * Un opérateur qui se passe de valeur — « est vide », « jamais joué ».
 * Exiger une saisie pour ceux-là bloquerait une règle parfaitement formée.
 */
export function sansValeur(op: string): boolean {
  return op === 'is_null' || op === 'is_not_null';
}

/**
 * Une règle est-elle complète ?
 *
 * Le serveur refuse une règle sans valeur là où il en attend une, et l'erreur
 * ne remonte qu'à l'enregistrement — après que l'utilisateur a tout saisi. On
 * le sait ici, tout de suite.
 */
export function regleComplete(r: { field: string; op: string; value: any }): boolean {
  if (!r.field || !r.op) return false;
  if (sansValeur(r.op)) return true;
  if (r.op === 'between') return Array.isArray(r.value) && r.value.length === 2
    && r.value.every((v) => v !== '' && v != null);
  return r.value !== '' && r.value != null;
}

/** La valeur de départ d'une règle, selon son opérateur. */
export function valeurInitiale(op: string, type: TypeChamp): any {
  if (sansValeur(op)) return null;
  if (op === 'between') return type === 'timestamp' ? ['', ''] : [0, 0];
  if (type === 'int' || type === 'count') return 0;
  // 🔴 Un FAVORI se qualifie par sa SORTE — `track`, `album`, `artist` — et non
  // par un oui/non. Partir sur `true` produisait une regle que le serveur ne
  // sait pas apparier : elle rendait ZERO album sans rien dire (mesure sur le
  // .18 : `true` -> 0, `"album"` -> 3). On part donc vide, et `regleComplete`
  // refuse tant que rien n'est choisi.
  if (type === 'favorite') return '';
  // Une REFERENCE part vide : le selecteur affiche « choisir… », et
  // `regleComplete` la refuse tant que rien n'est choisi. Sans cela on
  // enregistrerait une reference vide, que le serveur rejette.
  if (type === 'collection_ref' || type === 'playlist_ref') return '';
  // Même règle pour une étiquette : vide, et refusée tant que rien n'est choisi.
  if (type === 'tag_ref') return '';
  return '';
}
