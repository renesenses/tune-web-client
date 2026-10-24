/**
 * Tune Circle (rc8) — le moteur de particules, en Canvas 2D.
 *
 * Indépendant de tout cadriciel : une classe TypeScript qui reçoit un
 * `<canvas>`, une scène en données (`scene.ts`) et un budget (`budget.ts`).
 * Le site pourra en garder une copie versionnée ; l'écran Svelte n'en est
 * qu'une fine coquille.
 *
 * Le canevas ne porte QUE le décor (sphères de points, fils, flux, globe). Tout
 * ce qui se clique est un vrai bouton du DOM posé par-dessus : le moteur dit
 * seulement, à chaque image, où se trouve chaque nœud (`placer`).
 *
 * Garanties :
 * - image fixe sous `prefers-reduced-motion` (budget `anime: false`) : une
 *   seule image, redessinée quand la scène, la vue ou la taille changent ;
 * - boucle arrêtée onglet caché (`boucleImages`) et au démontage ;
 * - aucun appel réseau, aucune allocation de tableau par image ;
 * - transitions maison (interpolation cubique), sans bibliothèque.
 */
import { boucleImages } from '../boucleImages';
import { parBudget, type Budget } from './budget';
import { deprojeter, pointArc, projeter, vecteur, decoderPointsTerre, DEG, type Orientation } from './globe';
import { POINTS_TERRE } from './pointsTerre';
import { cleLien, type Scene, type Vue, type NoeudScene, type GenreLien } from './scene';

export type ModePlacement = 'sphere' | 'avatar' | 'cluster' | 'pin' | 'more';

export interface PlacementNoeud {
  /** Centre, en px CSS dans le canevas. */
  x: number;
  y: number;
  /** Rayon visible, en px CSS. */
  r: number;
  alpha: number;
  mode: ModePlacement;
}

export interface OptionsChamp {
  budget: Budget;
  /** Appelé à chaque image pour chaque nœud : `null` = caché dans cette vue. */
  placer?: (id: string, p: PlacementNoeud | null) => void;
  /** Mode « poser mon lieu » : un clic sur le globe rend un lieu (degrés). */
  surClicGlobe?: (lieu: { lat: number; lon: number }) => void;
  /** Couleurs, lues par l'appelant dans ses jetons CSS. */
  couleurs?: Partial<Couleurs>;
  /** Générateur pseudo-aléatoire (bancs). */
  aleatoire?: () => number;
}

export interface Couleurs { or: string; orClair: string; vert: string; vertClair: string; fil: string; fond: string }
const COULEURS: Couleurs = { or: '#deb268', orClair: '#f3cf86', vert: '#4cc79d', vertClair: '#7fe0bd', fil: '#9fb0b6', fond: 'rgba(15,24,28,.92)' };

type Props = { x: number; y: number; sphere: number; avatar: number; cluster: number; alpha: number };
const CLES: (keyof Props)[] = ['x', 'y', 'sphere', 'avatar', 'cluster', 'alpha'];
interface Anim { de: number; vers: number; t0: number; duree: number }
interface EtatNoeud { n: NoeudScene; cur: Props; anim: Partial<Record<keyof Props, Anim>> }
interface EtatLien { a: string; b: string; w: number; stream: number; animW?: Anim; animS?: Anim; phases: Float32Array }

const DUREE_MS = 1300;
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Points d'une sphère de Fibonacci, en Float32Array [x, y, z, …]. */
function sphere(n: number, rnd: () => number): Float32Array {
  const pts = new Float32Array(n * 3);
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i;
    const j = 1 + (rnd() - 0.5) * 0.04;
    pts[i * 3] = Math.cos(th) * r * j;
    pts[i * 3 + 1] = y * j;
    pts[i * 3 + 2] = Math.sin(th) * r * j;
  }
  return pts;
}

