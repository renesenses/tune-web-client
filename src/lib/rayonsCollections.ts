/**
 * Rayons de collections — tune-server-rust#4853 (Gros Bidon, fil 1907).
 *
 * « Rock → Artiste 1, Artiste 2… ; Jazz → … » : un ARBRE de rayons qui range
 * les collections des deux sortes. Décision de Bertrand du 24/09/2026 : arbre
 * (une collection dans un seul rayon), profondeur maximale 3.
 *
 * Logique pure, sans composant : ce que l'écran et la barre latérale
 * partagent, et ce que les témoins vérifient.
 */
import { writable } from 'svelte/store';
import type {
  ArbreCollections, CollectionRangee, RayonCollections, SorteCollectionRangee,
} from './api';
import { comparerAlphabetique } from './ordreAlphabetique';

/**
 * Ce que l'écran peut montrer.
 *
 * `plat` : le serveur ne sert pas l'arbre (serveur antérieur à #4853 → 404,
 * ou panne). L'écran Collections reste alors EXACTEMENT celui d'aujourd'hui —
 * ses deux onglets de listes plates, sans bandeau d'erreur : l'absence d'une
 * fonction nouvelle n'est pas une panne.
 */
export type EtatRayons =
  | { mode: 'arbre'; arbre: ArbreCollections }
  | { mode: 'plat' };

export async function chargerRayons(
  lire: () => Promise<ArbreCollections>,
): Promise<EtatRayons> {
  try {
    const arbre = await lire();
    // Garde de forme : un repli SPA ou un proxy peut répondre 200 sans l'arbre.
    if (!arbre || !Array.isArray(arbre.folders) || !Array.isArray(arbre.collections)) {
      return { mode: 'plat' };
    }
    return { mode: 'arbre', arbre };
  } catch {
    return { mode: 'plat' };
  }
}

/**
 * L'arbre PARTAGÉ entre l'écran Collections et la barre latérale : l'écran le
 * republie après chaque rangement, la barre ne montre donc jamais un arbre
 * périmé.
 */
export const etatRayons = writable<EtatRayons>({ mode: 'plat' });

export async function rafraichirRayons(
  lire: () => Promise<ArbreCollections>,
): Promise<EtatRayons> {
  const e = await chargerRayons(lire);
  etatRayons.set(e);
  return e;
}

/**
 * La clé de raccourci d'une collection, celle qu'écoute l'écran Collections
 * (`tune:shortcut-restore`) : la barre latérale ouvre une collection rangée
 * par le même chemin qu'un raccourci, sans second mécanisme.
 */
export function cleCibleCollection(kind: SorteCollectionRangee, id: number): string {
  return `${kind === 'smart' ? 'smartcollections' : 'collections'}:${id}`;
}

/** Tous les rayons, à plat, dans l'ordre de l'arbre (parcours en profondeur). */
export function tousLesRayons(folders: RayonCollections[]): RayonCollections[] {
  const sortie: RayonCollections[] = [];
  const visiter = (liste: RayonCollections[]) => {
    for (const f of liste) {
      sortie.push(f);
      visiter(f.folders ?? []);
    }
  };
  visiter(folders);
  return sortie;
}

/** Hauteur du sous-arbre : 1 pour un rayon sans sous-rayon. */
export function hauteur(f: RayonCollections): number {
  return 1 + Math.max(0, ...(f.folders ?? []).map(hauteur));
}

/** Vrai si `id` est `f` lui-même ou l'un de ses descendants. */
function contient(f: RayonCollections, id: number): boolean {
  return f.id === id || (f.folders ?? []).some((s) => contient(s, id));
}

/**
 * Où peut-on déplacer le rayon `id` ? `null` = la racine.
 *
 * Mêmes refus que le serveur, pour ne pas PROPOSER ce qui sera refusé : ni
 * lui-même, ni l'un de ses descendants (cycle), ni un parent qui porterait un
 * rayon du sous-arbre au-delà de `maxDepth`. Le serveur reste juge : cette
 * liste n'est qu'un menu.
 */
