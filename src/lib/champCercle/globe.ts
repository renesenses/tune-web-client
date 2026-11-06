/**
 * Tune Circle (rc8) — projection orthographique du globe, et son inverse.
 * Fonctions pures, en radians, sans DOM.
 *
 * Le globe tourne autour de l'axe des pôles (`lon0`, longitude au centre) et
 * s'incline vers l'observateur (`tilt`, positif = on voit le nord par-dessus).
 */

export const DEG = Math.PI / 180;

export interface Orientation {
  /** Longitude au centre de l'image, en radians. */
  lon0: number;
  /** Inclinaison, en radians. */
  tilt: number;
}

/**
 * Projette (lat, lon) sur l'image : rend [x, y, z], `z > 0` = face visible.
 * `alt` (≥ 1) éloigne le point du centre, pour les arcs qui décollent.
 */
export function projeter(lat: number, lon: number, R: number, cx: number, cy: number, o: Orientation, alt = 1): [number, number, number] {
  const cl = Math.cos(lat);
  const x = cl * Math.sin(lon - o.lon0);
  const y = Math.sin(lat);
  const z = cl * Math.cos(lon - o.lon0);
  const ct = Math.cos(o.tilt);
  const st = Math.sin(o.tilt);
  const y2 = y * ct - z * st;
  const z2 = y * st + z * ct;
  return [cx + x * R * alt, cy - y2 * R * alt, z2];
}

/**
 * L'inverse : le point (px, py) de l'image désigne quel lieu de la face
 * visible ? `null` hors du disque. Rend des DEGRÉS, longitude dans [-180, 180].
 * C'est ce qui sert à poser son lieu d'un clic sur le globe.
 */
export function deprojeter(px: number, py: number, R: number, cx: number, cy: number, o: Orientation): { lat: number; lon: number } | null {
  if (!(R > 0)) return null;
  const x = (px - cx) / R;
  const y2 = -(py - cy) / R;
  const d = x * x + y2 * y2;
  if (d > 1) return null;
  const z2 = Math.sqrt(1 - d);
  const ct = Math.cos(o.tilt);
  const st = Math.sin(o.tilt);
  const y = y2 * ct + z2 * st;
  const z = -y2 * st + z2 * ct;
  const lat = Math.asin(Math.max(-1, Math.min(1, y))) / DEG;
  let lon = (Math.atan2(x, z) + o.lon0) / DEG;
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return { lat, lon };
}

/** Vecteur unitaire d'un lieu, pour les arcs de grand cercle. */
export function vecteur(lat: number, lon: number): [number, number, number] {
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

/** Point à la fraction `t` de l'arc de grand cercle A→B (angle `om`), en [lat, lon]. */
export function pointArc(A: [number, number, number], B: [number, number, number], om: number, t: number): [number, number] {
  const s = Math.sin(om) || 1e-6;
  const k1 = Math.sin((1 - t) * om) / s;
  const k2 = Math.sin(t * om) / s;
  const v = [A[0] * k1 + B[0] * k2, A[1] * k1 + B[1] * k2, A[2] * k1 + B[2] * k2];
  return [Math.asin(Math.max(-1, Math.min(1, v[2]))), Math.atan2(v[1], v[0])];
}

/** Décode la grille versionnée « lat×10,lon×10,… » en [lat, lon] radians. */
export function decoderPointsTerre(brut: string): [number, number][] {
  const v = brut.split(',').map(Number);
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < v.length; i += 2) {
    if (Number.isFinite(v[i]) && Number.isFinite(v[i + 1])) pts.push([(v[i] / 10) * DEG, (v[i + 1] / 10) * DEG]);
  }
  return pts;
}

/**
 * Décode les frontières versionnées (« lat×10,lon×10,… » séparées par « ; »)
 * en polylignes [lat, lon, lat, lon, …] en radians. Une polyligne de moins de
 * deux points valides est écartée.
 */
