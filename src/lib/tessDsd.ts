/**
 * TESS rc14 — choisir la cible du suréchantillonnage, DSD compris.
 *
 * Référence : `docs/tess/contrat.md` (tune-server-rust#9518), § 3
 * (`fixed.upsampling`), § 7 (`dsd_capabilities`) et le refus 409
 * `dsd_not_supported_by_output`.
 *
 * Fonctions PURES seulement : l'écran (`PanneauSurechantillonnageTess`) s'en
 * sert, les tests les lisent sans écran. Règles :
 *   - `dsd_capabilities` absent (serveur antérieur) : le DSD n'est pas proposé ;
 *   - sortie réseau (transport ≠ `local`, ou étape `not_applied_on_transport`) :
 *     rien de tout cela, l'étape ne s'y applique pas ;
 *   - une cible que la sortie ne prend pas est grisée, avec son motif ; une
 *     cible acceptée dit son transport (natif ou DoP) ;
 *   - la chaîne renvoyée part de la chaîne BRUTE : seul `fixed.upsampling`
 *     change, les autres champs (connus ou non de ce client) restent.
 */
import type { ChaineTess, ReponseTessZone } from './tess';

/** Les trois cibles DSD du contrat, dans l'ordre d'affichage. */
export const CIBLES_DSD = ['dsd64', 'dsd128', 'dsd256'] as const;
export type CibleDsd = (typeof CIBLES_DSD)[number];

/** Les rapports PCM du contrat (`null` = maximum du périphérique). */
export const RAPPORTS_PCM = [2, 4, 8, 16] as const;

/** Les six filtres du SDK (§ 3) ; `polyvalent` par défaut. */
export const FILTRES_SDK = ['polyvalent', 'polyvalent-pm', 'precision', 'precision-pm', 'resolution', 'resolution-pm'] as const;
export const FILTRE_PAR_DEFAUT = 'polyvalent';

/** Les motifs de refus connus (`MotifDsdRefuse` du serveur). */
export const MOTIFS_DSD = [
  'output_not_local', 'dsd_mode_not_enabled', 'rate_above_zone_max', 'dop_refused_by_output',
  'carrier_rate_not_supported', 'machine_too_slow', 'source_rate_not_modulable', 'channels_not_supported',
  'modulator_failed',
] as const;

/** Sélection de la colonne de droite pour l'étage fixe de suréchantillonnage. */
export const SELECTION_SURECHANTILLONNAGE = '@upsampling';
/** L'id sous lequel `motifDuVerrou` juge le droit au suréchantillonnage (Premium). */
export const ID_SURECHANTILLONNAGE = 'upsampling';

export interface FamilleDsd {
  rate_hz: number | null;
  accepted: boolean;
  transport: 'native' | 'dop' | null;
  dop_rate_hz: number | null;
  reason: string | null;
  native_reason: string | null;
}

export interface CibleCapaciteDsd extends FamilleDsd {
  rate: string;
  family_48k: FamilleDsd | null;
}

export interface CapacitesDsd {
  dsd_mode: string;
  output_local: boolean;
  modulator_order: number | null;
  /** Où s'applique le volume (relecture de #9518 : `before_dsd_modulator`, avec une rampe). */
  volume_placement: string | null;
  /**
   * `known`, ou `unknown` : la sortie n'a jamais pu être lue (périphérique
   * jamais vu, sortie occupée). `targets` est alors vide et le `PUT` ne refuse
   * rien : la lecture décide et le dit (contrat § 7). Absent : `known`.
   */
  status: 'known' | 'unknown';
  targets: CibleCapaciteDsd[];
}

/** La forme d'`upsampling` que l'écran sait écrire. */
export type UpsamplingTess =
  | { mode: 'off'; [autre: string]: unknown }
  | { mode: 'pcm'; filter: string; max_ratio: number | null; max_rate_hz: number | null; [autre: string]: unknown }
  | { mode: 'dsd'; rate: CibleDsd; filter: string; [autre: string]: unknown };

const estObjet = (x: unknown): x is Record<string, any> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const entierOuNull = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const texteOuNull = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null);

