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

/**
 * Clés i18n des libellés produit affichés dans le sélecteur (menu avatar).
 *
 * C'étaient des chaînes ANGLAISES figées — `Essential` / `Advanced` / `Expert`
 * — dans une interface par ailleurs traduite en onze langues. L'utilisateur
 * lisait donc « Advanced » dans le menu et « Avancé » deux clics plus loin, sur
 * l'écran Réglages qui, lui, parlait français. Décision de Bertrand du
 * 01/09/2026 : les niveaux se traduisent PARTOUT.
 *
 * Vocabulaire volontairement distinct de `settings.levelBeginner/…`, qui porte
 * celui du client actuel (« Débutant / Intermédiaire »). Ici c'est celui de la
 * maquette Levente : Essentiel / Avancé / Expert. Un seul mot est commun aux
 * deux, « Expert », et sa clé est donc réutilisée telle quelle.
 */
export const LEVEL_LABEL_KEYS: Record<SettingsLevel, string> = {
  beginner: 'settings.levelEssential',
  intermediate: 'settings.levelAdvanced',
  expert: 'settings.levelExpert',
};