export class ChampCercle {
  private ctx: CanvasRenderingContext2D | null;
  private opts: OptionsChamp;
  private c: Couleurs;
  private rnd: () => number;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private noeuds = new Map<string, EtatNoeud>();
  private liens: EtatLien[] = [];
  private scene: Scene | null = null;
  private vueCourante: Vue = 'genres';
  private sel: string | null = null;
  private hover: string | null = null;
  private time = 0;
  private rot = 0;
  private dernier = 0;
  private arreter: (() => void) | null = null;
  private demande: number | null = null;
  private detruit = false;
  private pose = false;
  private repereLieu: { lat: number; lon: number } | null = null;
  // Particules
  private grand!: Float32Array;
  private petit!: Float32Array;
  private bande!: Float32Array;
  private halo!: Float32Array;
  private terre: [number, number][];
  private terrePhase: Float32Array;
  private arcPh!: Float32Array;
  // Globe
  private G: Orientation & { w: number; anim?: Anim } = { w: 0, lon0: 8 * DEG, tilt: 0.62 };
  private glisse: { x: number; y: number; lon: number; tilt: number; bouge: boolean } | null = null;
  private dernierGlisse = 0;
  private ecouteurs: [string, EventListener][] = [];

  constructor(private canvas: HTMLCanvasElement, opts: OptionsChamp) {
    this.opts = opts;
    this.c = { ...COULEURS, ...(opts.couleurs ?? {}) };
    this.rnd = opts.aleatoire ?? mulberry(20261023);
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = canvas.getContext('2d'); } catch { ctx = null; }
    this.ctx = ctx;
    this.terre = decoderPointsTerre(POINTS_TERRE);
    this.terrePhase = new Float32Array(this.terre.length);
    for (let i = 0; i < this.terrePhase.length; i++) this.terrePhase[i] = this.rnd();
    this.particules();
    this.brancherPointeur();
    this.lancer();
  }

  /** Le canevas a-t-il pu être dessiné ? (`false` : pas de 2D, l'écran garde sa vue liste) */
  get disponible(): boolean { return this.ctx !== null; }

  private particules() {
    const b = this.opts.budget;
    this.grand = sphere(parBudget(2600, b), this.rnd);
    this.petit = sphere(parBudget(560, b), this.rnd);
    const nb = parBudget(560, b);
    this.bande = new Float32Array(nb * 4);
    for (let i = 0; i < nb; i++) {
      this.bande[i * 4] = this.rnd() * 2 - 1;
      this.bande[i * 4 + 1] = this.gauss() * 0.075;
      this.bande[i * 4 + 2] = 0.04 + this.rnd() * 0.1;
      this.bande[i * 4 + 3] = this.rnd();
    }
    const nh = parBudget(760, b);
    this.halo = new Float32Array(nh * 3);
    for (let i = 0; i < nh; i++) {
      this.halo[i * 3] = this.rnd() * Math.PI * 2;
      this.halo[i * 3 + 1] = 1.04 + Math.pow(this.rnd(), 2.2) * 0.5;
      this.halo[i * 3 + 2] = this.rnd();
    }
    this.arcPh = new Float32Array(parBudget(28, b));
    for (let i = 0; i < this.arcPh.length; i++) this.arcPh[i] = this.rnd();
    for (const l of this.liens) l.phases = this.phasesLien();
  }

  private phasesLien(): Float32Array {
    const n = parBudget(110, this.opts.budget);
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p[i * 3] = this.rnd(); p[i * 3 + 1] = this.gauss() * 0.5; p[i * 3 + 2] = 0.08 + this.rnd() * 0.12; }
    return p;
  }

  private gauss(): number {
    let u = 0; let v = 0;
    while (!u) u = this.rnd();
    while (!v) v = this.rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ── API ──────────────────────────────────────────────────────────────────

  /** Nouvelle scène (données relues) : les nœuds connus gardent leur position. */
  majScene(s: Scene) {
    this.scene = s;
    const vus = new Set<string>();
    for (const n of s.noeuds) {
      vus.add(n.id);
      const e = this.noeuds.get(n.id);
      if (e) e.n = n;
      else this.noeuds.set(n.id, { n, cur: { x: 0, y: 0, sphere: 0, avatar: 0, cluster: 0, alpha: 0 }, anim: {} });
    }
    for (const id of [...this.noeuds.keys()]) if (!vus.has(id)) { this.noeuds.delete(id); this.opts.placer?.(id, null); }
    const anciens = new Map(this.liens.map((l) => [cleLien(l.a, l.b), l]));
    this.liens = s.liens.map((l) => anciens.get(cleLien(l.a, l.b)) ?? { a: l.a, b: l.b, w: 0, stream: 0, phases: this.phasesLien() });
    this.vue(this.vueCourante, false);
  }

  /** Passe à une vue, en transition (ou d'un coup : `instant`, ou image fixe). */
  vue(v: Vue, instant = false) {
    this.vueCourante = v;
    if (!this.scene) return;
    const etat = this.scene.vues[v];
    const maintenant = this.maintenant();
    const duree = instant || !this.opts.budget.anime ? 0 : DUREE_MS;
    for (const [id, e] of this.noeuds) {
      const t = etat.noeuds[id];
      const cible: Partial<Props> = { sphere: 0, avatar: 0, cluster: 0, alpha: 0, ...(t ?? {}) };
      // Un nœud qui n'existe pas dans la vue s'efface SUR PLACE.
      if (!t) { delete cible.x; delete cible.y; }
      // Un nœud qui apparaît de nulle part naît à sa place, sans glisser du centre.
      if (t && e.cur.alpha < 0.01 && t.x != null && t.y != null) { e.cur.x = t.x; e.cur.y = t.y; }
      for (const k of CLES) {
        const vers = cible[k];
        if (vers == null) continue;
        if (duree === 0) { e.cur[k] = vers; delete e.anim[k]; }
        else e.anim[k] = { de: e.cur[k], vers, t0: maintenant, duree };
      }
    }
    for (const l of this.liens) {
      const g: GenreLien | undefined = etat.liens[cleLien(l.a, l.b)];
      const w = g ? 1 : 0;
      const s = g === 'stream' ? 1 : 0;
      if (duree === 0) { l.w = w; l.stream = s; l.animW = l.animS = undefined; }
      else { l.animW = { de: l.w, vers: w, t0: maintenant, duree: duree * 0.8 }; l.animS = { de: l.stream, vers: s, t0: maintenant, duree: duree * 0.8 }; }
    }
    const gw = etat.globe ? 1 : 0;
    if (duree === 0) { this.G.w = gw; this.G.anim = undefined; } else this.G.anim = { de: this.G.w, vers: gw, t0: maintenant, duree };
    this.canvas.style.touchAction = etat.globe ? 'none' : 'auto';
    this.demander();
  }

  selection(id: string | null) { this.sel = id; this.demander(); }
  survol(id: string | null) { this.hover = id; this.demander(); }

  /** Mode « poser mon lieu » : le prochain clic sur le globe rend un lieu. */
  modePose(actif: boolean) { this.pose = actif; this.canvas.style.cursor = actif ? 'crosshair' : 'default'; this.demander(); }
  /** Repère du lieu choisi mais pas encore enregistré (degrés), ou `null`. */
  repere(l: { lat: number; lon: number } | null) { this.repereLieu = l; this.demander(); }

  /** Nouveau budget (lecture locale qui commence, fenêtre rétrécie…). */
  majBudget(b: Budget) {
    const avant = this.opts.budget;
    this.opts.budget = b;
    if (avant.facteur !== b.facteur) this.particules();
    if (avant.anime !== b.anime || avant.ips !== b.ips) { this.arreterBoucle(); this.lancer(); }
    if (avant.dprMax !== b.dprMax) this.redimensionner(this.W, this.H);
    this.demander();
  }

  redimensionner(w: number, h: number) {
    this.W = Math.max(0, w);
    this.H = Math.max(0, h);
    const dprBrut = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.dpr = Math.min(this.opts.budget.dprMax, dprBrut);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.ctx?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.demander();
  }

  detruire() {
    this.detruit = true;
    this.arreterBoucle();
    if (this.demande !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.demande);
    this.demande = null;
    for (const [t, f] of this.ecouteurs) this.canvas.removeEventListener(t, f);
    this.ecouteurs = [];
  }

  // ── Boucle ───────────────────────────────────────────────────────────────

  private maintenant(): number { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

  private lancer() {
    if (this.detruit || !this.ctx || !this.opts.budget.anime || typeof requestAnimationFrame === 'undefined') return;
    const ips = this.opts.budget.ips;
    const pas = 1000 / Math.max(1, ips) - 2;
    this.dernier = 0;
    this.arreter = boucleImages((ts) => { this.image(ts); return true; }, { rythme: (m, d) => m - d >= pas });
  }

  private arreterBoucle() { this.arreter?.(); this.arreter = null; }

  /** Image fixe : une seule image, au prochain tour (regroupe les changements). */
  private demander() {
    if (this.detruit || !this.ctx || this.arreter) return;
    if (typeof requestAnimationFrame === 'undefined') { this.dessiner(this.maintenant()); return; }
    if (this.demande !== null) return;
    this.demande = requestAnimationFrame((ts) => { this.demande = null; this.dessiner(ts); });
  }

  private image(ts: number) {
    const dt = Math.min(0.05, (ts - (this.dernier || ts)) / 1000);
    this.dernier = ts;
    this.time += dt;
    this.rot += dt * 0.16;
    if (this.G.w > 0.5 && !this.glisse && !this.pose && this.maintenant() - this.dernierGlisse > 2500) this.G.lon0 += dt * 0.05;
    this.dessiner(ts);
  }

  private avancer(now: number) {
    const pas = (a: Anim | undefined): number | null => {
      if (!a) return null;
      const p = a.duree <= 0 ? 1 : Math.min(1, Math.max(0, (now - a.t0) / a.duree));
      return a.de + (a.vers - a.de) * ease(p);
    };
    const fini = (a: Anim | undefined) => !a || now - a.t0 >= a.duree;
    for (const e of this.noeuds.values()) {
      for (const k of CLES) {
        const a = e.anim[k];
        if (!a) continue;
        e.cur[k] = pas(a)!;
        if (fini(a)) delete e.anim[k];
      }
    }
    for (const l of this.liens) {
      if (l.animW) { l.w = pas(l.animW)!; if (fini(l.animW)) l.animW = undefined; }
      if (l.animS) { l.stream = pas(l.animS)!; if (fini(l.animS)) l.animS = undefined; }
    }
    if (this.G.anim) { this.G.w = pas(this.G.anim)!; if (fini(this.G.anim)) this.G.anim = undefined; }
  }

  // ── Dessin ───────────────────────────────────────────────────────────────

  private pos(p: Props): [number, number] { return [this.W / 2 + p.x * this.W * 0.42, this.H / 2 + p.y * this.H * 0.43]; }
  private get U(): number { return Math.min(this.W, this.H) / 2; }

  private dessiner(_ts: number) {
    const ctx = this.ctx;
    if (!ctx || this.W <= 0 || this.H <= 0) return;
    // Les transitions se comptent sur la MÊME horloge que leur départ
    // (`performance.now()`), pas sur l'horodatage de l'image : les deux
    // peuvent diverger (onglet ralenti, temps virtuel d'un navigateur sans tête).
    this.avancer(this.maintenant());
    ctx.clearRect(0, 0, this.W, this.H);
    this.dessinerGlobe(ctx);
    this.dessinerLiens(ctx);
    this.dessinerNoeuds(ctx);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private dessinerSphere(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, pts: Float32Array, a: number, grand: boolean, hl: boolean) {
    const cr = Math.cos(this.rot); const sr = Math.sin(this.rot); const tl = 0.38; const ct = Math.cos(tl); const stl = Math.sin(tl);
    ctx.fillStyle = this.c.or;
    if (grand) {
      for (let i = 0; i < this.halo.length; i += 3) {
        const t = this.halo[i] + this.rot * 0.25; const rr = this.halo[i + 1]; const s = this.halo[i + 2];
        ctx.globalAlpha = a * (0.05 + 0.18 * s) * (1.5 - rr);
        ctx.fillRect(cx + Math.cos(t) * rr * R, cy + Math.sin(t) * rr * R * 0.97, 1.1, 1.1);
      }
    }
    for (let i = 0; i < pts.length; i += 3) {
      const x1 = pts[i] * cr - pts[i + 2] * sr; const z1 = pts[i] * sr + pts[i + 2] * cr;
      const y2 = pts[i + 1] * ct - z1 * stl; const z2 = pts[i + 1] * stl + z1 * ct;
      const d = (z2 + 1) / 2;
      const s = (grand ? 0.55 : 0.45) + d * (grand ? 1.35 : 0.9);
      ctx.globalAlpha = a * (0.06 + 0.78 * d * d) * (hl ? 1 : 0.9);
      ctx.fillRect(cx + x1 * R - s / 2, cy + y2 * R - s / 2, s, s);
    }
    if (grand) {
      ctx.fillStyle = this.c.orClair;
      for (let i = 0; i < this.bande.length; i += 4) {
        const bx = this.bande[i]; const by = this.bande[i + 1]; const bv = this.bande[i + 2]; const bs = this.bande[i + 3];
        const x = ((((bx + this.time * bv + 1) % 2) + 2) % 2) - 1;
        const fall = Math.pow(1 - Math.abs(x), 1.6);
        const y = by * (0.6 + fall) + Math.sin(this.time * 1.3 + bs * 9) * 0.012;
        ctx.globalAlpha = a * fall * (0.25 + 0.6 * bs);
        const s = 0.8 + bs * 1.6;
        ctx.fillRect(cx + x * R * 0.78, cy + y * R, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  private disque(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, hue: number, a: number, anneau: boolean) {
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue} 32% 52%)`; ctx.fill();
    ctx.lineWidth = anneau ? 2 : 1.2; ctx.strokeStyle = anneau ? this.c.or : 'rgba(236,242,244,.8)'; ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private dessinerGlobe(ctx: CanvasRenderingContext2D) {
    const a = this.G.w;
    if (!this.scene) return;
    if (a < 0.01) {
      for (const n of this.scene.noeuds) if (n.kind === 'pin') this.opts.placer?.(n.id, null);
      return;
    }
    const R = this.U * 0.86; const cx = this.W / 2; const cy = this.H / 2;
    const vis = (x: number, y: number, z: number) => z > 0 || Math.hypot(x - cx, y - cy) > R;
    ctx.globalAlpha = a;
    const gr = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    gr.addColorStop(0, 'rgba(222,178,104,0.07)'); gr.addColorStop(1, 'rgba(222,178,104,0.015)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(222,178,104,0.22)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = this.c.or;
    const pasTerre = this.opts.budget.facteur < 0.3 ? 2 : 1;
    for (let i = 0; i < this.terre.length; i += pasTerre) {
      const d = this.terre[i];
      const [x, y, z] = projeter(d[0], d[1], R, cx, cy, this.G);
      if (z < 0) continue;
      const tw = 0.8 + 0.2 * Math.sin(this.time * 1.6 + this.terrePhase[i] * 40);
      ctx.globalAlpha = a * (0.1 + 0.8 * z * z) * tw;
      const s = 0.7 + z * 1.4;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    const pins = this.scene.noeuds.filter((n) => n.kind === 'pin');
    const moi = pins.find((p) => p.me);
    if (moi) {
      const M = this.noeuds.get(moi.id)!;
      const VM = vecteur(moi.lat!, moi.lon!);
      pins.forEach((p, pi) => {
        if (p.me) return;
        const n = this.noeuds.get(p.id)!;
        const aa = a * Math.min(n.cur.alpha, M.cur.alpha);
        if (aa < 0.01) return;
        const VB = vecteur(p.lat!, p.lon!);
        const om = Math.acos(Math.max(-1, Math.min(1, VM[0] * VB[0] + VM[1] * VB[1] + VM[2] * VB[2])));
        const lift = Math.min(0.42, 0.12 + om * 0.25);
        const hl = this.sel === p.id || this.sel === moi.id || this.hover === p.id;
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = hl ? 'rgba(243,207,134,0.8)' : 'rgba(222,178,104,0.38)'; ctx.lineWidth = hl ? 1.4 : 1;
        ctx.globalAlpha = aa;
        let px = 0; let py = 0; let pv = false;
        for (let i = 0; i <= 48; i++) {
          const t = i / 48; const [la, lo] = pointArc(VM, VB, om, t);
          const P = projeter(la, lo, R, cx, cy, this.G, 1 + Math.sin(Math.PI * t) * lift);
          const v = vis(P[0], P[1], P[2]);
          if (i > 0 && v && pv) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(P[0], P[1]); ctx.stroke(); }
          px = P[0]; py = P[1]; pv = v;
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = this.c.orClair;
        for (let k = 0; k < this.arcPh.length; k++) {
          const t = (this.arcPh[k] + this.time * (0.12 + (k % 5) * 0.012) + pi * 0.37) % 1;
          const [la, lo] = pointArc(VM, VB, om, t);
          const P = projeter(la, lo, R, cx, cy, this.G, 1 + Math.sin(Math.PI * t) * lift);
          if (!vis(P[0], P[1], P[2])) continue;
          ctx.globalAlpha = aa * (0.25 + 0.7 * Math.sin(Math.PI * t));
          ctx.fillRect(P[0] - 1, P[1] - 1, 2, 2);
        }
      });
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const p of pins) {
      const n = this.noeuds.get(p.id)!;
      const aa = a * n.cur.alpha;
      const [x, y, z] = projeter(p.lat!, p.lon!, R, cx, cy, this.G);
      if (aa < 0.01 || z < 0.04) { this.opts.placer?.(p.id, null); continue; }
      const hl = this.sel === p.id || this.hover === p.id;
      const col = p.me ? '222,178,104' : '76,199,157';
      const pulse = this.opts.budget.anime ? (this.time * 0.7 + (p.me ? 0 : 0.5)) % 1 : 0.35;
      ctx.globalAlpha = aa * (1 - pulse) * 0.7;
      ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, (p.me ? 7 : 5) + pulse * 18, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = aa;
      const g2 = ctx.createRadialGradient(x, y, 0, x, y, 14);
      g2.addColorStop(0, `rgba(${col},0.55)`); g2.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.me ? '#f6d796' : this.c.vertClair;
      ctx.beginPath(); ctx.arc(x, y, (p.me ? 4.5 : 3.5) * (hl ? 1.3 : 1), 0, Math.PI * 2); ctx.fill();
      this.opts.placer?.(p.id, { x, y, r: 12, alpha: aa, mode: 'pin' });
    }
    if (this.repereLieu) {
      const [x, y, z] = projeter(this.repereLieu.lat * DEG, this.repereLieu.lon * DEG, R, cx, cy, this.G);
      if (z > 0) {
        ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private rayonNoeud(e: EtatNoeud): number {
    const U = this.U;
    return Math.max(e.cur.sphere * U * 0.92, e.cur.avatar, e.cur.cluster > 0.01 ? Math.max(22, 40 * e.cur.cluster) : 0, e.n.kind === 'more' ? 16 : 0);
  }

  private dessinerLiens(ctx: CanvasRenderingContext2D) {
    for (const l of this.liens) {
      const A = this.noeuds.get(l.a); const B = this.noeuds.get(l.b);
      if (!A || !B) continue;
      const a = l.w * Math.min(A.cur.alpha, B.cur.alpha);
      if (a < 0.01) continue;
      const [ax, ay] = this.pos(A.cur); const [bx, by] = this.pos(B.cur);
      const dx = bx - ax; const dy = by - ay; const len = Math.hypot(dx, dy) || 1; const ux = dx / len; const uy = dy / len;
      const ra = this.rayonNoeud(A); const rb = this.rayonNoeud(B);
      const sx = ax + ux * ra; const sy = ay + uy * ra; const ex = bx - ux * rb; const ey = by - uy * rb;
      const hl = this.sel != null && (this.sel === l.a || this.sel === l.b);
      ctx.globalAlpha = a * (1 - l.stream * 0.6) * (hl ? 0.55 : 0.28);
      ctx.strokeStyle = hl ? this.c.or : this.c.fil; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      if (l.stream > 0.01) {
        ctx.fillStyle = '#e9c27a';
        const seg = Math.hypot(ex - sx, ey - sy);
        const p = l.phases;
        for (let i = 0; i < p.length; i += 3) {
          const t = (p[i] + this.time * p[i + 2]) % 1;
          const env = Math.sin(Math.PI * t);
          const off = (p[i + 1] + Math.sin(this.time * 2 + t * 10 + p[i + 1] * 5) * 0.25) * env * Math.min(26, seg * 0.08);
          ctx.globalAlpha = a * l.stream * (0.15 + 0.6 * env);
          ctx.fillRect(sx + (ex - sx) * t - uy * off, sy + (ey - sy) * t + ux * off, 1.4, 1.4);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  private dessinerNoeuds(ctx: CanvasRenderingContext2D) {
    const U = this.U;
    ctx.globalCompositeOperation = 'lighter';
    for (const [id, e] of this.noeuds) {
      if (e.n.kind === 'pin' || e.cur.alpha < 0.01 || e.cur.sphere < 0.01) continue;
      const [x, y] = this.pos(e.cur);
      const grand = e.cur.sphere > 0.25;
      this.dessinerSphere(ctx, x, y, e.cur.sphere * U, grand ? this.grand : this.petit, e.cur.alpha, e.cur.sphere > 0.3, this.sel === id || this.hover === id);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const [id, e] of this.noeuds) {
      if (e.n.kind === 'pin') continue;
      if (e.cur.alpha < 0.01) { this.opts.placer?.(id, null); continue; }
      const [x, y] = this.pos(e.cur);
      const hl = this.sel === id || this.hover === id;
      let mode: ModePlacement = 'sphere';
      if (e.cur.avatar > 0.5) {
        this.disque(ctx, x, y, e.cur.avatar * (hl ? 1.25 : 1), e.n.hue, e.cur.alpha, hl);
        mode = 'avatar';
      }
      if (e.cur.cluster > 0.01) {
        mode = 'cluster';
        const c = e.cur.cluster; const a = e.cur.alpha * Math.min(1, c * 3); const cr = Math.max(22, 40 * c);
        ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(x, y, cr, 0, Math.PI * 2);
        ctx.fillStyle = this.c.fond; ctx.fill();
        ctx.strokeStyle = hl ? this.c.or : 'rgba(236,242,244,.16)'; ctx.lineWidth = hl ? 1.6 : 1; ctx.stroke();
        const teintes = e.n.memberHues ?? [];
        const nb = Math.min(teintes.length, 8);
        for (let i = 0; i < nb; i++) {
          const ang = i * ((Math.PI * 2) / nb) + this.time * 0.12 + id.length;
          this.disque(ctx, x + Math.cos(ang) * (cr + 12), y + Math.sin(ang) * (cr + 12), 7, teintes[i], a * 0.95, false);
        }
      }
      if (e.n.kind === 'more') mode = 'more';
      this.opts.placer?.(id, { x, y, r: this.rayonNoeud(e), alpha: e.cur.alpha, mode });
    }
    ctx.globalAlpha = 1;
  }

  // ── Pointeur : faire tourner le globe, y poser son lieu ──────────────────

  private brancherPointeur() {
    const sur = (t: string, f: (e: PointerEvent) => void) => {
      const g = f as unknown as EventListener;
      this.canvas.addEventListener(t, g);
      this.ecouteurs.push([t, g]);
    };
    sur('pointerdown', (e) => {
      if (this.G.w < 0.5) return;
      this.glisse = { x: e.clientX, y: e.clientY, lon: this.G.lon0, tilt: this.G.tilt, bouge: false };
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* navigateur ancien */ }
    });
    sur('pointermove', (e) => {
      const g = this.glisse;
      if (!g) return;
      const dx = e.clientX - g.x; const dy = e.clientY - g.y;
      if (Math.hypot(dx, dy) > 4) g.bouge = true;
      if (!g.bouge) return;
      this.G.lon0 = g.lon - dx * 0.006;
      this.G.tilt = Math.max(-0.3, Math.min(1.25, g.tilt + dy * 0.004));
      this.canvas.style.cursor = 'grabbing';
      this.demander();
    });
    const fin = (e: PointerEvent, annule: boolean) => {
      const g = this.glisse;
      this.glisse = null;
      this.canvas.style.cursor = this.pose ? 'crosshair' : 'default';
      if (!g) return;
      this.dernierGlisse = this.maintenant();
      if (annule || g.bouge || !this.pose || !this.opts.surClicGlobe) return;
      const r = this.canvas.getBoundingClientRect();
      const lieu = deprojeter(e.clientX - r.left, e.clientY - r.top, this.U * 0.86, this.W / 2, this.H / 2, this.G);
      if (lieu) this.opts.surClicGlobe(lieu);
    };
    sur('pointerup', (e) => fin(e, false));
    sur('pointercancel', (e) => fin(e, true));
  }

  /** Tourne le globe d'un pas (clavier : flèches). */
  tourner(dLon: number, dTilt = 0) {
    this.G.lon0 += dLon;
    this.G.tilt = Math.max(-0.3, Math.min(1.25, this.G.tilt + dTilt));
    this.dernierGlisse = this.maintenant();
    this.demander();
  }

  /** Centre le globe sur un lieu (degrés). */
  centrerSur(lat: number, lon: number) {
    this.G.lon0 = lon * DEG;
    this.G.tilt = Math.max(-0.3, Math.min(1.25, lat * DEG));
    this.dernierGlisse = this.maintenant();
    this.demander();
  }
}
