/**
 * Retours de Didier et de Sandro (rc13.90) — « on perd la configuration du
 * correcteur quand on revient sur l'écran ». Tout vivait dans l'état du
 * composant, détruit à chaque sortie de l'écran.
 *
 * Ce qui se retrouve désormais, zone par zone :
 *
 *  - la SAISIE de la calibration sans micro (dimensions, surfaces, positions,
 *    cible, mode expert) : aucune route du greffon ne la garde (`POST
 *    /simulations` ne fait que calculer), elle est donc gardée dans ce
 *    navigateur, par zone ; la simulation et sa proposition sont recalculées
 *    au retour ;
 *  - la dernière MESURE au micro : le serveur la connaît (`GET /mesures`,
 *    `GET /sessions`, en mémoire jusqu'au redémarrage) ; on garde seulement
 *    les identifiants des sessions et la cible choisie, relus et vérifiés
 *    auprès du serveur au retour ;
 *  - ce qui est APPLIQUÉ à la zone : le profil de pièce enregistré
 *    (`GET /room-correction/profiles/{zone}`) comparé à l'égaliseur de la
 *    zone (`GET /zones/{zone}/eq`).
 */
import * as api from './api';
import {
  CIBLES, QUALITES, SURFACES, coteHorsBornes, sessionDeLaMesure,
  type Avancement, type Piece, type Placement, type ReglageExpert, type Surfaces, type TypeCible, type VueSession,
} from './correctionPiece';

const PREFIXE = 'tune.correctionPiece';

function lire(cle: string): unknown {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? JSON.parse(brut) : null;
  } catch {
    return null;
  }
}
function ecrire(cle: string, valeur: unknown) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    // Stockage plein ou interdit : l'écran marche sans mémoire.
  }
}

// ─── Saisie de la calibration sans micro ───────────────────────────────────

export interface SaisieSimulation {
  piece: Piece;
  surfaces: Surfaces;
  /** `null` : disposition type (elle suit les dimensions). */
  placement: Placement | null;
  cible: TypeCible;
  expert: ReglageExpert | null;
  /** Une simulation avait été lancée : on la relance au retour. */
  simulee: boolean;
}

export const cleSaisie = (zoneId: number) => `${PREFIXE}.simulation.${zoneId}`;

const nombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const position = (p: unknown): p is { x: number; y: number; z: number } =>
  !!p && typeof p === 'object' && nombre((p as any).x) && nombre((p as any).y) && nombre((p as any).z);

/** La saisie gardée pour la zone, ou `null` si rien, ou rien de lisible. */
export function lireSaisie(zoneId: number): SaisieSimulation | null {
  const s = lire(cleSaisie(zoneId)) as Partial<SaisieSimulation> | null;
  if (!s || typeof s !== 'object') return null;
  const p = s.piece;
  if (!p || !nombre(p.longueur_m) || !nombre(p.largeur_m) || !nombre(p.hauteur_m)) return null;
  const piece: Piece = { longueur_m: p.longueur_m, largeur_m: p.largeur_m, hauteur_m: p.hauteur_m };
  const surfaces = {} as Surfaces;
  for (const k of SURFACES) {
    const q = (s.surfaces as any)?.[k];
    if (!QUALITES.includes(q)) return null;
    surfaces[k] = q;
  }
  const pl = s.placement;
  const placement = pl && position(pl.auditeur) && Array.isArray(pl.enceintes) && pl.enceintes.length > 0
    && pl.enceintes.every(position)
    ? { auditeur: { ...pl.auditeur }, enceintes: pl.enceintes.map((e) => ({ ...e })) }
    : null;
  const cible: TypeCible = CIBLES.includes(s.cible as TypeCible) ? (s.cible as TypeCible) : 'plate';
  const ex = s.expert;
  const expert = ex && nombre(ex.bandes_max) && nombre(ex.coupe_max_db)
    ? { bandes_max: ex.bandes_max, coupe_max_db: ex.coupe_max_db } : null;
  return { piece, surfaces, placement, cible, expert, simulee: s.simulee === true };
}

export function ecrireSaisie(zoneId: number, s: SaisieSimulation) {
  ecrire(cleSaisie(zoneId), s);
}

/** Une saisie relue est-elle simulable telle quelle (dimensions dans les bornes) ? */
export const saisieSimulable = (s: SaisieSimulation) => coteHorsBornes(s.piece) == null;

// ─── Mesure au micro ───────────────────────────────────────────────────────

export interface MemoireMicro {
  /** Les sessions multi-positions : `a` = la mesure, `b` = la vérification. */
  sessions: { a: string | null; b: string | null };
  cible: TypeCible;
}

export const cleMicro = (zoneId: number) => `${PREFIXE}.micro.${zoneId}`;

