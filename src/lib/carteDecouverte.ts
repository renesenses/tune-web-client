/**
 * Le moteur des cartes de découverte — radios (web#2400) et podcasts
 * (web#2450). Fonctions pures : aucun DOM, aucun réseau.
 *
 * Une carte est un ARBRE qu'on parcourt un niveau à la fois (prototypes
 * validés du 26/10 : « genre → pays → station », et « réseaux ») :
 *
 *   - mode `arbre`, axe `genre` : genres, puis pays, puis éléments ;
 *   - mode `arbre`, axe `pays`  : pays, puis genres, puis éléments ;
 *   - mode `reseaux` : un groupe par réseau (radio) ou producteur (podcast),
 *     ses éléments directement ; les éléments SANS réseau sont rangés dans un
 *     dernier groupe, lui-même subdivisé par l'axe choisi.
 *
 * Le composant (`CarteDecouverte.svelte`) traduit les clés en libellés : ce
 * module ne connaît aucune langue, il compte et il range.
 */
import { fold } from './utils';

export interface ElementCarte {
  /** Identifiant stable (fiche d'annuaire, `source_id` du podcast). */
  id: string;
  nom: string;
  /** Adresse brute de l'image ; le composant la fait passer par le serveur. */
  image?: string | null;
  /** Clé de genre ou de catégorie ('' : sans) : le premier genre. */
  genre: string;
  /** Tous les genres de l'élément (tune-server-rust#7215) : il apparaît sous
   *  CHACUN dans l'arbre. Absent ou vide : le seul `genre`. */
  genres?: readonly string[];
  /** Toutes les catégories de l'élément, pour les « proches ». */
  categories?: readonly string[];
  /** Code pays ISO 3166-1 alpha-2 en majuscules ('' : sans). */
  pays: string;
  /** Réseau (radio) ou producteur (podcast) ; `null` : indépendant. */
  reseau?: string | null;
  /** Podcasts : Tune sait-il lire cette émission ? (absent : oui). */
  lisible?: boolean;
  /** Rang de tri des feuilles (1 = premier) ; absent : ordre alphabétique. */
  rang?: number | null;
  /** Texte de recherche (libellés traduits compris) ; replié ici. */
  texte: string;
}

export type ModeCarte = 'arbre' | 'reseaux';
export type AxeCarte = 'genre' | 'pays';
export type DimensionCarte = 'racine' | 'genre' | 'pays' | 'reseau' | 'sansReseau';

export interface NoeudCarte {
  /** Chemin stable (`genre:jazz/pays:FR`), sert de clé d'affichage. */
  id: string;
  type: 'groupe' | 'element';
  dimension: DimensionCarte;
  /** La clé du groupe dans sa dimension (genre, code pays, réseau). */
  cle: string;
  elements: ElementCarte[];
  enfants: NoeudCarte[];
  parent: NoeudCarte | null;
  element?: ElementCarte;
}

/** Les genres d'un élément : `genres`, sinon `[genre]` ('' : sans). */
export function genresDe(e: ElementCarte): string[] {
  const l = (e.genres ?? []).filter(Boolean);
  return l.length ? [...new Set(l)] : [e.genre || ''];
}
const clesGenre = (e: ElementCarte) => genresDe(e);
const clesPays = (e: ElementCarte) => [e.pays || ''];

function trierFeuilles(els: ElementCarte[]): ElementCarte[] {
  return els.slice().sort((a, b) => (a.rang ?? 1e9) - (b.rang ?? 1e9) || a.nom.localeCompare(b.nom));
}

