/**
 * Les greffons audio natifs TIERS, pour l'écran Extensions.
 *
 * Ils ne figurent pas dans `GET /plugins` (la liste de l'écran) : l'hôte les
 * publie à part, dans `GET /audio-plugins` (`third_party: true`), avec leur
 * état de chargement. Vécu le 28/09/2026 sur le .18 : Crossfeed Pro installé
 * et chargé (`native_loaded: true`), et visible nulle part dans l'interface.
 */
import type { GreffonAudioNatif } from './api';
import type { View } from './stores/navigation';
import { CROSSFEED_PRO_ID } from './crossfeedPro';

/** L'écran de réglage de chaque greffon natif tiers qui en a un. */
export const ECRANS_GREFFONS_NATIFS: Record<string, View> = {
  [CROSSFEED_PRO_ID]: 'crossfeedpro',
};

/** Le nom à montrer : une clé de traduction pour les greffons connus,
 *  l'identifiant sinon (l'hôte ne publie pas de nom d'affichage). */
export const NOMS_GREFFONS_NATIFS: Record<string, string> = {
  [CROSSFEED_PRO_ID]: 'v2.nav.crossfeedPro',
};

export type EtatChargement = 'charge' | 'erreur' | 'non_charge';

export function etatDeChargement(g: Pick<GreffonAudioNatif, 'native_loaded' | 'error'>): EtatChargement {
  if (g.error) return 'erreur';
  return g.native_loaded ? 'charge' : 'non_charge';
}

/** Les seuls greffons TIERS, triés par identifiant. */
export function greffonsNatifsTiers(liste: GreffonAudioNatif[] | null | undefined): GreffonAudioNatif[] {
  return (liste ?? []).filter((g) => g && g.third_party === true && typeof g.id === 'string')
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** L'écran à ouvrir, seulement si le greffon en a un ET qu'il est chargé. */
export function ecranDuGreffon(g: Pick<GreffonAudioNatif, 'id' | 'native_loaded' | 'error'>): View | null {
  return etatDeChargement(g) === 'charge' ? ECRANS_GREFFONS_NATIFS[g.id] ?? null : null;
}

/**
 * Les greffons natifs que l'écran Extensions propose d'installer depuis le
 * catalogue de mozaiklabs (`POST /audio-plugins/{id}/install-from-catalog`).
 * Chacun a une description traduite ; tous exigent le Premium.
 */
export const CATALOGUE_GREFFONS_NATIFS: readonly string[] = [CROSSFEED_PRO_ID];

export const DESCRIPTIONS_GREFFONS_NATIFS: Record<string, string> = {
  [CROSSFEED_PRO_ID]: 'v2.plug.crossfeedProDesc',
};

/** Les greffons du catalogue qui ne sont PAS encore sur ce serveur. */
export function greffonsAProposer(installes: Pick<GreffonAudioNatif, 'id'>[] | null | undefined): string[] {
  const presents = new Set((installes ?? []).map((g) => g.id));
  return CATALOGUE_GREFFONS_NATIFS.filter((id) => !presents.has(id));
}

/** Les refus de l'installation depuis le catalogue qui ont leur phrase. */
const REFUS_CONNUS = new Set([
  'premium_required',
  'not_connected',
  // #5601 — le site refuse le jeton du compte (412) : à reconnecter, ce
  // n'est PAS un défaut de licence.
  'account_token_rejected',
  'no_package_for_target',
  'plugin_not_in_catalog',
  'signature_invalid',
  'catalog_unreachable',
  'catalog_rate_limited',
  'package_checksum_mismatch',
]);

/** La clé de traduction d'un refus d'installation (`err.code`). */
export function cleDuRefusDInstallation(code: string | null | undefined): string {
  return code && REFUS_CONNUS.has(code) ? `v2.plug.catalogErr_${code}` : 'v2.plug.catalogErr_other';
}
