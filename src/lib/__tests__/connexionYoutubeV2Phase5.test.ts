// @vitest-environment jsdom
//
// Phase 5 (web#1257) — la connexion YouTube par CODE D'APPAREIL doit survivre
// au retrait de l'ancienne interface.
//
// L'ancien écran (`SettingsView.svelte`) la portait par quatre fonctions
// dédiées : `youtubeAuthDeviceCode`, `youtubeAuthPoll`, `youtubeAuthStatus`,
// `youtubeAuthLogout`. Aucun écran v2 ne les appelle — l'inventaire
// `docs/capacites-sans-chemin-phase5.md` les range donc parmi les capacités
// perdues.
//
// Elles ne le sont pas : le serveur sert ces routes et les routes GÉNÉRIQUES
// par les MÊMES gestionnaires (`tune-streaming-http/src/lib.rs`, routeur) :
//
//   POST /{service}/auth/device-code ─┐
//   POST /{service}/auth              ─┴─ service_auth   (corps vide ⇒ device_flow)
//   POST /{service}/auth/logout       ─┐
//   POST /{service}/disconnect        ─┴─ service_logout
//   GET  /{service}/status            ─── service_status (sonde `{"poll": true}`
//                                         tant que non connecté)
//
// et `SettingsV2` (onglet « Accès et jetons », section Services de streaming)
// emprunte les routes génériques. Ce témoin tient ce chemin : si l'écran v2
// cessait de le faire pour YouTube, la phase 5 perdrait la connexion.
//
// 🔴 Il MONTE l'écran et CLIQUE ; il ne lit pas le source.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const authenticateStreaming = vi.fn();
const getStreamingServiceStatus = vi.fn();
const disconnectStreaming = vi.fn();
let services: Record<string, any> = {};

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    apiFetch: vi.fn(async () => ({} as any)),
    getStreamingServices: vi.fn(async () => services),
    authenticateStreaming: (...a: unknown[]) => authenticateStreaming(...a),
    getStreamingServiceStatus: (...a: unknown[]) => getStreamingServiceStatus(...a),
    disconnectStreaming: (...a: unknown[]) => disconnectStreaming(...a),
    getHealth: vi.fn(async () => ({ status: 'ok' })),
    getStats: vi.fn(async () => ({})),
    getConfig: vi.fn(async () => ({ music_dirs: [] })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    listServiceTokens: vi.fn(async () => []),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import lFr from '../locales/fr';
const fr = lFr as unknown as Record<string, string>;

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function tourner(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  flushSync();
}

async function monterSurLesServices(): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await tourner(0);
  await tourner(0);
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabAccess'],
  );
  expect(onglet, 'onglet « Accès et jetons » introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  flushSync();
  await tourner(0);
  return hote;
}

/** La carte du service `youtube`, par son nom affiché. */
function carteYoutube(el: HTMLElement): HTMLElement {
  const carte = [...el.querySelectorAll<HTMLElement>('.svc')].find((c) =>
    (c.querySelector('.sname')?.textContent ?? '').trim().startsWith('youtube'),
  );
  expect(carte, 'aucune carte YouTube dans la section des services').toBeDefined();
  return carte as HTMLElement;
}

function boutonDe(carte: HTMLElement, libelle: string): HTMLButtonElement {
  const b = [...carte.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === libelle);
  expect(b, `bouton « ${libelle} » absent de la carte YouTube`).toBeDefined();
  return b as HTMLButtonElement;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  authenticateStreaming.mockReset();
  getStreamingServiceStatus.mockReset();
  disconnectStreaming.mockReset();
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Phase 5 — la connexion YouTube par code d’appareil a un chemin v2', () => {
  it('« Se connecter » demande un code d’appareil, l’affiche, puis la sonde conclut', async () => {
    services = { youtube: { enabled: true, authenticated: false } };
    authenticateStreaming.mockResolvedValue({
      service: 'youtube', authenticated: false,
      verification_url: 'https://www.google.com/device', user_code: 'ABCD-EFGH',
    });
    getStreamingServiceStatus.mockResolvedValue({ authenticated: true, username: 'moi@exemple.fr' });

    const el = await monterSurLesServices();
    boutonDe(carteYoutube(el), 'Se connecter').click();
    await tourner(0);

    // Le flux « code d'appareil » : corps VIDE, que le serveur lit comme
    // `{"device_flow": true}` — l'équivalent exact de `youtubeAuthDeviceCode`.
    expect(authenticateStreaming).toHaveBeenCalledWith('youtube', undefined);
    const carte = carteYoutube(el);
    expect(carte.querySelector('code.ucode')?.textContent).toBe('ABCD-EFGH');
    expect(carte.querySelector('a')?.getAttribute('href')).toBe('https://www.google.com/device');

    // La sonde remplace `youtubeAuthPoll` / `youtubeAuthStatus`.
    await tourner(3000);
    expect(getStreamingServiceStatus).toHaveBeenCalledWith('youtube');
    const apres = carteYoutube(el);
    expect(apres.querySelector('code.ucode'), 'le code reste affiché après la connexion').toBeNull();
    expect(apres.textContent).toContain('moi@exemple.fr');
  });

  it('« Se déconnecter » ferme la session YouTube (équivalent de `youtubeAuthLogout`)', async () => {
    services = { youtube: { enabled: true, authenticated: true, username: 'moi@exemple.fr' } };
    disconnectStreaming.mockResolvedValue({ disconnected: true });

    const el = await monterSurLesServices();
    boutonDe(carteYoutube(el), fr['settings.signOut']).click();
    await tourner(0);

    expect(disconnectStreaming).toHaveBeenCalledWith('youtube');
    expect(carteYoutube(el).textContent).not.toContain('moi@exemple.fr');
  });
});
