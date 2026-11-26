/**
 * Retour de Didier (rc13.90) — « une seule fréquence corrigée, alors que je
 * vois d'autres écarts jusqu'à 500 Hz ». L'écran montre désormais les écarts
 * à la cible que la correction LAISSE, et pourquoi :
 *
 *  - `creux` : un creux sous la cible n'est jamais relevé (coupes
 *    seulement : le remonter coûte de la réserve sans le combler) ;
 *  - `hors_zone` : une bosse en dehors de la zone de correction ;
 *  - `limite` : une bosse dans la zone, que le nombre de bandes ou la coupe
 *    maximale n'ont pas permis de ramener.
 *
 * Calculé ici depuis les courbes de la proposition (mesure lissée, cible,
 * corrigée attendue) : marche avec tout serveur qui rend une proposition.
 *
 * GO de Bertrand (rc13.91) : la limite haute de la zone se règle jusqu'à
 * 1 kHz (300 Hz par défaut en un point, 500 Hz en moyenne).
 */
import * as api from './api';
import {
  RACINE_CALIBRATION, demandeCorrection,
  type Proposition, type ProfilEnregistre, type TypeCible,
} from './correctionPiece';

export type RaisonEcart = 'creux' | 'hors_zone' | 'limite';
export interface EcartNonCorrige { freq_hz: number; ecart_db: number; raison: RaisonEcart }

export const LIBELLES_RAISONS: Record<RaisonEcart, string> = {
  creux: 'v2.room.gapDip',
  hors_zone: 'v2.room.gapOutside',
  limite: 'v2.room.gapLimit',
};

/** Au-delà, l'écart n'est plus le sujet d'une correction de pièce. */
export const F_ECARTS_MAX_HZ = 1000;

/**
 * Les écarts que la correction laisse (courbe corrigée − cible), de plus de
 * `seuilDb`, entre le bas de la zone et 1 kHz : un par bosse ou par creux
 * (extremum local), les `max` plus forts, par fréquence croissante.
 */
export function ecartsNonCorriges(p: Proposition, seuilDb = 3, max = 8): EcartNonCorrige[] {
  const f = p.courbes?.freqs_hz ?? [];
  const c = p.courbes?.cible_db ?? [];
  const k = p.courbes?.corrigee_db ?? [];
  const [lo, hi] = p.zone_hz ?? [20, 300];
  const n = Math.min(f.length, c.length, k.length);
  const r = Array.from({ length: n }, (_, i) => k[i] - c[i]);
  const dans = (i: number) => f[i] >= Math.min(lo, 20) && f[i] <= F_ECARTS_MAX_HZ;
  const trouves: EcartNonCorrige[] = [];
  for (let i = 0; i < n; i++) {
    if (!dans(i) || !Number.isFinite(r[i]) || Math.abs(r[i]) < seuilDb) continue;
    const avant = i > 0 ? r[i - 1] : -Infinity * Math.sign(r[i]);
    const apres = i + 1 < n ? r[i + 1] : -Infinity * Math.sign(r[i]);
    const extremum = r[i] > 0 ? r[i] >= avant && r[i] > apres : r[i] <= avant && r[i] < apres;
    if (!extremum) continue;
    const raison: RaisonEcart = r[i] < 0 ? 'creux' : f[i] < lo || f[i] > hi ? 'hors_zone' : 'limite';
    trouves.push({ freq_hz: f[i], ecart_db: r[i], raison });
  }
  // Deux extrémums à moins d'1/6 d'octave : le plus fort seulement.
  const gardes: EcartNonCorrige[] = [];
  for (const e of [...trouves].sort((a, b) => Math.abs(b.ecart_db) - Math.abs(a.ecart_db))) {
    if (gardes.some((g) => Math.abs(Math.log2(g.freq_hz / e.freq_hz)) < 1 / 6)) continue;
    gardes.push(e);
    if (gardes.length >= max) break;
  }
  return gardes.sort((a, b) => a.freq_hz - b.freq_hz);
}

// ─── Limite haute de la zone de correction (GO rc13.91) ────────────────────

/** Les limites proposées à l'écran (Hz). Le serveur borne à 1 kHz. */
export const LIMITES_HZ: readonly number[] = [300, 500, 1000];
/**
 * Au-delà de cette fréquence, la correction ne vaut plus que pour la place
 * mesurée : Schroeder (~300 Hz) pour un point, 500 Hz pour une moyenne.
 */
export const limiteDePlace = (positions: 'une' | 'plusieurs') => (positions === 'une' ? 300 : 500);

const json = (corps: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(corps) });
const appel = <T>(chemin: string, init?: RequestInit) =>
  api.fetchJSON<T>(`${RACINE_CALIBRATION}${chemin}`, init, undefined, true);
/** La demande : cible, et la limite haute si elle est choisie (sinon le défaut du serveur). */
const corps = (cible: TypeCible, fMaxHz: number | null) =>
  ({ ...demandeCorrection(cible), ...(fMaxHz != null ? { f_max_hz: fMaxHz } : {}) });

type Quoi = 'mesures' | 'sessions';
export const proposerJusqua = (quoi: Quoi, id: string, cible: TypeCible, fMaxHz: number | null) =>
  appel<Proposition>(`/${quoi}/${encodeURIComponent(id)}/correction`, json(corps(cible, fMaxHz)));
/** Le profil enregistré est celui de la proposition affichée : même cible, même limite. */
export const enregistrerJusqua = (quoi: Quoi, id: string, cible: TypeCible, fMaxHz: number | null) =>
  appel<ProfilEnregistre>(`/${quoi}/${encodeURIComponent(id)}/correction/profil`, json(corps(cible, fMaxHz)));
