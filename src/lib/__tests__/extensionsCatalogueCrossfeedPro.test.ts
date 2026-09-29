// @vitest-environment jsdom
//
// Extensions : Crossfeed Pro s'installe depuis le catalogue de mozaiklabs.
//
// Premium : une carte avec un bouton « Installer », qui appelle
// `POST /audio-plugins/crossfeed-pro/install-from-catalog` ; une fois installé,
// la carte du greffon natif montre sa version et le redémarrage à faire.
// Non-Premium : la mention Premium, SANS bouton (contre-épreuve : aucun appel
// d'installation ne part).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { licenseState } from '../stores/license';
import { presenceCrossfeedPro } from '../stores/crossfeedPro';
import { t } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import { cleDuRefusDInstallation, greffonsAProposer } from '../greffonsAudioNatifs';
import PluginsV2 from '../../components/v2/PluginsV2.svelte';

vi.setConfig({ testTimeout: 20_000 });

const INTEGRES = [
  { error: null, id: 'equalizer', native_loaded: false, third_party: false },
  { error: null, id: 'crossfeed', native_loaded: false, third_party: false },
  { error: null, id: 'converter', native_loaded: false, third_party: false },
  { error: null, id: 'declick', native_loaded: false, third_party: false },
];
const etat = (tiers: unknown[]) => ({
  abi: 1, target: 'x86_64-unknown-linux-gnu', trust_configured: true, plugins: [...INTEGRES, ...tiers],
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
let installation: { status: number; corps: unknown };
let appelsInstallation: string[];
let cible: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function palier(tier: 'premium' | 'free') {
  licenseState.update((s) => ({ ...s, loaded: true, tier }));
}

beforeEach(() => {
  audioPlugins = etat([]);
  installation = {
    status: 200,
    corps: { id: 'crossfeed-pro', installed: true, restart_required: true, target: 'x86_64-unknown-linux-gnu', version: '0.3.1' },
  };
  appelsInstallation = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/audio-plugins/crossfeed-pro/install-from-catalog')) {
      appelsInstallation.push(init?.method ?? 'GET');
      if (installation.status === 200) {
        audioPlugins = etat([{ error: null, id: 'crossfeed-pro', native_loaded: false, third_party: true, version: '0.3.1' }]);
      }
      return reponse(installation.status, installation.corps);
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
  vi.unstubAllGlobals();
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

describe('Extensions — installer Crossfeed Pro depuis le catalogue', () => {
  it('🔴 Premium : « Installer » installe, puis la carte montre la version et le redémarrage', async () => {
    palier('premium');
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!q('[data-catalogue="crossfeed-pro"] .installer-natif'));
    const carte = q('[data-catalogue="crossfeed-pro"]');
    expect(carte, 'carte du catalogue absente').toBeTruthy();
    expect(carte!.textContent).toContain(texte('v2.nav.crossfeedPro'));
    expect(carte!.querySelector('[data-premium-seulement]')).toBeNull();
    const bouton = carte!.querySelector('.installer-natif') as HTMLButtonElement;
    expect(bouton.textContent!.trim()).toBe(texte('v2.plug.catalogInstall'));

    bouton.click();
    await jusqua(() => !!q('[data-natif="crossfeed-pro"] [data-version]'));
    expect(appelsInstallation).toEqual(['POST']);
    expect(q('[data-catalogue="crossfeed-pro"]'), 'la carte du catalogue reste après installation').toBeNull();
    const installe = q('[data-natif="crossfeed-pro"]')!;
    expect(installe.querySelector('[data-version]')!.textContent).toBe('v0.3.1');
    expect(installe.querySelector('[data-redemarrer]')!.textContent).toBe(texte('v2.plug.catalogInstalled'));
    expect(q('.restart')).toBeTruthy();
  });

  it('contre-épreuve — non-Premium : mention Premium, aucun bouton, aucun appel', async () => {
    palier('free');
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!q('[data-catalogue="crossfeed-pro"]'));
    const carte = q('[data-catalogue="crossfeed-pro"]')!;
    expect(carte.querySelector('.installer-natif')).toBeNull();
    expect(carte.querySelector('[data-premium-seulement]')!.textContent).toBe(texte('v2.plug.catalogPremiumOnly'));
    expect(carte.querySelector('.prem')).toBeTruthy();
    expect(appelsInstallation).toEqual([]);
  });

  it('déjà installé et chargé : pas de carte de catalogue, la version et le lien de réglage', async () => {
    palier('premium');
    audioPlugins = etat([{ error: null, id: 'crossfeed-pro', native_loaded: true, third_party: true, version: '0.3.1' }]);
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!q('[data-natif="crossfeed-pro"]'));
    expect(q('[data-catalogue]')).toBeNull();
    const carte = q('[data-natif="crossfeed-pro"]')!;
    expect(carte.querySelector('[data-version]')!.textContent).toBe('v0.3.1');
    expect(carte.querySelector('.ouvrir-natif')).toBeTruthy();
  });

  it('un refus du serveur est dit dans la langue de l’interface, et le bouton reste', async () => {
    palier('premium');
    installation = { status: 404, corps: { error: 'no_package_for_target', detail: 'aucun paquet', plugin: 'crossfeed-pro', target: 'riscv64gc-unknown-linux-gnu' } };
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!q('[data-catalogue="crossfeed-pro"] .installer-natif'));
    (q('[data-catalogue="crossfeed-pro"] .installer-natif') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-catalogue="crossfeed-pro"] [data-refus]'));
    expect(q('[data-catalogue="crossfeed-pro"] [data-refus]')!.textContent)
      .toBe(texte('v2.plug.catalogErr_no_package_for_target'));
    expect(q('[data-catalogue="crossfeed-pro"] .installer-natif')).toBeTruthy();
    expect(q('[data-natif="crossfeed-pro"]')).toBeNull();
  });

  it('état des greffons illisible (403) : rien n’est proposé', async () => {
    palier('premium');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      if (/\/audio-plugins$/.test(u)) return reponse(403, { error: 'admin role required' });
      if (/\/plugins$/.test(u)) return reponse(200, []);
      return reponse(200, {});
    }));
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => false, 300);
    expect(q('[data-catalogue]')).toBeNull();
  });
});

