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
  | 'credit' | 'collection_ref' | 'playlist_ref' | 'favorite';

export interface Champ {
  value: string;
  labelKey: string;
  type: TypeChamp;
}

export const CHAMPS: readonly Champ[] = [
  { value: 'artist_name',    labelKey: 'smartCollection.fieldArtist',      type: 'text' },
  { value: 'title',          labelKey: 'smartCollection.fieldAlbumTitle',  type: 'text' },
  { value: 'genre',          labelKey: 'smartCollection.fieldGenre',       type: 'text' },
  { value: 'composer',       labelKey: 'smartCollection.fieldComposer',    type: 'text' },
  { value: 'label',          labelKey: 'smartCollection.fieldLabel',       type: 'text' },
  { value: 'format',         labelKey: 'smartCollection.fieldFormat',      type: 'text' },
  { value: 'source',         labelKey: 'smartCollection.fieldSource',      type: 'text' },
  { value: 'year',           labelKey: 'smartCollection.fieldYear',        type: 'int' },
  { value: 'sample_rate',    labelKey: 'smartCollection.fieldSampleRate',  type: 'int' },
  { value: 'bit_depth',      labelKey: 'smartCollection.fieldBitDepth',    type: 'int' },
  { value: 'track_count',    labelKey: 'smartCollection.fieldTrackCount',  type: 'int' },
  { value: 'duration',       labelKey: 'smartCollection.fieldDuration',    type: 'int' },
  { value: 'track_number',   labelKey: 'smartCollection.fieldTrackNumber', type: 'int' },
  { value: 'disc_number',    labelKey: 'smartCollection.fieldDiscNumber',  type: 'int' },
  { value: 'bpm',            labelKey: 'smartCollection.fieldBpm',         type: 'int' },
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
];

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
  count: [
    { value: '>=', label: '≥' }, { value: '>', label: '>' },
    { value: '<', label: '<' }, { value: '=', label: '=' },
    { value: 'between', labelKey: 'smartCollection.opBetween' },
  ],
};

export function typeDuChamp(champ: string): TypeChamp {
  return CHAMPS.find((f) => f.value === champ)?.type ?? 'text';
}

/** Les opérateurs légaux pour un champ. Jamais vide : `text` sert de repli. */
export function operateursDe(champ: string): readonly Operateur[] {
  return OPERATEURS[typeDuChamp(champ)] ?? OPERATEURS.text;
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
  if (type === 'favorite') return true;
  // Une REFERENCE part vide : le selecteur affiche « choisir… », et
  // `regleComplete` la refuse tant que rien n'est choisi. Sans cela on
  // enregistrerait une reference vide, que le serveur rejette.
  if (type === 'collection_ref' || type === 'playlist_ref') return '';
  return '';
}
