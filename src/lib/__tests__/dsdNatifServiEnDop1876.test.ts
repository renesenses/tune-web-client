// @vitest-environment jsdom
//
// #1876 (Marco Polo, fil 2106, SMSL M400) : « j'ai spécifié 'Natif' et Tune
// envoie du Dop ». Sur une sortie LOCALE, le serveur n'a aucun chemin DSD
// natif : « Natif » part en DoP. Il le publie à côté de `dsd_mode` —
// `dsd_transport = "natif_servi_en_dop"` (`TransportDsd::as_str`,
// `tune-core/src/orchestrator/regles.rs`, publié par `list_zones` et
// `get_zone`, donc aussi par la réponse du PATCH) — et le client ne le lisait
// nulle part : le testeur a dû ouvrir le panneau du pilote de son DAC.
//
// 🔴 Ce témoin MONTE l'écran Réglages et lit le TEXTE RENDU sous le
// sélecteur DSD de la carte de zone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getConfig: vi.fn(async () => ({ music_dirs: [], quality_split: true })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { zones } from '../stores/zones';
import { natifServiEnDop } from '../transportDsd';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');
const CLE = 'v2.set.dsdNativeServedAsDop';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let zonesServeur: unknown[] = [];

/** Le transport que le serveur déduit pour une zone LOCALE (`transport_dsd`). */
const transportLocal = (mode: string) => (mode === 'native' ? 'natif_servi_en_dop' : mode === 'dop' ? 'dop' : 'pcm');

function zone(over: Record<string, unknown> = {}) {
  return {
    id: 21, name: 'SMSL M400', output_type: 'local', output_device_id: 'local:hw:1,0',
    volume: 1, state: 'stopped', dsd_mode: 'native', dsd_transport: 'natif_servi_en_dop',
    ...over,
  };
}

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function poser(z: Record<string, unknown>): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
  zonesServeur = [z];
  zones.set([z] as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabDevices'],
  );
  expect(onglet, 'onglet Appareils introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  expect(selecteurDsd(hote), 'sélecteur DSD absent — témoin sans objet').not.toBeNull();
  return hote;
}

function selecteurDsd(h: HTMLElement): HTMLSelectElement | null {
  const champ = [...h.querySelectorAll<HTMLElement>('#zc-21 .zf')]
    .find((l) => l.querySelector(':scope > span')?.textContent?.trim() === 'DSD');
  return champ?.querySelector('select') ?? null;
}
const mention = (h: HTMLElement) => selecteurDsd(h)?.closest('.zf')?.querySelector<HTMLElement>('.dsd-dop') ?? null;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      // Comme `patch_zone`, qui rend `get_zone` : `dsd_transport` recalculé.
      const corps = JSON.parse(String(init.body ?? '{}'));
      const z = { ...zone(), ...corps };
      if (corps.dsd_mode) z.dsd_transport = transportLocal(corps.dsd_mode);
      return new Response(JSON.stringify(z), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const u = String(url);
    const corps = /\/zones(\?|$)/.test(u) ? zonesServeur
      : /\/(profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {};
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  vi.unstubAllGlobals();
});

describe('#1876 — natifServiEnDop', () => {
  it('seul le champ du serveur fait foi', () => {
    expect(natifServiEnDop({ dsd_mode: 'native', dsd_transport: 'natif_servi_en_dop' })).toBe(true);
    // Vieux serveur : rien publié, rien affirmé — même sur une sortie locale.
    expect(natifServiEnDop({ dsd_mode: 'native' })).toBe(false);
    expect(natifServiEnDop({ dsd_mode: 'dop', dsd_transport: 'dop' })).toBe(false);
    expect(natifServiEnDop({ dsd_mode: 'native', dsd_transport: 'pcm' })).toBe(false);
    // Champ resté d'avant un changement de réglage : jamais sous « DoP ».
    expect(natifServiEnDop({ dsd_mode: 'dop', dsd_transport: 'natif_servi_en_dop' })).toBe(false);
    expect(natifServiEnDop(null)).toBe(false);
  });
});

describe('#1876 — la carte de zone dit que « Natif » part en DoP', () => {
  it('zone locale réglée sur Natif ⇒ la mention est sous le sélecteur', { timeout: 60_000 }, async () => {
    const h = await poser(zone());
    expect(selecteurDsd(h)!.value).toBe('native');
    expect(mention(h)?.textContent?.trim()).toBe(fr[CLE]);
    expect(mention(h)?.textContent).toBe('Sur cette sortie, le DSD natif est envoyé en DoP.');
  });

  it('serveur qui ne publie pas `dsd_transport` ⇒ rien', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ dsd_transport: undefined }));
    expect(mention(h)).toBeNull();
  });

  it('renderer réseau en Natif (transport pcm) ⇒ rien', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ output_type: 'dlna', output_device_id: 'uuid:x', dsd_transport: 'pcm' }));
    expect(mention(h)).toBeNull();
  });

  it('basculer DoP puis Natif suit la réponse du serveur', { timeout: 60_000 }, async () => {
    const h = await poser(zone());
    const sel = selecteurDsd(h)!;
    sel.value = 'dop';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await attendre();
    expect(mention(h), 'DoP réglé : rien à signaler').toBeNull();
    selecteurDsd(h)!.value = 'native';
    selecteurDsd(h)!.dispatchEvent(new Event('change', { bubbles: true }));
    await attendre();
    expect(mention(h)?.textContent?.trim()).toBe(fr[CLE]);
  });
});

describe('#1876 — la phrase dans les ONZE langues', () => {
  for (const l of ONZE_LANGUES) {
    it(l, () => {
      const d = dictionnaire(l);
      expect(d[CLE], `${l} : clé absente`).toBeTruthy();
      expect(d[CLE], `${l} : la phrase doit nommer DoP`).toContain('DoP');
      expect(d[CLE], `${l} : la phrase doit nommer DSD`).toContain('DSD');
    });
  }
});