export function decoderFrontieres(brut: string): Float32Array[] {
  const polys: Float32Array[] = [];
  for (const morceau of brut.split(';')) {
    const v = morceau.split(',').map(Number);
    const pts: number[] = [];
    for (let i = 0; i + 1 < v.length; i += 2) {
      if (Number.isFinite(v[i]) && Number.isFinite(v[i + 1])) pts.push((v[i] / 10) * DEG, (v[i + 1] / 10) * DEG);
    }
    if (pts.length >= 4) polys.push(Float32Array.from(pts));
  }
  return polys;
}

/**
 * Parcourt une polyligne projetée en orthographique et n'en rend que la part
 * VISIBLE : `debut(x, y)` ouvre un tronçon, `suite(x, y)` le prolonge. Un
 * segment qui passe derrière le globe est coupé au limbe : le point où
 * `z = 0` est cherché par interpolation (la rotation est linéaire, donc `z`
 * aussi le long du segment), puis posé sur le cercle de rayon R.
 * Aucune allocation de tableau : le moteur l'appelle à chaque image.
 */
export function parcourirPolyligne(
  poly: ArrayLike<number>, R: number, cx: number, cy: number, o: Orientation,
  debut: (x: number, y: number) => void, suite: (x: number, y: number) => void,
): void {
  const cl0 = Math.cos(o.tilt); const sl0 = Math.sin(o.tilt);
  let px = 0; let py = 0; let pz = 0; let pv = false;
  for (let i = 0; i + 1 < poly.length; i += 2) {
    const lat = poly[i]; const lon = poly[i + 1];
    const cl = Math.cos(lat);
    const x = cl * Math.sin(lon - o.lon0);
    const y = Math.sin(lat);
    const zz = cl * Math.cos(lon - o.lon0);
    const vy = -(y * cl0 - zz * sl0);
    const z = y * sl0 + zz * cl0;
    const v = z > 0;
    if (i > 0 && v !== pv) {
      // Le point du limbe, entre le précédent et celui-ci.
      const t = pz / (pz - z);
      let lx = px + (x - px) * t; let ly = py + (vy - py) * t;
      const n = Math.hypot(lx, ly) || 1;
      lx /= n; ly /= n;
      if (pv) suite(cx + lx * R, cy + ly * R);
      else { debut(cx + lx * R, cy + ly * R); suite(cx + x * R, cy + vy * R); }
    } else if (v) {
      if (i === 0) debut(cx + x * R, cy + vy * R);
      else suite(cx + x * R, cy + vy * R);
    }
    px = x; py = vy; pz = z; pv = v;
  }
}

/** Les tronçons visibles d'une polyligne, en px [x0, y0, x1, y1, …] (bancs, et ce qui veut des tableaux). */
export function decouperPolyligne(poly: ArrayLike<number>, R: number, cx: number, cy: number, o: Orientation): number[][] {
  const troncons: number[][] = [];
  parcourirPolyligne(poly, R, cx, cy, o,
    (x, y) => { troncons.push([x, y]); },
    (x, y) => { troncons[troncons.length - 1].push(x, y); });
  return troncons;
}

/**
 * Le pays sous un lieu (degrés) : le code du point de terre le plus proche
 * dans un rayon `rayonDeg` (la grille est au pas de 1,6°), ou `null` en mer,
 * trop loin de toute terre, ou sur un point sans pays (`--`).
 * `terre` est en radians, `codes` donne deux lettres par point.
 */
export function paysSous(lieu: { lat: number; lon: number }, terre: readonly (readonly [number, number])[], codes: string, rayonDeg = 1.2): string | null {
  const [ax, ay, az] = vecteur(lieu.lat * DEG, lieu.lon * DEG);
  const seuil = Math.cos(rayonDeg * DEG);
  let meilleur = -1; let proche = seuil;
  for (let i = 0; i < terre.length; i++) {
    const [la, lo] = terre[i];
    const cl = Math.cos(la);
    const p = ax * cl * Math.cos(lo) + ay * cl * Math.sin(lo) + az * Math.sin(la);
    if (p >= proche) { proche = p; meilleur = i; }
  }
  if (meilleur < 0) return null;
  const code = codes.slice(meilleur * 2, meilleur * 2 + 2);
  return /^[A-Z]{2}$/.test(code) ? code : null;
}
