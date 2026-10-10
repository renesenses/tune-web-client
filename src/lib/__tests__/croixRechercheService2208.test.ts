// @vitest-environment jsdom
/**
 * Fil forum 2208 (Didier, 10/10/2026) — « Si on recherche un titre ou un album
 * sur la page d'un service de streaming, la seule façon de sortir du mode de
 * recherche c'est de sélectionner tout le texte recherché et de l'effacer.
 * […] Sur la page de la bibliothèque, le champ recherche possède une petite
 * croix pour tout effacer d'un clic. »
 *
 * Témoin COMPORTEMENTAL : vrai écran monté, `fetch` simulé, on tape, on clique
 * la croix (ou Échap), et la page revient à l'éditorial.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { activeView } from '../stores/navigation';
import { activeStreamingService, streamingServices } from '../stores/streaming';
import StreamingV2 from '../../components/v2/StreamingV2.svelte';

vi.setConfig({ testTimeout: 60_000 });

const SERVICES = { qobuz: { enabled: true, authenticated: true, username: 'Didier' } } as any;
const RESULTATS = {
  albums: [{ id: 'a1', title: 'Avalon', artist: 'Roxy Music' }],
  artists: [], tracks: [], playlists: [], has_more: false,
};

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function laisserTourner(n = 40) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}
const sousOnglets = () => Array.from(hote!.querySelectorAll('nav.subs > button')) as HTMLButtonElement[];
const sousOngletAllume = () => hote!.querySelector('nav.subs > button.on')?.textContent?.trim() ?? null;
const avalonAffiche = () => (hote!.textContent ?? '').includes('Avalon');
const champ = () => hote!.querySelector('header input') as HTMLInputElement | null;

async function monterEtChercher() {
  monte = mount(StreamingV2 as any, { target: hote! });
  for (let i = 0; i < 60 && !sousOnglets().length; i++) await laisserTourner(1);
  expect(sousOnglets().length, 'aucun sous-onglet rendu').toBeGreaterThan(1);
  const input = champ();
  expect(input, 'le champ de recherche du service a disparu').not.toBeNull();
  input!.value = 'Roxy Music';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  await new Promise((r) => setTimeout(r, 320));
  await laisserTourner(20);
  expect(avalonAffiche(), 'les résultats de recherche ne sont pas affichés').toBe(true);
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/ext\/bandcamp\/tags/.test(u)) throw new Error('extension non chargée');
    if (/\/streaming\/services/.test(u)) return reponse(SERVICES);
    if (/\/streaming\/qobuz\/search/.test(u)) return reponse(RESULTATS);
    if (/\/config/.test(u)) return reponse({});
    return reponse([]);
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeStreamingService.set(null);
  streamingServices.set({});
  activeView.set('streaming');
});

afterEach(() => {
  try { if (monte) unmount(monte); } catch { /* hors sujet */ }
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const croix = () => hote!.querySelector('header .v2-rech .clr') as HTMLButtonElement | null;

describe('fil 2208 — une croix efface la recherche d’un service', () => {
  it('pas de croix tant que le champ est vide', async () => {
    monte = mount(StreamingV2 as any, { target: hote! });
    for (let i = 0; i < 60 && !sousOnglets().length; i++) await laisserTourner(1);
    expect(champ()).not.toBeNull();
    expect(croix()).toBeNull();
  });

  it('la croix vide le champ et quitte les résultats', async () => {
    await monterEtChercher();
    const c = croix();
    expect(c, 'aucune croix dans le champ de recherche du service').not.toBeNull();
    c!.click();
    flushSync();
    await laisserTourner(10);
    expect(champ()!.value).toBe('');
    expect(avalonAffiche(), 'les résultats restent affichés après la croix').toBe(false);
    expect(croix()).toBeNull();
    expect(document.activeElement, 'le curseur revient dans le champ').toBe(champ());
  });

  it('Échap fait de même', async () => {
    await monterEtChercher();
    champ()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    await laisserTourner(10);
    expect(champ()!.value).toBe('');
    expect(avalonAffiche()).toBe(false);
  });
});
