/**
 * web#3233 — les DEUX sélecteurs de thème (écran Réglages et menu de
 * l'avatar) passent par ces deux gestes. Le menu de l'avatar n'écrivait que
 * `preferences.v2Theme` : avec « Mon thème » actif, que la coquille peint en
 * priorité, la pastille cliquée ne changeait rien à l'écran.
 *
 * Module à part : `stores/monTheme` reste sans dépendance aux préférences
 * (lues dans `localStorage` dès l'import).
 */
import { get } from 'svelte/store';
import { preferences } from './preferences';
import { activerMonTheme, themeDuProfil } from './monTheme';
import type { V2Theme } from '../v2Theme';

/**
 * Une palette standard choisie : « Mon thème » se met de côté (gardé sur le
 * serveur, réactivable d'un clic sur sa pastille). #2527
 */
export function choisirPaletteStandard(theme: V2Theme): void {
  preferences.update((p) => ({ ...p, v2Theme: theme }));
  if (get(themeDuProfil).actif) void activerMonTheme(false).catch(() => {});
}

/** Réactive « Mon thème » rangé dans le profil (sa pastille). */
export function choisirMonThemeRange(): void {
  const e = get(themeDuProfil);
  if (!e.theme || e.actif) return;
  void activerMonTheme(true).catch(() => {});
}