function lireFamille(x: unknown): FamilleDsd | null {
  if (!estObjet(x)) return null;
  const transport = x.transport === 'native' || x.transport === 'dop' ? x.transport : null;
  return {
    rate_hz: entierOuNull(x.rate_hz),
    // Une cible n'est acceptée que si le serveur le dit en toutes lettres.
    accepted: x.accepted === true,
    transport,
    dop_rate_hz: entierOuNull(x.dop_rate_hz),
    reason: texteOuNull(x.reason),
    native_reason: texteOuNull(x.native_reason),
  };
}

/**
 * Lit `dsd_capabilities` (dans une réponse de zone ou dans un refus 409).
 * Absent ou illisible : `null` (serveur antérieur : on ne propose pas le DSD).
 */
export function lireCapacitesDsd(x: unknown): CapacitesDsd | null {
  if (!estObjet(x) || !Array.isArray(x.targets)) return null;
  const targets: CibleCapaciteDsd[] = [];
  for (const t of x.targets) {
    const f = lireFamille(t);
    if (!f || !estObjet(t) || typeof t.rate !== 'string') continue;
    targets.push({ ...f, rate: t.rate, family_48k: lireFamille(t.family_48k) });
  }
  return {
    dsd_mode: typeof x.dsd_mode === 'string' ? x.dsd_mode : 'unknown',
    output_local: x.output_local === true,
    modulator_order: entierOuNull(x.modulator_order),
    volume_placement: texteOuNull(x.volume_placement),
    status: x.status === 'unknown' ? 'unknown' : 'known',
    targets,
  };
}

/** Les capacités DSD publiées avec la réponse de zone, ou `null`. */
export function capacitesDe(r: ReponseTessZone | null | undefined): CapacitesDsd | null {
  return lireCapacitesDsd((r as Record<string, unknown> | null | undefined)?.dsd_capabilities);
}

/** L'étape `upsampling` du chemin résolu, si le serveur l'a publiée. */
function etapeUpsampling(r: ReponseTessZone) {
  return r.signal_path?.find((e) => e.code === 'upsampling') ?? null;
}

/**
 * Sortie réseau : l'étage ne s'y applique pas (`not_applied_on_transport`).
 * Rien n'est proposé : ni PCM, ni DSD.
 */
export function surSortieReseau(r: ReponseTessZone): boolean {
  if (etapeUpsampling(r)?.reason === 'not_applied_on_transport') return true;
  return typeof r.transport === 'string' && r.transport !== 'local';
}

/** Le DSD est-il proposé sur cette zone ? Il faut les capacités, et une sortie locale. */
export function dsdProposable(r: ReponseTessZone): boolean {
  const c = capacitesDe(r);
  return c != null && c.output_local && !surSortieReseau(r);
}

/** Le DSD est-il activé sur la zone (`dsd_mode` natif ou DoP) ? */
export function modeDsdActive(c: CapacitesDsd | null): boolean {
  return c != null && (c.dsd_mode === 'native' || c.dsd_mode === 'dop');
}

/** L'état affiché d'une famille de cadences : acceptée (et comment), ou refusée (et pourquoi). */
export interface EtatFamilleDsd {
  accepted: boolean;
  transport: 'native' | 'dop' | null;
  /** Motif du refus ; `unknown` si le serveur ne le dit pas. */
  reason: string | null;
  /** Zone « natif » servie en DoP : pourquoi (texte du serveur). */
  native_reason: string | null;
  /** Sortie jamais lue (`status: unknown`) : choisissable, vérifiée à la lecture. */
  unverified?: boolean;
}

/**
 * L'état d'une cible. Les champs à plat sont ceux de la famille 44,1 kHz :
 * c'est elle que le serveur vérifie au `PUT` (409), donc elle qui grise la
 * cible. `family_48k` dit ce que deviennent les sources 48, 96 ou 192 kHz
 * (`null` : le serveur ne le publie pas).
 */
export interface EtatCibleDsd extends EtatFamilleDsd {
  rate: CibleDsd;
  family_48k: EtatFamilleDsd | null;
}

