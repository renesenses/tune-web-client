/**
 * Tune Circle, vue Monde : le ZOOM du globe (web#2521, chantier web#2574).
 *
 * Fonctions pures, sans DOM : le moteur (`moteur.ts`) les appelle, les bancs
 * les vérifient. Le globe reste une projection orthographique centrée dans le
 * canevas ; zoomer, c'est agrandir son rayon (`R = rayonBase × k`), et se
 * déplacer sur le globe zoomé, c'est le TOURNER (`lon0`, `tilt`). Un lieu
 * visé (curseur, doigts, double-clic) reste sous le pointeur pendant le zoom.
 *
 * Confidentialité : rien ici ne touche aux données. Les cases de la carte
 * publique restent de 1°, les lieux du cercle restent arrondis au demi-degré
 * avant l'envoi ; zoomer agrandit l'image, jamais la précision.
 */
import { deprojeter, DEG, type Orientation } from './globe';

/** Vue entière. */
export const ZOOM_MIN = 1;
/** Une région (un pays d'Europe remplit à peu près la scène). */
export const ZOOM_MAX = 12;
/** Un cran des boutons + / − et des touches. */
export const PAS_ZOOM = 1.6;
/** Le double-clic ou le double-tap. */
export const PAS_DOUBLE = 2;
/** Durée d'une transition de zoom (0 sous `prefers-reduced-motion`). */
export const DUREE_ZOOM_MS = 260;

/** Inclinaison en vue entière : on voit le nord par-dessus, comme avant le zoom. */
const TILT_ENTIER: readonly [number, number] = [-0.3, 1.25];
/** Zoomé : les deux hémisphères se centrent (Australie, Patagonie…), sans passer le pôle. */
const TILT_ZOOME: readonly [number, number] = [-80 * DEG, 80 * DEG];

/** Le zoom, borné ; une valeur absurde (NaN, ±∞) vaut la vue entière. */
export function bornerZoom(k: number): number {
  if (!Number.isFinite(k)) return k === Infinity ? ZOOM_MAX : ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));
}

/** L'inclinaison permise à ce zoom. */
export function bornerInclinaison(tilt: number, k: number): number {
  const [lo, hi] = k > ZOOM_MIN + 1e-6 ? TILT_ZOOME : TILT_ENTIER;
  return Math.min(hi, Math.max(lo, tilt));
}

/**
 * Molette (et pincement du pavé tactile, que les navigateurs envoient en
 * molette avec `ctrlKey`) : un zoom exponentiel, indépendant du sens de
 * défilement de la plateforme. `deltaY < 0` (vers le haut) rapproche.
 */
export function zoomMolette(k: number, deltaY: number, modeLignes = false): number {
  const d = modeLignes ? deltaY * 16 : deltaY;
  // Un cran de souris (~100 px) ≈ ×1,22 ; borné pour les molettes « libres ».
  const borne = Math.max(-300, Math.min(300, d));
  return bornerZoom(k * Math.exp(-borne * 0.002));
}

/** Pincement à deux doigts : le zoom suit l'écart entre les doigts. */
export function zoomPincement(kDepart: number, ecartDepart: number, ecart: number): number {
  if (!(ecartDepart > 0) || !(ecart > 0)) return bornerZoom(kDepart);
  return bornerZoom(kDepart * (ecart / ecartDepart));
}

/** Glisser sur un globe zoomé : le même geste le tourne moins, pour suivre le doigt. */
export function vitesseGlisse(k: number): number {
  return 1 / bornerZoom(k);
}

/** Le rayon du globe à l'écran, en px. */
export function rayonGlobe(rayonBase: number, k: number): number {
  return rayonBase * bornerZoom(k);
}

/** Le retour à la vue entière : zoom 1, inclinaison ramenée dans ses bornes d'origine. */
export function vueEntiere(o: Orientation): { k: number; lon0: number; tilt: number } {
  return { k: ZOOM_MIN, lon0: o.lon0, tilt: bornerInclinaison(o.tilt, ZOOM_MIN) };
}

const repli = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Tourne le globe pour que `lieu` (degrés) revienne sous le point (px, py)
 * de l'image, au rayon `R`. C'est ce qui garde le lieu visé sous le curseur
 * pendant un zoom. Quelques pas de Newton simplifiés suffisent : l'écart se
 * divise à chaque pas tant que le lieu reste sur la face visible.
 * Rend l'orientation corrigée (une copie), bornée.
 */
export function garderSous(
  o: Orientation, lieu: { lat: number; lon: number }, px: number, py: number,
  R: number, cx: number, cy: number, k: number,
): Orientation {
  let lon0 = o.lon0;
  let tilt = o.tilt;
  for (let i = 0; i < 6; i++) {
    const vu = deprojeter(px, py, R, cx, cy, { lon0, tilt });
    if (!vu) break;
    const dLat = (lieu.lat - vu.lat) * DEG;
    const dLon = repli((lieu.lon - vu.lon) * DEG);
    if (Math.abs(dLat) < 1e-7 && Math.abs(dLon) < 1e-7) break;
    // Près du centre, tourner de dLon déplace d'autant en longitude ; incliner
    // de dLat déplace d'autant en latitude.
    lon0 += dLon;
    tilt = bornerInclinaison(tilt + dLat, k);
  }
  return { lon0, tilt };
}

/** Où viser une transition de zoom : un zoom cible et le lieu à garder sous (px, py). */
export interface Visee {
  vers: number;
  px: number;
  py: number;
  lieu: { lat: number; lon: number } | null;
}

/** Le zoom intermédiaire d'une transition (interpolation géométrique, fluide en ×). */
export function zoomIntermediaire(de: number, vers: number, p: number): number {
  const t = Math.min(1, Math.max(0, p));
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return bornerZoom(de * Math.pow(vers / de, e));
}

/** Un point de l'image est-il dans la scène (avec une marge, pour les étiquettes) ? */
export function dansLaScene(x: number, y: number, W: number, H: number, marge = 0): boolean {
  return x >= -marge && y >= -marge && x <= W + marge && y <= H + marge;
}
