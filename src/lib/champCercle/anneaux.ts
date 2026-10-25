/**
 * Tune Circle (rc8, décision de Bertrand du 24/10/2026) — un cercle se dessine
 * comme un ANNEAU : une boucle douce, de la couleur du cercle, nommée sur son
 * trait, qui entoure ses membres ET moi. Ce module est la géométrie pure de
 * ces boucles, sans DOM : le moteur l'applique aux positions en px de l'image
 * courante, les bancs aux positions cibles de la scène.
 *
 * Depuis le 25/10/2026 une boucle est une FORME LISSÉE (`formeLissee`) : mon
 * disque, ceux de ses membres et un bras fin vers chacun, fondus en une seule
 * forme douce ; son nom se pose DEHORS, sans couvrir un nom (`placerEtiquettes`).
 * `enveloppe` (convexe) reste pour qui en a besoin.
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

// ── Forme lissée (25/10/2026, « inspire-toi de Levente ») ─────────────────
//
// L'enveloppe convexe faisait de grands polygones qui traversaient la scène et
// se croisaient. Un anneau est désormais une « métaballe » : le disque de moi,
// le disque de chaque membre, et un bras fin de moi vers chacun, fondus par une
// union douce (smooth-min des distances signées). La forme suit les fils au
// lieu de couvrir la scène, et reste d'un seul tenant (tout passe par moi).

/** Rondeur des jonctions (px) : l'union douce bombe d'au plus `k / 4`. */
export const DOUCEUR = 26;

/** Demi-largeur du bras de moi vers un membre, pour l'anneau de marge `marge`. */
export function demiBras(marge: number): number {
  return Math.max(6, marge * 0.55);
}

type Prim = { kind: 'd'; x: number; y: number; r: number } | { kind: 'b'; ax: number; ay: number; bx: number; by: number; r: number };

function distPrim(p: Prim, x: number, y: number): number {
  if (p.kind === 'd') return Math.hypot(x - p.x, y - p.y) - p.r;
  const dx = p.bx - p.ax; const dy = p.by - p.ay; const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((x - p.ax) * dx + (y - p.ay) * dy) / l2)) : 0;
  return Math.hypot(x - (p.ax + t * dx), y - (p.ay + t * dy)) - p.r;
}

/** Union douce (smooth-min polynomial) : toujours ≤ au min, jamais plus bas que min − k/4. */
function champ(prims: readonly Prim[], x: number, y: number, k: number): number {
  let d = Infinity;
  for (const p of prims) {
    const b = distPrim(p, x, y);
    if (d === Infinity) { d = b; continue; }
    const h = Math.max(k - Math.abs(d - b), 0) / k;
    d = Math.min(d, b) - (h * h * k) / 4;
  }
  return d;
}

/** Taille (px) d'une maille de la grille où se lit la forme. */
export const MAILLE = 5;

/**
 * La forme lissée d'un anneau, en polygone plat [x0, y0, …] : le premier
 * disque est le centre (moi), les autres ses membres ; chacun est gonflé de
 * `marge` et relié au centre par un bras de demi-largeur `demiBras(marge)`,
 * le tout fondu par une union douce de rondeur `k`. Le contour est la ligne
 * de niveau 0 du champ, lue sur une grille de `maille` px (carrés marchants)
 * et interpolée : il contient chaque disque gonflé et chaque bras.
 */
