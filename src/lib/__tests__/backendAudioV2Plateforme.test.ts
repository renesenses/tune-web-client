// @vitest-environment jsdom
//
// Backend de la sortie locale dans la coquille v2 (`SettingsV2`, onglet
// Audio, section « Sorties audio locales »). Régression, dans l'écran v2, de
// tune-web-client#1268 et de tune-server-rust#2265.
//
// Défaut : trois boutons Auto / WASAPI / ASIO écrits en dur, valeur lue dans
// l'ordre `audio_backend ?? local_audio_backend ?? 'wasapi'`. Un serveur Linux
// se voyait proposer deux technologies Windows, et `audio_backend` (qui n'est
// pas le réglage de la sortie locale) l'emportait sur `local_audio_backend`.
//
// Contrat : les boutons sont ceux que publie le serveur dans
// `GET /system/config` → `supported_audio_backends` (lu par `choixDeBackend`).
// Liste vide (build sans sortie locale) : aucun bouton, une explication.
// Champ absent (serveur ancien) : `auto` plus la valeur persistée, rien d'autre.
//
// On monte le VRAI composant et on regarde les boutons rendus et le corps du
// PATCH qui part sur le réseau.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

let configServeur: Record<string, unknown> = {};

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getConfig: vi.fn(async () => ({ music_dirs: [], ...configServeur })),
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

const LINUX = [{ value: 'auto', label: 'Auto (ALSA)' }];
const WINDOWS_ASIO = [
  { value: 'auto', label: 'Auto (WASAPI)' },
  { value: 'wasapi', label: 'WASAPI' },
  { value: 'asio', label: 'ASIO (bit-perfect)' },
];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let patches: { url: string; corps: Record<string, unknown> }[] = [];

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

/** Monte l'écran sur l'onglet Audio et rend la ligne « Backend audio ». */
async function ligneBackend(config: Record<string, unknown>): Promise<HTMLElement> {
  configServeur = config;
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabAudio'],
  );
  expect(onglet, 'onglet Audio introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  const ligne = [...hote.querySelectorAll<HTMLElement>('.row')].find(
    (r) => (r.querySelector('.lbl span')?.textContent ?? '').trim() === fr['settings.audioBackend'],
  );
  // Témoin : sans la ligne, « WASAPI absent » ne prouverait rien.
  expect(ligne, 'ligne « Backend audio » absente — témoin sans objet').toBeDefined();
  return ligne!;
}

function boutons(ligne: HTMLElement): string[] {
  return [...ligne.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim());
}

function actif(ligne: HTMLElement): string | undefined {
  return ligne.querySelector('button.on')?.textContent?.trim();
}

beforeEach(() => {
  patches = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      const corps = JSON.parse(String(init.body ?? '{}'));
      patches.push({ url: String(url), corps });
      return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const u = String(url);
    const corps = /\/(zones|profiles|devices|playlists|shortcuts)(\/audio)?(\?|$)/.test(u) ? [] : {};
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('Backend audio v2 : la liste vient de la plateforme du serveur', () => {
  it('Linux : un seul choix, ni WASAPI ni ASIO', { timeout: 60_000 }, async () => {
    const ligne = await ligneBackend({
      supported_audio_backends: LINUX,
      local_audio_backend: 'auto',
    });
    const b = boutons(ligne);
    expect(b).toHaveLength(1);
    expect(b[0]).toContain('ALSA');
    expect(b.join(' ')).not.toMatch(/WASAPI|ASIO/);
    // Le sous-réglage « Mode WASAPI » n'a rien à faire sous Linux.
    expect(hote!.textContent).not.toContain(fr['settings.wasapiMode']);
  });

  it('`local_audio_backend` fait foi, pas `audio_backend`', { timeout: 60_000 }, async () => {
    const ligne = await ligneBackend({
      supported_audio_backends: WINDOWS_ASIO,
      audio_backend: 'asio',
      local_audio_backend: 'wasapi',
    });
    expect(actif(ligne)).toBe('WASAPI');
  });

  it('Windows avec ASIO : les trois choix du serveur, et ASIO s’écrit dans `local_audio_backend`', { timeout: 60_000 }, async () => {
    const ligne = await ligneBackend({
      supported_audio_backends: WINDOWS_ASIO,
      local_audio_backend: 'auto',
    });
    expect(boutons(ligne)).toHaveLength(3);
    const asio = [...ligne.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => (b.textContent ?? '').trim() === 'ASIO (bit-perfect)',
    );
    expect(asio, 'bouton ASIO absent sous Windows').toBeDefined();
    asio!.click();
    await vi.waitFor(() => expect(patches.length).toBeGreaterThan(0));
    const p = patches[patches.length - 1];
    expect(p.url).toMatch(/\/system\/config$/);
    expect(p.corps.local_audio_backend).toBe('asio');
  });

  it('liste vide (pas de sortie locale) : aucun bouton, une explication', { timeout: 60_000 }, async () => {
    const ligne = await ligneBackend({ supported_audio_backends: [], local_audio_backend: 'auto' });
    expect(boutons(ligne)).toEqual([]);
    expect(ligne.textContent).toContain(fr['settings.audioBackendNoLocalOutput']);
  });

  it('serveur ancien sans la liste : repli sur « auto », rien de Windows inventé', { timeout: 60_000 }, async () => {
    const ligne = await ligneBackend({});
    const b = boutons(ligne);
    expect(b).toEqual([fr['settings.autoDefault']]);
    expect(actif(ligne)).toBe(fr['settings.autoDefault']);
  });
});
