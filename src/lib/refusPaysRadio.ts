import { get, writable } from 'svelte/store';
import { t } from './i18n';

export const CODE_REFUS_PAYS_RADIO = 'radio_country_unavailable';

/** #2533 : vrai dès qu'une radio a été refusée pour le pays d'écoute (lien vers le réglage). */
export const refusPaysRadioVu = writable(false);

/** Même phrase pour les deux clients HTTP et les écrans de l'annuaire. */
export function messageRefusPaysRadio(corps: unknown): string | null {
  if (!corps || typeof corps !== 'object') return null;
  const objet = corps as Record<string, unknown>;
  if ((objet.code ?? objet.error_code) !== CODE_REFUS_PAYS_RADIO) return null;
  refusPaysRadioVu.set(true);
  return get(t)('playback.errorRadioCountry' as any);
}