export function formeLissee(disques: readonly Disque[], marge: number, maille = MAILLE, k = DOUCEUR): number[] {
  if (!disques.length) return [];
  const [c, ...autres] = disques;
  const w = demiBras(marge);
  const prims: Prim[] = [{ kind: 'd', x: c.x, y: c.y, r: Math.max(0, c.r) + marge }];
  for (const d of autres) {
    prims.push({ kind: 'd', x: d.x, y: d.y, r: Math.max(0, d.r) + marge });
    prims.push({ kind: 'b', ax: c.x, ay: c.y, bx: d.x, by: d.y, r: w });
  }
  // La boîte de la forme, plus de quoi rester dehors sur tout le pourtour.
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const p of prims) {
    if (p.kind !== 'd') continue;
    x0 = Math.min(x0, p.x - p.r); y0 = Math.min(y0, p.y - p.r); x1 = Math.max(x1, p.x + p.r); y1 = Math.max(y1, p.y + p.r);
  }
  const bord = k / 4 + maille * 2;
  x0 -= bord; y0 -= bord; x1 += bord; y1 += bord;
  const nx = Math.ceil((x1 - x0) / maille) + 1; const ny = Math.ceil((y1 - y0) / maille) + 1;
  const f = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) f[j * nx + i] = champ(prims, x0 + i * maille, y0 + j * maille, k);
  // Un point sur chaque arête traversée, puis les segments de chaque maille (carrés marchants).
  const val = (i: number, j: number) => f[j * nx + i];
  const pointArete = (cle: number): [number, number] => {
    const h = cle % 2 === 0; const q = Math.floor(cle / 2); const i = q % nx; const j = Math.floor(q / nx);
    const a = val(i, j); const b = h ? val(i + 1, j) : val(i, j + 1);
    const t = a === b ? 0.5 : a / (a - b);
    return h ? [x0 + (i + t) * maille, y0 + j * maille] : [x0 + i * maille, y0 + (j + t) * maille];
  };
  const H = (i: number, j: number) => (j * nx + i) * 2; // arête horizontale (i, j) → (i + 1, j)
  const V = (i: number, j: number) => (j * nx + i) * 2 + 1; // arête verticale (i, j) → (i, j + 1)
  const voisins = new Map<number, number[]>();
  const relier = (p: number, q: number) => {
    (voisins.get(p) ?? voisins.set(p, []).get(p)!).push(q);
    (voisins.get(q) ?? voisins.set(q, []).get(q)!).push(p);
  };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = val(i, j) <= 0; const b = val(i + 1, j) <= 0; const cc = val(i + 1, j + 1) <= 0; const d = val(i, j + 1) <= 0;
      const cas = (a ? 1 : 0) | (b ? 2 : 0) | (cc ? 4 : 0) | (d ? 8 : 0);
      if (cas === 0 || cas === 15) continue;
      const haut = H(i, j); const bas = H(i, j + 1); const gauche = V(i, j); const droite = V(i + 1, j);
      switch (cas) {
        case 1: case 14: relier(gauche, haut); break;
        case 2: case 13: relier(haut, droite); break;
        case 3: case 12: relier(gauche, droite); break;
        case 4: case 11: relier(droite, bas); break;
        case 6: case 9: relier(haut, bas); break;
        case 7: case 8: relier(gauche, bas); break;
        case 5: case 10: {
          // Selle : le centre de la maille tranche.
          const centre = (val(i, j) + val(i + 1, j) + val(i + 1, j + 1) + val(i, j + 1)) / 4 <= 0;
          if ((cas === 5) === centre) { relier(gauche, bas); relier(haut, droite); } else { relier(gauche, haut); relier(droite, bas); }
          break;
        }
      }
    }
  }
  // Les boucles ; la plus longue est le contour (la forme est d'un seul tenant).
  const vu = new Set<number>();
  let meilleure: number[] = [];
  for (const depart of voisins.keys()) {
    if (vu.has(depart)) continue;
    const boucle: number[] = [];
    let prec = -1; let cur = depart;
    while (!vu.has(cur)) {
      vu.add(cur); boucle.push(cur);
      const v = voisins.get(cur)!;
      const suiv = v[0] !== prec ? v[0] : v[1];
      if (suiv == null) break;
      prec = cur; cur = suiv;
    }
    if (boucle.length > meilleure.length / 2) {
      const pts = boucle.flatMap(pointArete);
      if (pts.length > meilleure.length) meilleure = pts;
    }
  }
  return meilleure;
}

// ── Étiquettes sans collision ─────────────────────────────────────────────

/** Une boîte, en px : coin haut-gauche (x, y), largeur, hauteur. */
export interface Boite { x: number; y: number; w: number; h: number }

/** Recouvrement (aire, px²) de deux boîtes. */
export function recouvrement(a: Boite, b: Boite): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Largeur estimée d'un texte (px) : majorant prudent, sans DOM, le même partout. */
export function largeurTexte(texte: string, px: number): number {
  return Math.ceil([...texte].length * px * 0.64) + 2;
}

