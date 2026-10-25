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
