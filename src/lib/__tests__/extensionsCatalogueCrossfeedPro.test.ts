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
import { dialogs } from '../stores/dialogs';
import PluginsV2 from '../../components/v2/PluginsV2.svelte';

// Le retour du serveur après redémarrage recharge la page : hors de portée
// de jsdom. On vérifie seulement que l'attente est armée.
const attente = vi.hoisted(() => ({ armee: 0 }));
vi.mock('../retourDuServeur', () => ({
  attendreRetourEtRecharger: () => { attente.armee += 1; },
}));

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
let appelsRedemarrage: number;
let etatCatalogue: { status: number; corps: unknown };
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
  appelsRedemarrage = 0;
  attente.armee = 0;
  etatCatalogue = { status: 200, corps: {
    id: 'crossfeed-pro', target: 'x86_64-unknown-linux-gnu', available: true, latest_version: '0.3.1',
    installed: false, installed_version: null, update_available: false,
  } };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/audio-plugins/crossfeed-pro/catalog')) return reponse(etatCatalogue.status, etatCatalogue.corps);
    if (u.endsWith('/system/restart')) { appelsRedemarrage += 1; return reponse(200, { status: 'restarting' }); }
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

  it('🔴 #5601 — jeton du compte refusé par le site : « reconnectez », jamais « fait partie de Tune Premium »', async () => {
    palier('premium');
    const { notifications } = await import('../stores/notifications');
    const toasts: string[] = [];
    const espion = vi.spyOn(notifications, 'error').mockImplementation((m: string) => { toasts.push(m); return 0; });
    installation = { status: 412, corps: {
      error: 'account_token_rejected', detail: 'mozaiklabs.fr ne reconnaît plus le compte (invalid_token)',
      plugin: 'crossfeed-pro', target: 'x86_64-unknown-linux-gnu',
    } };
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!q('[data-catalogue="crossfeed-pro"] .installer-natif'));
    (q('[data-catalogue="crossfeed-pro"] .installer-natif') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-catalogue="crossfeed-pro"] [data-refus]'));
    const ligne = q('[data-catalogue="crossfeed-pro"] [data-refus]')!.textContent;
    expect(ligne).toBe(texte('v2.plug.catalogErr_account_token_rejected'));
    expect(ligne).not.toBe(texte('v2.plug.catalogErr_premium_required'));
    expect(toasts).not.toContain(texte('premium.required'));
    expect(q('[data-catalogue="crossfeed-pro"] .installer-natif')).toBeTruthy();
    espion.mockRestore();
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

describe('Extensions — Crossfeed Pro : mise à jour, redémarrage, plateforme (#5419)', () => {
  it('🔴 plateforme sans paquet : carte grisée avec la raison, sans bouton', async () => {
    palier('premium');
    etatCatalogue.corps = { id: 'crossfeed-pro', target: 'riscv64gc-unknown-linux-gnu', available: false,
      reason: 'no_package_for_target', latest_version: null, installed: false, installed_version: null, update_available: false };
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!q('[data-catalogue="crossfeed-pro"] [data-sans-paquet]'));
    const carte = q('[data-catalogue="crossfeed-pro"]')!;
    expect(carte.classList.contains('grise')).toBe(true);
    expect(carte.querySelector('[data-sans-paquet]')!.textContent).toContain(texte('v2.plug.catalogNoPackage'));
    expect(carte.querySelector('[data-sans-paquet]')!.textContent).toContain('riscv64gc-unknown-linux-gnu');
    expect(carte.querySelector('.installer-natif')).toBeNull();
  });

  it('🔴 nouvelle version : signalée, « Mettre à jour » seulement au clic', async () => {
    palier('premium');
    audioPlugins = etat([{ error: null, id: 'crossfeed-pro', native_loaded: true, third_party: true, version: '0.3.1' }]);
    etatCatalogue.corps = { id: 'crossfeed-pro', target: 'x86_64-unknown-linux-gnu', available: true,
      latest_version: '0.4.0', installed: true, installed_version: '0.3.1', update_available: true };
    installation.corps = { id: 'crossfeed-pro', installed: true, restart_required: true, target: 'x86_64-unknown-linux-gnu', version: '0.4.0' };
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!q('[data-natif="crossfeed-pro"] .maj-natif'));
    const carte = q('[data-natif="crossfeed-pro"]')!;
    expect(carte.querySelector('[data-maj]')!.textContent)
      .toBe(texte('v2.plug.catalogUpdateAvailable').replace('{version}', '0.4.0'));
    expect(appelsInstallation, 'mise à jour lancée sans clic').toEqual([]);
    (carte.querySelector('.maj-natif') as HTMLButtonElement).click();
    await jusqua(() => appelsInstallation.length > 0);
    expect(appelsInstallation).toEqual(['POST']);
  });

  it('à jour : ni mention ni bouton de mise à jour', async () => {
    palier('premium');
    audioPlugins = etat([{ error: null, id: 'crossfeed-pro', native_loaded: true, third_party: true, version: '0.4.0' }]);
    etatCatalogue.corps = { id: 'crossfeed-pro', target: 'x86_64-unknown-linux-gnu', available: true,
      latest_version: '0.4.0', installed: true, installed_version: '0.4.0', update_available: false };
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!q('[data-natif="crossfeed-pro"] [data-version]'));
    await jusqua(() => false, 100);
    expect(q('[data-maj]')).toBeNull();
    expect(q('.maj-natif')).toBeNull();
  });

  it('🔴 « Redémarrer » après installation : confirmation, puis POST /system/restart', async () => {
    palier('premium');
    const confirmer = vi.spyOn(dialogs, 'confirm').mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!q('[data-catalogue="crossfeed-pro"] .installer-natif'));
    (q('.installer-natif') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-natif="crossfeed-pro"] .redemarrer-serveur'));
    const bouton = q('.redemarrer-serveur') as HTMLButtonElement;
    expect(bouton.textContent!.trim()).toBe(texte('v2.plug.catalogRestart'));

    bouton.click(); // refusé
    await jusqua(() => confirmer.mock.calls.length === 1);
    await jusqua(() => false, 50);
    expect(appelsRedemarrage, 'redémarré sans confirmation').toBe(0);

    bouton.click(); // confirmé
    await jusqua(() => appelsRedemarrage === 1 && attente.armee === 1);
    expect(appelsRedemarrage).toBe(1);
    expect(attente.armee).toBe(1);
    expect(confirmer.mock.calls[1][0]).toBe(texte('settings.restartConfirm'));
  });

  it('non-Premium : le catalogue n’est pas interrogé', async () => {
    palier('free');
    const espion = vi.fn();
    const f = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    vi.stubGlobal('fetch', vi.fn(async (u: string, i?: RequestInit) => { espion(String(u)); return f(u, i); }));
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!q('[data-catalogue="crossfeed-pro"]'));
    await jusqua(() => false, 100);
    expect(espion.mock.calls.some(([u]) => u.endsWith('/catalog'))).toBe(false);
  });
});

