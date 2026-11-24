// @vitest-environment jsdom
//
// web#3233 (fil 2934, rc12) — « Lorsque Mon thème est sélectionné dans les
// Réglages, la sélection d'un thème par la pastille en haut à droite est
// désactivée. Par ailleurs, Mon thème est manquant à la liste. »
//
// Le menu de l'avatar n'écrivait que `preferences.v2Theme` ; la coquille peint
// « Mon thème » en priorité : la pastille cliquée ne changeait rien. Il doit se
// comporter comme les Réglages : la pastille « Mon thème » y figure, et une
// palette standard choisie met « Mon thème » de côté.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import AvatarMenu from '../../components/v2/AvatarMenu.svelte';
import { preparerLocale } from '../i18n';
import { preferences } from '../stores/preferences';
import { themeDuProfil, urlMonTheme } from '../stores/monTheme';
import { V2_THEMES } from '../v2Theme';
import type { ThemePerso } from '../monTheme';

const MON_THEME: ThemePerso = {
  format: 'tune-theme', version: 1, name: 'Nuit verte',
  colors: {
    '--v2-bg': '#000000', '--v2-bg2': '#080A09', '--v2-surface': '#1F2321',
    '--v2-surface2': '#151817', '--v2-hover': '#101312',
    '--v2-txt': '#FFFFFF', '--v2-txt2': '#D2D8D5', '--v2-txt3': '#A9B1AD',
    '--v2-acc1': '#2A9F5B', '--v2-acc2': '#28BA9B', '--v2-acc-tint': '#E4F9D8',
    '--v2-on-acc': '#000000', '--v2-line': '#2B302D', '--v2-line2': '#3A413D',
    '--v2-active1': '#0F2A1B', '--v2-active2': '#0A1A12', '--v2-player1': '#050606',
    '--v2-player2': '#000000', '--v2-danger': '#FF8F87', '--v2-danger-bd': '#FF6B6B',
  },
};

let hote: HTMLDivElement;
let vue: ReturnType<typeof mount>;
let avant = get(preferences);
let envois: { url: string; methode: string; corps: any }[] = [];
const attendre = async () => { for (let n = 0; n < 6; n++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };

beforeEach(async () => {
  avant = get(preferences);
  envois = [];
  await preparerLocale('fr');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const corps = init?.body ? JSON.parse(String(init.body)) : null;
    envois.push({ url: String(url), methode: init?.method ?? 'GET', corps });
    if (String(url).includes('/ext/mon-theme/theme/actif')) {
      return new Response(JSON.stringify({ actif: corps?.actif, theme: MON_THEME }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ configured: false, connected: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  urlMonTheme.set('/api/v1/ext/mon-theme/theme');
  themeDuProfil.set({ actif: true, theme: MON_THEME });
  preferences.update((p) => ({ ...p, v2Theme: V2_THEMES[0].id }));
  hote = document.createElement('div'); document.body.append(hote);
  vue = mount(AvatarMenu, { target: hote }); await attendre();
  hote.querySelector<HTMLButtonElement>('button.avatar')!.click(); await attendre();
});

afterEach(async () => {
  await unmount(vue); hote.remove(); preferences.set(avant);
  themeDuProfil.set({ actif: false, theme: null }); urlMonTheme.set(null);
  vi.unstubAllGlobals();
});

const pastilles = () => [...hote.querySelectorAll<HTMLButtonElement>('.themes button.sw')];
const pastilleMonTheme = () => hote.querySelector<HTMLButtonElement>('.themes [data-pastille-mon-theme]');

it('« Mon thème » figure parmi les pastilles du menu, allumé quand il est actif', () => {
  expect(pastilleMonTheme(), 'la pastille « Mon thème » manque au menu').not.toBeNull();
  expect(pastilleMonTheme()!.getAttribute('aria-pressed')).toBe('true');
  // Aucune palette standard ne se dit affichée : c'est « Mon thème » qu'on voit.
  const standards = pastilles().filter((b) => !b.hasAttribute('data-pastille-mon-theme'));
  expect(standards.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(0);
});

it('choisir une palette standard met « Mon thème » de côté', async () => {
  const cible = V2_THEMES[1];
  const bouton = pastilles().find((b) => b.getAttribute('style')?.includes(cible.swatch[0]))!;
  bouton.click(); await attendre();
  expect(get(preferences).v2Theme).toBe(cible.id);
  const desactivation = envois.find((e) => e.url.endsWith('/ext/mon-theme/theme/actif') && e.methode === 'PUT');
  expect(desactivation, '« Mon thème » doit être éteint au serveur').toBeTruthy();
  expect(desactivation!.corps).toEqual({ actif: false });
  expect(get(themeDuProfil).actif).toBe(false);
  expect(bouton.getAttribute('aria-pressed')).toBe('true');
  expect(pastilleMonTheme()!.getAttribute('aria-pressed')).toBe('false');
});

it('la pastille « Mon thème » le réactive', async () => {
  themeDuProfil.set({ actif: false, theme: MON_THEME }); await attendre();
  pastilleMonTheme()!.click(); await attendre();
  expect(envois.find((e) => e.url.endsWith('/ext/mon-theme/theme/actif'))?.corps).toEqual({ actif: true });
  expect(get(themeDuProfil).actif).toBe(true);
});