/** Un élément entre dans le groupe de CHACUNE de ses clés (ses genres, #7215). */
function grouper(els: ElementCarte[], cles: (e: ElementCarte) => readonly string[]): [string, ElementCarte[]][] {
  const m = new Map<string, ElementCarte[]>();
  for (const e of els) {
    for (const k of cles(e)) {
      const l = m.get(k);
      if (l) l.push(e); else m.set(k, [e]);
    }
  }
  // Les plus gros groupes d'abord ; le groupe « sans » en dernier.
  return [...m.entries()].sort((a, b) =>
    Number(a[0] === '') - Number(b[0] === '') || b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

function feuilles(parent: NoeudCarte): NoeudCarte[] {
  return trierFeuilles(parent.elements).map((e) => ({
    id: `${parent.id}/el:${e.id}`, type: 'element', dimension: parent.dimension, cle: e.id,
    elements: [e], enfants: [], parent, element: e,
  }));
}

type Niveau = { dimension: DimensionCarte; cles: (e: ElementCarte) => readonly string[] };
const NIVEAU_GENRE: Niveau = { dimension: 'genre', cles: clesGenre };
const NIVEAU_PAYS: Niveau = { dimension: 'pays', cles: clesPays };

function descendre(parent: NoeudCarte, niveaux: Niveau[]): void {
  if (!niveaux.length) { parent.enfants = feuilles(parent); return; }
  const [n, ...reste] = niveaux;
  parent.enfants = grouper(parent.elements, n.cles).map(([cle, els]) => {
    const g: NoeudCarte = {
      id: `${parent.id}/${n.dimension}:${cle}`, type: 'groupe', dimension: n.dimension, cle,
      elements: els, enfants: [], parent,
    };
    descendre(g, reste);
    return g;
  });
}

/** L'arbre de la carte. */
export function construireArbre(els: readonly ElementCarte[], mode: ModeCarte, axe: AxeCarte): NoeudCarte {
  const racine: NoeudCarte = {
    id: `${mode}-${axe}`, type: 'groupe', dimension: 'racine', cle: '', elements: [...els], enfants: [], parent: null,
  };
  if (mode === 'arbre') {
    descendre(racine, axe === 'genre' ? [NIVEAU_GENRE, NIVEAU_PAYS] : [NIVEAU_PAYS, NIVEAU_GENRE]);
    return racine;
  }
  const avec = racine.elements.filter((e) => e.reseau);
  const sans = racine.elements.filter((e) => !e.reseau);
  racine.enfants = grouper(avec, (e) => [e.reseau ?? '']).map(([cle, l]) => {
    const g: NoeudCarte = { id: `${racine.id}/reseau:${cle}`, type: 'groupe', dimension: 'reseau', cle, elements: l, enfants: [], parent: racine };
    g.enfants = feuilles(g);
    return g;
  });
  if (sans.length) {
    const g: NoeudCarte = { id: `${racine.id}/sansReseau`, type: 'groupe', dimension: 'sansReseau', cle: '', elements: sans, enfants: [], parent: racine };
    descendre(g, [axe === 'genre' ? NIVEAU_GENRE : NIVEAU_PAYS]);
    racine.enfants.push(g);
  }
  return racine;
}

/** Le chemin de la racine jusqu'à `n` compris. */
export function cheminVers(n: NoeudCarte): NoeudCarte[] {
  const out: NoeudCarte[] = [];
  for (let x: NoeudCarte | null = n; x; x = x.parent) out.unshift(x);
  return out;
}

/** Le nœud d'un élément dans l'arbre (le premier trouvé). */
export function noeudDeLElement(racine: NoeudCarte, id: string): NoeudCarte | null {
  const pile = [racine];
  while (pile.length) {
    const n = pile.pop()!;
    if (n.type === 'element' && n.element?.id === id) return n;
    for (const e of n.enfants) pile.push(e);
  }
  return null;
}

/** Les éléments qui répondent à la recherche (nom, libellés, réseau…). */
export function correspondances(els: readonly ElementCarte[], requete: string): Set<string> {
  const m = fold(requete.trim());
  const out = new Set<string>();
  if (!m) return out;
  for (const e of els) if (fold(e.texte).includes(m)) out.add(e.id);
  return out;
}

export type RaisonProche = 'reseau' | 'genre' | 'pays';
export interface Proche { element: ElementCarte; raisons: RaisonProche[] }

/**
 * Les éléments « proches » : même réseau (3), une catégorie commune (2), même
 * pays (1). Retenus à partir de 3, ou pour une catégorie commune seule ; les
 * plus proches d'abord, puis par rang et par nom. Au plus `max`.
 */
export function proches(e: ElementCarte, tous: readonly ElementCarte[], max = 8): Proche[] {
  const cats = new Set([...genresDe(e), ...(e.categories ?? [])].filter(Boolean));
  const out: { element: ElementCarte; raisons: RaisonProche[]; score: number }[] = [];
  for (const o of tous) {
    if (o.id === e.id) continue;
    const raisons: RaisonProche[] = [];
    let score = 0;
    if (e.reseau && o.reseau === e.reseau) { score += 3; raisons.push('reseau'); }
    if ([...genresDe(o), ...(o.categories ?? [])].some((c) => c && cats.has(c))) { score += 2; raisons.push('genre'); }
    if (e.pays && o.pays === e.pays) { score += 1; raisons.push('pays'); }
    if (score >= 3 || (score === 2 && raisons[0] === 'genre')) out.push({ element: o, raisons, score });
  }
  out.sort((a, b) => b.score - a.score || (a.element.rang ?? 1e9) - (b.element.rang ?? 1e9)
    || a.element.nom.localeCompare(b.element.nom));
  return out.slice(0, max).map(({ element, raisons }) => ({ element, raisons }));
}

export interface Place { x: number; y: number; r: number }

/**
 * Disposition des enfants d'un nœud dans une scène `l × h` : spirale de
 * tournesol puis relâchement des recouvrements (même méthode que les
 * prototypes). Les groupes ont une taille selon leur effectif ; les éléments,
 * une taille commune. Déterministe.
 */
export function disposer(poids: readonly number[], feuillesSeules: boolean, l: number, h: number): Place[] {
  const n = poids.length;
  if (!n || l <= 0 || h <= 0) return [];
  const marge = 14, haut = 40, bas = 30;
  const aw = Math.max(1, l - marge * 2), ah = Math.max(1, h - haut - bas);
  let rayons: number[];
  if (feuillesSeules) {
    const r = Math.max(16, Math.min(30, Math.sqrt((aw * ah * 0.5) / (Math.PI * n))));
    rayons = poids.map(() => r);
  } else {
    const w = poids.map((p) => Math.sqrt(p) + 0.7);
    const somme = w.reduce((a, x) => a + x * x, 0);
    const k0 = Math.sqrt((aw * ah * 0.32) / (Math.PI * somme));
    rayons = w.map((x) => Math.max(18, Math.min(70, x * k0)));
  }
  const ecart = feuillesSeules ? 4 : 30;
  const ga = Math.PI * (3 - Math.sqrt(5));
  const cx = l / 2, cy = haut + ah / 2;
  const P: Place[] = rayons.map((r, i) => {
    const rr = Math.sqrt((i + 0.5) / n) * Math.min(aw, ah) * 0.42;
    return { x: cx + Math.cos(i * ga) * rr * (aw / ah > 1 ? 1.3 : 1), y: cy + Math.sin(i * ga) * rr, r };
  });
  const tours = n > 150 ? 90 : n > 60 ? 180 : 360;
  for (let it = 0; it < tours; it++) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = P[i], b = P[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const min = a.r + b.r + ecart;
      if (d < min) { const m = (min - d) / 2; dx /= d; dy /= d; a.x -= dx * m; a.y -= dy * m; b.x += dx * m; b.y += dy * m; }
    }
    for (const p of P) {
      p.x += (cx - p.x) * 0.02; p.y += (cy - p.y) * 0.02;
      const ex = feuillesSeules ? p.r : p.r * 1.3;
      p.x = Math.max(marge + ex, Math.min(l - marge - ex, p.x));
      p.y = Math.max(haut + p.r, Math.min(h - bas - p.r - (feuillesSeules ? 0 : 14), p.y));
    }
  }
  return P.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, r: Math.round(p.r * 10) / 10 }));
}

/** Initiales d'un nom (deux au plus), pour un élément sans image. */
export function initiales(nom: string): string {
  const mots = nom.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  return (((mots[0] ?? '?')[0] ?? '?') + (mots[1]?.[0] ?? '')).toUpperCase();
}

/** Teinte stable d'une chaîne (0..359), pour la pastille d'un élément sans image. */
export function teinte(s: string): number {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/**
 * L'élément suivant au clavier, dans une rangée de `n` (flèches, début, fin).
 * `-1` : aucun. Rend `null` pour une touche qui ne déplace pas.
 */
export function focusSuivant(touche: string, courant: number, n: number): number | null {
  if (!n) return null;
  switch (touche) {
    case 'ArrowRight': case 'ArrowDown': return courant < 0 ? 0 : (courant + 1) % n;
    case 'ArrowLeft': case 'ArrowUp': return courant <= 0 ? n - 1 : courant - 1;
    case 'Home': return 0;
    case 'End': return n - 1;
    default: return null;
  }
}