export function destinationsDuRayon(
  arbre: ArbreCollections,
  id: number,
): (RayonCollections | null)[] {
  const tous = tousLesRayons(arbre.folders);
  const lui = tous.find((f) => f.id === id);
  if (!lui) return [];
  const h = hauteur(lui);
  const sorties: (RayonCollections | null)[] = [];
  if (lui.parent_id !== null) sorties.push(null);
  for (const f of tous) {
    if (contient(lui, f.id)) continue;
    if (f.id === lui.parent_id) continue;
    if (f.depth + h > arbre.max_depth) continue;
    sorties.push(f);
  }
  return sorties;
}

/**
 * Où peut-on ranger une collection ? Tout rayon, quelle que soit sa
 * profondeur, et la racine si elle est aujourd'hui dans un rayon.
 */
export function destinationsDeLaCollection(
  arbre: ArbreCollections,
  dossierActuel: number | null,
): (RayonCollections | null)[] {
  const sorties: (RayonCollections | null)[] = [];
  if (dossierActuel !== null) sorties.push(null);
  for (const f of tousLesRayons(arbre.folders)) {
    if (f.id !== dossierActuel) sorties.push(f);
  }
  return sorties;
}

/** Peut-on créer un sous-rayon dans `f` ? */
export function peutContenirUnSousRayon(arbre: ArbreCollections, f: RayonCollections): boolean {
  return f.depth < arbre.max_depth;
}

/**
 * Ce que transporte un glisser-déposer : un rayon ou une collection — et pour
 * une collection, TOUJOURS sa sorte (l'id 1 est « favorites » ET
 * « Audiophile »).
 */
export type Glisse =
  | { type: 'rayon'; id: number }
  | { type: 'collection'; kind: SorteCollectionRangee; id: number };

export const TYPE_GLISSE = 'application/x-tune-rayon';

export function encoderGlisse(g: Glisse): string {
  return JSON.stringify(g);
}

export function decoderGlisse(brut: string | null | undefined): Glisse | null {
  if (!brut) return null;
  try {
    const g = JSON.parse(brut);
    if (g?.type === 'rayon' && Number.isInteger(g.id)) return { type: 'rayon', id: g.id };
    if (
      g?.type === 'collection' &&
      (g.kind === 'collection' || g.kind === 'smart') &&
      Number.isInteger(g.id)
    ) {
      return { type: 'collection', kind: g.kind, id: g.id };
    }
  } catch {
    /* corps étranger : ignoré */
  }
  return null;
}

/** Les rayons repliés, mémorisés par navigateur (préférence d'écran). */
const CLE_REPLIS = 'tune_v2_rayons_replies';

export function lireReplis(): Set<number> {
  try {
    const brut = localStorage.getItem(CLE_REPLIS);
    const ids = brut ? JSON.parse(brut) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x) => Number.isInteger(x)) : []);
  } catch {
    return new Set();
  }
}

export function ecrireReplis(ids: Set<number>): void {
  try {
    localStorage.setItem(CLE_REPLIS, JSON.stringify([...ids]));
  } catch {
    /* stockage indisponible : le repli vaut pour la session */
  }
}

/**
 * L'arbre ENTIER de la barre latérale replié ou non (#1580), mémorisé par
 * navigateur. Distinct des replis rayon par rayon : replier chaque rayon laisse
 * tous les rayons racine affichés, un par ligne — avec des dizaines de rayons,
 * la barre ne se lit plus. Déplié par défaut : c'est ce qui a été livré.
 */
const CLE_ARBRE_BARRE = 'tune_v2_rayons_barre_replie';

export function lireArbreBarreReplie(): boolean {
  try {
    return localStorage.getItem(CLE_ARBRE_BARRE) === '1';
  } catch {
    return false;
  }
}

export function ecrireArbreBarreReplie(replie: boolean): void {
  try {
    localStorage.setItem(CLE_ARBRE_BARRE, replie ? '1' : '0');
  } catch {
    /* stockage indisponible : le repli vaut pour la session */
  }
}

