/**
 * web#2285 (tune-server-rust#6380, PR #6662 ; Sandro, fil 2284) — après un
 * redémarrage du serveur, page ouverte, la barre affichait 0:00 alors que le
 * serveur rendait la position restaurée. La règle de web#1652 prenait le
 * passage `paused` → `stopped`, vu à travers la coupure, pour un « Arrêter ».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { positionApresReleve, oublierEtatObserve, type SuiviPosition } from '../positionLecture';

const DERIVE = 3000;
const CLE = 'id:42';
const zonePure = (pos: number, etat: string) => ({
  current_track: { id: 42, source: 'local', source_id: null, title: 'Inner City Blues' },
  position_ms: pos,
  state: etat,
});

describe('web#2285 — la règle pure', () => {
  it('🔴 coupure de liaison entre la pause et la zone restaurée : la position restaurée fait foi', () => {
    let s: SuiviPosition = { clePiste: CLE, positionMs: 0 };
    s = positionApresReleve(s, zonePure(96_000, 'paused'), s.positionMs, DERIVE).suivi;
    s = oublierEtatObserve(s); // la liaison tombe : le serveur redémarre
    const d = positionApresReleve(s, zonePure(96_000, 'stopped'), s.positionMs, DERIVE);
    expect(d.raison).toBe('arret');
    expect(d.suivi.positionMs).toBe(96_000);
  });

  it('web#1652 tenu : sans coupure, Stop ramène toujours la barre à 0:00', () => {
    let s: SuiviPosition = { clePiste: CLE, positionMs: 0 };
    s = positionApresReleve(s, zonePure(96_000, 'playing'), s.positionMs, DERIVE).suivi;
    const d = positionApresReleve(s, zonePure(96_000, 'stopped'), s.positionMs, DERIVE);
    expect(d.raison).toBe('stop');
    expect(d.suivi.positionMs).toBe(0);
  });

  it('oublier garde la piste suivie (#954 ne refuse pas le premier relevé)', () => {
    const s = oublierEtatObserve({ clePiste: CLE, positionMs: 1234, etat: 'paused', positionAuStop: 5 });
    expect(s).toEqual({ clePiste: CLE, positionMs: 1234 });
  });
});

// ── Le branchement réel : `demarrerTransportV2`, faux WebSocket ──────────────

let pousser: (e: unknown) => void = () => {};
vi.mock('../websocket', () => ({
  tuneWS: {
    connect: () => {},
    setCurrentZoneId: () => {},
    get isPolling() { return false; },
    onEvent: (h: (e: unknown) => void) => { pousser = h; return () => {}; },
  },
}));

import { demarrerTransportV2 } from '../v2Live';
import { currentZoneId, zones } from '../stores/zones';
import { seekPositionMs } from '../stores/nowPlaying';

const zone = (pos: number, etat: string) => ({
  id: 2, name: 'Salon', volume: 40, state: etat, position_ms: pos,
  current_track: { id: 42, title: 'Inner City Blues', duration_ms: 330_000 },
});
const attendre = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  zones.set([]);
  seekPositionMs.set(-1);
  vi.stubGlobal('fetch', () => Promise.resolve(new Response('{}', {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('web#2285 — la coquille v2 oublie l’état vu quand la liaison tombe', () => {
  it('🔴 pause à 1:36, serveur redémarré, zone restaurée arrêtée à 1:36 : la barre reste à 1:36', async () => {
    currentZoneId.set(2);
    const arreter = demarrerTransportV2();
    // Le premier relevé fixe la piste suivie (#954) ; le second, la position.
    pousser({ type: 'zone.updated', data: { zones: [zone(96_000, 'paused')] } });
    pousser({ type: 'zone.updated', data: { zones: [zone(96_000, 'paused')] } });
    await attendre();
    expect(get(seekPositionMs)).toBe(96_000);

    pousser({ type: '_disconnected', data: { attemptCount: 1 } });
    pousser({ type: '_connected', data: null });
    pousser({ type: 'zone.updated', data: { zones: [zone(96_000, 'stopped')] } });
    await attendre();
    arreter();
    expect(get(seekPositionMs), 'la barre est retombée à 0:00 après la reconnexion').toBe(96_000);
  });

  it('web#1652 tenu dans la coquille : un vrai Stop, liaison intacte, ramène à 0:00', async () => {
    currentZoneId.set(2);
    const arreter = demarrerTransportV2();
    // Le premier relevé fixe la piste suivie (#954) ; le second, la position.
    pousser({ type: 'zone.updated', data: { zones: [zone(96_000, 'paused')] } });
    pousser({ type: 'zone.updated', data: { zones: [zone(96_000, 'paused')] } });
    await attendre();
    pousser({ type: 'zone.updated', data: { zones: [zone(96_000, 'stopped')] } });
    await attendre();
    arreter();
    expect(get(seekPositionMs)).toBe(0);
  });
});
