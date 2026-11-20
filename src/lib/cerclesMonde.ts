/**
 * Tune Circle rc13 — tous les cercles du monde (décisions de Bertrand du
 * 20/11/2026 : « I want to see all Tune circles in the world maps, not only
 * mines! People without my circles stay anonymous! »).
 *
 * Contrat, relayé par le greffon `circle` sous `/api/v1/ext/circle` :
 *
 *   GET /world/circles → 200 [{ country_code, circles, members }]
 *
 * `circles` et `members` sont des TRANCHES, celles de la carte /world :
 * `<5`, `5-19`, `20-99`, `100-499`, `500+`. Jamais un nombre exact.
 *
 * Vie privée (le cloud l'applique, le client la redouble) :
 * - un cercle compte au pays de la ville posée par son propriétaire, s'il
 *   ne s'est pas retiré de la carte publique (consentement de la carte rc9) ;
 * - aucun nom de cercle ni de membre, aucun identifiant, aucune coordonnée ;
 * - les cercles dont je suis propriétaire ou membre n'y sont pas : je les
 *   vois nommés, comme avant ;
 * - le client ne garde que le code pays et les deux tranches, lus champ par
 *   champ : un champ de plus venu du cloud ne s'afficherait pas.
 *
 * Serveur plus ancien (404) ou panne : la couche ne s'affiche pas.
 */
import { BASE, fetchJSON, type ApiError } from './api';
import { CODES_PAYS, type NombrePays } from './paysMonde';
import type { EtatRelais } from './circleMonde';

export const TRANCHES = ['<5', '5-19', '20-99', '100-499', '500+'] as const;
export type Tranche = (typeof TRANCHES)[number];
const EST_TRANCHE = new Set<string>(TRANCHES);

export interface CerclesPays { code: string; cercles: Tranche; membres: Tranche }

/** Les pays lisibles, sans doublon, triés par code, réduits à `{ code, cercles, membres }`. */
export function cerclesDuMondeValides(b: unknown): CerclesPays[] {
  const liste: any[] = Array.isArray(b) ? b : [];
  const vus = new Set<string>();
  const out: CerclesPays[] = [];
  for (const x of liste) {
    const code = typeof x?.country_code === 'string' ? x.country_code.toUpperCase() : '';
    if (!CODES_PAYS.has(code) || vus.has(code)) continue;
    if (typeof x.circles !== 'string' || !EST_TRANCHE.has(x.circles)) continue;
    if (typeof x.members !== 'string' || !EST_TRANCHE.has(x.members)) continue;
    vus.add(code);
    out.push({ code, cercles: x.circles as Tranche, membres: x.members as Tranche });
  }
  return out.sort((a, c) => (a.code < c.code ? -1 : a.code > c.code ? 1 : 0));
}

/** Les cercles du monde. Serveur plus ancien (404) ou panne : aucun. */
export async function lireCerclesDuMonde(): Promise<{ relais: EtatRelais; pays: CerclesPays[] }> {
  try {
    const b = await fetchJSON<unknown>(`${BASE}/ext/circle/world/circles`, undefined, undefined, true);
    return { relais: 'ok', pays: cerclesDuMondeValides(b) };
  } catch (e) {
    return { relais: (e as ApiError | null)?.status === 404 ? 'absent' : 'indisponible', pays: [] };
  }
}

/** Le plancher d'une tranche, dans la forme que la teinte des pays (`niveauPays`) connaît. */
export function trancheEnNombre(t: Tranche): NombrePays {
  return t === '<5' ? '<5' : t === '5-19' ? 5 : t === '20-99' ? 20 : t === '100-499' ? 100 : 500;
}

/** La teinte du globe : un niveau par pays, selon la tranche de cercles. */
export function teinteCercles(pays: readonly CerclesPays[]): Record<string, NombrePays> {
  const out: Record<string, NombrePays> = Object.create(null);
  for (const p of pays) out[p.code] = trancheEnNombre(p.cercles);
  return out;
}
