// @vitest-environment jsdom
//
// tune-server-rust#6713 (Marco Polo, fil 2355 ; cas de #6450) — lever le
// bridage des analyses de fond quand la température est illisible.
//
// - Réglages : une case au niveau Expert, décochée par défaut, à côté de la
//   vitesse des analyses ; l'activer passe par un avertissement, et un refus
//   n'écrit rien.
// - État du serveur : quand le bridage est levé, l'écran le dit
//   (`analyses_bridage_leve` de `GET /system/diagnostics`).
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { dialogs } from '../stores/dialogs';
import { CLE_LEVER_LE_BRIDAGE, bridageLeve } from '../temperatureProcesseur';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let config: Record<string, unknown>;
const patchs: Record<string, unknown>[] = [];

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  patchs.length = 0;
  config = { music_dirs: [], background_analysis_speed: 'normal', [CLE_LEVER_LE_BRIDAGE]: false };
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'PATCH' && /\/system\/config(\?|$)/.test(u)) {
      const corps = JSON.parse(String(init.body ?? '{}'));
      patchs.push(corps);
      Object.assign(config, corps);
      return json({ ok: true });
    }
    if (/\/system\/config(\?|$)/.test(u)) return json(config);
    if (/\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(u)) return json([]);
    return json({});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function ecranAudio(niveau: string): Promise<HTMLElement> {
  preferences.update((p) => ({ ...p, settingsLevel: niveau as any }));
  v2SettingsTarget.set({ tab: 'audio', section: 'localAudio' } as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  return hote;
}

const laCase = (h: HTMLElement) =>
  h.querySelector<HTMLInputElement>(`input[type="checkbox"][data-cle="${CLE_LEVER_LE_BRIDAGE}"]`);
const patchsBridage = () => patchs.filter((p) => CLE_LEVER_LE_BRIDAGE in p);

describe('#6713 — la case « lever le bridage »', () => {
  it('niveau Expert : présente et décochée par défaut', { timeout: 60_000 }, async () => {
    const h = await ecranAudio('expert');
    expect(laCase(h), 'aucune case').not.toBeNull();
    expect(laCase(h)!.checked).toBe(false);
    expect(patchsBridage()).toEqual([]);
  });

  it('sous le niveau Expert : absente', { timeout: 60_000 }, async () => {
    const h = await ecranAudio('advanced');
    expect(laCase(h)).toBeNull();
  });

  it('l’activer passe par l’avertissement ; un refus n’écrit rien', { timeout: 60_000 }, async () => {
    const confirmer = vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
    const h = await ecranAudio('expert');
    laCase(h)!.click();
    await attendre();
    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(patchsBridage()).toEqual([]);
    expect(laCase(h)!.checked).toBe(false);
  });

  it('accepté : PATCH de SA clé à true', { timeout: 60_000 }, async () => {
    vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
    const h = await ecranAudio('expert');
    laCase(h)!.click();
    await attendre();
    expect(patchsBridage()).toEqual([{ [CLE_LEVER_LE_BRIDAGE]: true }]);
  });

  it('le désactiver ne demande rien', { timeout: 60_000 }, async () => {
    config[CLE_LEVER_LE_BRIDAGE] = true;
    const confirmer = vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
    const h = await ecranAudio('expert');
    expect(laCase(h)!.checked).toBe(true);
    laCase(h)!.click();
    await attendre();
    expect(confirmer).not.toHaveBeenCalled();
    expect(patchsBridage()).toEqual([{ [CLE_LEVER_LE_BRIDAGE]: false }]);
  });

  it('serveur qui ne publie pas la clé : pas de case', { timeout: 60_000 }, async () => {
    delete config[CLE_LEVER_LE_BRIDAGE];
    const h = await ecranAudio('expert');
    expect(laCase(h)).toBeNull();
  });
});

describe('#6713 — l’État du serveur dit le bridage levé', () => {
  it('un motif rend la phrase, rien sinon', () => {
    expect(bridageLeve('temperature_illisible', 'LEVE')).toBe('LEVE');
    expect(bridageLeve(null, 'LEVE')).toBeNull();
    expect(bridageLeve(undefined, 'LEVE')).toBeNull();
    expect(bridageLeve('', 'LEVE')).toBeNull();
  });

  it('l’écran lit `analyses_bridage_leve`', () => {
    const src = readFileSync('src/components/v2/TuneHealthV2.svelte', 'utf8');
    expect(src).toContain('diag[0].value?.analyses_bridage_leve');
    expect(src).toContain('data-bridage="leve"');
  });

  it('les quatre phrases existent dans les douze langues', () => {
    for (const l of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'vi', 'el', 'nb']) {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      for (const cle of [
        'settings.analysisUnthrottle',
        'settings.analysisUnthrottleHint',
        'settings.analysisUnthrottleConfirm',
        'v2.health.analysesBridageLeve',
      ]) {
        expect(src, `${l} ${cle}`).toContain(`"${cle}":`);
      }
    }
  });
});
