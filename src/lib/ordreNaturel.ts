/**
 * L'ordre NATUREL de deux libellés : « Disc 2 » avant « Disc 10 » — #1434.
 *
 * Bertrand, recette de la 0.9.161 : sur les coffrets Radio Nova, « le CD 10
 * s'affiche avant le CD 2 » ; « dans le coffret, l'ordre est bon ». Les disques
 * d'un coffret éclaté portent des titres qui ne diffèrent QUE par leur numéro
 * (« Radio Nova - La boîte Bleue, Disc 10 », « …, Disc 2 »). Un
 * `localeCompare` nu les compare caractère par caractère : `"1" < "2"`, donc
 * « Disc 10 » passe avant « Disc 2 », puis « Disc 11 »… jusqu'à « Disc 19 ».
 *
 * `numeric: true` lit les suites de chiffres comme des NOMBRES. Rien d'autre ne
 * change : la casse et les accents restent départagés comme avant
 * (`localeCompare` sans option), pour qu'un tri de titres ne bouge que là où il
 * était faux.
 *
 * Un seul collateur, créé une fois : `localeCompare` avec options en recrée un
 * à chaque appel, et un tri de 4 000 albums en fait des dizaines de milliers.
 */
const collateur = new Intl.Collator(undefined, { numeric: true });

export function ordreNaturel(a: string | null | undefined, b: string | null | undefined): number {
  return collateur.compare(a ?? '', b ?? '');
}
