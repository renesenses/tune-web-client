// @vitest-environment jsdom
//
// #1430 — Didier, fil 1884, 0.9.161 : « Quand un coeur a été apposé sur le
// titre d'un album, il n'apparaît pas sur le même titre de l'écran présentant
// la file d'attente. »
//
// La réponse de `GET /zones/{id}/queue` nomme `id` la LIGNE DE FILE et range
// l'identifiant de piste dans `track_id` — mesuré sur le .18 le 22/09/2026 :
// `{ "id": 26070, "track_id": 32764, "source": "local" }`.
//
// 🔴 CE TÉMOIN MONTE L'ÉCRAN File d'attente avec cette forme exacte et compte
// les cœurs PLEINS rendus.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import QueueV2 from '../../components/v2/QueueV2.svelte';
import { currentZoneId } from '../stores/zones';
import { favoriteTrackIds } from '../stores/profile';
import { pisteDeFile } from '../pisteDeFile';

const FILE = {
  position: 0,
  length: 3,
  tracks: [
    // En cours : « Memory Motel », favori par son `track_id`.
    { id: 26070, track_id: 32764, zone_id: 10, source: 'local', title: 'Memory Motel', artist_name: 'The Rolling Stones', duration_ms: 427000 },
    // À suivre : un favori, et un qui ne l'est pas.
    { id: 26071, track_id: 32765, zone_id: 10, source: 'local', title: 'Hey Negrita', artist_name: 'The Rolling Stones', duration_ms: 300000 },
    { id: 26072, track_id: 32766, zone_id: 10, source: 'local', title: 'Melody', artist_name: 'The Rolling Stones', duration_ms: 300000 },
  ],
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const attendre = (ms = 60) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const corps = /\/zones\/\d+\/queue/.test(String(url)) ? FILE : {};
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  currentZoneId.set(10);
  // Les favoris portent des identifiants de PISTE. Le leurre 26072 est
  // l'identifiant de LIGNE de « Melody » : lu à tort, il l'allumerait.
  favoriteTrackIds.set(new Set([32764, 32765, 26072]));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
  favoriteTrackIds.set(new Set());
});

describe('#1430 — le cœur de la file lit l’identifiant de PISTE', () => {
  it('🔴 les deux favoris sont pleins, le leurre ne l’est pas', { timeout: 60_000 }, async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(QueueV2 as any, { target: hote, props: {} as any });
    flushSync();
    await attendre(120);
    flushSync();
    const coeurs = [...hote.querySelectorAll('button.coeur')];
    expect(coeurs.length, 'aucun cœur rendu dans la file').toBe(3);
    expect(coeurs.map((c) => c.classList.contains('on'))).toEqual([true, true, false]);
  });

  it('pisteDeFile : `track_id` remplace `id` quand il est là, et seulement alors', () => {
    expect(pisteDeFile({ id: 26070, track_id: 32764, title: 'a' } as any).id).toBe(32764);
    const streaming = { id: 17194, track_id: null, source: 'qobuz', source_id: '50168762', title: 'b' } as any;
    expect(pisteDeFile(streaming)).toBe(streaming);
    const piste = { id: 5, title: 'c' } as any;
    expect(pisteDeFile(piste)).toBe(piste);
  });
});
