// @vitest-environment jsdom
//
// COPIE du banc de tune-server-rust#8346 (même écran, même instantané),
// pour web#2675 — voir plus bas.
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
import { carteDeFondCiblee } from '../carteEmpreintes';
import { avancementsParTraitement, fusionnerAvancements, ligneAvancement } from '../analysesDeFond';
import { tuneWS } from '../websocket';
import lFr from '../locales/fr';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const fr = lFr as unknown as Record<string, string>;
const TITRE_DR = fr['v2.health.cardDr'];

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
  if (chemin.endsWith('/library/stats/completeness')) {
    return json({ total_tracks: 40000, with_dynamic_range: 10000, dynamic_range_from_analysis: 10000, dynamic_range_from_tag: 0 });
  }
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
const carteDr = () =>
  (Array.from(hote!.querySelectorAll('article.card')) as HTMLElement[])
    .find((c) => c.getAttribute('data-traitement') === 'dynamic_range') ?? null;


const plageDynamique = (extra: Record<string, unknown> = {}) =>
  ({ id: 'dynamic_range', state: 'en_cours', paused: false, ...extra });

describe('web#2675 — lecture de l’instantané', () => {
  it('chaque passe en cours avec son avancement ; ni pause, ni repos, ni serveur ancien', () => {
    const a = avancementsParTraitement({ pausable: [
      plageDynamique({ progress: { processed: 1250, total: 40000, eta_seconds: 7500 } }),
      { id: 'replaygain', state: 'en_cours', paused: false, progress: { processed: 5, total: 10 } },
      { id: 'fingerprints', state: 'en_pause', paused: true, progress: { processed: 5, total: 10 } },
      { id: 'enrichment', state: 'en_cours', paused: false },
    ] });
    expect(a).toEqual({
      dynamic_range: { tache: 'dynamic_range', traitees: 1250, total: 40000, resteSecondes: 7500 },
      replaygain: { tache: 'replaygain', traitees: 5, total: 10, resteSecondes: null },
    });
    expect(avancementsParTraitement(null)).toEqual({});
  });

  it('l’événement met à jour une passe, et sa fin l’efface', () => {
    let m = fusionnerAvancements({}, { task: 'dynamic_range', processed: 10, total: 100, eta_seconds: 60, active: true });
    expect(m.dynamic_range.traitees).toBe(10);
    m = fusionnerAvancements(m, { task: 'dynamic_range', active: false });
    expect(m).toEqual({});
    const meme = {};
    expect(fusionnerAvancements(meme, { task: 'x', active: false })).toBe(meme);
  });

  it('la ligne : titres traités, total, puis le temps restant s’il est estimé', () => {
    const t = (k: string) => fr[k] ?? k;
    expect(ligneAvancement({ tache: 'dynamic_range', traitees: 1250, total: 40000, resteSecondes: 7500 }, t))
      .toBe(fr['v2.health.fpLine'].replace('{n}', '1250').replace('{t}', '40000') + ' · ' + fr['v2.nav.bgAnalysisEta'].replace('{d}', '2 h 05'));
    expect(ligneAvancement({ tache: 'replaygain', traitees: 5, total: 10, resteSecondes: null }, t))
      .toBe(fr['v2.health.fpLine'].replace('{n}', '5').replace('{t}', '10'));
  });
});

describe('web#2675 — la carte Plage dynamique de l’État du serveur', () => {
  it('🔴 passe en cours : titres traités, total et temps restant sur la carte', async () => {
    instantane.pausable = [plageDynamique({ progress: { processed: 1250, total: 40000, detail: 'cascade', eta_seconds: 7500 } })];
    await monter();
    const c = carteDr();
    expect(c, 'aucune carte Plage dynamique — témoin sans objet').not.toBeNull();
    const ligne = c!.querySelector('[data-avancement-analyse="dynamic_range"]');
    expect(ligne, 'la carte ne dit pas le temps restant').not.toBeNull();
    expect(ligne!.textContent).toMatch(/1\s?250.*40\s?000/);
    expect(ligne!.textContent).toContain('2 h 05');
  });

  it('🔴 l’événement `library.analysis.progress` fait avancer la carte', async () => {
    instantane.pausable = [plageDynamique({ progress: { processed: 1250, total: 40000, eta_seconds: 7500 } })];
    await monter();
    (tuneWS as any).handlers.forEach((h: any) => h({ type: 'library.analysis.progress',
      data: { task: 'dynamic_range', processed: 30000, total: 40000, eta_seconds: 1800, active: true } }));
    flushSync();
    const ligne = carteDr()!.querySelector('[data-avancement-analyse="dynamic_range"]')!;
    expect(ligne.textContent).toMatch(/30\s?000.*40\s?000/);
    expect(ligne.textContent).toContain('30 min');
  });

  it('CONTRE-ÉPREUVE : serveur sans `progress`, ou passe en pause → affichage d’avant', async () => {
    instantane.pausable = [plageDynamique()];
    await monter();
    expect(carteDr()).not.toBeNull();
    expect(hote!.querySelector('[data-avancement-analyse]')).toBeNull();
    unmount(monte!); monte = null; hote!.remove();
    instantane.pausable = [plageDynamique({ state: 'en_pause', paused: true, progress: { processed: 1, total: 2 } })];
    await monter();
    expect(hote!.querySelector('[data-avancement-analyse]')).toBeNull();
  });
});
