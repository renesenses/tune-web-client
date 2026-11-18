// @vitest-environment jsdom
//
// tune-server-rust#9046 (fil 2907, rc12, macOS) — la carte « Analyse
// acoustique » affichait « EN COURS », 12 629 / 14 579, compteur immobile,
// sous un « Ce qui tourne » qui disait « aucune tâche de fond ne tourne ».
// L'état se déduisait de la jauge seule.
//
// Règle : « en cours » SEULEMENT si `pausable[acoustic].state === 'en_cours'`
// (`GET /system/background-tasks`) ; `paused_reason` non nul
// (`GET /library/search/acoustic/status`) → « en pause » et sa raison
// traduite ; sinon « au repos », jauge conservée.
//
// Contre-épreuve : l'ancienne règle (`fait > 0 ? 'running'`) fait tomber les
// tests 🔴 ; la passe qui travaille reste « en cours » (dernier test monté).
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
import { etatCarteClap, etatServeurAcoustique } from '../santeClap';
import { RAISONS_DE_PAUSE } from '../stores/acoustic';
import lFr from '../locales/fr';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = lFr as unknown as Record<string, string>;

let instantane: Record<string, unknown>;
let acoustique: Record<string, unknown>;

const VIDE = /\/(zones|devices|profiles|shortcuts|collections|service-tokens)(\?|\/|$)/;
function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}
function repondre(chemin: string): Response {
  if (chemin.endsWith('/system/background-tasks')) return json(instantane);
  if (chemin.endsWith('/library/search/acoustic/status')) return json(acoustique);
  if (chemin.includes('/system/scan/status')) return json({ scanning: false });
  if (VIDE.test(chemin)) return json([]);
  return json({});
}

/** Le cas du fil 2907 : jauge entamée, non finie. */
const FIL_2907 = {
  available: true, enabled: true, model_ready: true,
  analysed_tracks: 12_629, processed_tracks: 12_629, eligible_tracks: 14_579,
  deferred_tracks: 0, waiting_reason: null, paused_reason: null,
};
const acoustic = (state: string) => ({ id: 'acoustic', state, paused: state === 'en_pause' });

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  instantane = { tasks: [], pausable: [acoustic('au_repos')], all_paused: false, scan_pausable: false };
  acoustique = { ...FIL_2907 };
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
const carteClap = () =>
  (Array.from(hote!.querySelectorAll('article.card')) as HTMLElement[])
    .find((c) => c.querySelector('h2')?.textContent?.trim() === fr['v2.health.cardClap']) ?? null;
const badge = (c: HTMLElement) => c.querySelector('.chead .badge')?.textContent?.trim();

describe('#9046 — règle de la carte CLAP', () => {
  const base = { fait: 12_629, total: 14_579, attendLesFichiers: false, raisonPause: null };

  it('🔴 jauge entamée + `au_repos` + pas de raison ⇒ pas « en cours »', () => {
    expect(etatCarteClap({ ...base, etatServeur: 'au_repos' })).toEqual({ etat: 'idle', raisonPause: null });
  });
  it('🔴 serveur sans l’entrée `acoustic` ⇒ pas « en cours » non plus', () => {
    expect(etatCarteClap({ ...base, etatServeur: undefined }).etat).toBe('idle');
  });
  it('`en_cours` ⇒ « en cours »', () => {
    expect(etatCarteClap({ ...base, etatServeur: 'en_cours' }).etat).toBe('running');
  });
  it('une raison de pause prime, même sur `en_cours`', () => {
    expect(etatCarteClap({ ...base, etatServeur: 'en_cours', raisonPause: 'model_unavailable' }))
      .toEqual({ etat: 'idle', raisonPause: 'model_unavailable' });
  });
  it('fini ⇒ « terminé » ; reports seuls ⇒ « au repos »', () => {
    expect(etatCarteClap({ ...base, fait: 14_579, etatServeur: 'au_repos' }).etat).toBe('done');
    expect(etatCarteClap({ ...base, attendLesFichiers: true, etatServeur: 'en_cours' }).etat).toBe('idle');
  });
  it('lit `pausable[acoustic].state`', () => {
    expect(etatServeurAcoustique({ pausable: [acoustic('en_cours') as any] })).toBe('en_cours');
    expect(etatServeurAcoustique({ pausable: [] })).toBeUndefined();
    expect(etatServeurAcoustique(null)).toBeUndefined();
  });
});

describe('#9046 — la carte montée', () => {
  it('🔴 fil 2907 : jauge 12 629 / 14 579, `au_repos`, `paused_reason: null` ⇒ « au repos », jauge gardée', async () => {
    await monter();
    const c = carteClap();
    expect(c, 'aucune carte CLAP').not.toBeNull();
    expect(badge(c!)).toBe(fr['v2.health.stIdle']);
    expect(badge(c!)).not.toBe(fr['v2.health.stRunning']);
    expect(c!.querySelector('.bar')).not.toBeNull();
  });

  it('🔴 `paused_reason: model_unavailable` ⇒ « en pause » et la raison traduite', async () => {
    acoustique = { ...FIL_2907, paused_reason: 'model_unavailable' };
    await monter();
    const c = carteClap()!;
    expect(badge(c)).toBe(fr['v2.health.stPaused']);
    expect(c.querySelector('[data-raison-pause]')?.textContent?.trim()).toBe(fr['acoustic.paused.model_unavailable']);
  });

  it('🔴 `paused_reason: playback` ⇒ la raison, pas le frein générique en double', async () => {
    acoustique = { ...FIL_2907, paused_reason: 'playback' };
    instantane.pausable = [{ ...acoustic('au_repos'), throttled_for_playback: true }];
    await monter();
    const c = carteClap()!;
    expect(c.querySelector('[data-raison-pause]')?.textContent?.trim()).toBe(fr['acoustic.paused.playback']);
    expect(c.querySelector('[data-frein-lecture]')).toBeNull();
  });

  it('🔴 raison inconnue du client ⇒ libellé générique, pas d’identifiant nu seul', async () => {
    acoustique = { ...FIL_2907, paused_reason: 'nouvelle_raison' };
    await monter();
    expect(carteClap()!.querySelector('[data-raison-pause]')?.textContent?.trim())
      .toBe(fr['acoustic.pausedUnknown'].replace('{reason}', 'nouvelle_raison'));
  });

  it('contre-épreuve : la passe qui travaille reste « en cours »', async () => {
    instantane.pausable = [acoustic('en_cours')];
    await monter();
    const c = carteClap()!;
    expect(badge(c)).toBe(fr['v2.health.stRunning']);
    expect(c.querySelector('[data-raison-pause]')).toBeNull();
  });
});

describe('#9046 — i18n', () => {
  it.each(ONZE_LANGUES)('%s nomme chaque raison de pause', (code) => {
    for (const r of RAISONS_DE_PAUSE) expect(dictionnaire(code)[`acoustic.paused.${r}`], `${code} ${r}`).toBeTruthy();
  });
});
