/**
 * Niveau d'interface v2 — étend `settingLevels` (aujourd'hui limité à la vue
 * Réglages) à TOUTE l'interface : navigation, densité de la bibliothèque,
 * détail technique. On réutilise le même `SettingsLevel` (beginner /
 * intermediate / expert) et le même stockage (`preferences.settingsLevel`,
 * défaut débutant pour tous — décision Bertrand du 14/08), pour qu'un seul
 * réglage pilote toute la profondeur de l'UI.
 *
 * Correspondance produit (Essential / Advanced / Expert de la maquette Levente) :
 *   beginner     → Essential  (le strict nécessaire)
 *   intermediate → Advanced   (podcasts, streaming, file, favoris, zones)
 *   expert       → Expert      (section « Studio » : EQ, convertisseur, méta…)
 */
import { SETTINGS_LEVELS, type SettingsLevel } from './settingLevels';

export type { SettingsLevel };

/** Rang croissant d'un niveau (0 = débutant). */
export function levelRank(l: SettingsLevel): number {
  return SETTINGS_LEVELS.indexOf(l);
}

/** Le niveau courant atteint-il AU MOINS `min` ? (ex. montrer le groupe
 *  Avancé dès `intermediate`). */
export function atLeast(current: SettingsLevel, min: SettingsLevel): boolean {
  return levelRank(current) >= levelRank(min);
}

/** Libellés produit affichés dans le sélecteur (menu avatar). */
export const LEVEL_LABELS: Record<SettingsLevel, string> = {
  beginner: 'Essential',
  intermediate: 'Advanced',
  expert: 'Expert',
};
