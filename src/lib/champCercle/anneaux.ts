/**
 * Tune Circle (rc8, décision de Bertrand du 24/10/2026) — un cercle se dessine
 * comme un ANNEAU : une boucle douce, de la couleur du cercle, nommée sur son
 * trait, qui entoure ses membres ET moi. Ce module est la géométrie pure de
 * ces boucles, sans DOM : le moteur l'applique aux positions en px de l'image
 * courante, les bancs aux positions cibles de la scène.
 *
 * Une boucle est l'enveloppe convexe des disques de ses planètes, chacun
 * gonflé d'une marge : convexe et arrondie, elle contient chaque centre et
 * chaque disque ; la disposition (`scene.ts`) range les membres d'un même
 * cercle côte à côte pour que la boucle d'un cercle ne prenne pas un contact
 * qui n'en est pas.
 */
import type { Cible, NoeudScene, Scene, Vue } from './scene';

export interface Disque { x: number; y: number; r: number }

/** Coordonnées de scène → px du canevas (même formule que le moteur). */
export function versPixels(x: number, y: number, W: number, H: number): [number, number] {
  return [W / 2 + x * W * 0.42, H / 2 + y * H * 0.43];
}

/** Rayon visible d'un nœud, en px (même formule que le moteur). */
export function rayonVisible(c: Pick<Cible, 'sphere' | 'avatar' | 'cluster'>, kind: NoeudScene['kind'], U: number): number {
  const cl = c.cluster ?? 0;
  return Math.max((c.sphere ?? 0) * U * 0.92, c.avatar ?? 0, cl > 0.01 ? Math.max(22, 40 * cl) : 0, kind === 'more' ? 16 : 0);
}

/** Marge de la boucle de rang `rang` autour de ses disques : deux boucles qui m'englobent ne se confondent pas. */
export function margeAnneau(rang: number): number {
  return 12 + 6 * rang;
}

/**
 * L'enveloppe convexe des disques gonflés de `marge`, en polygone plat
 * [x0, y0, x1, y1, …], sens trigonométrique de l'écran. Chaque disque est
 * échantillonné sur `pas` points : assez pour que le trait paraisse rond.
 */
export function enveloppe(disques: readonly Disque[], marge: number, pas = 28): number[] {
  const pts: [number, number][] = [];
  for (const d of disques) {
    const r = Math.max(0, d.r) + marge;
    for (let i = 0; i < pas; i++) {
      const a = (i / pas) * Math.PI * 2;
      pts.push([d.x + Math.cos(a) * r, d.y + Math.sin(a) * r]);
    }
  }
  if (pts.length < 3) return pts.flat();
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const croix = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const bas: [number, number][] = [];
  for (const p of pts) {
    while (bas.length >= 2 && croix(bas[bas.length - 2], bas[bas.length - 1], p) <= 0) bas.pop();
    bas.push(p);
  }
  const haut: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (haut.length >= 2 && croix(haut[haut.length - 2], haut[haut.length - 1], p) <= 0) haut.pop();
    haut.push(p);
  }
  bas.pop(); haut.pop();
  return [...bas, ...haut].flat();
}

/** Le point (x, y) est-il DANS le polygone plat `c` ? (règle pair-impair) */
export function dansContour(c: ArrayLike<number>, x: number, y: number): boolean {
  let dedans = false;
  const n = c.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = c[i * 2]; const yi = c[i * 2 + 1]; const xj = c[j * 2]; const yj = c[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

/** L'indice du sommet le plus avancé dans la direction (dx, dy) : là où le nom se pose sur le trait. */
export function sommetVers(c: ArrayLike<number>, dx: number, dy: number): number {
  let best = 0; let max = -Infinity;
  for (let i = 0; i < c.length / 2; i++) {
    const v = c[i * 2] * dx + c[i * 2 + 1] * dy;
    if (v > max) { max = v; best = i; }
  }
  return best;
}

/** Le point du trait à `distance` px du sommet `depart`, en suivant le contour. */
export function pointSurContour(c: ArrayLike<number>, depart: number, distance: number): { x: number; y: number } {
  const n = c.length / 2;
  if (n === 0) return { x: 0, y: 0 };
  let i = ((depart % n) + n) % n;
  let reste = Math.max(0, distance);
  for (let tour = 0; tour < n * 2; tour++) {
    const j = (i + 1) % n;
    const ax = c[i * 2]; const ay = c[i * 2 + 1]; const bx = c[j * 2]; const by = c[j * 2 + 1];
    const l = Math.hypot(bx - ax, by - ay);
    if (l >= reste && l > 0) { const t = reste / l; return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t }; }
    reste -= l;
    i = j;
  }
  return { x: c[i * 2], y: c[i * 2 + 1] };
}

/** Une boucle prête à dessiner, en px. */
export interface AnneauPx {
  id: string;
  contour: number[];
  /** Où le nom se pose, sur le trait (sommet `ancre`). */
  ancre: number;
  x: number;
  y: number;
}

/**
 * Les disques d'une boucle : moi et ses membres, depuis une fonction qui dit
 * où est chaque nœud (px) et son rayon ; un nœud absent (`null`) est sauté.
 */
export function anneauDepuis(
  n: Pick<NoeudScene, 'id' | 'enclos' | 'rang'>,
  ou: (id: string) => Disque | null,
): AnneauPx | null {
  const disques: Disque[] = [];
  for (const id of n.enclos ?? []) { const d = ou(id); if (d) disques.push(d); }
  if (!disques.length) return null;
  const contour = enveloppe(disques, margeAnneau(n.rang ?? 0));
  // Le nom va du côté de ses membres : de moi (premier disque) vers leur centre.
  const [moi, ...autres] = disques;
  let dx = 0; let dy = -1;
  if (autres.length) {
    const mx = autres.reduce((s, d) => s + d.x, 0) / autres.length - moi.x;
    const my = autres.reduce((s, d) => s + d.y, 0) / autres.length - moi.y;
    const l = Math.hypot(mx, my);
    if (l > 1e-6) { dx = mx / l; dy = my / l; }
  }
  const ancre = sommetVers(contour, dx, dy);
  return { id: n.id, contour, ancre, x: contour[ancre * 2], y: contour[ancre * 2 + 1] };
}

/** Les boucles d'une vue aux positions CIBLES de la scène, pour un canevas W × H (bancs, et toute lecture sans moteur). */
export function anneauxDeVue(s: Scene, v: Vue, W: number, H: number): AnneauPx[] {
  const etat = s.vues[v];
  const U = Math.min(W, H) / 2;
  const parId = new Map(s.noeuds.map((n) => [n.id, n]));
  const ou = (id: string): Disque | null => {
    const c = etat.noeuds[id]; const n = parId.get(id);
    if (!c || !n || (c.alpha ?? 0) <= 0 || c.x == null || c.y == null) return null;
    const [x, y] = versPixels(c.x, c.y, W, H);
    return { x, y, r: rayonVisible(c, n.kind, U) };
  };
  const out: AnneauPx[] = [];
  for (const n of s.noeuds) {
    if (n.kind !== 'ring' || !etat.noeuds[n.id]) continue;
    const a = anneauDepuis(n, ou);
    if (a) out.push(a);
  }
  return out;
}