/* ------------------------------------------------------------------------- */
/*  web#1579 — créer une collection intelligente DANS un rayon (Didier, fil   */
/*  1907) : « Ne serait-il pas possible de créer l'équivalent d'une Smart     */
/*  Collection directement dans la zone Rayon ? Cela éviterait d'encombrer la */
/*  page Smart Collection. » Go de Bertrand du 12/10/2026.                    */
/* ------------------------------------------------------------------------- */

/**
 * Les collections rangées dans un rayon, quelle que soit la profondeur, sous la
 * forme `sorte:id` — les deux espaces d'identifiants se recouvrent, l'id seul
 * ne suffit pas.
 */
export function clesRangees(arbre: ArbreCollections): Set<string> {
  const s = new Set<string>();
  for (const f of tousLesRayons(arbre.folders)) {
    for (const c of f.collections ?? []) s.add(`${c.kind}:${c.id}`);
  }
  return s;
}

/**
 * Après l'enregistrement d'une collection intelligente CRÉÉE depuis le menu
 * d'un rayon : la ranger dans ce rayon. Deux routes existantes (création, puis
 * `POST /library/collection-folders/items/smart/{id}`), pas de route nouvelle.
 *
 * Rend vrai si la collection a été rangée. Sans rayon (création depuis
 * l'onglet Smart), ou sans identifiant rendu par le serveur, rien ne part.
 */
export async function rangerLaNouvelle(
  rayonId: number | null | undefined,
  creee: { id?: unknown } | null | undefined,
  placer: (kind: SorteCollectionRangee, id: number, folderId: number | null) => Promise<unknown>,
): Promise<boolean> {
  if (rayonId == null) return false;
  const id = creee?.id;
  if (typeof id !== 'number' || !Number.isFinite(id)) return false;
  await placer('smart', id, rayonId);
  return true;
}

/* ------------------------------------------------------------------------- */
/*  web#2207 — l'ORDRE des collections dans l'arbre des rayons (Didier, fil   */
/*  1907, réponse 8434) : « que les Collections Intelligentes (tous les       */
/*  niveaux) soient classées dans l'ordre alphanumérique ou avoir la          */
/*  possibilité de les ranger selon son choix. Pour le moment elles sont      */
/*  classées selon leur ordre de création. » Go de Bertrand du 19/10/2026.   */
/* ------------------------------------------------------------------------- */

/**
 * `manuel` : l'ordre que le SERVEUR garde (`collection_folder_items.position`,
 * tune-server-rust#4853), réglé par glisser-déposer. C'est l'ordre livré
 * jusqu'ici — l'ordre de création tant que rien n'a été déplacé.
 *
 * `alpha` : l'ordre alphanumérique du libellé AFFICHÉ, à chaque niveau (dans
 * chaque rayon, et hors rayon). Même comparaison que le reste de
 * l'application (`comparerAlphabetique`) : « Best 2 » avant « Best 10 »,
 * sans casse ni accents.
 *
 * Le choix est une préférence d'écran rangée dans `ui_preferences`, donc
 * gardée par le SERVEUR, comme les collections elles-mêmes : il suit le
 * profil d'un navigateur à l'autre.
 */
export type OrdreRayons = 'manuel' | 'alpha';
export const ORDRES_RAYONS: readonly OrdreRayons[] = ['manuel', 'alpha'];
/**
 * web#2256 — l'ALPHABÉTIQUE par défaut. Didier, fil 1907 (19/10/2026) : « si
 * un seul choix est possible je préfère classement alphabétique
 * automatique » ; go de Bertrand le même jour. Le manuel reste au choix.
 *
 * Ce défaut ne touche que les profils qui n'ont jamais choisi : un
 * `ordreRayons` enregistré garde le dernier mot (`{ ...defaults, ...raw }`).
 * web#2224 n'est pas encore publié (rc7) : aucun testeur n'a de valeur
 * figée sur l'ancien défaut.
 */
export const ORDRE_RAYONS_DEFAUT: OrdreRayons = 'alpha';

export function estOrdreRayons(v: unknown): v is OrdreRayons {
  return v === 'manuel' || v === 'alpha';
}