describe('catalogue des greffons natifs — logique pure et libellés', () => {
  it('propose ce qui manque, et nomme les refus connus', () => {
    expect(greffonsAProposer([])).toEqual(['crossfeed-pro']);
    expect(greffonsAProposer([{ id: 'crossfeed-pro' }])).toEqual([]);
    expect(greffonsAProposer(null)).toEqual(['crossfeed-pro']);
    expect(cleDuRefusDInstallation('signature_invalid')).toBe('v2.plug.catalogErr_signature_invalid');
    expect(cleDuRefusDInstallation('inconnu')).toBe('v2.plug.catalogErr_other');
    expect(cleDuRefusDInstallation(undefined)).toBe('v2.plug.catalogErr_other');
  });

  it('les libellés existent dans les onze langues', () => {
    const codes = ['premium_required', 'not_connected', 'no_package_for_target', 'plugin_not_in_catalog',
      'signature_invalid', 'catalog_unreachable', 'catalog_rate_limited', 'package_checksum_mismatch', 'other'];
    const cles = ['v2.plug.crossfeedProDesc', 'v2.plug.catalogInstall', 'v2.plug.catalogInstalling',
      'v2.plug.catalogInstalled', 'v2.plug.catalogPremiumOnly', ...codes.map((c) => `v2.plug.catalogErr_${c}`)];
    for (const l of ONZE_LANGUES) for (const c of cles) expect(dictionnaire(l)[c], `${c} manque en ${l}`).toBeTruthy();
  });
});
