/**
 * tune-server-rust#5247 — pays proposés pour les Tendances YouTube Music.
 *
 * Le réglage serveur `youtube_charts_country` l'emporte sur la langue du
 * navigateur (que l'écran Découvrir envoie en `?country=`). Vide :
 * automatique ; `ZZ` : classement mondial. Les noms viennent de
 * `Intl.DisplayNames` (`nomDuPays`), dans la langue de l'interface : le client
 * ne tient aucune table de noms.
 */
import { nomDuPays } from './paysAffichage';

export const CLE_PAYS_TENDANCES_YOUTUBE = 'youtube_charts_country';

/** Pays où YouTube Music publie des classements, parmi ceux de nos auditeurs. */
export const PAYS_TENDANCES_YOUTUBE = [
  'AR', 'AT', 'AU', 'BE', 'BR', 'CA', 'CH', 'CZ', 'DE', 'DK', 'ES', 'FI', 'FR', 'GB',
  'HU', 'IE', 'IN', 'IT', 'JP', 'KR', 'MX', 'NL', 'NO', 'NZ', 'PL', 'PT', 'RO', 'SE', 'US',
] as const;

/** Les options du sélecteur, triées par nom dans la langue de l'interface. */
export function optionsPaysTendances(langue: string): { code: string; nom: string }[] {
  return PAYS_TENDANCES_YOUTUBE
    .map((code) => ({ code, nom: nomDuPays(code, langue) || code }))
    .sort((a, b) => a.nom.localeCompare(b.nom, langue));
}

/** La valeur lue dans `GET /system/config` : vide si absente ou illisible. */
export function paysTendancesDuReglage(config: unknown): string {
  const v = (config as Record<string, unknown> | null)?.[CLE_PAYS_TENDANCES_YOUTUBE];
  return typeof v === 'string' && /^[A-Za-z]{2}$/.test(v.trim()) ? v.trim().toUpperCase() : '';
}
