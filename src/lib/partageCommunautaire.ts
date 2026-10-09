/**
 * Partage communautaire — les deux réglages que la nouvelle interface avait
 * perdus (renesenses/tune-web-client#1866).
 *
 * 1. `community_sync_enabled` : la synchronisation communautaire automatique
 *    (toutes les 30 min, côté serveur `community_sync::spawn`). La bascule
 *    « Partage communautaire des métadonnées » vivait dans l'ancien
 *    `SettingsView` et a disparu avec lui (d5ed7deb, phase 5).
 * 2. `community_contribution_enabled` : le consentement à l'ENVOI (bios et
 *    images d'artistes). Le serveur publie dans `GET /system/config` un bloc
 *    `community_contribution` prêt à afficher (`setting_key`, `enabled`,
 *    `effective`, `label`, `description` traduits) ; aucun client ne l'avait
 *    jamais lu.
 *
 * Côté serveur (`tune-core/src/cloud/consent.rs`), les deux verrous exigent
 * la télémétrie ET leur propre clé : la télémétrie est nécessaire, pas
 * suffisante. Les deux sont opt-in strict (défaut NON).
 *
 * Aucune route neuve : lecture par `GET /system/config`, écriture par
 * `PATCH /system/config`, comme l'ancien écran.
 */

export const CLE_SYNC_COMMUNAUTAIRE = 'community_sync_enabled';
export const CLE_CONTRIBUTION_DEFAUT = 'community_contribution_enabled';

/**
 * Lit un booléen de réglage comme le serveur (`consent::est_vrai`) : seules
 * les formes usuelles du vrai valent oui, tout le reste (absent, illisible)
 * vaut NON — le doute penche du côté qui n'envoie rien.
 */
export function reglageVrai(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === 'number') return v === 1;
  if (typeof v !== 'string') return false;
  const s = v.trim().replace(/^"+|"+$/g, '').toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'on';
}

export interface ContributionCommunautaire {
  /** Clé à écrire par `PATCH /system/config`. */
  cle: string;
  /** Le choix de l'utilisateur (état de la bascule). */
  active: boolean;
  /** Ce qui va réellement se passer, télémétrie et `TUNE_TELEMETRY` compris. */
  effective: boolean;
  /** Libellé et description fournis par le serveur, traduits, ou `null`. */
  libelle: string | null;
  description: string | null;
}

/**
 * Le bloc `community_contribution` de `GET /system/config`, ou `null` si le
 * serveur ne le publie pas (serveur antérieur) : la bascule n'est alors pas
 * offerte, plutôt qu'une case qui prétendrait un état inconnu.
 */
export function contributionDepuisConfig(config: unknown): ContributionCommunautaire | null {
  const bloc = (config as any)?.community_contribution;
  if (!bloc || typeof bloc !== 'object') return null;
  const cle = typeof bloc.setting_key === 'string' && bloc.setting_key
    ? bloc.setting_key
    : CLE_CONTRIBUTION_DEFAUT;
  const active = reglageVrai(bloc.enabled);
  return {
    cle,
    active,
    // Absent : on ne promet rien de plus que le choix lui-même.
    effective: typeof bloc.effective === 'boolean' ? bloc.effective : active,
    libelle: typeof bloc.label === 'string' && bloc.label.trim() ? bloc.label : null,
    description: typeof bloc.description === 'string' && bloc.description.trim() ? bloc.description : null,
  };
}
