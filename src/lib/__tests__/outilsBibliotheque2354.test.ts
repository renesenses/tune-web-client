// @vitest-environment jsdom
//
// #2354 (Didier, fil 2397) — décision de Bertrand du 24/10/2026 : en tête de
// Réglages › Bibliothèque, un bloc « Outils de la bibliothèque » réunit
// « Analyser la bibliothèque », « Nettoyage du serveur » (venu de Système ›
// Santé) et « Vider la bibliothèque » (jusque-là en bas de l'onglet). « Vider »
// ferme le bloc, isolé en zone dangereuse, et garde sa confirmation danger.
// Chaque outil garde son niveau d'affichage.
//
// Ce témoin lit la carte (`v2Settings`) ET monte l'écran : l'ordre, la
// présence par niveau, l'isolement de « Vider », sa confirmation, et le renvoi
// laissé dans Système.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { dialogs } from '../stores/dialogs';
import { V2_SETTINGS, searchSettings } from '../v2Settings';
import type { SettingsLevel } from '../uiLevel';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
const OUTILS = ['library', 'libraryCleanup', 'clearLibrary'];

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: () => null },
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let appels: { url: string; method: string }[] = [];
const posts = (motif: RegExp) => appels.filter((a) => a.method === 'POST' && motif.test(a.url));

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function ouvrir(cle: string, niveau: SettingsLevel): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: niveau }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === fr[cle]);
  expect(onglet, `onglet ${fr[cle]} introuvable`).toBeDefined();
  (onglet as HTMLButtonElement).click();
  flushSync();
  await attendre();
  return hote;
}

const cartes = (el: HTMLElement) =>
  [...el.querySelectorAll('section.card[data-section]')].map((c) => c.getAttribute('data-section'));

function bouton(el: Element, libelle: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === libelle) as
    | HTMLButtonElement
    | undefined;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  appels = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      appels.push({ url: String(url), method: String(options?.method ?? 'GET').toUpperCase() });
      return reponse(200, {});
    }),
  );
});

