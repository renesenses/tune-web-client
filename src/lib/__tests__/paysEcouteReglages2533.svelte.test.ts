// @vitest-environment jsdom
//
// web#2533 — le pays d'écoute des radios, une fois réglé, quitte l'onglet
// Radios et vit dans Réglages › Général. Tant qu'il n'est pas réglé, l'onglet
// Radios garde le choix (pour forcer la configuration) ; une radio refusée
// pour son pays y laisse un lien vers le réglage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

const cfg = vi.hoisted(() => ({ radios_country: 'FR' as string }));
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConfig: vi.fn(async () => ({ radios_country: cfg.radios_country })),
  getRadios: vi.fn(async () => []),
  getAnnuaireRadios: vi.fn(async () => ({ total: 0, offset: 0, limit: 1000, count: 0, items: [], countries: [], genres: [] })),
}));
vi.mock('../zoneRequise', () => ({ zoneRequise: () => 3 }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { V2_SETTINGS } from '../v2Settings';
import { preferences } from '../stores/preferences';
import { activeView, clearViewContext } from '../stores/navigation';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { messageRefusPaysRadio, refusPaysRadioVu } from '../refusPaysRadio';
import { locale } from '../i18n';
import fr from '../locales/fr';

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
const respirer = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement | null = null;
let instance: Record<string, unknown> | null = null;

beforeEach(() => {
  cfg.radios_country = 'FR';
  refusPaysRadioVu.set(false);
  clearViewContext('radios');
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ radios_country: cfg.radios_country }), {
    status: 200, headers: { 'Content-Type': 'application/json' } })));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  locale.set('fr');
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null; hote?.remove(); hote = null;
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

async function monter(Composant: any) {
  hote = document.createElement('div'); document.body.append(hote);
  instance = mount(Composant, { target: hote, props: {} });
  flushSync(); await respirer();
  return hote;
}
const choix = (el: Element) => el.querySelector('select');

describe('web#2533 — carte des Réglages', () => {
  it('le pays d’écoute est dans Général, et nulle part ailleurs', () => {
    const hits = V2_SETTINGS.flatMap((t) => t.sections.filter((s) => s.id === 'radiosCountry').map(() => t.id));
    expect(hits).toEqual(['general']);
  });
});

describe('web#2533 — onglet Radios', () => {
  it('pays réglé : le choix a disparu de l’onglet Radios', async () => {
    const el = await monter(RadiosV2);
    expect(choix(el), 'le sélecteur est encore dans Radios').toBeNull();
    expect(el.querySelector('[data-pays-ecoute-lien]')).toBeNull();
  });
  it('pays non réglé : le choix reste dans Radios pour forcer la configuration', async () => {
    cfg.radios_country = '';
    const el = await monter(RadiosV2);
    expect(choix(el)).not.toBeNull();
  });
  it('pays réglé et radio refusée pour son pays : un lien mène au réglage', async () => {
    messageRefusPaysRadio({ error_code: 'radio_country_unavailable' });
    const el = await monter(RadiosV2);
    expect(choix(el)).toBeNull();
    const lien = el.querySelector('[data-pays-ecoute-lien] button') as HTMLButtonElement;
    expect(lien?.textContent?.trim()).toBe(fr['v2.radio.countryGoSettings']);
    lien.click(); flushSync();
    expect(get(v2SettingsTarget)).toEqual({ tab: 'general', section: 'radiosCountry' });
    expect(get(activeView)).toBe('settings');
  });
});

describe('web#2533 — Réglages › Général', () => {
  it('le réglage est dans Général, même quand le pays est réglé', async () => {
    preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
    const el = await monter(SettingsV2);
    const carte = el.querySelector('section.card[data-section="radiosCountry"]');
    expect(carte, 'carte manquante dans Général').not.toBeNull();
    const select = choix(carte!)!;
    expect(select).not.toBeNull();
    expect(select.value).toBe('FR');
  });
});
