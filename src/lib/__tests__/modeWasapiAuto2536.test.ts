// @vitest-environment jsdom
//
// web#2536 — Réglages › Audio › Sorties audio locales : la ligne « Mode
// WASAPI » (Partagé / Exclusif bit-perfect) n'apparaissait que si « Backend
// audio » valait « WASAPI », jamais sur « Auto (WASAPI) » — le choix par
// défaut sous Windows, qui joue pourtant déjà en WASAPI. JeanPitre (Windows
// 10 Pro, privé d'ASIO par renesenses/tune-server-rust#6452) ne trouvait donc
// pas « Exclusif (bit-perfect) ».
//
// Ce témoin MONTE l'écran avec la configuration qu'un serveur Windows publie
// et cherche la ligne À L'ÉCRAN. Contre-épreuve : avec l'ancienne condition
// (`selectionne === 'wasapi'`), le premier cas est rouge.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const WINDOWS = [
  { value: 'auto', label: 'Auto (WASAPI)' },
  { value: 'wasapi', label: 'WASAPI' },
  { value: 'asio', label: 'ASIO (bit-perfect)' },
];

let config: Record<string, unknown> = {};

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getConfig: vi.fn(async () => config),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

/** Monte l'écran, ouvre l'onglet Audio, rend la ligne « Mode WASAPI » ou null. */
async function ligneModeWasapi(): Promise<Element | null> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabAudio'],
  );
  expect(onglet, 'onglet Audio introuvable à l’écran').toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  // La ligne « Backend audio » doit être peinte : sinon le cas ne prouve rien.
  const backend = [...hote.querySelectorAll('.row')].find(
    (r) => (r.querySelector('.lbl span')?.textContent ?? '').trim() === fr['settings.audioBackend'],
  );
  expect(backend, 'la ligne « Backend audio » n’est pas peinte').toBeDefined();
  return (
    [...hote.querySelectorAll('.row')].find(
      (r) => (r.querySelector('.lbl span')?.textContent ?? '').trim() === fr['settings.wasapiMode'],
    ) ?? null
  );
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    const corps = /\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {};
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  // « Backend audio » et « Mode WASAPI » sont rangés au niveau Expert.
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('web#2536 — « Mode WASAPI » sur « Auto (WASAPI) »', () => {
  it('visible et réglable quand le backend est « Auto (WASAPI) », le défaut Windows', { timeout: 60_000 }, async () => {
    config = { supported_audio_backends: WINDOWS, local_audio_backend: 'auto', local_exclusive_mode: false };
    const ligne = await ligneModeWasapi();
    expect(ligne, 'la ligne « Mode WASAPI » manque sur « Auto (WASAPI) »').not.toBeNull();
    const boutons = [...ligne!.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim());
    expect(boutons).toContain(fr['settings.exclusiveBitPerfect']);
  });

  it('toujours visible quand « WASAPI » est choisi', { timeout: 60_000 }, async () => {
    config = { supported_audio_backends: WINDOWS, local_audio_backend: 'wasapi', local_exclusive_mode: true };
    expect(await ligneModeWasapi()).not.toBeNull();
  });

  it('masquée sur ASIO (exclusif par nature) et hors Windows', { timeout: 60_000 }, async () => {
    config = { supported_audio_backends: WINDOWS, local_audio_backend: 'asio', local_exclusive_mode: true };
    expect(await ligneModeWasapi()).toBeNull();
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    config = { supported_audio_backends: [{ value: 'auto', label: 'Auto (ALSA)' }], local_audio_backend: 'auto' };
    expect(await ligneModeWasapi()).toBeNull();
  });
});
