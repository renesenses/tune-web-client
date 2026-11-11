// @vitest-environment jsdom
//
// web#2804, point 3 — Réglages › Spotify Connect : tant que
// `GET /spotify-connect/status` dit `librespot_linked: false` (lecture Spotify
// activée), l'écran montre l'étape unique ; récepteur éteint (`active: false`),
// l'étape porte « Activer le récepteur ». Champs lus dans
// `tune-core/src/streaming/spotify_connect.rs` (`status`), lot rc12.
//
// Contre-épreuve : sans le bloc `data-reglage="spotify-liaison"` de
// `SettingsV2.svelte`, les tests 🔴 tombent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { zones } from '../stores/zones';
import fr from '../locales/fr';
import type { Zone } from '../types';

const ZONE = { id: 7, name: 'Salon', output_type: 'local', volume: 0.3, state: 'stopped' } as unknown as Zone;
let statut: Record<string, unknown>;
let posts: { url: string; corps: any }[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
async function attendre(tours = 8) {
  for (let i = 0; i < tours; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}

beforeEach(() => {
  posts = [];
  statut = {
    enabled: true, active: true, device_name: 'Tune — Salon', zone_id: 7, binary_available: true,
    lecture_experimentale: true, librespot_linked: false,
  };
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/spotify-connect/')) {
      if (init?.method === 'POST') {
        posts.push({ url: u, corps: init.body ? JSON.parse(String(init.body)) : null });
        statut = { ...statut, enabled: true, active: true };
      }
      return json(statut);
    }
    if (/\/zones(\?|$)/.test(u)) return json([ZONE]);
    return json(/\/(profiles|devices|playlists|shortcuts|groups)(\?|$)/.test(u) ? [] : {});
  }));
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  zones.set([ZONE]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function monter() {
  v2SettingsTarget.set({ tab: 'access', section: 'spotify' } as any);
  monte = mount(SettingsV2, { target: hote!, props: {} });
  flushSync();
  await attendre();
}
const etape = () => hote!.querySelector<HTMLElement>('[data-reglage="spotify-liaison"]');
const ETAPE = (fr as Record<string, string>)['playback.errorSpotifyLinkRequired'].replace('{device}', 'Tune — Salon');
const BOUTON = (fr as Record<string, string>)['settings.enableReceiver'];

describe('web#2804 — l’étape de liaison dans Réglages › Spotify Connect', () => {
  it('🔴 non lié, récepteur actif : l’étape, nommant l’appareil, sans bouton', async () => {
    await monter();
    expect(hote!.querySelector('[data-reglage="spotify-recepteur"]'), 'section Spotify non montée').not.toBeNull();
    expect(etape(), 'l’étape de liaison manque').not.toBeNull();
    expect(etape()!.textContent).toContain(ETAPE);
    expect(etape()!.querySelector('button')).toBeNull();
  }, 60_000);

  it('🔴 non lié, récepteur éteint : « Activer le récepteur » allume celui de la zone retenue', async () => {
    statut = { ...statut, active: false };
    await monter();
    const b = etape()?.querySelector<HTMLButtonElement>('button');
    expect(b?.textContent?.trim()).toBe(BOUTON);
    b!.click();
    await attendre();
    const p = posts.find((x) => x.url.endsWith('/spotify-connect/enable'));
    expect(p, 'aucune activation demandée').toBeTruthy();
    expect(p!.corps.zone_id).toBe(7);
  }, 60_000);

  it('TÉMOIN — déjà lié : pas d’étape', async () => {
    statut = { ...statut, librespot_linked: true };
    await monter();
    expect(hote!.querySelector('[data-reglage="spotify-recepteur"]')).not.toBeNull();
    expect(etape()).toBeNull();
  }, 60_000);
});
