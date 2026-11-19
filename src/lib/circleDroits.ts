/**
 * Tune Circle (décision du 19/11/2026) : qui peut modifier le cercle depuis
 * cette interface.
 *
 * Le serveur réserve les écritures du greffon (`/ext/circle`, toute méthode
 * autre que GET) à un profil ADMINISTRATEUR quand l'authentification est
 * active, et les refuse toujours à un client qui passe par le relais. Ses deux
 * refus, en 403 :
 *
 * - `circle.admin_required` : profil non administrateur ;
 * - `circle.remote_read_only` : appel venu du relais (lecture seule).
 *
 * L'écran se met en lecture seule AVANT le premier refus quand il le peut
 * (page servie par le relais, session d'un profil non administrateur), et
 * APRÈS un refus sinon — un serveur plus ancien ne refuse rien et ne change
 * donc rien ici.
 */
import { writable } from 'svelte/store';
import { getToken } from './auth';
import { viaRelais } from './bridge';

export const CODE_ADMIN_REQUIS = 'circle.admin_required';
export const CODE_LECTURE_SEULE_A_DISTANCE = 'circle.remote_read_only';

export type MotifLectureSeule = 'admin' | 'distant';

/** La phrase de chaque motif (16 langues). */
export const CLES_LECTURE_SEULE: Record<MotifLectureSeule, string> = {
  admin: 'v2.circle.err.adminRequired',
  distant: 'v2.circle.err.remoteReadOnly',
};

/** Le motif porté par un code de refus du serveur, ou `null`. */
export function motifLectureSeuleDuCode(code: unknown): MotifLectureSeule | null {
  if (code === CODE_ADMIN_REQUIS) return 'admin';
  if (code === CODE_LECTURE_SEULE_A_DISTANCE) return 'distant';
  return null;
}

/** `null` : les gestes d'écriture du cercle sont offerts. */
export const cercleLectureSeule = writable<MotifLectureSeule | null>(null);

/** Note un refus de droit du serveur ; rend son motif, `null` s'il n'en est pas un. */
export function noterRefusDeDroit(code: unknown): MotifLectureSeule | null {
  const motif = motifLectureSeuleDuCode(code);
  if (motif) cercleLectureSeule.set(motif);
  return motif;
}

type Moi = { role?: unknown } | null | undefined;

/**
 * Décide, avant tout geste, si l'écran est en lecture seule.
 *
 * - page servie par le relais : `distant` ;
 * - session ouverte (l'authentification est donc active) d'un profil dont le
 *   rôle n'est pas `admin` : `admin` ;
 * - sinon (authentification coupée, serveur plus ancien, `/auth/me` absent ou
 *   en échec) : rien — le serveur reste juge, et son refus est noté.
 */
export async function verifierDroitsCercle(
  // Import différé : `api.ts` lit déjà ce module (`noterRefusDeDroit`).
  lireMoi: () => Promise<Moi> = async () => {
    const { BASE, fetchJSON } = await import('./api');
    return fetchJSON<Moi>(`${BASE}/auth/me`, undefined, (s) => s === 401 || s === 403 || s === 404, true);
  },
  relais: () => boolean = viaRelais,
  jeton: () => string | null = getToken,
): Promise<MotifLectureSeule | null> {
  let motif: MotifLectureSeule | null = null;
  if (relais()) {
    motif = 'distant';
  } else if (jeton()) {
    try {
      const moi = await lireMoi();
      const role = moi && typeof moi === 'object' ? moi.role : undefined;
      if (typeof role === 'string' && role !== 'admin') motif = 'admin';
    } catch {
      motif = null;
    }
  }
  cercleLectureSeule.set(motif);
  return motif;
}