export function lireMemoireMicro(zoneId: number): MemoireMicro | null {
  const m = lire(cleMicro(zoneId)) as Partial<MemoireMicro> | null;
  if (!m || typeof m !== 'object') return null;
  const id = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    sessions: { a: id(m.sessions?.a), b: id(m.sessions?.b) },
    cible: CIBLES.includes(m.cible as TypeCible) ? (m.cible as TypeCible) : 'plate',
  };
}

export function ecrireMemoireMicro(zoneId: number, m: MemoireMicro) {
  ecrire(cleMicro(zoneId), m);
}

/**
 * Les sessions gardées que le serveur connaît ENCORE (il les oublie à son
 * redémarrage) : sans `a`, rien ; `b` seul n'a pas de sens.
 */
export function sessionsConnues(
  m: MemoireMicro['sessions'], liste: readonly VueSession[] | null | undefined, zoneId: number,
): MemoireMicro['sessions'] {
  const connue = (id: string | null) => !!id && (liste ?? []).some((s) => s.id === id && s.zone_id === zoneId);
  if (!connue(m.a)) return { a: null, b: null };
  return { a: m.a, b: connue(m.b) ? m.b : null };
}

/**
 * La dernière mesure à UNE position terminée sur la zone (le serveur les
 * rend dans l'ordre où elles ont commencé), hors positions de session.
 */
export function derniereMesureTerminee(
  liste: readonly Avancement[] | null | undefined, zoneId: number, sessions: readonly VueSession[] | null | undefined,
): Avancement | null {
  const deSession = (id: string) => !!sessionDeLaMesure(sessions, id)
    || (sessions ?? []).some((s) => s.etats?.some((e) => e.mesure_id === id));
  const finies = (liste ?? []).filter((m) => m.zone_id === zoneId && m.etat === 'terminee' && !deSession(m.id));
  return finies.length ? finies[finies.length - 1] : null;
}

// ─── Ce qui est appliqué à la zone ─────────────────────────────────────────

export interface FiltreProfil { frequency_hz: number; gain_db: number; q_factor: number; filter_type?: string }
export interface ProfilPiece {
  name: string;
  zone_id: string;
  filters: FiltreProfil[];
  created_at: string;
  /** `measured` ou `estimation` (sans micro) ; absent d'un profil ancien. */
  origin?: string | null;
}

/** L'état de la correction de la zone, pour le bandeau. */
export type EtatCorrection =
  | { etat: 'aucune' }
  /** Le profil est dans l'égaliseur de la zone, et l'égaliseur est actif. */
  | { etat: 'appliquee'; profil: ProfilPiece }
  /** Le profil est enregistré, mais l'égaliseur de la zone n'est pas (ou plus) celui-là. */
  | { etat: 'enregistree'; profil: ProfilPiece };

/** Les bandes de l'égaliseur sont-elles celles du profil (même fréquence, gain, Q) ? */
export function egaliseurDuProfil(eq: api.EqSettings | null | undefined, profil: ProfilPiece): boolean {
  if (!eq?.enabled || !Array.isArray(eq.bands) || !profil.filters.length || eq.bands.length !== profil.filters.length) return false;
  const proche = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 1e-3);
  const tri = <T>(l: T[], f: (x: T) => number) => [...l].sort((x, y) => f(x) - f(y));
  const bandes = tri(eq.bands, (b) => b.freq);
  return tri(profil.filters, (f) => f.frequency_hz).every((f, i) =>
    proche(bandes[i].freq, f.frequency_hz) && proche(bandes[i].gain, f.gain_db) && proche(bandes[i].q, f.q_factor));
}

export function etatCorrection(profil: ProfilPiece | null, eq: api.EqSettings | null): EtatCorrection {
  if (!profil) return { etat: 'aucune' };
  return egaliseurDuProfil(eq, profil) ? { etat: 'appliquee', profil } : { etat: 'enregistree', profil };
}

/** Le profil de pièce de la zone ; `null` sans profil (404) ou sur un refus. */
export async function lireProfilZone(zoneId: number): Promise<ProfilPiece | null> {
  try {
    const p = await api.fetchJSON<ProfilPiece>(`${api.BASE}/room-correction/profiles/${zoneId}`, undefined, undefined, true);
    return p && Array.isArray(p.filters) ? p : null;
  } catch {
    return null;
  }
}

export async function lireEtatCorrection(zoneId: number): Promise<EtatCorrection> {
  const [profil, eq] = await Promise.all([lireProfilZone(zoneId), api.getEq(zoneId).catch(() => null)]);
  return etatCorrection(profil, eq);
}

// ─── Onglet ouvert ─────────────────────────────────────────────────────────

export type Onglet = 'simulation' | 'micro';
const CLE_ONGLET = `${PREFIXE}.onglet`;
export const lireOnglet = (): Onglet => (lire(CLE_ONGLET) === 'micro' ? 'micro' : 'simulation');
export const ecrireOnglet = (o: Onglet) => ecrire(CLE_ONGLET, o);
