// @vitest-environment jsdom
//
// tune-server-rust#8346, point 2 (BenjaminB, AudioScienceReview #161, rc11) :
// le rééchantillonnage continu en 11 kHz du journal est la passe d'empreintes.
// Sa pause existait côté serveur, mais l'État du serveur n'avait AUCUNE carte
// pour elle : ReplayGain, plage dynamique, CLAP… avaient la leur, les
// empreintes n'étaient qu'une ligne de « Ce qui tourne », sans bouton.
//
// Ce banc monte le vrai écran (et la vraie barre latérale) sur
// `GET /system/background-tasks` tel que le serveur le rend
// (`routes/system/taches_de_fond.rs`, `instantane`, lot rc12).
//
// Contre-épreuve : sans la carte dans `TuneHealthV2.svelte`, les tests 🔴 de
// l'écran tombent (aucun `article` « Empreintes audio », aucun POST de pause) ;
// sans `carteDeFondCiblee` posée par la barre, le test de ciblage tombe.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';

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
import SidebarV2 from '../../components/v2/Sidebar.svelte';
import { preferences } from '../stores/preferences';
import { activeView } from '../stores/navigation';
import { analyseDeFond } from '../analysesDeFond';
import { terminerAvancement } from '../analyseBibliotheque';
import { carteEmpreintes, carteDeFondCiblee } from '../carteEmpreintes';
import lFr from '../locales/fr';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const fr = lFr as unknown as Record<string, string>;
const TITRE = fr['v2.health.running.task.fingerprints'];

let instantane: Record<string, unknown>;
const appels: { methode: string; chemin: string }[] = [];

const VIDE = /\/(zones|devices|profiles|shortcuts|collections|service-tokens)(\?|\/|$)/;
function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}
function repondre(methode: string, chemin: string): Response {
  if (methode === 'POST' && /\/system\/background-tasks\/fingerprints\/(pause|resume)$/.test(chemin)) {
    const enPause = chemin.endsWith('/pause');
    instantane.pausable = [{ id: 'fingerprints', state: enPause ? 'en_pause' : 'au_repos', paused: enPause }];
    return json(instantane);
  }
  if (chemin.endsWith('/system/background-tasks')) return json(instantane);
  if (chemin.includes('/system/scan/status')) return json({ scanning: false });
  if (VIDE.test(chemin)) return json([]);
  return json({});
}

const empreintes = (extra: Record<string, unknown> = {}) =>
  ({ id: 'fingerprints', state: 'en_cours', paused: false, ...extra });

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  instantane = { tasks: [], pausable: [], all_paused: false, scan_pausable: false };
  appels.length = 0;
  carteDeFondCiblee.set(null);
  analyseDeFond.set(null);
  terminerAvancement();
  activeView.set('home');
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const brut = String(typeof url === 'string' ? url : (url?.url ?? ''));
    const chemin = brut.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const methode = String(init?.method ?? 'GET').toUpperCase();
    appels.push({ methode, chemin });
    return repondre(methode, chemin);
  }));
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  carteDeFondCiblee.set(null);
  analyseDeFond.set(null);
  activeView.set('home');
  vi.unstubAllGlobals();
});

async function attendre() {
  await new Promise((r) => setTimeout(r, 120));
  for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
async function monter(composant: any = TuneHealthV2) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote });
  flushSync();
  await attendre();
  return hote;
}
const carte = () =>
  (Array.from(hote!.querySelectorAll('article.card')) as HTMLElement[])
    .find((c) => c.querySelector('h2')?.textContent?.trim() === TITRE) ?? null;
