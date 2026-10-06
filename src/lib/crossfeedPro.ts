/**
 * Crossfeed Pro — le greffon audio natif PREMIUM (identifiant `crossfeed-pro`),
 * à côté du crossfeed intégré, qui reste intact.
 *
 * Ce client n'en connaît QUE l'interface : les noms des réglages, leurs unités
 * et leurs bornes. Le traitement lui-même vit dans le greffon, pas ici.
 *
 * 🔴 D'OÙ VIENNENT LES BORNES — l'hôte (tune-server-rust v0.9.167,
 * `routes/greffons_natifs_tiers.rs`) stocke le JSON de réglages tel quel et le
 * fait valider par le greffon ; il ne publie ni schéma, ni bornes, ni
 * préréglages. Elles sont donc recopiées ici, au minimum, depuis le schéma de
 * réglages que le greffon déclare (`config_version` 1). Un réglage hors bornes
 * est de toute façon refusé par le greffon (400 `invalid_plugin_settings`) :
 * borner avant l'envoi sert seulement à montrer la valeur qui sera appliquée.
 * Le jour où l'hôte publiera le schéma, c'est lui qu'il faudra lire.
 */
import type { Zone } from './types';
import type { ApiError } from './api';

export const CROSSFEED_PRO_ID = 'crossfeed-pro';

/** Le moteur : `tune` (défaut) ou `classique` (libbs2b). Un réglage
 *  enregistré sans `mode` est en mode Tune. */
export type ModeCrossfeedPro = 'tune' | 'classique';

/** Les réglages d'une zone, tels que le greffon les enregistre. Les champs
 *  inconnus de ce client sont CONSERVÉS tels quels à l'écriture : un greffon
 *  plus récent ne doit pas perdre un réglage parce que l'écran l'ignore. */
export interface ReglagesCrossfeedPro {
  enabled: boolean;
  /** `tune` ou `classique` ; une autre chaîne (greffon plus récent) est
   *  gardée telle quelle. */
  mode: ModeCrossfeedPro | string;
  amount: number;
  delay_ms: number;
  head_shadow: boolean;
  head_shadow_hz: number;
  head_shadow_slope_db_oct: number;
  low_cut: boolean;
  phase_guard: boolean;
  phase_guard_ms: number;
  /** EXPÉRIMENTAL, éteint par défaut. Allumé, le retard fixe ne sert plus. */
  experimental_itd: boolean;
  itd_tau_max_us: number;
  itd_smoothing_ms: number;
  [autre: string]: unknown;
}

export type CurseurCrossfeedPro =
  | 'amount'
  | 'delay_ms'
  | 'head_shadow_hz'
  | 'head_shadow_slope_db_oct'
  | 'phase_guard_ms'
  | 'itd_tau_max_us'
  | 'itd_smoothing_ms';

export interface Borne {
  min: number;
  max: number;
  /** Le pas du curseur (choix d'interface, pas une contrainte du greffon). */
  pas: number;
}

/** Bornes du schéma de réglages du greffon (voir l'en-tête). */
export const BORNES_CROSSFEED_PRO: Record<CurseurCrossfeedPro, Borne> = {
  amount: { min: 0.2, max: 0.6, pas: 0.01 },
  delay_ms: { min: 0, max: 1, pas: 0.05 },
  head_shadow_hz: { min: 100, max: 20000, pas: 10 },
  head_shadow_slope_db_oct: { min: 3, max: 6, pas: 0.5 },
  phase_guard_ms: { min: 20, max: 50, pas: 1 },
  itd_tau_max_us: { min: 500, max: 1000, pas: 10 },
  itd_smoothing_ms: { min: 100, max: 200, pas: 5 },
};

/** En mode classique, seuls le dosage et la coupure servent, et le greffon
 *  les borne à ceux de libbs2b (300–2000 Hz, niveau de 1 à 15 dB, soit un
 *  dosage d'au plus 0,47). */
export const BORNES_CLASSIQUE: Pick<Record<CurseurCrossfeedPro, Borne>, 'amount' | 'head_shadow_hz'> = {
  amount: { min: 0.2, max: 0.47, pas: 0.01 },
  head_shadow_hz: { min: 300, max: 2000, pas: 10 },
};

/** Les bornes d'un curseur dans le mode du réglage. */
export function borneCrossfeedPro(cle: CurseurCrossfeedPro, mode: string): Borne {
  if (mode === 'classique' && (cle === 'amount' || cle === 'head_shadow_hz')) return BORNES_CLASSIQUE[cle];
  return BORNES_CROSSFEED_PRO[cle];
}

