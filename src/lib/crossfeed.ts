import type { CrossfeedSettings } from './api';

/** Bornes acceptées par le serveur (`/zones/{id}/dsp`). Au-delà, il rogne
 *  lui-même — on le fait avant d'envoyer pour que l'écran montre la valeur
 *  qui sera réellement appliquée, pas celle qu'on a demandée. */
export const CF_MIN_AMOUNT = 0;
export const CF_MAX_AMOUNT = 0.5;
export const CF_MIN_DELAY = 0;
export const CF_MAX_DELAY = 5;

export interface CrossfeedPreset {
  key: string;
  labelKey: string;
  amount: number;
  delay: number;
}

/** Les trois réglages tout faits, en valeurs RÉELLES.
 *
 *  Une seule définition : l'égaliseur et « En écoute » doivent proposer les
 *  mêmes, sinon « Standard » ne veut plus rien dire d'un écran à l'autre. */
export const CF_PRESETS: CrossfeedPreset[] = [
  { key: 'light', labelKey: 'dsp.crossfeedPresetLight', amount: 0.25, delay: 0.3 },
  { key: 'standard', labelKey: 'dsp.crossfeedPresetStandard', amount: 0.3, delay: 0.5 },
  { key: 'strong', labelKey: 'dsp.crossfeedPresetStrong', amount: 0.4, delay: 0.7 },
];

const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** La charge utile à envoyer, bornée. */
export function reglagesCrossfeed(
  enabled: boolean,
  amount: number,
  delay_ms: number
): CrossfeedSettings {
  return {
    enabled,
    amount: borner(amount, CF_MIN_AMOUNT, CF_MAX_AMOUNT),
    delay_ms: borner(delay_ms, CF_MIN_DELAY, CF_MAX_DELAY),
  };
}

/** Quel réglage tout fait correspond aux valeurs courantes, s'il y en a un.
 *
 *  Comparaison à une tolérance près : les curseurs travaillent au centième et
 *  une égalité stricte sur des flottants n'allumerait jamais le bouton. */
export function presetActif(amount: number, delay_ms: number): string | null {
  const proche = (a: number, b: number) => Math.abs(a - b) < 0.005;
  return (
    CF_PRESETS.find((p) => proche(p.amount, amount) && proche(p.delay, delay_ms))?.key ?? null
  );
}
