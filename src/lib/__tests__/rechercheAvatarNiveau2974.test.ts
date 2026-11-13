// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import AvatarMenu from '../../components/v2/AvatarMenu.svelte';
import { preparerLocale } from '../i18n';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import fr from '../locales/fr';
let hote: HTMLDivElement;
let vue: ReturnType<typeof mount>;
let avant = get(preferences);
const attendre = async () => { for (let n = 0; n < 6; n++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
beforeEach(async () => {
  avant = get(preferences);
  await preparerLocale('fr');
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ configured: false, connected: false }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
  hote = document.createElement('div'); document.body.append(hote);
  vue = mount(AvatarMenu, { target: hote }); await attendre();
  hote.querySelector<HTMLButtonElement>('button.avatar')!.click(); await attendre();
});
afterEach(async () => { await unmount(vue); hote.remove(); preferences.set(avant); v2SettingsTarget.set(null); vi.unstubAllGlobals(); });
it('le menu avatar annonce le réglage Expert masqué en Essentiel, sans bloquer sa navigation', async () => {
  const saisie = hote.querySelector<HTMLInputElement>('input[type=search]')!;
  saisie.value = 'WASAPI'; saisie.dispatchEvent(new Event('input', { bubbles: true })); await attendre();
  const resultat = hote.querySelector<HTMLButtonElement>('.hit')!;
  expect(resultat).not.toBeNull();
  expect(resultat.textContent, 'le résultat doit expliquer pourquoi le réglage est masqué').toContain(fr['reglages.recherche.masque'].replace('{niveau}', fr['settings.levelExpert']));
  resultat.click(); await attendre(); expect(get(v2SettingsTarget)?.reglage).toBeTruthy();
  expect(get(preferences).settingsLevel).toBe('beginner');
});
it('le menu avatar ne dit pas masqué lorsque le niveau Expert rend le réglage visible', async () => {
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  const saisie = hote.querySelector<HTMLInputElement>('input[type=search]')!;
  saisie.value = 'WASAPI'; saisie.dispatchEvent(new Event('input', { bubbles: true })); await attendre();
  expect(hote.querySelector('.hit')).not.toBeNull();
  expect(hote.querySelector('[data-masque-niveau]')).toBeNull();
});