const bouton = (c: HTMLElement, texte: string) =>
  (Array.from(c.querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.textContent?.trim() === texte) ?? null;

describe('#8346 — lecture de l’entrée `fingerprints`', () => {
  it('serveur sans l’entrée : pas de carte', () => {
    expect(carteEmpreintes(null)).toBeNull();
    expect(carteEmpreintes({ tasks: [], pausable: [{ id: 'replaygain', state: 'en_cours', paused: false }] })).toBeNull();
  });

  it('en cours, avec l’avancement de la cascade (#7915)', () => {
    const c = carteEmpreintes({ tasks: [], pausable: [empreintes({
      progress: { processed: 1250, total: 40000, detail: 'cascade', eta_seconds: 7500 },
    })] as any });
    expect(c).toEqual({ etat: 'running', enPause: false, fait: 1250, total: 40000, resteSecondes: 7500 });
  });

  it('en pause : ni « en cours », ni jauge inventée', () => {
    const c = carteEmpreintes({ tasks: [], pausable: [{ id: 'fingerprints', state: 'en_pause', paused: true }] });
    expect(c).toEqual({ etat: 'idle', enPause: true, resteSecondes: null });
  });
});

describe('#8346 — la carte Empreintes de l’État du serveur', () => {
  it('🔴 la passe en cours a sa carte : à quoi elle sert, où elle en est, et sa pause', async () => {
    instantane.pausable = [empreintes({ progress: { processed: 1250, total: 40000, detail: 'cascade', eta_seconds: 7500 } })];
    await monter();
    const c = carte();
    expect(c, 'aucune carte Empreintes audio').not.toBeNull();
    expect(c!.textContent).toContain(fr['v2.health.cardFpSub']);
    expect(c!.textContent).toContain(fr['v2.health.fpPauseHint']);
    expect(c!.querySelector('.line')!.textContent).toMatch(/1\s?250.*40\s?000/);
    expect(c!.querySelector('.line')!.textContent).toContain('2 h 05');
    const pause = bouton(c!, fr['v2.health.pause']);
    expect(pause, 'la carte ne porte pas la pause').not.toBeNull();
    pause!.click();
    await attendre();
    expect(appels.some((a) => a.methode === 'POST' && a.chemin.endsWith('/system/background-tasks/fingerprints/pause')),
      'la pause n’a pas été demandée au serveur').toBe(true);
    expect(carte()!.textContent).toContain(fr['v2.health.stPaused']);
    expect(bouton(carte()!, fr['v2.health.resume'])).not.toBeNull();
  });

  it('🔴 au repos, la pause reste proposée : on coupe les empreintes avant la prochaine passe', async () => {
    instantane.pausable = [{ id: 'fingerprints', state: 'au_repos', paused: false }];
    await monter();
    const c = carte();
    expect(c).not.toBeNull();
    expect(c!.querySelector('.line')!.textContent?.trim()).toBe(fr['v2.health.fpIdle']);
    expect(bouton(c!, fr['v2.health.pause'])).not.toBeNull();
  });

  it('TÉMOIN — serveur qui ne publie pas `fingerprints` : aucune carte', async () => {
    instantane.pausable = [{ id: 'replaygain', state: 'au_repos', paused: false }];
    await monter();
    expect(carte()).toBeNull();
  });

  it('🔴 venu de l’indicateur de la barre, l’écran amène la carte de la passe', async () => {
    instantane.pausable = [empreintes({ progress: { processed: 10, total: 100, detail: 'cascade' } })];
    carteDeFondCiblee.set('fingerprints');
    await monter();
    expect(document.activeElement, 'la carte de la passe n’a pas été amenée').toBe(carte());
    expect(get(carteDeFondCiblee), 'la cible doit être consommée une seule fois').toBeNull();
  });
});

describe('#8346 — l’indicateur de la barre latérale vise la carte', () => {
  it('🔴 un clic ouvre l’État du serveur en désignant la passe en cours', async () => {
    await monter(SidebarV2);
    analyseDeFond.set({ tache: 'fingerprints', traitees: 10, total: 100, resteSecondes: null });
    flushSync();
    const ind = hote!.querySelector<HTMLButtonElement>('[data-testid="bg-analysis"]');
    expect(ind).not.toBeNull();
    ind!.click();
    flushSync();
    expect(get(activeView)).toBe('diagnostics');
    expect(get(carteDeFondCiblee)).toBe('fingerprints');
  });
});

describe('#8346 — les textes de la carte existent dans les quinze langues', () => {
  it.each(ONZE_LANGUES)('%s', (code) => {
    const d = dictionnaire(code);
    for (const cle of ['v2.health.cardFpSub', 'v2.health.fpLine', 'v2.health.fpIdle', 'v2.health.fpPauseHint']) {
      expect(d[cle], `${code} : ${cle}`).toBeTruthy();
    }
    expect(d['v2.health.fpLine']).toContain('{n}');
    expect(d['v2.health.fpLine']).toContain('{t}');
  });
});
