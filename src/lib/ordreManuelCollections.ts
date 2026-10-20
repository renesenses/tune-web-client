/**
 * web#2256 — le classement MANUEL des deux listes plates de l'écran
 * Collections (« Smart Collections » et « Collections »). Didier, fil 1907,
 * 19/10/2026 : « Le choix parfait serait bien-sûr de pouvoir choisir entre
 * classement alphabétique automatique ou manuel […] tu peux retenir le même
 * choix que pour les collections intelligentes ». Go de Bertrand du 19/10 :
 * l'alphabétique par défaut, le manuel en option, pour les deux sortes.
 *
 * Même geste que l'onglet Rayons (web#2224) : on dépose une collection sur
 * une autre et elle prend sa place, avant elle si on remonte, après elle si
 * on descend.
 *
 * ## Pourquoi une préférence, et pas la position des rayons
 *
 * L'arbre des rayons range une collection à une position DANS SON rayon
 * (`collection_folder_items.position`). Une liste plate mêle les collections
 * de tous les rayons et celles qui n'en ont pas : aucune de ces positions ne
 * dit où l'une se place par rapport à l'autre. L'ordre manuel d'une liste
 * plate est donc la liste de ses identifiants, rangée dans `ui_preferences`
 * — gardée par le SERVEUR, comme l'ordre des rayons (`ordreRayons`), et
 * suivie d'un navigateur à l'autre.
 *
 * Logique pure, sans composant : l'écran l'appelle, les témoins aussi.
 */

/** Les deux listes plates. `normale` = l'onglet « Collections ». */
export type SortePlate = 'smart' | 'normale';

/** Pour chaque liste, les identifiants dans l'ordre choisi à la main. */
export interface OrdreManuelCollections {
  smart: number[];
  normale: number[];
}

export const ORDRE_MANUEL_VIDE: OrdreManuelCollections = Object.freeze({
  smart: [],
  normale: [],
}) as OrdreManuelCollections;

/**
 * Plafond de longueur d'une liste lue : ce blob vient du SERVEUR, une valeur
 * abîmée ne doit pas faire trier cent mille entrées à chaque affichage.
 */
const PLAFOND = 5000;

function idsPropres(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const vus = new Set<number>();
  const sortie: number[] = [];
  for (const x of v) {
    if (!Number.isSafeInteger(x) || vus.has(x)) continue;
    vus.add(x);
    sortie.push(x);
    if (sortie.length >= PLAFOND) break;
  }
  return sortie;
}

/**
 * Le choix lu depuis `ui_preferences`, assaini : des entiers, sans doublon,
 * pour chacune des deux listes. Toute autre forme retombe sur « rien de
 * rangé à la main ».
 */
export function normaliserOrdreManuel(v: unknown): OrdreManuelCollections {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { smart: [], normale: [] };
  const o = v as { smart?: unknown; normale?: unknown };
  return { smart: idsPropres(o.smart), normale: idsPropres(o.normale) };
}

/**
 * La liste à AFFICHER en ordre manuel : d'abord les collections rangées à la
 * main, dans leur ordre ; puis celles qui ne l'ont jamais été (créées
 * depuis, ou jamais déplacées), dans l'ordre `parDefaut` — l'alphabétique
 * de l'écran. Choisir « Manuel » pour la première fois ne bouscule donc
 * rien : on part de l'ordre qu'on voyait.
 *
 * Un identifiant rangé qui n'existe plus (collection supprimée) est ignoré.
 */
export function ordonnerManuellement<T>(
  entrees: readonly T[],
  ids: readonly number[],
  idDe: (e: T) => number,
  parDefaut: (a: T, b: T) => number,
): T[] {
  return entrees.slice().sort(comparateurManuel(ids, idDe, parDefaut));
}

/**
 * Le même ordre, en COMPARATEUR : l'écran trie sa liste déjà filtrée avec
 * lui, comme il le fait pour les autres tris.
 */
export function comparateurManuel<T>(
  ids: readonly number[],
  idDe: (e: T) => number,
  parDefaut: (a: T, b: T) => number,
): (a: T, b: T) => number {
  const rang = new Map<number, number>();
  ids.forEach((id, i) => { if (!rang.has(id)) rang.set(id, i); });
  return (a, b) => {
    const ra = rang.get(idDe(a));
    const rb = rang.get(idDe(b));
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return parDefaut(a, b);
  };
}

/**
 * Déposer `glisse` sur `cible` dans la liste `affiches` (les identifiants,
 * dans l'ordre affiché, TOUTE la liste de cette sorte) : `glisse` prend la
 * place de `cible` — avant elle si on remonte, après elle si on descend.
 *
 * Rend la liste COMPLÈTE à retenir, ou `null` quand il n'y a rien à faire
 * (sur elle-même, ou une cible absente).
 */
export function deposerDansOrdre(
  affiches: readonly number[],
  glisse: number,
  cible: number,
): number[] | null {
  if (glisse === cible) return null;
  const iCible = affiches.indexOf(cible);
  if (iCible < 0) return null;
  const iGlisse = affiches.indexOf(glisse);
  const sans = affiches.filter((id) => id !== glisse);
  const jCible = sans.indexOf(cible);
  const at = iGlisse >= 0 && iGlisse < iCible ? jCible + 1 : jCible;
  sans.splice(at, 0, glisse);
  return sans;
}

/** Le type MIME du glisser-déposer d'une carte de liste plate. */
export const TYPE_GLISSE_PLATE = 'application/x-tune-collection-plate';

export function encoderGlissePlate(sorte: SortePlate, id: number): string {
  return JSON.stringify({ sorte, id });
}

export function decoderGlissePlate(brut: string | null | undefined): { sorte: SortePlate; id: number } | null {
  if (!brut) return null;
  try {
    const g = JSON.parse(brut);
    if ((g?.sorte === 'smart' || g?.sorte === 'normale') && Number.isSafeInteger(g.id)) {
      return { sorte: g.sorte, id: g.id };
    }
  } catch {
    /* corps étranger : ignoré */
  }
  return null;
}
