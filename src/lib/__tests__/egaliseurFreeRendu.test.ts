// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import EqualizerView from '../../components/EqualizerView.svelte';
import { currentZoneId } from '../stores/zones';
import { licenseState } from '../stores/license';
import { locale } from '../i18n';

let host: HTMLDivElement;
let component: ReturnType<typeof mount>;
let pure = false;
let refuse = false;
const writes: { url: string; body: any }[] = [];
async function settle() {
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 0));
    flushSync();
  }
}
beforeEach(() => {
  pure = false;
  refuse = false;
  writes.length = 0;
  localStorage.clear();
  locale.set('fr');
  currentZoneId.set(1);
  licenseState.update(s => ({ ...s, loaded: true, tier: 'free' }));
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    let data: unknown = {};
    if (url.endsWith('/audiophile')) data = { enabled: pure };
    if (url.endsWith('/expert-settings')) data = { expert_bands: 10 };
    if (url.endsWith('/presets')) data = { presets: [] };
    if (url.endsWith('/eq')) data = { enabled: true, bands: [] };
    if (init?.method === 'POST') {
      writes.push({ url, body: JSON.parse(String(init.body)) });
      data = refuse ? { code: 'premium_required', message: 'premium_required' } : { applied_live: true };
    }
    return new Response(JSON.stringify(data), { status: refuse && init?.method === 'POST' ? 402 : 200, headers: { 'Content-Type': 'application/json' } });
  }));
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(async () => {
  if (component) await unmount(component);
  host.remove();
  vi.unstubAllGlobals();
});
async function expert() {
  component = mount(EqualizerView, { target: host });
  await settle();
  const button = [...host.querySelectorAll<HTMLButtonElement>('.eq-mode-tab')].find(b => b.textContent?.includes('Expert'));
  expect(button, 'le compte FREE doit voir le mode Expert').toBeDefined();
  button!.click();
  await settle();
}
async function moveBand() {
  const slider = host.querySelector<HTMLInputElement>('.vertical-slider');
  expect(slider).not.toBeNull();
  slider!.value = '3';
  slider!.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 350));
  await settle();
}
describe('égaliseur FREE réellement monté', () => {
  it('affiche les bandes et envoie le réglage, sans ouvrir le crossfeed Premium', async () => {
    await expert();
    expect(host.querySelector('.premium-gate')).toBeNull();
    expect(host.querySelector('.crossfeed-toggle')).toBeNull();
    expect(host.querySelector('.crossfeed')?.textContent).toContain('Vos réglages sont conservés');
    await moveBand();
    const request = writes.find(w => w.url.endsWith('/zones/1/eq'));
    expect(request?.body.bands[0].gain).toBe(3);
  });
  it('explique le bypass PURE aussi au compte FREE', async () => {
    pure = true;
    await expert();
    expect(host.querySelector('.eq-pure-banner')?.textContent).toContain('PURE');
  });
  it('garde visible le refus explicite d’un ancien serveur', async () => {
    refuse = true;
    await expert();
    await moveBand();
    expect(host.querySelector('.premium-gate')?.textContent).toContain('Premium');
  });
});
