// @vitest-environment jsdom
//
// web#2580 — Extensions : Crosstalk (greffon natif PREMIUM, enceintes)
// s'installe depuis le catalogue de mozaiklabs, comme Crossfeed Pro.
//
// Une règle par témoin : proposé (nom et description traduits), jamais doublé
// (installé ⇒ plus de carte de catalogue), Premium exigé (sans Premium : carte
// verrouillée, même appel au Premium que Crossfeed Pro, aucun appel
// d'installation), installation et version comme Crossfeed Pro.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { licenseState } from '../stores/license';
import { presenceCrossfeedPro } from '../stores/crossfeedPro';
import { presenceCrosstalk } from '../stores/crosstalk';
import { t } from '../i18n';
import {
  CATALOGUE_GREFFONS_NATIFS, DESCRIPTIONS_GREFFONS_NATIFS, ECRANS_GREFFONS_NATIFS, NOMS_GREFFONS_NATIFS,
  greffonsAProposer, ecranDuGreffon,
} from '../greffonsAudioNatifs';
import PluginsV2 from '../../components/v2/PluginsV2.svelte';

vi.mock('../retourDuServeur', () => ({ attendreRetourEtRecharger: () => {} }));
vi.setConfig({ testTimeout: 20_000 });

const etat = (tiers: unknown[]) => ({
  abi: 1, target: 'x86_64-unknown-linux-gnu', trust_configured: true,
  plugins: [{ error: null, id: 'crossfeed', native_loaded: false, third_party: false }, ...tiers],
});

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let audioPlugins: unknown;
let appelsInstallation: string[];
let cible: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function palier(tier: 'premium' | 'free') {
  licenseState.update((s) => ({ ...s, loaded: true, tier }));
}

beforeEach(() => {
  audioPlugins = etat([]);
  appelsInstallation = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/audio-plugins/crosstalk/catalog')) {
      return reponse(200, { id: 'crosstalk', target: 'x86_64-unknown-linux-gnu', available: true, latest_version: '0.1.0',
        installed: false, installed_version: null, update_available: false });
    }
    if (u.endsWith('/audio-plugins/crosstalk/install-from-catalog')) {
      appelsInstallation.push(init?.method ?? 'GET');
      audioPlugins = etat([{ error: null, id: 'crosstalk', native_loaded: false, third_party: true, version: '0.1.0' }]);
      return reponse(200, { id: 'crosstalk', installed: true, restart_required: true, target: 'x86_64-unknown-linux-gnu', version: '0.1.0' });
    }
    if (/\/audio-plugins$/.test(u)) return reponse(200, audioPlugins);
    if (/\/plugins$/.test(u)) return reponse(200, []);
    if (u.includes('/marketplace/')) return reponse(404, { error: 'not found' });
    return reponse(200, {});
  }));
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible?.remove();
  cible = null;
  licenseState.update((s) => ({ ...s, loaded: false, tier: 'free' }));
  presenceCrossfeedPro.set('inconnue');
  presenceCrosstalk.set('inconnue');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function jusqua(condition: () => boolean, borne = 8000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await new Promise((r) => setTimeout(r, 0));
  }
}

const q = (sel: string) => cible!.querySelector(sel) as HTMLElement | null;
const texte = (cle: string) => get(t)(cle as any);

describe('catalogue des greffons natifs — Crosstalk', () => {
  it('Crosstalk est au catalogue, avec un nom, une description et un écran', () => {
    expect(CATALOGUE_GREFFONS_NATIFS).toContain('crosstalk');
    expect(NOMS_GREFFONS_NATIFS.crosstalk).toBe('v2.nav.crosstalk');
    expect(DESCRIPTIONS_GREFFONS_NATIFS.crosstalk).toBe('v2.plug.crosstalkDesc');
    expect(ECRANS_GREFFONS_NATIFS.crosstalk).toBe('crosstalk');
    expect(ecranDuGreffon({ id: 'crosstalk', native_loaded: true, error: null })).toBe('crosstalk');
    expect(ecranDuGreffon({ id: 'crosstalk', native_loaded: false, error: null })).toBeNull();
  });

  it('jamais doublé : installé, il n’est plus proposé ; le catalogue ne le liste qu’une fois', () => {
    expect(CATALOGUE_GREFFONS_NATIFS.filter((id) => id === 'crosstalk')).toHaveLength(1);
    expect(greffonsAProposer([{ id: 'crosstalk' }])).not.toContain('crosstalk');
    expect(greffonsAProposer([{ id: 'crosstalk' }, { id: 'crosstalk' }])).toEqual(['crossfeed-pro']);
  });
});

describe('Extensions — tuile Crosstalk', () => {
  it('🔴 Premium : la tuile est proposée avec son nom et sa description, « Installer » installe, la version s’affiche', async () => {
    palier('premium');
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!q('[data-catalogue="crosstalk"] .installer-natif'));
    const carte = q('[data-catalogue="crosstalk"]')!;
    expect(carte.textContent).toContain(texte('v2.nav.crosstalk'));
    expect(carte.textContent).toContain(texte('v2.plug.crosstalkDesc'));
    expect(carte.querySelector('[data-premium-seulement]')).toBeNull();
    (carte.querySelector('.installer-natif') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-natif="crosstalk"] [data-version]'));
    expect(appelsInstallation).toEqual(['POST']);
    expect(q('[data-catalogue="crosstalk"]'), 'la tuile du catalogue reste après installation').toBeNull();
    expect(q('[data-natif="crosstalk"] [data-version]')!.textContent).toBe('v0.1.0');
  });

  it('🔴 Premium exigé : sans Premium, tuile verrouillée avec le même appel au Premium que Crossfeed Pro, aucun appel', async () => {
    palier('free');
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!q('[data-catalogue="crosstalk"]') && !!q('[data-catalogue="crossfeed-pro"]'));
    const carte = q('[data-catalogue="crosstalk"]')!;
    const temoin = q('[data-catalogue="crossfeed-pro"]')!;
    expect(carte.querySelector('.installer-natif')).toBeNull();
    expect(carte.querySelector('[data-premium-seulement]')!.textContent)
      .toBe(temoin.querySelector('[data-premium-seulement]')!.textContent);
    expect(carte.querySelector('[data-premium-seulement]')!.textContent).toBe(texte('v2.plug.catalogPremiumOnly'));
    expect(carte.querySelector('.prem')).toBeTruthy();
    expect(appelsInstallation).toEqual([]);
  });

  it('déjà installé et chargé : pas de tuile de catalogue, la version et le lien de réglage', async () => {
    palier('premium');
    audioPlugins = etat([{ error: null, id: 'crosstalk', native_loaded: true, third_party: true, version: '0.1.0' }]);
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!q('[data-natif="crosstalk"]'));
    expect(q('[data-catalogue="crosstalk"]')).toBeNull();
    expect(q('[data-natif="crosstalk"] [data-version]')!.textContent).toBe('v0.1.0');
    expect(q('[data-natif="crosstalk"] .ouvrir-natif')).toBeTruthy();
  });
});
