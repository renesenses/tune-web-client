// @vitest-environment jsdom
//
// Fil 3095 (rc13.90, zone DLNA) — une zone joue la radio « Morow » en Cover+ ;
// on passe à « Radio DY10 ». Le serveur joue DY10, mais « Lecture en cours » et
// la vignette restent sur Morow jusqu'à un rechargement de la page.
//
// Côté client : chaque `playback.*` relance un `GET /zones` autonome, et rien
// n'ordonnait les réponses. En Cover+, la station émet des
// `playback.track_changed` rapprochés (titre ICY, puis pochette) : une
// relecture partie AVANT le changement de station pouvait répondre APRÈS celle
// qui montrait DY10, et réécrire Morow. L'annonce retenue (web#2615) était déjà
// levée par la bonne réponse : plus rien ne relisait la zone avant le prochain
// titre de DY10.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { demarrerTransportV2 } from '../v2Live';
import { currentZoneId, zones } from '../stores/zones';
import { currentTrack } from '../stores/nowPlaying';

const MOROW = {
  source: 'radio',
  source_id: 'http://morow.example/stream',
  title: 'Artiste A - Titre A',
  album_title: 'Morow',
  cover_path: 'https://img.example/morow-titre-a.jpg',
  cover_plus: true,
  cover_plus_source: 'itunes',
};
const DY10 = {
  source: 'radio',
  source_id: 'http://dy10.example/stream',
  title: 'Radio DY10',
  album_title: 'Radio DY10',
  cover_path: null,
  cover_plus: false,
};

const zone = (piste: Record<string, unknown>) => ({
  id: 3,
  name: 'Salon DLNA',
  state: 'playing',
  volume: 50,
  position_ms: 0,
  output_type: 'dlna',
  current_track: { ...piste },
});

/** Les `GET /zones` en vol, dans l'ordre où ils sont partis. */
let enVol: { repondre: (piste: Record<string, unknown>) => void }[] = [];

function json(corps: unknown) {
  return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fil 3095 — l’affichage suit le changement de station (Cover+)', () => {
  it('une relecture partie avant le changement, arrivée après, ne remet pas l’ancienne station', async () => {
    enVol = [];
    vi.stubGlobal('fetch', (url: string) => {
      const u = String(url);
      if (/\/zones(\?|$)/.test(u)) {
        return new Promise<Response>((ok) => {
          enVol.push({ repondre: (piste) => ok(json([zone(piste)])) });
        });
      }
      if (/\/zones\/\d+\/queue/.test(u)) return Promise.resolve(json({ tracks: [], position: 0, length: 0 }));
      return Promise.resolve(json({}));
    });
    vi.useFakeTimers();
    zones.set([zone(MOROW) as never]);
    currentZoneId.set(3);
    const arreter = demarrerTransportV2();
    await vi.advanceTimersByTimeAsync(0);

    // Morow : la pochette Cover+ arrive, le serveur l'annonce (relecture n° 1).
    pousser({ type: 'playback.track_changed', data: { zone_id: 3, ...MOROW, track_generation: 4 } });
    await vi.advanceTimersByTimeAsync(0);
    // Le testeur passe à DY10 (relecture n° 2).
    pousser({ type: 'playback.started', data: { zone_id: 3, ...DY10, track_generation: 5 } });
    await vi.advanceTimersByTimeAsync(0);
    const relectures = enVol.slice();
    expect(relectures.length).toBe(2);

    // La relecture n° 2 répond la première : DY10.
    relectures[1].repondre(DY10);
    await vi.advanceTimersByTimeAsync(0);
    // La n° 1, partie avant le changement, répond ensuite avec Morow.
    relectures[0].repondre(MOROW);
    await vi.advanceTimersByTimeAsync(0);
    // Les relectures éventuellement programmées répondent DY10, l'état réel.
    for (let i = 0; i < 12; i++) {
      await vi.advanceTimersByTimeAsync(1_000);
      enVol.slice(2).forEach((r) => r.repondre(DY10));
      enVol = enVol.slice(0, 2);
    }

    const piste = get(currentTrack) as any;
    arreter();
    expect(
      piste?.album_title,
      'le serveur joue DY10, mais une relecture périmée a réécrit Morow (fil 3095)',
    ).toBe('Radio DY10');
    expect(piste?.source_id).toBe(DY10.source_id);
    expect(piste?.cover_path ?? null, 'la pochette Cover+ de Morow ne reste pas').toBeNull();
    expect(piste?.cover_plus).toBe(false);
  });
  it('à la reconnexion du WebSocket, la zone est relue (événements perdus pendant la coupure)', async () => {
    enVol = [];
    vi.stubGlobal('fetch', (url: string) => {
      const u = String(url);
      if (/\/zones(\?|$)/.test(u)) return Promise.resolve(json([zone(DY10)]));
      return Promise.resolve(json({}));
    });
    vi.useFakeTimers();
    zones.set([zone(MOROW) as never]);
    currentZoneId.set(3);
    const arreter = demarrerTransportV2();
    await vi.advanceTimersByTimeAsync(0);

    // Le `playback.started` de DY10 s'est perdu pendant la coupure.
    pousser({ type: '_disconnected', data: { attemptCount: 1 } });
    pousser({ type: '_connected', data: null });
    await vi.advanceTimersByTimeAsync(0);

    const piste = get(currentTrack) as any;
    arreter();
    expect(piste?.source_id, 'la reconnexion ne relisait pas `/zones`').toBe(DY10.source_id);
    expect(piste?.cover_plus).toBe(false);
  });
});
