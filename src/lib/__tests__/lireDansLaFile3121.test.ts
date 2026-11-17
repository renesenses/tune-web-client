// @vitest-environment jsdom
//
// web#3121, relecture de la PR web#3126 — dans l'écran File, « Lire » d'un
// titre SAUTE à ce titre ; il ne remplace pas la file.
//
// Hors de la File, « Lire » envoie un titre seul (`queue_follows` pour un
// service). Le serveur remplace alors la file par ce titre
// (`file_pour_un_titre_de_service`, #6399) : posé dans la File, le même geste
// effaçait toute la file d'un clic. L'écran fournit donc son geste
// (`onLire` = `jumpInQueue`).
//
// Ce témoin MONTE QueueV2 avec une file Qobuz et lit les requêtes.
// Contre-épreuve : sans `onLire` dans QueueV2, le clic part en
// `POST /zones/10/play` avec `queue_follows` et aucun saut n'est demandé.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import QueueV2 from '../../components/v2/QueueV2.svelte';
import { currentZoneId } from '../stores/zones';
import { t } from '../i18n';

const FILE = {
  position: 0,
  length: 3,
  tracks: [
    { id: 1, track_id: null, zone_id: 10, source: 'qobuz', source_id: 'q1', title: 'Un', artist_name: 'A', duration_ms: 1000 },
    { id: 2, track_id: null, zone_id: 10, source: 'qobuz', source_id: 'q2', title: 'Deux', artist_name: 'A', duration_ms: 1000 },
    { id: 3, track_id: null, zone_id: 10, source: 'qobuz', source_id: 'q3', title: 'Trois', artist_name: 'A', duration_ms: 1000 },
  ],
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let requetes: { url: string; method: string; body: any }[] = [];
const attendre = (ms = 60) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  requetes = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ url: String(url), method: (init?.method ?? 'GET').toUpperCase(), body });
    const corps = /\/zones\/\d+\/queue(\?|$)/.test(String(url)) ? FILE : {};
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  currentZoneId.set(10);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('web#3121 — « Lire » dans la File saute au titre, la file intacte', () => {
  it('🔴 un titre Qobuz à suivre : un saut à son rang, aucun /play', { timeout: 60_000 }, async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(QueueV2 as any, { target: hote, props: {} as any });
    flushSync();
    await attendre(120);
    flushSync();
    const lire = get(t)('v2.pa.play' as any);
    const boutons = [...hote.querySelectorAll<HTMLButtonElement>(`.pactions button[aria-label="${lire}"]`)];
    expect(boutons.length, 'aucune barre de piste dans la file').toBe(3);
    requetes = [];
    // Le troisième bouton : « Trois », à suivre, rang 2 de la file.
    boutons[2].click();
    await attendre(60);
    flushSync();
    const lectures = requetes.filter((r) => r.method === 'POST' && /\/zones\/10\/play(\?|$)/.test(r.url));
    expect(lectures, 'Lire a remplacé la file par un titre seul').toHaveLength(0);
    const sauts = requetes.filter((r) => r.method === 'POST' && /\/zones\/10\/queue\/jump/.test(r.url));
    expect(sauts, 'Lire n’a pas sauté dans la file').toHaveLength(1);
    expect(sauts[0].body).toEqual({ position: 2 });
  });
});