/** Les défauts du schéma : éteint, mode Tune, ombre de la tête, coupe-bas et
 *  mode expérimental ÉTEINTS, garde de phase allumée. */
export const DEFAUTS_CROSSFEED_PRO: ReglagesCrossfeedPro = {
  enabled: false,
  mode: 'tune',
  amount: 0.3,
  delay_ms: 0.3,
  head_shadow: false,
  head_shadow_hz: 700,
  head_shadow_slope_db_oct: 6,
  low_cut: false,
  phase_guard: true,
  phase_guard_ms: 30,
  experimental_itd: false,
  itd_tau_max_us: 1000,
  itd_smoothing_ms: 150,
};

const BOOLEENS = ['enabled', 'head_shadow', 'low_cut', 'phase_guard', 'experimental_itd'] as const;

function borner(v: number, b: Borne): number {
  return Math.min(b.max, Math.max(b.min, v));
}

/**
 * Ce que l'hôte a rendu (`settings`, `null` tant que la zone n'a rien
 * enregistré), complété par les défauts et borné. Un champ illisible retombe
 * sur son défaut ; un champ inconnu est gardé.
 */
export function reglagesCrossfeedPro(brut: unknown): ReglagesCrossfeedPro {
  const src = brut && typeof brut === 'object' && !Array.isArray(brut) ? (brut as Record<string, unknown>) : {};
  const r: ReglagesCrossfeedPro = { ...src, ...DEFAUTS_CROSSFEED_PRO };
  for (const cle of BOOLEENS) {
    if (typeof src[cle] === 'boolean') r[cle] = src[cle] as boolean;
  }
  if (typeof src.mode === 'string' && src.mode) r.mode = src.mode;
  for (const cle of Object.keys(BORNES_CROSSFEED_PRO) as CurseurCrossfeedPro[]) {
    const v = src[cle];
    if (typeof v === 'number' && Number.isFinite(v)) r[cle] = v;
    r[cle] = borner(r[cle], borneCrossfeedPro(cle, r.mode));
  }
  return r;
}

/**
 * Les PRÉRÉGLAGES — ceux de libbs2b 3.1.0 (`src/bs2b.h`, bibliothèque
 * publique) : coupure et niveau croisé de BS2B (700 Hz, 4,5 dB), Chu Moy
 * (700 Hz, 6 dB) et Jan Meier (650 Hz, 9,5 dB). Le niveau croisé y est
 * exprimé en dosage linéaire, l'unité du réglage `amount`. Ils passent en mode
 * `classique` (libbs2b).
 *
 * Un préréglage allume le greffon, passe en mode classique, et ÉTEINT la garde
 * de phase et le retard adaptatif. Retard et ombre de la tête sont posés
 * comme avant (sans effet en mode classique, ils servent si l'on repasse en
 * mode Tune) ; le coupe-bas n'est pas touché.
 *
 * ⚠️ Le greffon connaît aussi un préréglage « Meier extended » dont les valeurs
 * ne sont pas publiées : il n'est pas proposé ici tant que l'hôte ne publie
 * pas les préréglages du greffon (question ouverte).
 */
export interface PresetCrossfeedPro {
  key: string;
  labelKey: string;
  mode: ModeCrossfeedPro;
  amount: number;
  head_shadow_hz: number;
  head_shadow_slope_db_oct: number;
}

export const PRESETS_CROSSFEED_PRO: PresetCrossfeedPro[] = [
  { key: 'bs2b', labelKey: 'v2.cfp.presetBs2b', mode: 'classique', amount: 0.3733, head_shadow_hz: 700, head_shadow_slope_db_oct: 6 },
  { key: 'chu_moy', labelKey: 'v2.cfp.presetChuMoy', mode: 'classique', amount: 0.3339, head_shadow_hz: 700, head_shadow_slope_db_oct: 6 },
  { key: 'jan_meier', labelKey: 'v2.cfp.presetJanMeier', mode: 'classique', amount: 0.2509, head_shadow_hz: 650, head_shadow_slope_db_oct: 6 },
];

export function appliquerPresetCrossfeedPro(
  r: ReglagesCrossfeedPro,
  p: PresetCrossfeedPro,
): ReglagesCrossfeedPro {
  return {
    ...r,
    enabled: true,
    mode: p.mode,
    phase_guard: false,
    experimental_itd: false,
    amount: p.amount,
    delay_ms: 0,
    head_shadow: true,
    head_shadow_hz: p.head_shadow_hz,
    head_shadow_slope_db_oct: p.head_shadow_slope_db_oct,
  };
}

