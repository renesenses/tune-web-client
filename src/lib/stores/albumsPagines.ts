/**
 * LA BIBLIOTHÈQUE PAGINÉE — renesenses/tune-server-rust#4800, cause 3.
 *
 * ## Ce qu'on corrige
 *
 * Mesuré sur le .18 (9 427 albums) : la coquille chargeait TOUTE la
 * bibliothèque à chaque ouverture — `v2Bootstrap.loadAlbums`, des requêtes
 * en série (100, puis des lots de 2 000), 3,5 Mo de JSON, ~1 s de
 * désérialisation — et la rechargeait à chaque `library.scan.completed`. Pendant que ces quatre
 * requêtes occupaient une connexion de lecture du serveur, une requête sur
 * trois attendait derrière (cause 2). Décision de Bertrand, 23/09/2026 : la
 * grille se sert PAR PAGES.
 *
 * ## Ce que ce module tient
 *
 *  1. `albumsPagines` — les pages d'UNE liste (un tri, un sens, une graine),
 *     demandées au défilement et au saut A–Z, mises en cache par numéro, avec
 *     le `total` que le serveur rend (`COUNT OVER`, PR serveur #4815). Changer
 *     de tri vide les pages — le total, lui, ne dépend pas du tri.
 *  2. `demanderBibliothequeEntiere` — le chargement COMPLET, pour les écrans
 *     qui en ont vraiment besoin (facettes et leurs comptes, recherche locale,
 *     frise des années, onglets Genres/Années/Labels, portée de répertoire,
 *     convertisseur, déclic) : PARESSEUX, à la demande, mémorisé, jamais au
 *     démarrage. Il remplit le magasin partagé `albums` (`stores/library`).
 *  3. `invaliderBibliotheque` — ce que fait `library.scan.completed` : les
 *     pages tombent, la liste entière tombe, la génération avance. RIEN n'est
 *     rechargé ici : chaque écran monté redemande ce qu'il montre — les cases
 *     redevenues vides se re-demandent d'elles-mêmes au défilement, et un
 *     consommateur de la liste entière relit `$albums` vide et la redemande.
 *  4. `offsetDeLettre` — le rail A–Z sans route serveur : le serveur ne rend
 *     pas de borne par lettre. On la trouve par DICHOTOMIE sur `offset` avec
 *     `limit=1`, soit ⌈log₂ 9 427⌉ = 14 requêtes d'un album, mises en cache
 *     par lettre. Une route `GET /library/albums/lettres` la rendrait en une.
 *
 * ## Pourquoi le serveur ne fait pas tout
 *
 * `GET /library/albums` filtre par format, qualité, compilation et tranche de
 * DR, mais PAS par fréquence, profondeur, source, année ni texte ; il ne
 * compte aucune facette (son `total` est toujours celui de la bibliothèque
 * visible entière) et ne rend ni histogramme des années ni bornes par lettre.
 * Tant que ces routes n'existent pas, les écrans qui en dépendent chargent la
 * liste entière — à la demande, pas à l'ouverture.
 */
import { get, writable, type Readable } from 'svelte/store';
import type { Album } from '../types';
import * as api from '../api';
import { albums, libraryLoading } from './library';

/** Les tris que le serveur sait rendre PAGINÉS avec le même ordre que l'écran. */
export type TriServeur = 'title' | 'artist' | 'added' | 'dr' | 'random';

export interface ClefDeListe {
  sort: TriServeur;
  order: 'asc' | 'desc';
  /** Tri aléatoire seulement : la graine EST le contrat (#3074). */
  seed?: number | null;
}

/**
 * Albums par page. Une grille de bureau montre une quarantaine de pochettes :
 * une page en couvre deux écrans et demi, et pèse ~35 Ko — contre 3,5 Mo.
 */
export const TAILLE_PAGE = 100;

export interface EtatPagine {
  /** La liste dont les pages sont celles-ci — `clefDeListe(...)`. */
  clef: string;
  /** L'effectif de la bibliothèque visible, dès la première réponse. */
  total: number | null;
  pages: ReadonlyMap<number, readonly Album[]>;
  enVol: ReadonlySet<number>;
  erreur: string | null;
  /** Avance à chaque invalidation : ce qui a été demandé AVANT ne s'écrit plus. */
  generation: number;
}

export function clefDeListe(c: ClefDeListe): string {
  return `${c.sort}|${c.order}|${c.seed ?? ''}`;
}

const etatInitial = (): EtatPagine => ({
  clef: '', total: null, pages: new Map(), enVol: new Set(), erreur: null, generation: 0,
});

