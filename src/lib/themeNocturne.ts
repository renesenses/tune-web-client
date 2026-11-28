/**
 * Thème de l'interface « Nocturne » (sombre ou clair), propre à cet appareil.
 *
 * Itération 5 (27/11/2026) : sorti de `ShellNocturne` pour que `ShellV2` le
 * lise aussi. C'est `ShellV2` qui pose l'interface active sur `<html>`
 * (`poserInterfaceSurRacine`, `lib/interfaceSalon.ts`) : les calques posés
 * HORS de la coquille Nocturne — dialogues, bandeaux, menus, session expirée —
 * suivent ainsi le thème choisi dans le tiroir, sans deuxième écrivain.
 */
import { writable } from 'svelte/store';

export type ThemeNocturne = 'sombre' | 'clair';
export const CLE_THEME_NOCTURNE = 'tune-nocturne-theme';

export function lireThemeNocturne(): ThemeNocturne {
  try { return localStorage.getItem(CLE_THEME_NOCTURNE) === 'clair' ? 'clair' : 'sombre'; } catch { return 'sombre'; }
}

export const themeNocturne = writable<ThemeNocturne>(lireThemeNocturne());

/** Change le thème et le retient sur cet appareil. */
export function choisirThemeNocturne(theme: ThemeNocturne, retenir = true): void {
  themeNocturne.set(theme);
  if (!retenir) return;
  try { localStorage.setItem(CLE_THEME_NOCTURNE, theme); } catch { /* stockage refusé : réglage de session */ }
}