afterEach(() => {
  for (const r of get(dialogs)) dialogs.settle(r.id, false);
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('#2354 — la carte des Réglages', () => {
  const lib = V2_SETTINGS.find((t) => t.id === 'library')!;
  const sys = V2_SETTINGS.find((t) => t.id === 'system')!;

  it('les trois outils ouvrent l’onglet Bibliothèque, dans l’ordre Analyser, Nettoyer, Vider', () => {
    expect(lib.sections.slice(0, 3).map((s) => s.id)).toEqual(OUTILS);
    for (const s of lib.sections.slice(0, 3)) expect(s.group, s.id).toBe('libraryTools');
    expect(lib.sections.slice(3).some((s) => s.group), 'un outil hors du bloc').toBe(false);
  });

  it('chacun garde son niveau d’affichage', () => {
    const niveau = Object.fromEntries(lib.sections.map((s) => [s.id, s.min]));
    expect(niveau).toMatchObject({ library: 'beginner', libraryCleanup: 'intermediate', clearLibrary: 'beginner' });
    // Le niveau qu'il avait dans Système › Santé.
    expect(sys.sections.find((s) => s.id === 'health')?.min).toBe('intermediate');
  });

  it('seul « Vider » est une zone dangereuse', () => {
    expect(lib.sections.filter((s) => s.danger).map((s) => s.id)).toEqual(['clearLibrary']);
  });

  it('la recherche trouve le nettoyage dans Bibliothèque', () => {
    const hits = searchSettings('doublons', (k) => fr[k] ?? k, 50);
    expect(hits.some((h) => h.tab.id === 'library' && h.section.id === 'libraryCleanup')).toBe(true);
  });
});

describe('#2354 — l’écran Réglages › Bibliothèque', () => {
  it('Expert : intertitre unique, puis Analyser, Nettoyer, Vider en tête', async () => {
    const el = await ouvrir('settings.tabLibrary', 'expert');
    expect(cartes(el).slice(0, 3)).toEqual(OUTILS);
    const titres = el.querySelectorAll('h2.groupe');
    expect(titres.length).toBe(1);
    expect(titres[0].textContent?.trim()).toBe(fr['settings.libraryTools']);
    // L'intertitre précède la première carte du bloc.
    const premiere = el.querySelector('section.card[data-section="library"]')!;
    expect(titres[0].compareDocumentPosition(premiere) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bouton(el.querySelector('[data-section="libraryCleanup"]')!, fr['diagnostics.cleanupServer'])).toBeDefined();
  });

  it('Débutant : le nettoyage (intermédiaire) est masqué, Analyser et Vider restent en tête', async () => {
    const el = await ouvrir('settings.tabLibrary', 'beginner');
    expect(cartes(el).slice(0, 2)).toEqual(['library', 'clearLibrary']);
    expect(cartes(el)).not.toContain('libraryCleanup');
    expect(el.querySelectorAll('h2.groupe').length).toBe(1);
  });

  it('Intermédiaire : les trois outils', async () => {
    const el = await ouvrir('settings.tabLibrary', 'intermediate');
    expect(cartes(el).slice(0, 3)).toEqual(OUTILS);
  });

  it('« Vider » est isolé en zone dangereuse, et SEUL à l’être', async () => {
    const el = await ouvrir('settings.tabLibrary', 'expert');
    const vider = el.querySelector('section.card[data-section="clearLibrary"]')!;
    expect(vider.classList.contains('zone-danger')).toBe(true);
    expect(vider.querySelector('[data-zone-danger]')?.textContent?.trim()).toBe(fr['settings.dangerZone']);
    expect(el.querySelectorAll('section.card.zone-danger').length).toBe(1);
    expect(vider.classList.contains('fin-groupe'), '« Vider » ferme le bloc').toBe(true);
  });

  it('« Vider » garde sa confirmation danger ; « non » n’envoie rien', async () => {
    const el = await ouvrir('settings.tabLibrary', 'beginner');
    const vider = el.querySelector('section.card[data-section="clearLibrary"]')!;
    bouton(vider, fr['settings.clearLibrary'])!.click();
    await attendre();
    const d = get(dialogs).at(-1);
    expect(d?.message).toBe(fr['settings.clearLibraryConfirm']);
    expect(d?.danger).toBe(true);
    expect(posts(/\/system\/library\/clear$/).length, 'vidé avant la confirmation').toBe(0);
    dialogs.settle(d!.id, false);
    await attendre();
    expect(posts(/\/system\/library\/clear$/).length).toBe(0);
  });

  it('« Nettoyage du serveur » garde sa confirmation danger', async () => {
    const el = await ouvrir('settings.tabLibrary', 'expert');
    bouton(el.querySelector('[data-section="libraryCleanup"]')!, fr['diagnostics.cleanupServer'])!.click();
    await attendre();
    const d = get(dialogs).at(-1);
    expect(d?.message).toBe(fr['v2.maint.cleanupConfirm']);
    expect(d?.danger).toBe(true);
    expect(posts(/\/system\/cleanup$/).length).toBe(0);
  });
});

describe('#2354 — Système › Santé : un renvoi, plus le geste', () => {
  it('le bouton de nettoyage a quitté Santé ; un renvoi mène aux outils', async () => {
    const el = await ouvrir('settings.tabSystem', 'expert');
    const sante = el.querySelector('section.card[data-section="health"]')!;
    expect(sante, 'section Santé absente').not.toBeNull();
    expect(bouton(sante, fr['diagnostics.cleanupServer']), 'le geste est encore dans Santé').toBeUndefined();
    const renvoi = sante.querySelector('[data-renvoi-nettoyage]');
    expect(renvoi?.textContent).toContain(fr['settings.cleanupMovedHint']);
    bouton(renvoi!, fr['settings.cleanupMovedGo'])!.click();
    flushSync();
    await attendre();
    expect(cartes(el).slice(0, 3)).toEqual(OUTILS);
    expect(el.querySelector('section.card.hl')?.getAttribute('data-section')).toBe('libraryCleanup');
  });
});