function etatFamille(f: FamilleDsd): EtatFamilleDsd {
  return {
    accepted: f.accepted,
    transport: f.accepted ? (f.transport ?? 'dop') : null,
    reason: f.accepted ? null : (f.reason ?? 'unknown'),
    native_reason: f.accepted ? f.native_reason : null,
  };
}

/**
 * L'état des trois cibles (§ 7). Une cible absente des capacités est grisée,
 * motif `unknown` — sauf sortie jamais lue (`status: unknown`) : le serveur ne
 * refuse rien au `PUT`, les trois cibles restent choisissables, « à vérifier ».
 */
export function etatsDesCibles(c: CapacitesDsd | null): EtatCibleDsd[] {
  if (c?.status === 'unknown') {
    return CIBLES_DSD.map((rate) => ({
      rate, accepted: true, transport: null, reason: null, native_reason: null, unverified: true, family_48k: null,
    }));
  }
  return CIBLES_DSD.map((rate) => {
    const t = c?.targets.find((x) => x.rate === rate);
    if (!t) return { rate, accepted: false, transport: null, reason: 'unknown', native_reason: null, family_48k: null };
    return { rate, ...etatFamille(t), family_48k: t.family_48k ? etatFamille(t.family_48k) : null };
  });
}

/** La clé i18n du motif d'une cible refusée. */
export function cleMotifDsd(reason: string | null | undefined): string {
  return reason && (MOTIFS_DSD as readonly string[]).includes(reason) ? `tess.dsd.reason.${reason}` : 'tess.dsd.reason.unknown';
}

/** L'`upsampling` actuel de la chaîne, lu sans rien supposer. */
export function upsamplingDe(chaine: ChaineTess | null | undefined): Record<string, any> {
  const u = chaine?.fixed?.upsampling;
  return estObjet(u) && typeof u.mode === 'string' ? u : { mode: 'off' };
}

/** Le mode affiché : `off`, `pcm`, `dsd`, ou `unknown` (valeur d'un serveur plus récent). */
export function modeDe(chaine: ChaineTess | null | undefined): 'off' | 'pcm' | 'dsd' | 'unknown' {
  const m = upsamplingDe(chaine).mode;
  return m === 'off' || m === 'pcm' || m === 'dsd' ? m : 'unknown';
}

function filtreDe(u: Record<string, any>): string {
  return typeof u.filter === 'string' && u.filter ? u.filter : FILTRE_PAR_DEFAUT;
}

/** Vers le PCM : on garde les réglages PCM en place, sinon le filtre et le maximum de l'appareil. */
export function versPcm(actuel: Record<string, any>, change: Partial<{ filter: string; max_ratio: number | null }> = {}): UpsamplingTess {
  const base = actuel.mode === 'pcm'
    ? { filter: filtreDe(actuel), max_ratio: entierOuNull(actuel.max_ratio), max_rate_hz: entierOuNull(actuel.max_rate_hz) }
    : { filter: filtreDe(actuel), max_ratio: null, max_rate_hz: null };
  return { mode: 'pcm', ...base, ...change };
}

/** Vers le DSD, à la cible `rate` ; le filtre en place est gardé. */
export function versDsd(actuel: Record<string, any>, rate: CibleDsd, filter?: string): UpsamplingTess {
  return { mode: 'dsd', rate, filter: filter ?? filtreDe(actuel) };
}

/**
 * La cible DSD proposée quand on passe en DSD : celle déjà choisie si elle est
 * acceptée, sinon la plus basse acceptée, sinon `null` (rien d'acceptable).
 */
export function cibleParDefaut(actuel: Record<string, any>, etats: EtatCibleDsd[]): CibleDsd | null {
  const deja = actuel.mode === 'dsd' ? etats.find((e) => e.rate === actuel.rate && e.accepted) : undefined;
  return deja?.rate ?? etats.find((e) => e.accepted)?.rate ?? null;
}

/** Copie de la chaîne BRUTE avec un nouvel `upsampling` ; le reste de `fixed` est gardé. */
export function avecUpsampling(chaine: ChaineTess, up: UpsamplingTess): ChaineTess {
  return { ...chaine, fixed: { ...(chaine.fixed ?? {}), upsampling: up } };
}
