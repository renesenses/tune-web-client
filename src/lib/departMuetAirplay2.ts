import { get } from 'svelte/store';
import { t } from './i18n';
import { lireEvenementErreur } from './messageServeur';

/**
 * tune-server-rust#8402 (décision du 11/11/2026) — une zone AirPlay 2 en
 * volume fixe ou en PURE verrouillé ouvre sa session à 0 %, plus à 100 %. Le
 * serveur le dit par un `zone.playback_error` NON fatal, avec l'un de ces
 * codes. La zone JOUE : c'est un avertissement, pas un échec.
 *
 * Il arrive dans la seconde qui suit un Lire, donc en pleine fenêtre de grâce
 * (#1146), qui le taisait comme un échec passager : il passe avant elle, en
 * information, traduit (`erreursServeur.<code>`).
 */
export const CODES_DEPART_MUET_AIRPLAY2 = new Set<string>([
  'airplay2_start_volume_zero_fixed',
  'airplay2_start_volume_zero_pure',
]);

/** L'événement est-il l'avertissement de départ à 0 % ? */
export function estDepartMuetAirplay2(data: { code?: unknown } | null | undefined): boolean {
  return typeof data?.code === 'string' && CODES_DEPART_MUET_AIRPLAY2.has(data.code);
}

/** Le texte de l'avertissement, dans la langue de l'interface. */
export function texteDepartMuetAirplay2(data: Record<string, unknown> | null | undefined): string {
  return lireEvenementErreur(data, 'library.playbackError').message || get(t)('library.playbackError');
}