/**
 * L'arbre à AFFICHER dans l'ordre choisi. `manuel` le rend tel quel (même
 * objet) ; `alpha` en rend une copie dont les collections de chaque niveau
 * sont triées sur leur libellé affiché. Les rayons gardent leur ordre : la
 * demande porte sur les collections.
 */
export function ordonnerArbre(
  arbre: ArbreCollections,
  ordre: OrdreRayons,
  libelle: (c: CollectionRangee) => string = (c) => c.name ?? '',
): ArbreCollections {
  if (ordre !== 'alpha') return arbre;
  const trier = (cs: CollectionRangee[]) =>
    cs.slice().sort((a, b) =>
      comparerAlphabetique(libelle(a), libelle(b))
      // À libellé égal, un ordre TOTAL et stable : la sorte, puis l'id.
      || a.kind.localeCompare(b.kind) || a.id - b.id,
    );
  const rayon = (f: RayonCollections): RayonCollections => ({
    ...f,
    folders: (f.folders ?? []).map(rayon),
    collections: trier(f.collections ?? []),
  });
  return { ...arbre, folders: arbre.folders.map(rayon), collections: trier(arbre.collections) };
}

/** Une écriture de rangement : `placeCollectionInFolder(kind, id, folderId, position)`. */
export interface Placement {
  kind: SorteCollectionRangee;
  id: number;
  folderId: number | null;
  position: number;
}

/**
 * Ranger À LA MAIN : la collection `glisse`, déposée sur la collection
 * `cible` d'un même niveau `liste` (dans l'ordre affiché, celui du serveur),
 * prend la place de la cible — avant elle si on remonte, après elle si on
 * descend, comme dans toute liste qu'on réordonne.
 *
 * Rend les écritures à faire, dans l'ordre :
 *
 * - dans un RAYON, toutes les collections ont une position : UNE écriture,
 *   le serveur renumérote la fratrie (`place_item`) ;
 * - HORS RAYON, le serveur ne range à une position que les collections qui
 *   ont une ligne de rangement ; les autres suivent, dans l'ordre de leurs
 *   listes (`position: null`). Pour qu'une collection prenne une place parmi
 *   elles, celles qui la précéderont reçoivent d'abord la leur, dans l'ordre
 *   affiché — sinon le serveur la poserait après les seules rangées, et le
 *   geste ne ferait pas ce qu'il montre.
 *
 * Rend `[]` quand il n'y a rien à faire (cible = glisse, ou absente).
 */
export function placementsPourDeposer(
  liste: readonly CollectionRangee[],
  glisse: { kind: SorteCollectionRangee; id: number },
  cible: { kind: SorteCollectionRangee; id: number },
  folderId: number | null,
): Placement[] {
  const meme = (a: { kind: string; id: number }, b: { kind: string; id: number }) =>
    a.kind === b.kind && a.id === b.id;
  if (meme(glisse, cible)) return [];
  const iCible = liste.findIndex((c) => meme(c, cible));
  if (iCible < 0) return [];
  const iGlisse = liste.findIndex((c) => meme(c, glisse));
  const sans = liste.filter((c) => !meme(c, glisse));
  const jCible = sans.findIndex((c) => meme(c, cible));
  // Venue d'ailleurs (autre rayon) ou d'au-dessus : après la cible quand on
  // descend, avant elle sinon.
  const at = iGlisse >= 0 && iGlisse < iCible ? jCible + 1 : jCible;
  const sorte = (c: CollectionRangee): SorteCollectionRangee => c.kind;
  if (folderId !== null) {
    return [{ kind: glisse.kind, id: glisse.id, folderId, position: at }];
  }
  // Hors rayon : les collections déjà posées à une place forment le préfixe.
  const posees = sans.filter((c) => c.position !== null && c.position !== undefined).length;
  const ecritures: Placement[] = [];
  for (let k = posees; k < at; k++) {
    ecritures.push({ kind: sorte(sans[k]), id: sans[k].id, folderId: null, position: k });
  }
  ecritures.push({ kind: glisse.kind, id: glisse.id, folderId: null, position: at });
  return ecritures;
}
