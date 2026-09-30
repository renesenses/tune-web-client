/**
 * Les règles d'une playlist intelligente, telles que ses deux éditeurs les
 * manipulent : champs, opérateurs offerts par champ, lecture des règles
 * stockées, et la forme exacte du corps envoyé au serveur.
 *
 * ## Une seule grammaire — tune-server-rust#5547
 *
 * Bertrand, 30/09/2026, sur le .18 en 0.9.169 : « l'éditeur des playlists
 * intelligentes n'offre pas les mêmes critères de sélection que celui des
 * collections intelligentes. Il manque notamment les ÉTIQUETTES. Harmonise
 * avec les smart collections ! »
 *
 * Ce module portait SA liste : quatorze champs et un seul jeu d'opérateurs,
 * le même pour un titre que pour une année. Les collections en avaient une
 * autre, de vingt-quatre champs typés, dans `smartRegles.ts`. Deux listes,
 * et elles avaient divergé : l'étiquette, le label, le répertoire, la
 * pochette, les dates, les crédits, les écoutes et les opérateurs « parmi » /
 * « entre » n'existaient que d'un côté.
 *
 * Il n'y a plus qu'une définition, `smartRegles.ts` ; ce module n'en garde
 * que ce qui est propre à la playlist : le niveau `'playlist'`, la clé
 * `operator` de ses éditeurs, et la lecture des anciennes graphies.
 */
import {
  champsDe,
  operateursDe as operateursDuNiveau,
  regleComplete,
  typeDuChamp as typeDuNiveau,
  type Operateur,
  type TypeChamp,
} from './smartRegles';

/** Une règle telle que l'éditeur la manipule (l'opérateur y est `operator`). */
export interface RegleSmartPlaylist {
  field: string;
  operator: string;
  /** Texte, nombre, paire (`between`) ou objet (`credit`), comme au serveur. */
  value: any;
}

/** Une entrée du menu des opérateurs : un symbole littéral ou une clé i18n. */
export interface OptionOperateur {
  value: string;
  key?: string;
  label?: string;
}

/** Les champs sur lesquels une règle peut porter, dans l'ordre du menu. */
export const CHAMPS: readonly { value: string; key: string; type: TypeChamp }[] = champsDe(
  'playlist',
).map((c) => ({ value: c.value, key: c.labelKey, type: c.type }));

/** Le type d'un champ de playlist : il décide des opérateurs ET de la saisie. */
export function typeDuChamp(field: string): TypeChamp {
  return typeDuNiveau(field, 'playlist');
}

const enOption = (o: Operateur): OptionOperateur =>
  o.labelKey ? { value: o.value, key: o.labelKey } : { value: o.value, label: o.label };

/** Les opérateurs offerts pour ce champ — ceux des collections, mot pour mot. */
export function operateursDe(field: string): readonly OptionOperateur[] {
  return operateursDuNiveau(field, 'playlist').map(enOption);
}

/**
 * Les opérateurs du MENU pour cette règle : ceux du champ, plus l'opérateur
 * enregistré s'il n'y figure pas.
 *
 * Une règle écrite avant l'harmonisation peut porter un opérateur que le menu
 * ne propose plus — `branch_of`, qu'aucun des deux moteurs ne sait traduire.
 * Sans cette entrée, le `<select>` s'afficherait vide et rouvrir puis
 * enregistrer la playlist changerait sa règle en silence. On la montre telle
 * quelle : elle se garde, ou se change à la main.
 */
export function operateursPour(r: RegleSmartPlaylist): readonly OptionOperateur[] {
  const offerts = operateursDe(r.field);
  if (!r.operator || offerts.some((o) => o.value === r.operator)) return offerts;
  return [...offerts, { value: r.operator, label: r.operator }];
}

/**
 * Les anciennes graphies de l'éditeur des playlists, ramenées aux valeurs du
 * menu commun.
 *
 * Chaque paire désigne la MÊME chose pour le serveur
 * (`regles_sql::normaliser_op`) : `equals` et `=` y deviennent `=`, `gte` et
 * `>=` y deviennent `>=`. La relecture ne change donc aucun résultat — elle
 * rend seulement l'opérateur visible dans le menu. `>` et `<` restent eux-mêmes :
 * le serveur les lit stricts.
 */
const ANCIENNES_GRAPHIES: Readonly<Record<string, string>> = {
  equals: '=',
  eq: '=',
  not_equals: '!=',
  ne: '!=',
  neq: '!=',
  gte: '>=',
  greater_than: '>=',
  greater_equal: '>=',
  lte: '<=',
  less_than: '<=',
  less_equal: '<=',
  gt: '>',
  lt: '<',
  is_empty: 'is_null',
  empty: 'is_null',
  is_not_empty: 'is_not_null',
  not_empty: 'is_not_null',
};

export function normaliserOperateur(op: string): string {
  return ANCIENNES_GRAPHIES[op] ?? op;
}

/** L'entrée de menu d'une valeur d'opérateur, pour afficher une règle. */
export function optionOperateur(field: string, op: string): OptionOperateur | undefined {
  return operateursDe(field).find((o) => o.value === op);
}

/** Les champs « référence » : collection, playlist, favori, étiquette. */
export function estChampReference(field: string): boolean {
  const t = typeDuChamp(field);
  return t === 'collection_ref' || t === 'playlist_ref' || t === 'favorite' || t === 'tag_ref';
}

/** La règle posée par défaut, à l'ouverture comme sur « ajouter une règle ». */
export function regleNeuve(): RegleSmartPlaylist {
  return { field: 'genre', operator: 'contains', value: '' };
}

/**
 * Les règles d'une playlist stockée, ramenées à la forme de l'éditeur.
 *
 * Le serveur rend tantôt un tableau, tantôt sa forme JSON encodée, et
 * l'opérateur y porte tantôt `op`, tantôt `operator`.
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
 * Les règles à envoyer au serveur : celles qui sont COMPLÈTES, sous le nom de
 * champ qu'il attend (`op`, pas `operator`).
 *
 * « Complète » est la définition des collections (`regleComplete`) : une règle
 * « est vide » part sans valeur — l'ancien filtre sur la valeur la jetait, et
 * la règle n'atteignait jamais le serveur.
 */
export function reglesPourServeur(
  regles: readonly RegleSmartPlaylist[],
): { field: string; op: string; value: any }[] {
  return regles
    .filter((r) =>
      regleComplete({
        field: r.field,
        op: r.operator,
        value: typeof r.value === 'string' ? r.value.trim() : r.value,
      }),
    )
    .map((r) => ({ field: r.field, op: r.operator, value: r.value }));
}
