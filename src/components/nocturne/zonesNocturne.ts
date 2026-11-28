/**
 * Sélecteur de zone de Nocturne (itération 5) : les zones rangées par
 * rubrique — sorties locales, lecteurs réseau, autres — comme la fenêtre
 * surgissante de la référence, avec le type de sortie sous chaque nom.
 */
import type { Zone } from '../../lib/types';

export type RubriqueZone = 'locales' | 'reseau' | 'autres';
export const ORDRE_RUBRIQUES: readonly RubriqueZone[] = ['locales', 'reseau', 'autres'];
export const LIBELLE_RUBRIQUE: Record<RubriqueZone, string> = {
  locales: 'nocturne.zones.locales',
  reseau: 'nocturne.zones.reseau',
  autres: 'nocturne.zones.autres',
};

const RESEAU = new Set(['dlna', 'openhome', 'airplay', 'airplay2', 'chromecast', 'bluos', 'snapcast', 'sonos', 'squeezebox', 'oaat', 'devialet_air']);

export function rubriqueDeZone(z: Pick<Zone, 'output_type'>): RubriqueZone {
  const t = z.output_type ?? '';
  if (t === 'local') return 'locales';
  if (RESEAU.has(t)) return 'reseau';
  return 'autres';
}

/** Les rubriques non vides, dans l'ordre, chacune avec ses zones (ordre d'origine gardé). */
export function zonesParRubrique<Z extends Pick<Zone, 'output_type'>>(zones: readonly Z[]): { rubrique: RubriqueZone; zones: Z[] }[] {
  return ORDRE_RUBRIQUES
    .map((rubrique) => ({ rubrique, zones: zones.filter((z) => rubriqueDeZone(z) === rubrique) }))
    .filter((g) => g.zones.length > 0);
}
