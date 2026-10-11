// @vitest-environment jsdom
//
// « Ré-analyser les crêtes (true-peak) » — bouton FACULTATIF des réglages
// audio, suite web de la remesure serveur (`GET|POST /system/replaygain/reanalyze`).
//
// Le serveur a corrigé une mesure de true-peak fausse aux jonctions de segments
// (0,507 au lieu de 0,456 pour le même signal). Les mesures prises avant le
// correctif restent en base ; ce bouton les fait refaire.
//
// 🔴 Ces témoins MONTENT l'écran Réglages et cliquent : ils lisent la requête
// qui part vraiment. Contre-épreuves : une confirmation annulée n'envoie rien,
// un serveur sans la route n'affiche pas le bouton.
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

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { tachesDeFond } from '../stores/tachesDeFond';
import { dialogs } from '../stores/dialogs';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

type Requete = { methode: string; chemin: string };
let requetes: Requete[] = [];
/** `null` : serveur antérieur, la route rend 404. */
let releve: Record<string, unknown> | null;
let lancement: { status: number; corps: unknown };

const VIDE = /\/(zones|devices|profiles|shortcuts|collections|service-tokens)(\?|\/|$)/;

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

function repondre(methode: string, chemin: string): Response {
  if (chemin.endsWith('/system/replaygain/reanalyze')) {
    if (methode === 'POST') return json(lancement.corps, lancement.status);
    return releve ? json(releve) : json({ error: 'not found' }, 404);
  }
  if (chemin.endsWith('/system/background-tasks')) {
    return json({ tasks: [], pausable: [], all_paused: false, scan_pausable: false });
  }
  if (chemin.endsWith('/system/config')) {
    return json({ music_dirs: [], replaygain_mode: 'track', replaygain_analysis_enabled: true });
  }
  if (chemin.includes('/system/scan/status')) return json({ scanning: false });
  if (VIDE.test(chemin)) return json([]);
  return json({});
}

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  requetes = [];
  releve = { stale: 1234, running: false, algo: 'bs1770-tp4x-v2', enabled: true };
  lancement = { status: 202, corps: { status: 'started', stale: 1234, running: true } };
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: any) => {
    const brut = String(typeof url === 'string' ? url : (url?.url ?? ''));
    const chemin = brut.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const methode = String(init?.method ?? 'GET').toUpperCase();
    requetes.push({ methode, chemin });
    return repondre(methode, chemin);
  }));
  tachesDeFond.set([]);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  vi.unstubAllGlobals();
});

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function monterReglagesAudio() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabAudio'],
  );
  expect(onglet, 'onglet audio introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  return hote;
}

function bouton(el: HTMLElement): HTMLButtonElement | null {
  return el.querySelector('[data-remesure="lancer"] button') as HTMLButtonElement | null;
}

const posts = () =>
  requetes.filter((r) => r.methode === 'POST' && r.chemin.endsWith('/system/replaygain/reanalyze'));

describe('Réglages audio — « Ré-analyser les crêtes (true-peak) »', () => {
  it('la rangée dit le libellé, l’explication et le nombre de mesures à refaire', async () => {
    const el = await monterReglagesAudio();
    const rangee = el.querySelector('[data-remesure="lancer"]');
    expect(rangee, 'aucune rangée de remesure').not.toBeNull();
    expect(rangee!.textContent).toContain(fr['settings.rgReanalyze']);
    expect(rangee!.textContent).toContain(fr['settings.rgReanalyzeHint']);
    expect(rangee!.textContent).toContain(fr['settings.rgReanalyzeCount'].replace('{n}', '1234'));
  });

  it('🔴 confirmer envoie POST /system/replaygain/reanalyze', async () => {
    const el = await monterReglagesAudio();
    bouton(el)!.click();
    await attendre();
    const attente = get(dialogs);
    expect(attente.length, 'aucune confirmation demandée').toBe(1);
    expect(attente[0].message).toContain('1234');
    dialogs.settle(attente[0].id, true);
    await attendre(10);
    expect(posts()).toHaveLength(1);
    // La campagne court : le bouton se grise.
    expect(bouton(el)!.disabled).toBe(true);
  });

  it('contre-épreuve : annuler n’envoie rien', async () => {
    const el = await monterReglagesAudio();
    bouton(el)!.click();
    await attendre();
    const attente = get(dialogs);
    expect(attente.length).toBe(1);
    dialogs.settle(attente[0].id, false);
    await attendre(10);
    expect(posts()).toHaveLength(0);
  });

  it('un 409 analysis_disabled est un refus rendu, pas une panne', async () => {
    lancement = { status: 409, corps: { status: 'analysis_disabled', stale: 1234, running: false } };
    const el = await monterReglagesAudio();
    bouton(el)!.click();
    await attendre();
    dialogs.settle(get(dialogs)[0].id, true);
    await attendre(10);
    expect(posts()).toHaveLength(1);
    expect(bouton(el)!.disabled).toBe(false);
  });

  it('rien à refaire : le bouton est grisé', async () => {
    releve = { stale: 0, running: false, enabled: true };
    const el = await monterReglagesAudio();
    expect(bouton(el)!.disabled).toBe(true);
  });

  it('contre-épreuve : serveur sans la route, aucun bouton', async () => {
    releve = null;
    const el = await monterReglagesAudio();
    // La section est bien là (le réglage d'analyse y est)…
    expect(el.textContent).toContain(fr['settings.replaygainSource']);
    // … mais pas le bouton.
    expect(el.querySelector('[data-remesure="lancer"]')).toBeNull();
  });
});
