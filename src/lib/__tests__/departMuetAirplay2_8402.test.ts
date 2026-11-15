// @vitest-environment jsdom
//
// tune-server-rust#8402 (décisions du 11/11/2026) — une zone AirPlay 2 en
// PURE verrouillé ouvre sa session à 0 % (le volume fixe garde ses 100 %). Le serveur le dit
// par un `zone.playback_error` NON fatal, juste après le Lire : l'écran doit
// l'afficher, traduit, même dans la fenêtre de grâce qui tait les échecs
// passagers.
//
// Contre-épreuve : retirer la branche `estDepartMuetAirplay2` de `v2Live.ts`
// fait rougir le test (la grâce affiche « chargement » à la place).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { demarrerTransportV2 } from '../v2Live';
import { currentZoneId, zones, playPendingUntil } from '../stores/zones';
import { notifications } from '../stores/notifications';
import { preparerLocale } from '../i18n';
import fr from '../locales/fr';

let pousser: (e: unknown) => void = () => {};
vi.mock('../websocket', () => ({
  tuneWS: {
    connect: () => {},
    setCurrentZoneId: () => {},
    get isPolling() {
      return false;
    },
    onEvent: (h: (e: unknown) => void) => {
      pousser = h;
      return () => {};
    },
  },
}));

const zone = { id: 4, name: 'PURE', state: 'playing', volume: 0, position_ms: 0,
  current_track: { id: null, title: 'So What', duration_ms: 562000 } };

beforeEach(async () => {
  await preparerLocale('fr');
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.stubGlobal('fetch', (url: string) => {
    const u = String(url);
    const corps = /\/zones(\?|$)/.test(u) ? [zone] : /\/queue/.test(u) ? { tracks: [], position: 0, length: 0 } : {};
    return Promise.resolve(new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const respirer = () => new Promise((r) => setTimeout(r, 0));

async function recevoir(code: string) {
  zones.set([zone as never]);
  currentZoneId.set(4);
  const arreter = demarrerTransportV2();
  await respirer();
  playPendingUntil.set(4, Date.now() + 30_000);
  pousser({ type: 'zone.playback_error', data: { zone_id: 4, code, fatal: false,
    error: 'AirPlay 2: playback started at 0 %' } });
  await respirer();
  arreter();
  return get(notifications);
}

describe('#8402 — AirPlay 2 parti à 0 % : dit, traduit, en information', () => {
  it('PURE verrouillé : sur l’appareil ou dans Tune', async () => {
    const recues = await recevoir('airplay2_start_volume_zero_pure');
    const n = recues.find((x) => x.message === fr['erreursServeur.airplay2_start_volume_zero_pure']);
    expect(n, JSON.stringify(recues)).toBeTruthy();
    expect(n!.level).toBe('info');
  });
});
