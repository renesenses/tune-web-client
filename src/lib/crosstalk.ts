/**
 * Crosstalk — le greffon audio natif PREMIUM (identifiant `crosstalk`),
 * traitement pour ENCEINTES, jamais au casque.
 *
 * Comme pour Crossfeed Pro, ce client n'en connaît QUE l'interface : les noms
 * des réglages, leurs bornes, leurs défauts et les libellés que le greffon
 * publie. Le traitement vit dans le greffon (dépôt privé), pas ici.
 *
 * Routes de l'hôte (génériques des greffons natifs tiers) :
 *   GET|PUT  /audio-plugins/crosstalk/zones/{zone}   réglage de la zone
 *   GET|POST /audio-plugins/crosstalk/profiles        profils nommés
 *   DELETE   /audio-plugins/crosstalk/profiles/{id}
 *
 * L'hôte ne publie pas le schéma : bornes et défauts sont recopiés ici depuis
 * le schéma de réglages déclaré par le greffon. Un réglage hors bornes est de
 * toute façon refusé par le greffon (400 `invalid_plugin_settings`).
 *
 * EXCLUSION (web#2580, tune-server-rust#7616) : crossfeed (casque) et
 * crosstalk (enceintes) ne se cumulent jamais sur une zone ; `crosstalk`
 * l'emporte. Tant que la route ne publie pas « la voie en service »
 * (tune-server-rust#7627), le client DÉDUIT l'état du réglage de zone de
 * `crosstalk` (`crosstalkTraite`).
 */
import type { Borne } from './crossfeedPro';

export const CROSSTALK_ID = 'crosstalk';

export interface ReglagesCrosstalk {
  enabled: boolean;
  separation_db: number;
  angle_deg: number;
  distance_m: number;
  band_low_hz: number;
  band_high_hz: number;
  gain_ceiling_db: number;
  /** Un champ inconnu (greffon plus récent) est gardé tel quel. */
  [autre: string]: unknown;
}

export type CurseurCrosstalk =
  | 'separation_db'
  | 'angle_deg'
  | 'distance_m'
  | 'band_low_hz'
  | 'band_high_hz'
  | 'gain_ceiling_db';

/** L'ordre d'affichage des six réglages. */
export const CURSEURS_CROSSTALK: readonly CurseurCrosstalk[] = [
  'separation_db',
  'angle_deg',
  'distance_m',
  'band_low_hz',
  'band_high_hz',
  'gain_ceiling_db',
];

/** Bornes du schéma de réglages du greffon ; le pas est un choix d'interface. */
export const BORNES_CROSSTALK: Record<CurseurCrosstalk, Borne> = {
  separation_db: { min: 3, max: 12, pas: 0.5 },
  angle_deg: { min: 25, max: 70, pas: 0.1 },
  distance_m: { min: 1, max: 4, pas: 0.05 },
  band_low_hz: { min: 150, max: 1000, pas: 10 },
  band_high_hz: { min: 2000, max: 10000, pas: 100 },
  gain_ceiling_db: { min: 3, max: 12, pas: 0.5 },
};

/** Défauts du schéma : éteint. */
export const DEFAUTS_CROSSTALK: ReglagesCrosstalk = {
  enabled: false,
  separation_db: 6,
  angle_deg: 30,
  distance_m: 2.5,
  band_low_hz: 250,
  band_high_hz: 5000,
  gain_ceiling_db: 6,
};

/** Le libellé et la note courte de chaque réglage (textes du greffon). */
export const LIBELLES_CROSSTALK: Record<CurseurCrosstalk, { cle: string; note: string; unite: string }> = {
  separation_db: { cle: 'v2.xtc.separation', note: 'v2.xtc.separationNote', unite: 'dB' },
  angle_deg: { cle: 'v2.xtc.angle', note: 'v2.xtc.geometryNote', unite: '°' },
  distance_m: { cle: 'v2.xtc.distance', note: 'v2.xtc.geometryNote', unite: 'm' },
  band_low_hz: { cle: 'v2.xtc.bandLow', note: 'v2.xtc.bandNote', unite: 'Hz' },
  band_high_hz: { cle: 'v2.xtc.bandHigh', note: 'v2.xtc.bandNote', unite: 'Hz' },
  gain_ceiling_db: { cle: 'v2.xtc.gainCeiling', note: 'v2.xtc.gainCeilingNote', unite: 'dB' },
};

/** La valeur affichée d'un réglage, avec son repère d'unité (jamais traduit). */
export function valeurCrosstalk(cle: CurseurCrosstalk, v: number): string {
  const { unite } = LIBELLES_CROSSTALK[cle];
  const chiffres = cle === 'band_low_hz' || cle === 'band_high_hz' ? 0 : cle === 'distance_m' ? 2 : 1;
  return `${v.toFixed(chiffres)}${unite === '°' ? '°' : ` ${unite}`}`;
}

/** Les profils LIVRÉS par le greffon et leur libellé traduit. */
export const PROFILS_LIVRES_CROSSTALK: Record<string, string> = {
  doux: 'v2.xtc.profileDoux',
  installation_thierry: 'v2.xtc.profileInstallationThierry',
  stereo_60: 'v2.xtc.profileStereo60',
  prudent: 'v2.xtc.profilePrudent',
};

/** Le libellé d'un profil : traduit pour un profil livré, son nom sinon. */
export function libelleProfilCrosstalk(p: { id: string; name: string }): { cle: string | null; nom: string } {
  return { cle: PROFILS_LIVRES_CROSSTALK[p.id] ?? null, nom: p.name };
}

function borner(v: number, b: Borne): number {
  return Math.min(b.max, Math.max(b.min, v));
}

/**
 * Ce que l'hôte a rendu (`settings`, `null` tant que la zone n'a rien
 * enregistré), complété par les défauts et borné. Un champ illisible retombe
 * sur son défaut ; un champ inconnu est gardé.
 */
export function reglagesCrosstalk(brut: unknown): ReglagesCrosstalk {
  const src = brut && typeof brut === 'object' && !Array.isArray(brut) ? (brut as Record<string, unknown>) : {};
  const r: ReglagesCrosstalk = { ...src, ...DEFAUTS_CROSSTALK };
  if (typeof src.enabled === 'boolean') r.enabled = src.enabled;
  for (const cle of CURSEURS_CROSSTALK) {
    const v = src[cle];
    if (typeof v === 'number' && Number.isFinite(v)) r[cle] = v;
    r[cle] = borner(r[cle], BORNES_CROSSTALK[cle]);
  }
  return r;
}

/** Le profil nommé qui correspond aux réglages, champ par champ. */
export function profilCrosstalkActif(
  r: ReglagesCrosstalk,
  profils: { id: string; settings: Record<string, unknown> }[],
): string | null {
  for (const p of profils) {
    const s = reglagesCrosstalk(p.settings);
    if (CURSEURS_CROSSTALK.every((c) => Math.abs(s[c] - r[c]) < 1e-4)) return p.id;
  }
  return null;
}

/**
 * Crosstalk TRAITE-t-il la zone ? Le greffon est actif (installé, activé,
 * chargé) ET sa case est cochée sur cette zone. Le crossfeed intégré et
 * Crossfeed Pro de la zone sont alors ÉCARTÉS (tune-server-rust#7616).
 */
export function crosstalkTraite(
  reponse: { active?: unknown; settings?: unknown } | null | undefined,
): boolean {
  if (!reponse || typeof reponse !== 'object' || reponse.active !== true) return false;
  const s = reponse.settings as { enabled?: unknown } | null | undefined;
  return !!s && typeof s === 'object' && s.enabled === true;
}
