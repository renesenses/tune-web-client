import { gainDeLaZone, volumeDepuisGain } from './courbeDeVolume';

/** Contrat #7333 : pour-cent, grille comptée depuis min. */
export interface PlageVolumeSortie { min: number; max: number; step: number }

/** Les réponses anciennes restent utilisables ; seul un refus explicite interdit. */
export interface CapacitesVolumeSortie {
  can_set_volume?: boolean;
  can_mute?: boolean;
  volume_percent_range?: PlageVolumeSortie | null;
}

export interface ZoneAvecCapacitesVolume {
  output_type?: string;
  volume_curve?: string | null;
  output_capabilities?: CapacitesVolumeSortie | null;
}

export function volumeCommandable(zone: ZoneAvecCapacitesVolume | null | undefined): boolean {
  if (!zone) return false;
  if (zone.output_type === 'browser') return true;
  const annonce = zone.output_capabilities?.volume_percent_range;
  return zone.output_capabilities?.can_set_volume !== false
    && (annonce == null || plageVolumeSortie(zone) !== null);
}

export function plageVolumeSortie(zone: ZoneAvecCapacitesVolume | null | undefined): PlageVolumeSortie | null {
  if (zone?.output_type === 'browser') return null;
  const p = zone?.output_capabilities?.volume_percent_range;
  if (!p || ![p.min, p.max, p.step].every(Number.isInteger)
    || p.min < 0 || p.max > 100 || p.min > p.max || p.step <= 0 || p.step > 255) return null;
  return p;
}

/** Primitive stable : un écho avec un nouvel objet ne révoque pas une consigne. */
export function clePlageVolumeSortie(zone: ZoneAvecCapacitesVolume | null | undefined): string {
  const p = plageVolumeSortie(zone);
  return p ? `${p.min}:${p.max}:${p.step}` : '';
}

export function bornesCurseurSortie(zone: ZoneAvecCapacitesVolume | null | undefined, echelle = 1) {
  const p = plageVolumeSortie(zone);
  if (!p) return { min: 0, max: echelle, step: echelle / 100 as number | 'any' };
  const dernier = p.min + Math.floor((p.max - p.min) / p.step) * p.step;
  const perceptif = zone?.volume_curve === 'db60';
  return { min: perceptif ? volumeDepuisGain(zone, p.min / 100) * echelle : p.min * (echelle / 100),
    max: perceptif ? volumeDepuisGain(zone, dernier / 100) * echelle : dernier * (echelle / 100),
    step: perceptif ? 'any' as const : p.step * (echelle / 100) };
}

const EPS = 1e-7;
/** Ne jamais relever une demande hors plage au minimum de l'appareil.
 * Le plafond évite qu'un arrondi sur le cran supérieur dépasse une limite. */
export function normaliserVolumeSortie(
  zone: ZoneAvecCapacitesVolume | null | undefined, cible: number, plafond = 1,
): number | null {
  if (!volumeCommandable(zone)) return null;
  const p = plageVolumeSortie(zone);
  if (!p) return cible;
  if (!Number.isFinite(cible) || cible < 0 || cible > 1) return null;
  const pourcent = gainDeLaZone(zone, cible) * 100;
  if (pourcent < p.min - EPS || pourcent > p.max + EPS) return null;
  const dernier = Math.floor((Math.min(p.max, gainDeLaZone(zone, plafond) * 100) - p.min + EPS) / p.step);
  if (dernier < 0) return null;
  // Le setter OAAT passe d’abord au pour-cent entier, puis applique sa grille.
  const cran = Math.max(0, Math.min(dernier, Math.round((Math.round(pourcent) - p.min) / p.step)));
  return volumeDepuisGain(zone, (p.min + cran * p.step) / 100);
}

/** Un bouton franchit le cran suivant ; ajouter 1 % puis arrondir peut rester immobile. */
export function pasVolumeSortie(
  zone: ZoneAvecCapacitesVolume | null | undefined, actuel: number, direction: 'up' | 'down', plafond = 1,
): number {
  const p = plageVolumeSortie(zone);
  if (!p || !volumeCommandable(zone)) return actuel;
  const pourcent = gainDeLaZone(zone, actuel) * 100;
  const dernier = Math.floor((Math.min(p.max, gainDeLaZone(zone, plafond) * 100) - p.min + EPS) / p.step);
  const position = (pourcent - p.min) / p.step;
  const cran = direction === 'up' ? Math.max(0, Math.floor(position + EPS) + 1)
    : Math.min(dernier, Math.ceil(position - EPS) - 1);
  if (cran < 0 || cran > dernier) return actuel;
  return volumeDepuisGain(zone, (p.min + cran * p.step) / 100);
}

export function sourdineCommandable(zone: ZoneAvecCapacitesVolume | null | undefined): boolean {
  return !!zone && (zone.output_type === 'browser' || zone.output_capabilities?.can_mute !== false);
}