describe('catalogue des greffons natifs — logique pure et libellés', () => {
  it('propose ce qui manque, et nomme les refus connus', () => {
    expect(greffonsAProposer([])).toEqual(['crossfeed-pro']);
    expect(greffonsAProposer([{ id: 'crossfeed-pro' }])).toEqual([]);
    expect(greffonsAProposer(null)).toEqual(['crossfeed-pro']);
    expect(cleDuRefusDInstallation('signature_invalid')).toBe('v2.plug.catalogErr_signature_invalid');
    expect(cleDuRefusDInstallation('account_token_rejected')).toBe('v2.plug.catalogErr_account_token_rejected');
    expect(cleDuRefusDInstallation('inconnu')).toBe('v2.plug.catalogErr_other');
    expect(cleDuRefusDInstallation(undefined)).toBe('v2.plug.catalogErr_other');
  });

  it('les libellés existent dans les onze langues', () => {
    const codes = ['premium_required', 'not_connected', 'account_token_rejected', 'no_package_for_target', 'plugin_not_in_catalog',
      'signature_invalid', 'catalog_unreachable', 'catalog_rate_limited', 'package_checksum_mismatch', 'other'];
    const cles = ['v2.plug.crossfeedProDesc', 'v2.plug.catalogInstall', 'v2.plug.catalogInstalling',
      'v2.plug.catalogNoPackage', 'v2.plug.catalogUpdateAvailable', 'v2.plug.catalogUpdate', 'v2.plug.catalogRestart',
      'v2.plug.catalogInstalled', 'v2.plug.catalogPremiumOnly', ...codes.map((c) => `v2.plug.catalogErr_${c}`)];
    for (const l of ONZE_LANGUES) for (const c of cles) expect(dictionnaire(l)[c], `${c} manque en ${l}`).toBeTruthy();
  });
});