/** Ce qu'occupe un nœud à l'écran, pour les étiquettes des anneaux. */
export interface NoeudVisible {
  x: number; y: number; r: number;
  mode: 'sphere' | 'avatar' | 'cluster' | 'pin' | 'more';
  label: string;
  /** Une ligne d'albums sous le nom. */
  albums?: boolean;
}

/** Les boîtes que les étiquettes des anneaux doivent éviter : le disque ET le nom de chaque nœud (même gabarit que le CSS). */
export function boitesDesNoeuds(noeuds: readonly NoeudVisible[]): Boite[] {
  const out: Boite[] = [];
  for (const n of noeuds) {
    const r = Math.max(8, n.r);
    out.push({ x: n.x - r, y: n.y - r, w: r * 2, h: r * 2 });
    if (n.mode === 'pin' || n.mode === 'more' || n.mode === 'cluster' || !n.label) continue;
    if (n.mode === 'sphere' && n.r > 60) {
      // Grand nom écrit DANS la sphère : déjà couvert par son disque.
      continue;
    }
    const px = n.mode === 'avatar' ? 11 : 13;
    const w = Math.min(n.mode === 'avatar' ? 110 : 220, largeurTexte(n.label, px));
    const h = n.mode === 'avatar' ? 15 : (n.albums ? 34 : 19);
    out.push({ x: n.x - w / 2, y: n.y + r + 2, w, h });
  }
  return out;
}

/** Hauteur de l'étiquette d'un anneau (px), et sa largeur pour un nom (police 12 px, 10 px de marge de chaque côté). */
export const HAUTEUR_ETIQUETTE = 22;
export function largeurEtiquette(nom: string): number {
  return Math.min(180, largeurTexte(nom, 12)) + 24;
}

/** L'étiquette posée d'un anneau : son centre (x, y), sa boîte (lunes comprises), et où commencent ses lunes. */
export interface EtiquettePosee { id: string; x: number; y: number; boite: Boite; lunesX: number }

/** Écart (px) entre le bord de la forme et l'étiquette. */
export const ECART_ETIQUETTE = 8;

/**
 * Pose le nom de chaque anneau À L'EXTÉRIEUR de sa forme, sans couper une
 * boîte de `obstacles` (disques et noms des membres), ni une étiquette déjà
 * posée, ni le bord de la scène W × H. Candidats : des points du contour,
 * l'étiquette poussée le long de la normale sortante. Le moins
 * de recouvrement gagne ; à égalité, le côté de ses membres (`dx, dy`).
 * `enPlus` : place à réserver à droite du nom (ses lunes), en px.
 */