/** Le préréglage qui correspond aux réglages, s'il y en a un (à une
 *  tolérance près : les curseurs travaillent au pas). */
export function presetCrossfeedProActif(r: ReglagesCrossfeedPro): string | null {
  const proche = (a: number, b: number, tol: number) => Math.abs(a - b) < tol;
  return (
    PRESETS_CROSSFEED_PRO.find(
      (p) =>
        // En mode classique, seuls le dosage et la coupure comptent.
        r.mode === p.mode &&
        proche(r.amount, p.amount, 0.005) &&
        proche(r.head_shadow_hz, p.head_shadow_hz, 0.5),
    )?.key ?? null
  );
}

/** Le profil nommé qui correspond aux réglages, champ par champ. */
export function profilCrossfeedProActif(
  r: ReglagesCrossfeedPro,
  profils: { id: string; settings: Record<string, unknown> }[],
): string | null {
  const champs = Object.keys(DEFAUTS_CROSSFEED_PRO).filter((c) => c !== 'enabled');
  for (const p of profils) {
    const s = reglagesCrossfeedPro(p.settings);
    if (champs.every((c) => (typeof s[c] === 'number' ? Math.abs((s[c] as number) - (r[c] as number)) < 1e-4 : s[c] === r[c]))) {
      return p.id;
    }
  }
  return null;
}

// ─── Curseur logarithmique de la coupure ────────────────────────────────────

export const POSITIONS_COUPURE = 1000;

export function positionCoupure(hz: number, b: Borne = BORNES_CROSSFEED_PRO.head_shadow_hz): number {
  const v = borner(Number.isFinite(hz) ? hz : DEFAUTS_CROSSFEED_PRO.head_shadow_hz, b);
  return Math.round((Math.log(v / b.min) / Math.log(b.max / b.min)) * POSITIONS_COUPURE);
}

/** Position → coupure, arrondie à un pas lisible (10 Hz sous 1 kHz, 50 Hz
 *  sous 10 kHz, 100 Hz au-delà). */
export function coupureDePosition(position: number, b: Borne = BORNES_CROSSFEED_PRO.head_shadow_hz): number {
  const r = Math.min(1, Math.max(0, Number.isFinite(position) ? position / POSITIONS_COUPURE : 0));
  const hz = b.min * Math.pow(b.max / b.min, r);
  const pas = hz < 1000 ? 10 : hz < 10000 ? 50 : 100;
  return borner(Math.round(hz / pas) * pas, b);
}

// ─── Ce qui empêche le réglage d'agir ───────────────────────────────────────

/** Ce que la sonde de l'hôte a appris du greffon. */
export type PresenceCrossfeedPro =
  | 'inconnue' // pas encore demandé, ou hôte injoignable
  | 'absent' // 404 `plugin_inconnu` : ni sur le disque, ni chargé
  | 'inactif' // présent mais désinstallé, désactivé ou non chargé
  | 'actif';

/** Traduit la réponse (ou le refus) de `GET /audio-plugins/{id}/zones/{zone}`. */
export function presenceDepuis(reponse: { active?: unknown } | null, erreur?: unknown): PresenceCrossfeedPro {
  if (erreur) {
    const e = erreur as ApiError | null;
    if (e?.status === 404 || e?.code === 'plugin_inconnu') return 'absent';
    if (e?.status === 409 || e?.code === 'plugin_unavailable') return 'inactif';
    return 'inconnue';
  }
  if (!reponse || typeof reponse !== 'object') return 'inconnue';
  return reponse.active === true ? 'actif' : 'inactif';
}

/**
 * La zone est-elle STÉRÉO ? Le greffon ne traite que la stéréo.
 *
 * On lit la disposition EFFECTIVE que le serveur publie
 * (`channel_layout_status.effective`), à défaut celle déclarée. Rien de
 * déclaré ⇒ la zone suit son appareil : on n'affirme rien (`null`), mieux vaut
 * se taire que verrouiller un réglage qui marche.
 */
export function zoneStereo(zone: Pick<Zone, 'channel_layout' | 'channel_layout_status'> | null | undefined): boolean | null {
  const disposition = zone?.channel_layout_status?.effective ?? zone?.channel_layout ?? null;
  if (!disposition) return null;
  return disposition === 'stereo';
}
