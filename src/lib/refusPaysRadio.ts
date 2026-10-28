import { get } from 'svelte/store';
import { t } from './i18n';

export const CODE_REFUS_PAYS_RADIO = 'radio_country_unavailable';

/** Même phrase pour les deux clients HTTP et les écrans de l'annuaire. */
export function messageRefusPaysRadio(corps: unknown): string | null {
  if (!corps || typeof corps !== 'object') return null;
  const objet = corps as Record<string, unknown>;
  return (objet.code ?? objet.error_code) === CODE_REFUS_PAYS_RADIO
    ? get(t)('playback.errorRadioCountry' as any) : null;
}
