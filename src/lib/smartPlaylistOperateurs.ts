/**
 * Opérateurs de l'éditeur de règles des listes de lecture intelligentes.
 *
 * Extrait de `SmartPlaylistsView.svelte` pour être vérifiable : la liste et sa
 * normalisation portent un contrat avec le serveur
 * (`tune-server/src/routes/smart_playlists.rs`, `build_smart_query`), et un
 * contrat ne se relit pas dans un `<select>`.
 *
 * `3408a76` ajoutait ici « ≥ » et « ≤ » ; la fusion `f14553f` (23/07/2026) l'a
 * avalé. La restauration s'écarte de son diff sur un point, pour une raison
 * lue dans le serveur — voir `normaliserOperateur`.
 */

/** Une entrée du menu déroulant : soit une clé i18n, soit un symbole littéral. */
export interface OptionOperateur {
  value: string;
  key?: string;
  label?: string;
}

/**
 * Les entrées du menu, dans l'ordre d'affichage.
 *
 * `gte` / `lte` y prennent la place de `greater_than` / `less_than` au lieu de
 * s'y ajouter : le serveur normalise `greater_than` en `gte`, donc le « > »
 * du menu n'a JAMAIS été strict. Afficher « > » et « ≥ » côte à côte aurait
 * offert deux libellés au comportement identique au bit près ; n'afficher que
 * « ≥ » dit enfin la vérité sur ce que la règle va faire. Les anciennes
 * valeurs restent lues sans perte par `normaliserOperateur`.
 */
export const OPERATEURS: readonly OptionOperateur[] = [
  { value: 'contains', key: 'smartPlaylists.opContains' },
  { value: 'equals', label: '=' },
  { value: 'not_equals', label: '!=' },
  { value: 'starts_with', key: 'smartPlaylists.opStartsWith' },
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
  { value: 'branch_of', key: 'smartPlaylists.opBranchOf' },
  { value: 'is_empty', key: 'smartPlaylists.opIsEmpty' },
  { value: 'is_not_empty', key: 'smartPlaylists.opIsNotEmpty' },
];

/**
 * Toutes les formes rencontrées dans une règle déjà en base, ramenées à la
 * valeur correspondante du menu.
 *
 * Deux dégâts distincts sont réparés ici.
 *
 * 1. Un opérateur stocké sous une forme absente du menu (`">="`, semé par le
 *    serveur — cf. `smart_refs.rs:688`) ne sélectionne AUCUNE `<option>` : le
 *    menu s'affiche vide. Pire, l'enregistrement renvoie `op: rule.operator`,
 *    donc rouvrir puis enregistrer la liste PERD son opérateur.
 * 2. Les symboles nus `>`, `<`, `=`, `!=` ne figurent pas dans la table du
 *    serveur : ils tombent dans son `_ => continue`, et la règle n'applique
 *    alors aucun filtre — la liste renvoie toute la bibliothèque, en silence
 *    (même défaut que les règles « Album » de Sergio, forum #1008). Les
 *    normaliser ne préserve donc pas un comportement : cela le répare.
 */
const ALIAS: Readonly<Record<string, string>> = {
  '>=': 'gte',
  '>': 'gte',
  greater_than: 'gte',
  '<=': 'lte',
  '<': 'lte',
  less_than: 'lte',
  '=': 'equals',
  '!=': 'not_equals',
};

export function normaliserOperateur(op: string): string {
  return ALIAS[op] ?? op;
}

/** L'entrée de menu correspondant à cette valeur, si elle existe. */
export function optionOperateur(value: string): OptionOperateur | undefined {
  return OPERATEURS.find((o) => o.value === value);
}
