// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import PluginsV2 from '../../components/v2/PluginsV2.svelte';
import { audiophileEnabled } from '../stores/audiophile';
import { activeView } from '../stores/navigation';
import { t, localeNames } from '../i18n';
import { dictionnaire } from './onzeDictionnaires';
let composant: any;
let cible: HTMLDivElement;
afterEach(() => { if (composant) unmount(composant); composant = null; cible?.remove(); audiophileEnabled.set(false); activeView.set('home'); vi.unstubAllGlobals(); });
it('#2388 : PURE contourne le DSP, garde sa configuration et donne accès au réglage', async () => {
  const appels: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: any, init: any) => {
    appels.push(init?.method ?? 'GET');
    const u = String(url);
    const corps = /\/plugins$/.test(u) ? ['equalizer', 'crossfeed', 'converter', 'declick', 'channel-remap', 'circle'].map(name => ({name, display_name:name, enabled:true, installed:true, compatible:true, version:'1'}))
      : /\/audio-plugins$/.test(u) ? {plugins:[]}
      : u.includes('/marketplace/') ? {plugins:[]}
      : {};
    return new Response(JSON.stringify(corps), { status:200, headers:{'Content-Type':'application/json'} });
  }));
  audiophileEnabled.set(true);
  cible = document.createElement('div'); document.body.append(cible);
  composant = mount(PluginsV2, { target: cible }); flushSync();
  await vi.waitFor(() => { flushSync(); expect(cible.querySelector('[data-plugin="equalizer"]')).toBeTruthy(); });
  for (const name of ['equalizer', 'crossfeed', 'converter', 'declick', 'channel-remap']) {
    const carte = cible.querySelector(`[data-plugin="${name}"]`)!;
    expect(carte.querySelector('[data-pure-bypass]')?.textContent).toContain(get(t)('v2.plug.pureBypassed'));
    const controle = carte.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    expect(controle.disabled).toBe(true); expect(controle.checked).toBe(false);
  }
  const autre = cible.querySelector<HTMLInputElement>('[data-plugin="circle"] input')!;
  expect(autre.disabled).toBe(false); expect(autre.checked).toBe(true);
  (cible.querySelector('[data-plugin="equalizer"] [data-pure-bypass] button') as HTMLButtonElement).click();
  expect(get(activeView)).toBe('nowplaying');
  audiophileEnabled.set(false); flushSync();
  expect(cible.querySelector('[data-pure-bypass]')).toBeNull();
  const eq = cible.querySelector<HTMLInputElement>('[data-plugin="equalizer"] input')!;
  expect(eq.disabled).toBe(false); expect(eq.checked).toBe(true);
  expect(appels.every(m => m === 'GET'), 'le contournement ne change aucun réglage').toBe(true);
});
it('#2388 : le message existe dans toutes les langues', () => {
  for (const langue of Object.keys(localeNames)) expect(dictionnaire(langue as any)['v2.plug.pureBypassed']).toBeTruthy();
});
