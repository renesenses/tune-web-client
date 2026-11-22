/**
 * Tune Circle rc13 — tous les cercles du monde sur le globe (décisions de
 * Bertrand du 20/11/2026 : « Affiche tous les cercles comme les miens », les
 * personnes hors de mes cercles restent anonymes).
 *
 * Contrat, relayé par le greffon `circle` sous `/api/v1/ext/circle` :
 *
 *   GET /world/circles → 200 [{ lat, lon, circles }]
 *
 * Un point par lieu de propriétaire (la ville qu'il a posée, déjà arrondie à
 * 0,5° par le cloud) ; `circles` est une TRANCHE, celles de la carte /world :
 * `<5`, `5-19`, `20-99`, `100-499`, `500+`. Jamais un nombre exact.
 *
 * Vie privée (le cloud l'applique, le client la redouble) :
 * - seuls comptent les propriétaires qui ont posé leur ville et ne se sont
 *   pas retirés de la carte publique (consentement de la carte rc9) ;
 * - aucun nom de personne ni de cercle, aucun identifiant, aucune date ;
 * - la même réponse pour tous : mes propres cercles y figurent aussi, en
 *   anonyme, et je les vois en plus nommés, comme avant ;
 * - le client ne garde que `lat`, `lon` (réarrondis au demi-degré) et la
 *   tranche, lus champ par champ : un champ de plus venu du cloud ne
 *   s'afficherait pas.
 *
 * Serveur plus ancien (404) ou panne : la couche ne s'affiche pas.
 */
import { BASE, fetchJSON, type ApiError } from './api';
import type { EtatRelais } from './circleMonde';

export const TRANCHES = ['<5', '5-19', '20-99', '100-499', '500+'] as const;
export type Tranche = (typeof TRANCHES)[number];
const EST_TRANCHE = new Set<string>(TRANCHES);

export interface PointCercles { lat: number; lon: number; cercles: Tranche }

const auDemi = (x: number) => { const r = Math.round(x * 2) / 2; return r === 0 ? 0 : r; };

/** Les points lisibles, au demi-degré, sans doublon, triés, réduits à `{ lat, lon, cercles }`. */
export function pointsCerclesValides(b: unknown): PointCercles[] {
  const liste: any[] = Array.isArray(b) ? b : [];
  const vus = new Set<string>();
  const out: PointCercles[] = [];
  for (const x of liste) {
    const lat = Number(x?.lat);
    const lon = Number(x?.lon);
    if (typeof x?.lat !== 'number' || typeof x?.lon !== 'number') continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    if (typeof x.circles !== 'string' || !EST_TRANCHE.has(x.circles)) continue;
    const p = { lat: auDemi(lat), lon: auDemi(lon) === 180 ? -180 : auDemi(lon), cercles: x.circles as Tranche };
    const k = `${p.lat}|${p.lon}`;
    if (vus.has(k)) continue;
    vus.add(k);
    out.push(p);
  }
  return out.sort((a, c) => a.lat - c.lat || a.lon - c.lon);
}

/** Les cercles du monde. Serveur plus ancien (404) ou panne : aucun. */
export async function lireCerclesDuMonde(): Promise<{ relais: EtatRelais; points: PointCercles[] }> {
  try {
    const b = await fetchJSON<unknown>(`${BASE}/ext/circle/world/circles`, undefined, undefined, true);
    return { relais: 'ok', points: pointsCerclesValides(b) };
  } catch (e) {
    return { relais: (e as ApiError | null)?.status === 404 ? 'absent' : 'indisponible', points: [] };
  }
}

/** Le niveau d'une tranche (0 à 4), pour la taille de l'anneau sur le globe. */
export const niveauTranche = (t: Tranche): number => TRANCHES.indexOf(t);