export const albumsPagines = writable<EtatPagine>(etatInitial());

/**
 * La génération de la bibliothèque : avance à chaque invalidation. Un écran
 * qui tient la liste ENTIÈRE la lit dans un effet pour la redemander quand
 * elle change — c'est le seul « rechargement », et il ne part que d'un écran
 * monté qui en a besoin.
 */
const generation = writable(0);
export const generationBibliotheque: Readable<number> = { subscribe: generation.subscribe };

/** Les pages tombent, mais pas le total : la grille garde sa hauteur. */
function reinitialiser(clef: string, total: number | null): void {
  albumsPagines.update((e) => ({ ...e, clef, total, pages: new Map(), enVol: new Set(), erreur: null }));
}

/**
 * Demande la page `index` de la liste `c`. Sans effet si elle est déjà là ou
 * en vol ; changer de liste (autre tri, autre graine) vide les pages d'avant.
 */
export async function demanderPage(c: ClefDeListe, index: number): Promise<void> {
  const clef = clefDeListe(c);
  let etat = get(albumsPagines);
  if (etat.clef !== clef) {
    reinitialiser(clef, etat.total);
    etat = get(albumsPagines);
  }
  if (index < 0 || etat.pages.has(index) || etat.enVol.has(index)) return;
  const gen = etat.generation;
  albumsPagines.update((e) => ({ ...e, enVol: new Set(e.enVol).add(index) }));
  try {
    const page = await api.getAlbumsPagines({
      limit: TAILLE_PAGE, offset: index * TAILLE_PAGE, sort: c.sort, order: c.order, seed: c.seed ?? null,
    });
    albumsPagines.update((e) => {
      const enVol = new Set(e.enVol); enVol.delete(index);
      // Une réponse d'une autre liste ou d'une génération passée ne s'écrit pas.
      if (e.clef !== clef || e.generation !== gen) return { ...e, enVol };
      const pages = new Map(e.pages);
      pages.set(index, page.items);
      // Un serveur sans `total` : on en déduit un du dernier lot, comme avant.
      const total = page.total ?? (page.items.length < TAILLE_PAGE ? index * TAILLE_PAGE + page.items.length : e.total);
      return { ...e, pages, enVol, total, erreur: null };
    });
  } catch (err: any) {
    albumsPagines.update((e) => {
      const enVol = new Set(e.enVol); enVol.delete(index);
      if (e.clef !== clef || e.generation !== gen) return { ...e, enVol };
      return { ...e, enVol, erreur: String(err?.message ?? err) };
    });
  }
}

/**
 * Les CASES de la liste : une par album du total, `null` tant que sa page n'est
 * pas arrivée. C'est ce que la grille itère — les cases vides tiennent la
 * place, et leur mise en vue déclenche la demande de leur page.
 */
export function casesDeLaListe(e: EtatPagine): (Album | null)[] {
  const total = e.total ?? 0;
  const cases: (Album | null)[] = new Array(total).fill(null);
  for (const [index, page] of e.pages) {
    const base = index * TAILLE_PAGE;
    for (let i = 0; i < page.length && base + i < total; i++) cases[base + i] = page[i];
  }
  return cases;
}

/** Les albums déjà arrivés, dans l'ordre de la liste, sans les trous. */
export function albumsCharges(e: EtatPagine): Album[] {
  const out: Album[] = [];
  for (const index of [...e.pages.keys()].sort((a, b) => a - b)) out.push(...e.pages.get(index)!);
  return out;
}

// ── Le rail A–Z ─────────────────────────────────────────────────────────────

/** '#' avant 'A' : les titres qui commencent par un chiffre sortent en tête. */
export function rangLettre(lettre: string): number {
  const c = lettre.charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c.charCodeAt(0) - 64 : 0;
}

const lettresConnues = new Map<string, Promise<number | null>>();

/**
 * Le PREMIER offset dont l'initiale (`initiale(album)`, celle du rail) vaut
 * au moins `lettre`, dans la liste `c`. `null` si la liste est vide.
 *
 * Dichotomie sur `offset` avec `limit=1` : 14 requêtes d'un album pour 9 427,
 * mises en cache par liste et par lettre jusqu'à la prochaine invalidation.
 * Les pages déjà en cache répondent sans requête. Suppose que l'initiale
 * croît le long de la liste — vrai des tris par titre et par artiste, les
 * seuls où le rail est offert.
 */
