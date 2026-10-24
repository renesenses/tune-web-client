// @vitest-environment jsdom
//
// tune-server-rust#6330, volet web (Benjithom, fil 2270) : sur l'État du
// serveur, une carte restait figée pendant une écoute (plage dynamique à
// 95 %) sans dire pourquoi. Le serveur publie depuis #4681 le drapeau
// `throttled_for_playback` dans `GET /system/background-tasks` :
//   * `pausable[].throttled_for_playback` (booléen, par traitement) ;
//   * `scan.throttled_for_playback` (le scan n'est pas dans `pausable`).
// Noms vérifiés dans `tune-server/src/routes/system/taches_de_fond.rs`
// (`instantane`), lot `batch/bugs-rc8-20261022`.
//
// L'écran ne le lisait pas. Ce banc monte l'écran et vérifie que la carte
// freinée le DIT, et seulement elle.
//
// Contre-épreuve : sans la lecture du drapeau dans `TuneHealthV2.svelte`, les
// tests 🔴 tombent ; le serveur sans le drapeau ne fait apparaître aucune
// mention (dernier test).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import TuneHealthV2 from '../../components/v2/TuneHealthV2.svelte';
import { preferences } from '../stores/preferences';
import { tachesDeFond as magasinTaches } from '../stores/tachesDeFond';
import { freinesParLaLecture, FREIN_SCAN } from '../tachesDeFond';
import lFr from '../locales/fr';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = lFr as unknown as Record<string, string>;
const TEXTE = fr['v2.health.throttledForPlayback'];

/** Le corps de `GET /system/background-tasks` servi à l'écran. */
let instantane: Record<string, unknown>;

const VIDE = /\/(zones|devices|profiles|shortcuts|collections|service-tokens)(\?|\/|$)/;
function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}
function repondre(chemin: string): Response {
  if (chemin.endsWith('/system/background-tasks')) return json(instantane);
  if (chemin.includes('/system/scan/status')) return json({ scanning: false });
  if (VIDE.test(chemin)) return json([]);
  return json({});
}

const traitement = (id: string, freine = false, paused = false) =>
  ({ id, state: paused ? 'en_pause' : 'en_cours', paused, throttled_for_playback: freine });

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  instantane = { tasks: [], pausable: [], all_paused: false, scan_pausable: false };
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const brut = String(typeof url === 'string' ? url : (url?.url ?? ''));
    return repondre(brut.replace(/^https?:\/\/[^/]+/, '').split('?')[0]);
  }));
  magasinTaches.set([]);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  magasinTaches.set([]);
  vi.unstubAllGlobals();
});

async function monter() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TuneHealthV2, { target: hote });
  flushSync();
  await new Promise((r) => setTimeout(r, 120));
  for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
  return hote;
}
const carte = (titre: string) =>
  (Array.from(hote!.querySelectorAll('article.card')) as HTMLElement[])
    .find((c) => c.querySelector('h2')?.textContent?.trim() === titre) ?? null;
const mention = (c: HTMLElement | null) => c?.querySelector('[data-frein-lecture]') ?? null;

describe('#6330 — lecture du drapeau `throttled_for_playback`', () => {
  it('par traitement, et pour le scan', () => {
    const f = freinesParLaLecture({
      tasks: [],
      pausable: [traitement('dynamic_range', true), traitement('enrichment', false), { id: 'acoustic', state: 'en_cours', paused: false }],
      scan: { running: true, throttled_for_playback: true },
    });
    expect([...f].sort()).toEqual(['dynamic_range', FREIN_SCAN].sort());
  });

  it('serveur antérieur, sans le champ : rien n’est freiné', () => {
    expect(freinesParLaLecture({ tasks: [] }).size).toBe(0);
    expect(freinesParLaLecture(null).size).toBe(0);
  });
});

describe('#6330 — la carte figée pendant l’écoute dit pourquoi', () => {
  it('🔴 la carte « Plage dynamique » freinée porte la raison, pas celle de l’enrichissement', async () => {
    instantane.pausable = [traitement('dynamic_range', true), traitement('enrichment', false)];
    await monter();
    const dr = carte(fr['v2.health.cardDr']);
    expect(dr, 'aucune carte Plage dynamique').not.toBeNull();
    expect(mention(dr), 'la carte freinée ne dit pas pourquoi elle est figée').not.toBeNull();
    expect(mention(dr)!.textContent?.trim()).toBe(TEXTE);
    expect(mention(carte(fr['v2.health.cardEnrich']))).toBeNull();
  });

  it('🔴 le scan freiné le dit aussi', async () => {
    instantane.scan = { running: true, throttled_for_playback: true };
    await monter();
    expect(mention(carte(fr['v2.health.cardScan']))).not.toBeNull();
  });

  it('une carte suspendue dit « en pause », pas le frein', async () => {
    instantane.pausable = [traitement('dynamic_range', true, true)];
    await monter();
    const dr = carte(fr['v2.health.cardDr'])!;
    expect(dr.textContent).toContain(fr['v2.health.stPaused']);
    expect(mention(dr)).toBeNull();
  });

  it('contre-épreuve : sans le drapeau, aucune carte n’en parle', async () => {
    instantane.pausable = [traitement('dynamic_range', false), traitement('enrichment', false)];
    await monter();
    expect(hote!.querySelectorAll('[data-frein-lecture]').length).toBe(0);
    expect(hote!.textContent).not.toContain(TEXTE);
  });

  it.each(ONZE_LANGUES)('%s porte le texte', (code) => {
    expect(dictionnaire(code)['v2.health.throttledForPlayback']).toBeTruthy();
  });
});
