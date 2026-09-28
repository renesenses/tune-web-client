// @vitest-environment jsdom
//
// Tune Circle T4 — renesenses/tune-server-rust#5327, décision 1 du 28/09/2026 :
// un contact retiré en cours d'écoute est coupé à la requête suivante. Le
// greffon émet alors `circle.stream_revoked` ; l'écran doit le DIRE, en clair,
// au lieu d'un échec de décodage — et même dans la fenêtre de grâce qui suit
// un Lire, puisque ce refus-là ne guérira pas.
//
// La trame est poussée dans le VRAI gestionnaire de `v2Live`, et on regarde ce
// qui arrive dans le bus de notifications.
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

const zone = { id: 3, name: 'Salon', state: 'playing', volume: 50, position_ms: 1000,
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
const messages = () => get(notifications).map((n) => n.message);

async function demarrer() {
  zones.set([zone as never]);
  currentZoneId.set(3);
  const arreter = demarrerTransportV2();
  await respirer();
  return arreter;
}

describe('T4 — `circle.stream_revoked` atteint l’écran', () => {
  it('l’événement propre : « Cette écoute n’est plus autorisée »', async () => {
    const arreter = await demarrer();
    pousser({ type: 'circle.stream_revoked', data: { zone_id: 3 } });
    await respirer();
    arreter();
    expect(messages()).toContain(fr['v2.circle.listen.revoked']);
  });

  it('porté par un échec de lecture, PENDANT la fenêtre de grâce : dit quand même', async () => {
    const arreter = await demarrer();
    // Un Lire vient de partir : la fenêtre de grâce taierait un échec passager.
    playPendingUntil.set(3, Date.now() + 30_000);
    pousser({ type: 'zone.playback_error', data: { zone_id: 3, code: 'circle.stream_revoked', error: 'decode error' } });
    await respirer();
    arreter();
    expect(messages()).toContain(fr['v2.circle.listen.revoked']);
    // Jamais l'échec de décodage brut.
    expect(messages().join('|')).not.toContain('decode error');
  });
});