export function placerEtiquettes(
  anneaux: readonly { id: string; contour: ArrayLike<number>; cx: number; cy: number; dx: number; dy: number; largeur: number; enPlus?: number }[],
  obstacles: readonly Boite[],
  W: number,
  H: number,
): EtiquettePosee[] {
  const poses: EtiquettePosee[] = [];
  const h = HAUTEUR_ETIQUETTE;
  for (const a of anneaux) {
    const n = a.contour.length / 2;
    const wNom = a.largeur; const w = wNom + (a.enPlus ?? 0);
    let best: EtiquettePosee | null = null; let bestScore = Infinity;
    const pas = Math.max(1, Math.floor(n / 72));
    for (let i = 0; i < n; i += pas) {
      const px = a.contour[i * 2]; const py = a.contour[i * 2 + 1];
      // La normale sortante du contour en ce point (la forme n'est pas étoilée : pas le rayon depuis moi).
      const g = ((i - 2) % n + n) % n; const d = (i + 2) % n;
      let ux = a.contour[d * 2 + 1] - a.contour[g * 2 + 1]; let uy = -(a.contour[d * 2] - a.contour[g * 2]);
      const ln = Math.hypot(ux, uy);
      if (ln < 1e-9) continue;
      ux /= ln; uy /= ln;
      if (dansContour(a.contour, px + ux * 2, py + uy * 2)) { ux = -ux; uy = -uy; }
      const l = Math.hypot(px - a.cx, py - a.cy);
      // La boîte touche le contour par son coin ou son bord le plus proche, vers l'extérieur.
      const demi = Math.abs(ux) * (w / 2) + Math.abs(uy) * (h / 2);
      const bx = px + ux * (demi + ECART_ETIQUETTE); const by = py + uy * (demi + ECART_ETIQUETTE);
      const boite: Boite = { x: bx - w / 2, y: by - h / 2, w, h };
      let gene = 0;
      for (const o of obstacles) gene += recouvrement(boite, o);
      for (const p of poses) gene += recouvrement(boite, p.boite) * 2;
      // Une étiquette qui sort de la scène compte comme un recouvrement.
      const dehors = Math.max(0, -boite.x) + Math.max(0, boite.x + w - W) + Math.max(0, -boite.y) + Math.max(0, boite.y + h - H);
      // L'étiquette ne doit pas non plus mordre sur sa propre forme (coins, centre, centre du nom).
      let surForme = 0;
      for (const [qx, qy] of [[boite.x, boite.y], [boite.x + w, boite.y], [boite.x, boite.y + h], [boite.x + w, boite.y + h], [bx, by], [boite.x + wNom / 2, by]]) {
        if (dansContour(a.contour, qx, qy)) surForme += 1;
      }
      const score = (gene + dehors * h + surForme * w * h) * 1000 - (ux * a.dx + uy * a.dy) * 20 + l * 0.01;
      if (score < bestScore) { bestScore = score; best = { id: a.id, x: boite.x + wNom / 2, y: by, boite, lunesX: boite.x + wNom + 10 }; }
    }
    // (x, y) : le centre du NOM ; la boîte porte aussi ses lunes, à droite.
    if (best) poses.push(best);
  }
  return poses;
}

/** Une boucle prête à dessiner, en px. */
export interface AnneauPx {
  id: string;
  contour: number[];
  /** Le sommet du contour du côté de ses membres. */
  ancre: number;
  x: number;
  y: number;
  /** Centre de la forme (moi) et direction de ses membres : pour poser son nom. */
  cx: number;
  cy: number;
  dx: number;
  dy: number;
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
  const contour = formeLissee(disques, margeAnneau(n.rang ?? 0));
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
  return { id: n.id, contour, ancre, x: contour[ancre * 2], y: contour[ancre * 2 + 1], cx: moi.x, cy: moi.y, dx, dy };
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

/**
 * Les étiquettes des anneaux d'une vue aux positions CIBLES (bancs) : les
 * boîtes des nœuds visibles, puis le placement sans collision.
 */
export function etiquettesDeVue(s: Scene, v: Vue, W: number, H: number, enPlus: (id: string) => number = () => 0): { anneaux: AnneauPx[]; noeuds: Boite[]; etiquettes: EtiquettePosee[] } {
  const etat = s.vues[v];
  const U = Math.min(W, H) / 2;
  const anneaux = anneauxDeVue(s, v, W, H);
  const visibles: NoeudVisible[] = [];
  for (const n of s.noeuds) {
    const c = etat.noeuds[n.id];
    if (!c || n.kind === 'ring' || (c.alpha ?? 0) <= 0 || c.x == null || c.y == null) continue;
    const [x, y] = versPixels(c.x, c.y, W, H);
    const mode: NoeudVisible['mode'] = n.kind === 'pin' ? 'pin' : n.kind === 'more' ? 'more' : (c.cluster ?? 0) > 0.01 ? 'cluster' : (c.avatar ?? 0) > 0.5 ? 'avatar' : 'sphere';
    visibles.push({ x, y, r: rayonVisible(c, n.kind, U), mode, label: n.label, albums: n.albums != null });
  }
  const noeuds = boitesDesNoeuds(visibles);
  const parId = new Map(s.noeuds.map((n) => [n.id, n]));
  const etiquettes = placerEtiquettes(
    anneaux.map((a) => ({ ...a, largeur: largeurEtiquette(parId.get(a.id)?.label ?? ''), enPlus: enPlus(a.id) })),
    noeuds, W, H,
  );
  return { anneaux, noeuds, etiquettes };
}