export function offsetDeLettre(
  c: ClefDeListe, lettre: string, initiale: (a: Album) => string,
): Promise<number | null> {
  const clef = clefDeListe(c);
  const cle = `${get(generation)}|${clef}|${rangLettre(lettre)}`;
  const connu = lettresConnues.get(cle);
  if (connu) return connu;
  const p = (async () => {
    if (get(albumsPagines).clef !== clef || get(albumsPagines).total == null) await demanderPage(c, 0);
    const total = get(albumsPagines).total;
    if (!total) return null;
    const cible = rangLettre(lettre);
    if (cible === 0) return 0;
    const rangA = async (k: number): Promise<number> => {
      const page = get(albumsPagines).pages.get(Math.floor(k / TAILLE_PAGE));
      const a = page ? page[k % TAILLE_PAGE] : (await api.getAlbumsPagines({
        limit: 1, offset: k, sort: c.sort, order: c.order, seed: c.seed ?? null,
      })).items[0];
      return a ? rangLettre(initiale(a)) : Number.POSITIVE_INFINITY;
    };
    let lo = 0, hi = total;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((await rangA(mid)) >= cible) hi = mid; else lo = mid + 1;
    }
    // Aucun album à partir de cette lettre : on va au bout de la liste plutôt
    // que nulle part.
    return Math.min(lo, total - 1);
  })();
  lettresConnues.set(cle, p);
  p.catch(() => lettresConnues.delete(cle));
  return p;
}

// ── La liste entière, à la demande ──────────────────────────────────────────

let chargementEntier: { generation: number; promesse: Promise<Album[]> } | null = null;

/**
 * La bibliothèque ENTIÈRE dans `albums` — pour qui en a vraiment besoin.
 *
 * Mémorisé par génération : dix appelants pendant un scan ne font qu'un
 * chargement ; une invalidation le rend à refaire. Ne se lance JAMAIS de
 * lui-même — c'est tout l'objet de #4800.
 *
 * Sans tri demandé au serveur, comme l'ancien `loadAlbums` : les écrans qui
 * tiennent la liste entière la trient eux-mêmes.
 */
export function demanderBibliothequeEntiere(): Promise<Album[]> {
  const gen = get(generation);
  if (chargementEntier && chargementEntier.generation === gen) return chargementEntier.promesse;
  libraryLoading.set(true);
  const promesse = api.getAllAlbums(2000, null, null)
    .then((liste) => {
      // Un scan passé entre-temps : cette liste décrit une bibliothèque
      // d'avant, on ne l'écrit pas.
      if (get(generation) !== gen) return get(albums);
      albums.set(liste);
      return liste;
    })
    .finally(() => { if (get(generation) === gen) libraryLoading.set(false); });
  chargementEntier = { generation: gen, promesse };
  promesse.catch(() => { if (chargementEntier?.promesse === promesse) chargementEntier = null; });
  return promesse;
}

/**
 * Le serveur dit que la bibliothèque a changé (`library.scan.completed`,
 * `library.updated`) : tout ce qu'on en tenait est PÉRIMÉ. Les pages tombent
 * (le total reste, la grille garde sa hauteur jusqu'à la première page
 * neuve), la liste entière tombe, les bornes de lettres tombent, la
 * génération avance. Aucune requête ne part d'ici.
 */
export function invaliderBibliotheque(): void {
  generation.update((g) => g + 1);
  chargementEntier = null;
  lettresConnues.clear();
  albumsPagines.update((e) => ({
    ...e, pages: new Map(), enVol: new Set(), erreur: null, generation: e.generation + 1,
  }));
  if (get(albums).length) albums.set([]);
  libraryLoading.set(false);
}

/** Une fiche modifiée : reportée dans les pages ET dans la liste entière. */
export function mettreAJourAlbum(maj: Partial<Album> & { id: number | null }): void {
  if (maj.id == null) return;
  albumsPagines.update((e) => {
    let touche = false;
    const pages = new Map(e.pages);
    for (const [index, page] of pages) {
      if (!page.some((a) => a.id === maj.id)) continue;
      pages.set(index, page.map((a) => (a.id === maj.id ? { ...a, ...maj } : a)));
      touche = true;
    }
    return touche ? { ...e, pages } : e;
  });
  if (get(albums).length) albums.update((liste) => liste.map((x) => (x.id === maj.id ? { ...x, ...maj } : x)));
}

/** Pour les témoins : tout à zéro, comme au premier chargement du module. */
export function _remiseAZeroPourTests(): void {
  albumsPagines.set(etatInitial());
  generation.set(0);
  chargementEntier = null;
  lettresConnues.clear();
}
