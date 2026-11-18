/**
 * tune-server-rust#8696 — la période WASAPI exclusive d'une zone.
 *
 * Didier (SMSL SU-8 en USB, Windows) entend des « sauts de vinyle » à la
 * période par défaut de 10 ms ; une période plus longue (50 ms) les absorbe.
 * Le serveur publie le réglage (`wasapi_exclusive_period_ms`, `null` = Auto),
 * les choix proposés et s'il a un effet (`wasapi_exclusive_period_applicable`,
 * vrai sur un serveur Windows). L'écran ne recalcule rien.
 */
import type { Zone } from './types';

/** Choix par défaut si le serveur ne les publie pas. */
export const CHOIX_PERIODE_WASAPI_MS = [10, 20, 50, 100] as const;

type ZonePeriode = Pick<
  Zone,
  | 'output_type'
  | 'exclusive_mode'
  | 'wasapi_exclusive_period_ms'
  | 'wasapi_exclusive_period_choices_ms'
  | 'wasapi_exclusive_period_applicable'
>;

/**
 * Le sélecteur n'a de sens que pour une zone LOCALE d'un serveur Windows
 * qui connaît le réglage, et pas quand la zone est réglée en partagé.
 */
export function periodeWasapiVisible(z: ZonePeriode): boolean {
  return (
    z.output_type === 'local' &&
    z.wasapi_exclusive_period_applicable === true &&
    z.exclusive_mode !== false &&
    z.wasapi_exclusive_period_ms !== undefined
  );
}

/**
 * Les valeurs du sélecteur (hors « Auto »), croissantes. Une valeur réglée
 * ailleurs (API, autre client) et absente de la liste y est ajoutée, pour
 * que le sélecteur montre ce que le serveur applique.
 */
export function choixPeriodeWasapi(z: ZonePeriode): number[] {
  const base = (z.wasapi_exclusive_period_choices_ms?.length
    ? z.wasapi_exclusive_period_choices_ms
    : [...CHOIX_PERIODE_WASAPI_MS]
  ).filter((ms) => Number.isFinite(ms) && ms > 0);
  const actuelle = z.wasapi_exclusive_period_ms;
  const toutes = typeof actuelle === 'number' && actuelle > 0 && !base.includes(actuelle)
    ? [...base, actuelle]
    : [...base];
  return toutes.sort((a, b) => a - b);
}
