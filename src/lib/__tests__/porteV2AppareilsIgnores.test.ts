// @vitest-environment jsdom
//
// Phase 5 — AUCUNE PERTE D'ACCÈS : les appareils ignorés (#1280) en v2.
//
// Avant ce portage, `ignoreDevice`, `listIgnoredDevices` et `unignoreDevice`
// n'étaient appelées que par `SettingsView.svelte`, que la phase 5 supprime.
// La croix de Réglages v2 appelait `DELETE /devices/{id}` — l'oubli en
// mémoire que #1280 avait remplacé — et rien, en v2, ne ramenait un appareil
// ignoré par erreur.
//
// 🔴 Ce témoin MONTE l'écran Réglages v2, ouvre l'onglet Audio et CLIQUE : la
// croix, puis « Ne plus ignorer ». Il ne cherche pas un nom dans un fichier.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const ignoreDevice = vi.fn();
const unignoreDevice = vi.fn();
const listIgnoredDevices = vi.fn();
const deleteDevice = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    ignoreDevice: (id: string) => ignoreDevice(id),
    unignoreDevice: (id: string) => unignoreDevice(id),
    listIgnoredDevices: () => listIgnoredDevices(),
    deleteDevice: (id: string) => deleteDevice(id),
    getDevices: vi.fn(async () => [
      { id: 'dlna:uuid-salon', name: 'Salon', type: 'dlna', host: '192.168.1.42', available: true },
    ]),
    getAudioDevices: vi.fn(async () => []),
    getConfig: vi.fn(async () => ({ music_dirs: [] })),
    getEqExpertSettings: vi.fn(async () => ({ expert_bands: 10 })),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import AppareilsIgnoresV2 from '../../components/v2/AppareilsIgnoresV2.svelte';
import { V2_SETTINGS } from '../v2Settings';
import { preferences } from '../stores/preferences';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

const SALON_IGNORE = {
  device_id: 'dlna:uuid-salon', mac: '', host: '192.168.1.42', name: 'Salon',
  device_type: 'dlna', created_at: null,
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(composant: any, props: Record<string, unknown> = {}): HTMLDivElement {
  hote = document.createElement('div');
  hote.className = 'tune-v2';
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props });
  flushSync();
  return hote;
}

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

function bouton(el: HTMLElement, texte: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === texte) as
    HTMLButtonElement | undefined;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  for (const f of [ignoreDevice, unignoreDevice, listIgnoredDevices, deleteDevice]) f.mockReset();
  ignoreDevice.mockResolvedValue({ ignored: SALON_IGNORE, hidden_zone_ids: [] });
  unignoreDevice.mockResolvedValue({ released: ['dlna:uuid-salon'] });
  listIgnoredDevices.mockResolvedValue({ total: 0, items: [] });
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('la carte des Réglages v2 porte « Appareils ignorés »', () => {
  it('dans l’onglet Audio, au même niveau que les appareils réseau', () => {
    const audio = V2_SETTINGS.find((t) => t.id === 'audio')!;
    const s = audio.sections.find((x) => x.id === 'ignoredDevices');
    expect(s, 'section ignoredDevices absente de la carte').toBeDefined();
    expect(s!.min).toBe('intermediate');
  });
});

describe('Réglages v2 → Audio : ignorer, puis rétablir', () => {
  it('la croix d’un appareil réseau IGNORE durablement (plus de DELETE /devices/{id})', async () => {
    const el = poser(SettingsV2);
    await attendre();
    bouton(el, fr['settings.tabAudio'])!.click();
    await attendre();
    const croix = el.querySelector('.dev.net .del') as HTMLButtonElement | null;
    expect(croix, 'aucune croix sur la ligne de l’appareil réseau').not.toBeNull();
    listIgnoredDevices.mockResolvedValue({ total: 1, items: [SALON_IGNORE] });
    croix!.click();
    await attendre();
    expect(ignoreDevice).toHaveBeenCalledWith('dlna:uuid-salon');
    expect(deleteDevice).not.toHaveBeenCalled();
    // La section « Appareils ignorés » s'est rechargée d'elle-même.
    expect(bouton(el, fr['settings.unignoreDevice']), 'l’appareil ignoré n’apparaît pas dans sa section')
      .toBeDefined();
  });

  it('« Ne plus ignorer » appelle DELETE /devices/{id}/ignore et relit la liste', async () => {
    listIgnoredDevices.mockResolvedValue({ total: 1, items: [SALON_IGNORE] });
    const el = poser(AppareilsIgnoresV2);
    await attendre();
    expect(el.textContent).toContain('Salon');
    expect(el.textContent).toContain('192.168.1.42');
    listIgnoredDevices.mockResolvedValue({ total: 0, items: [] });
    bouton(el, fr['settings.unignoreDevice'])!.click();
    await attendre();
    expect(unignoreDevice).toHaveBeenCalledWith('dlna:uuid-salon');
    expect(listIgnoredDevices).toHaveBeenCalledTimes(2);
    expect(el.textContent).toContain(fr['settings.noIgnoredDevices']);
  });

  it('dit son vide au lieu de disparaître', async () => {
    const el = poser(AppareilsIgnoresV2);
    await attendre();
    expect(el.textContent).toContain(fr['settings.noIgnoredDevices']);
  });
});
