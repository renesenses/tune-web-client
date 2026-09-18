/**
 * La GRAMMAIRE des règles d'une playlist intelligente : champs, opérateurs
 * offerts par champ, lecture des règles stockées, et la forme exacte du corps
 * envoyé au serveur.
 *
 * Extraite de `v2-heritage/SmartPlaylistsView.svelte`, sans rien y changer,
 * le jour où le nouveau client a eu besoin du même éditeur (#1150). Recopier
 * quatorze champs et quatre familles d'opérateurs dans un second composant
 * aurait donné DEUX grammaires : elles auraient divergé à la première
 * addition, et le serveur n'en accepte qu'une
 * (`tune-server/src/routes/smart_playlists.rs`, `build_smart_query`).
 *
 * Les opérateurs « ordinaires » et leur normalisation vivent déjà à côté, dans
 * `smartPlaylistOperateurs.ts` ; ce module s'appuie dessus plutôt que de les
 * redire.
 */
import {
  OPERATEURS,
  normaliserOperateur,
  type OptionOperateur,
} from './smartPlaylistOperateurs';

/** Une règle telle que l'éditeur la manipule (l'opérateur y est `operator`). */
export interface RegleSmartPlaylist {
  field: string;
  operator: string;
  value: string;
}

/** Les champs sur lesquels une règle peut porter, dans l'ordre du menu. */
export const CHAMPS: readonly { value: string; key: string }[] = [
  { value: 'title', key: 'common.title' },
  { value: 'artist', key: 'common.artist' },
  { value: 'album', key: 'common.album' },
  { value: 'genre', key: 'smartPlaylists.fieldGenre' },
  { value: 'year', key: 'smartPlaylists.fieldYear' },
  { value: 'format', key: 'smartPlaylists.fieldFormat' },
  { value: 'sample_rate', key: 'smartPlaylists.fieldSampleRate' },
  { value: 'bit_depth', key: 'smartPlaylists.fieldBitDepth' },
  { value: 'source', key: 'smartPlaylists.fieldSource' },
  { value: 'composer', key: 'smartPlaylists.fieldComposer' },
  { value: 'comments', key: 'smartPlaylists.fieldComments' },
  // Références : appartenance à une collection / playlist (classique ou
  // smart) et statut favori — mêmes libellés que l'éditeur de smart
  // collections (clés smartCollection.*).
  { value: 'in_collection', key: 'smartCollection.fieldInCollection' },
  { value: 'in_playlist', key: 'smartCollection.fieldInPlaylist' },
  { value: 'favorite', key: 'smartCollection.fieldFavorite' },
];

/**
 * Les champs « référence » n'acceptent que est / n'est pas — `in`/`not_in`
 * côté serveur, `is`/`is_not` pour les favoris.
 */
export const REF_OPERATEURS: readonly OptionOperateur[] = [
  { value: 'in', key: 'smartCollection.opRefIn' },
  { value: 'not_in', key: 'smartCollection.opRefNotIn' },
];
export const FAV_OPERATEURS: readonly OptionOperateur[] = [
  { value: 'is', key: 'smartCollection.opRefIn' },
  { value: 'is_not', key: 'smartCollection.opRefNotIn' },
];
/**
 * « Source » se choisit dans une LISTE (#4299) : est / n'est pas. Le serveur
 * ne ramène les favoris d'un service que sur une règle positive.
 */
export const SOURCE_OPERATEURS: readonly OptionOperateur[] = [
  { value: 'equals', label: '=' },
  { value: 'not_equals', label: '≠' },
];

export function estChampReference(field: string): boolean {
  return field === 'in_collection' || field === 'in_playlist' || field === 'favorite';
}

/** Les opérateurs offerts pour ce champ. */
export function operateursDe(field: string): readonly OptionOperateur[] {
  if (field === 'favorite') return FAV_OPERATEURS;
  if (estChampReference(field)) return REF_OPERATEURS;
  if (field === 'source') return SOURCE_OPERATEURS;
  return OPERATEURS;
}

/** La règle posée par défaut, à l'ouverture comme sur « ajouter une règle ». */
export function regleNeuve(): RegleSmartPlaylist {
  return { field: 'genre', operator: 'contains', value: '' };
}

/**
 * Les règles d'une playlist stockée, ramenées à la forme de l'éditeur.
 *
 * Le serveur rend tantôt un tableau, tantôt sa forme JSON encodée, et
 * l'opérateur y porte tantôt `op`, tantôt `operator`. `normaliserOperateur`
 * ramène les alias (`>=`, `greater_than`, …) sur une entrée du menu : sans
 * lui, rouvrir puis enregistrer une playlist PERD son opérateur.
 */
export function lireRegles(rules: unknown): RegleSmartPlaylist[] {
  const brut: any[] = Array.isArray(rules)
    ? rules
    : (() => {
        try {
          return JSON.parse((rules as string) || '[]');
        } catch {
          return [];
        }
      })();
  return (brut ?? []).map((r: any) => ({
    field: r.field,
    operator: normaliserOperateur(r.operator || r.op || 'contains'),
    value: r.value,
  }));
}

/**
 * Les règles à envoyer au serveur : celles qui portent une valeur, et sous le
 * nom de champ qu'il attend (`op`, pas `operator`).
 */
export function reglesPourServeur(
  regles: readonly RegleSmartPlaylist[],
): { field: string; op: string; value: string }[] {
  return regles
    .filter((r) => String(r.value ?? '').trim())
    .map((r) => ({ field: r.field, op: r.operator, value: r.value }));
}
