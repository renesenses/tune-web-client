// @vitest-environment jsdom
//
// L'écran Extensions liste les greffons audio natifs TIERS.
//
// Vécu le 28/09/2026 sur le .18 (v0.9.167) : Crossfeed Pro installé et chargé,
// et visible NULLE PART. `GET /plugins` — la liste de l'écran — ne le contient
// pas ; seul `GET /audio-plugins` le publie (`third_party: true`). Les formes
// ci-dessous sont celles relevées ce jour-là sur le .18 (lecture seule).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { activeView } from '../stores/navigation';
import { presenceCrossfeedPro } from '../stores/crossfeedPro';
import { t } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import { ecranDuGreffon, etatDeChargement, greffonsNatifsTiers } from '../greffonsAudioNatifs';
import PluginsV2 from '../../components/v2/PluginsV2.svelte';

vi.setConfig({ testTimeout: 20_000 });

/** `GET /api/v1/audio-plugins` sur le .18, 28/09/2026. */
const AUDIO_PLUGINS_DU_18 = {
  abi: 1,
  plugins: [
    { error: null, id: 'equalizer', native_loaded: false, third_party: false },
    { error: null, id: 'crossfeed', native_loaded: false, third_party: false },
    { error: null, id: 'converter', native_loaded: false, third_party: false },
    { error: null, id: 'declick', native_loaded: false, third_party: false },
    { error: null, id: 'crossfeed-pro', native_loaded: true, third_party: true },
  ],
  target: 'x86_64-unknown-linux-gnu',
  trust_configured: true,
};

/** Deux entrées de `GET /api/v1/plugins` sur le .18, même jour. */
const PLUGINS_DU_18 = [
  { activation_error: null, compatible: true, config_schema: {}, description: 'Tune Circle — partage entre proches invités.',
    display_name: 'circle', enabled: true, installed: true, name: 'circle', premium: false, required_feature: null,
    type: 'sdk', url: '/api/v1/ext/circle', version: '0.9.167' },
  { activation_error: null, compatible: true, description: 'Crossfeed casque : intensité, retard et ombre de la tête, à chaud',
    display_name: 'crossfeed', enabled: false, installed: true, name: 'crossfeed', premium: true, required_feature: null,
    restart_required: true, type: 'sdk', url: '/api/v1/ext/crossfeed', version: '0.1.0' },
];

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let audioPlugins: { status: number; corps: unknown };
let cible: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  audioPlugins = { status: 200, corps: AUDIO_PLUGINS_DU_18 };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (/\/audio-plugins$/.test(u)) return reponse(audioPlugins.status, audioPlugins.corps);
    if (u.includes('/audio-plugins/crossfeed-pro/zones/')) {
      return reponse(200, { active: true, plugin: 'crossfeed-pro', settings: null, zone_id: 0 });
    }
    if (/\/plugins$/.test(u)) return reponse(200, PLUGINS_DU_18);
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
  presenceCrossfeedPro.set('inconnue');
  activeView.set('home');
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

describe('Extensions — greffons audio natifs tiers', () => {
  it('🔴 l’état du .18 : Crossfeed Pro listé, « chargé », avec un bouton vers son écran', async () => {
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!q('[data-natif="crossfeed-pro"]'));
    const carte = q('[data-natif="crossfeed-pro"]');
    expect(carte, 'Crossfeed Pro absent de l’écran Extensions').toBeTruthy();
    expect(carte!.textContent).toContain(texte('v2.nav.crossfeedPro'));
    expect(carte!.querySelector('[data-etat]')!.getAttribute('data-etat')).toBe('charge');
    (carte!.querySelector('.ouvrir-natif') as HTMLButtonElement).click();
    expect(get(activeView)).toBe('crossfeedpro');
  });

  it('les quatre emplacements intégrés n’y figurent pas, et la liste habituelle reste là', async () => {
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!q('[data-natif]') && !!cible!.querySelector('.pl h2'));
    const natifs = [...cible!.querySelectorAll('[data-natif]')].map((e) => e.getAttribute('data-natif'));
    expect(natifs).toEqual(['crossfeed-pro']);
    const titres = [...cible!.querySelectorAll('.pl:not([data-natif]) h2')].map((e) => e.textContent);
    expect(titres).toEqual(expect.arrayContaining(['circle', 'crossfeed']));
  });

  it('l’écran Extensions republie la présence : l’entrée de la barre apparaît', async () => {
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => get(presenceCrossfeedPro) === 'actif');
    expect(get(presenceCrossfeedPro)).toBe('actif');
  });

  it('un greffon en ERREUR montre son motif, et pas de bouton de réglage', async () => {
    audioPlugins.corps = { ...AUDIO_PLUGINS_DU_18, plugins: [
      { error: 'abi mismatch', id: 'crossfeed-pro', native_loaded: false, third_party: true },
    ] };
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!q('[data-natif="crossfeed-pro"]'));
    const carte = q('[data-natif="crossfeed-pro"]')!;
    expect(carte.querySelector('[data-etat]')!.getAttribute('data-etat')).toBe('erreur');
    expect(carte.textContent).toContain('abi mismatch');
    expect(carte.querySelector('.ouvrir-natif')).toBeNull();
  });

  it('route refusée (403, compte non administrateur) : pas de section, le reste s’affiche', async () => {
    audioPlugins = { status: 403, corps: { error: 'admin role required' } };
    monte = mount(PluginsV2, { target: cible! });
    await jusqua(() => !!cible!.querySelector('.pl h2'));
    await jusqua(() => false, 200);
    expect(q('[data-natifs]')).toBeNull();
    expect(cible!.querySelector('.pl h2')).toBeTruthy();
  });
});

describe('greffonsAudioNatifs — logique pure', () => {
  it('ne garde que les tiers ; l’écran seulement chargé et connu', () => {
    expect(greffonsNatifsTiers(AUDIO_PLUGINS_DU_18.plugins).map((g) => g.id)).toEqual(['crossfeed-pro']);
    expect(ecranDuGreffon({ id: 'crossfeed-pro', native_loaded: true, error: null })).toBe('crossfeedpro');
    expect(ecranDuGreffon({ id: 'crossfeed-pro', native_loaded: false, error: null })).toBeNull();
    expect(ecranDuGreffon({ id: 'autre-greffon', native_loaded: true, error: null })).toBeNull();
    expect(etatDeChargement({ native_loaded: true, error: 'x' })).toBe('erreur');
    expect(etatDeChargement({ native_loaded: false, error: null })).toBe('non_charge');
  });

  it('les libellés de la section existent dans les onze langues', () => {
    const cles = ['v2.plug.nativeTitle', 'v2.plug.nativeBadge', 'v2.plug.nativeHint', 'v2.plug.nativeSettings',
      'v2.plug.native_charge', 'v2.plug.native_erreur', 'v2.plug.native_non_charge'];
    for (const l of ONZE_LANGUES) for (const c of cles) expect(dictionnaire(l)[c], `${c} manque en ${l}`).toBeTruthy();
  });
});
