// @vitest-environment jsdom
// web#2256 — Didier, fil 1907, 19/10/2026 : « Le choix parfait serait
// bien-sûr de pouvoir choisir entre classement alphabétique automatique ou
// manuel […] mais si un seul choix est possible je préfère classement
// alphabétique automatique […] tu peux retenir le même choix que pour les
// collections intelligentes si c'est possible. »
//
// Go de Bertrand du 19/10 : l'alphabétique par défaut, le manuel en option,
// pour les collections intelligentes comme pour les simples.
//
// 1. L'arbre des Rayons passe à l'alphabétique par défaut (web#2224 livrait
//    « manuel », l'ordre de création).
// 2. Les deux listes plates gagnent « Manuel (glisser-déposer) », gardé par
//    le serveur (`ui_preferences`, `ordreManuelCollections`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import CollectionsV2 from '../../components/v2/CollectionsV2.svelte';
import ArbreRayons from '../../components/v2/ArbreRayons.svelte';
import { dialogs } from '../stores/dialogs';
import { preferences } from '../stores/preferences';
import { ORDRE_RAYONS_DEFAUT } from '../rayonsCollections';
import type { ArbreCollections } from '../api';
import {
  decoderGlissePlate, deposerDansOrdre, encoderGlissePlate, normaliserOrdreManuel,
  ordonnerManuellement,
} from '../ordreManuelCollections';

describe('web#2256 — logique pure', () => {
  it('normaliserOrdreManuel : des entiers, sans doublon, pour les deux listes ; le reste tombe', () => {
    expect(normaliserOrdreManuel({ smart: [3, 1, 3, 'x', 2.5, 7], normale: [4] })).toEqual({ smart: [3, 1, 7], normale: [4] });
    for (const abime of [null, undefined, 'smart', [1, 2], { smart: 'x' }, 42]) {
      const n = normaliserOrdreManuel(abime);
      expect(n.smart, JSON.stringify(abime)).toEqual([]);
    }
  });

  it('ordonnerManuellement : les rangées à la main d’abord, puis les autres dans l’ordre par défaut ; un id disparu est ignoré', () => {
    const noms = ['Ambiances', 'Bach', 'Coltrane', 'Zénith'].map((n, i) => ({ id: i + 1, n }));
    const v = ordonnerManuellement(noms, [4, 99, 2], (e) => e.id, (a, b) => a.n.localeCompare(b.n));
    expect(v.map((e) => e.n)).toEqual(['Zénith', 'Bach', 'Ambiances', 'Coltrane']);
    // Rien de rangé : l'ordre par défaut, tel quel — choisir « Manuel » ne bouscule rien.
    expect(ordonnerManuellement(noms, [], (e) => e.id, (a, b) => a.n.localeCompare(b.n)).map((e) => e.n))
      .toEqual(['Ambiances', 'Bach', 'Coltrane', 'Zénith']);
  });

  it('deposerDansOrdre : la place de la cible, avant en remontant, après en descendant', () => {
    expect(deposerDansOrdre([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]); // remonte : avant
    expect(deposerDansOrdre([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 1, 4]); // descend : après
    expect(deposerDansOrdre([1, 2, 3], 2, 2)).toBeNull();
    expect(deposerDansOrdre([1, 2, 3], 2, 9)).toBeNull();
  });

  it('le glisser porte la SORTE : les identifiants des deux sortes se recouvrent', () => {
    expect(decoderGlissePlate(encoderGlissePlate('smart', 1))).toEqual({ sorte: 'smart', id: 1 });
    expect(decoderGlissePlate('{"sorte":"rayon","id":1}')).toBeNull();
    expect(decoderGlissePlate('pas du json')).toBeNull();
  });
});

describe('web#2256 — Rayons : l’alphabétique par défaut', () => {
  it('le défaut est « alpha », et l’arbre sans ordre choisi s’affiche par ordre des noms', () => {
    expect(ORDRE_RAYONS_DEFAUT).toBe('alpha');
    const arbre: ArbreCollections = {
      max_depth: 3,
      folders: [],
      collections: ['Zappa', 'Abba', 'Muse'].map((name, i) => ({
        kind: 'smart' as const, id: i + 1, name, description: null, icon: null, color: null, folder_id: null, position: i,
      })),
    };
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const c = mount(ArbreRayons, { target: hote, props: { arbre, onOuvrir: () => {} } });
    flushSync();
    expect([...hote.querySelectorAll('.hors > ul > .col .nom')].map((n) => n.textContent)).toEqual(['Abba', 'Muse', 'Zappa']);
    unmount(c);
    hote.remove();
  });
});

/* ------------------------- l'écran Collections monté ------------------------- */

const COLLECTIONS = [
  { id: 1, name: 'Ambiances', description: null, album_ids: [], covers: [], created_at: '2026-01-01T00:00:00Z' },
  { id: 2, name: 'Émotions', description: null, album_ids: [], covers: [], created_at: '2026-02-01T00:00:00Z' },
  { id: 3, name: 'Zénith', description: null, album_ids: [], covers: [], created_at: '2026-03-01T00:00:00Z' },
];

function corps(chemin: string): unknown {
  if (/\/smart-collections\/\d+\/albums/.test(chemin)) return [];
  if (chemin.includes('/smart-collections')) return [];
  if (/\/collections\/\d+\/albums/.test(chemin)) return [];
  if (chemin.endsWith('/library/collections')) return COLLECTIONS;
  return [];
}

class Inerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  localStorage.clear();
  preferences.update((p) => ({ ...p, ordreManuelCollections: { smart: [], normale: [] } }));
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const brut = String(typeof url === 'string' ? url : url?.url ?? '');
    const c = corps(brut.replace(/^https?:\/\/[^/]+/, '').split('?')[0]);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => c,
      text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});

afterEach(() => {
  for (const r of get(dialogs)) dialogs.settle(r.id, false);
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function tourner(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function attendreQue(condition: () => boolean, tours = 400): Promise<boolean> {
  for (let i = 0; i < tours; i++) {
    if (condition()) return true;
    await new Promise((r) => setTimeout(r, 5));
    flushSync();
  }
  return condition();
}

/** L'écran, sur l'onglet « Collections » (les simples), liste chargée. */
async function poserSurLesSimples(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CollectionsV2, { target: hote, props: {} as any });
  flushSync();
  await tourner();
  const onglets = Array.from(hote.querySelectorAll<HTMLButtonElement>('nav.tabs button.tab'));
  onglets[1].click();
  await tourner();
  await attendreQue(() => hote!.querySelectorAll('.grid .card').length === 3);
  return hote;
}

const ordreAffiche = (r: HTMLElement) =>
  [...r.querySelectorAll('.grid .card .ct')].map((n) => (n.textContent ?? '').trim());

function glisserSur(r: HTMLElement, source: string, cible: string) {
  const carte = (cle: string) => r.querySelector(`.grid .card[data-collection="${cle}"]`) as HTMLElement;
  const donnees = new Map<string, string>();
  const dt = {
    setData: (t: string, v: string) => donnees.set(t, v),
    getData: (t: string) => donnees.get(t) ?? '',
    effectAllowed: 'move',
  };
  const ev = (type: string) => {
    const e = new Event(type, { bubbles: true, cancelable: true }) as any;
    e.dataTransfer = dt;
    return e;
  };
  carte(source).dispatchEvent(ev('dragstart'));
  carte(cible).dispatchEvent(ev('dragover'));
  carte(cible).dispatchEvent(ev('drop'));
}

describe('web#2256 — listes plates : « Manuel » en option', () => {
  it('sans choix : l’alphabétique, comme avant, et les cartes ne se glissent pas', async () => {
    const r = await poserSurLesSimples();
    expect(ordreAffiche(r)).toEqual(['Ambiances', 'Émotions', 'Zénith']);
    expect((r.querySelector('.grid .card') as HTMLElement).getAttribute('draggable')).toBe('false');
  });

  it('le sélecteur de tri propose « Manuel (glisser-déposer) »', async () => {
    const r = await poserSurLesSimples();
    const options = [...r.querySelectorAll<HTMLOptionElement>('label.tricol select option')].map((o) => o.value);
    expect(options).toContain('manuel');
  });

  it('« Manuel » : l’ordre gardé d’abord, puis les autres par ordre alphabétique', async () => {
    localStorage.setItem('tune_v2_ecran_v2.collections.tri', 'manuel');
    preferences.update((p) => ({ ...p, ordreManuelCollections: { smart: [], normale: [3] } }));
    const r = await poserSurLesSimples();
    expect(ordreAffiche(r)).toEqual(['Zénith', 'Ambiances', 'Émotions']);
    expect(r.querySelector('.indicemanuel'), 'le geste est dit').not.toBeNull();
  });

  it('« Manuel » : déposer une collection sur une autre la range à sa place, et le choix part au profil', async () => {
    localStorage.setItem('tune_v2_ecran_v2.collections.tri', 'manuel');
    const r = await poserSurLesSimples();
    expect(ordreAffiche(r)).toEqual(['Ambiances', 'Émotions', 'Zénith']);
    glisserSur(r, 'normale:3', 'normale:1');
    await tourner();
    expect(ordreAffiche(r)).toEqual(['Zénith', 'Ambiances', 'Émotions']);
    expect(get(preferences).ordreManuelCollections).toEqual({ smart: [], normale: [3, 1, 2] });
  });

  it('en tri alphabétique, un dépôt ne range rien', async () => {
    const r = await poserSurLesSimples();
    glisserSur(r, 'normale:3', 'normale:1');
    await tourner();
    expect(ordreAffiche(r)).toEqual(['Ambiances', 'Émotions', 'Zénith']);
    expect(get(preferences).ordreManuelCollections).toEqual({ smart: [], normale: [] });
  });
});

describe('web#2256 — branchement de la préférence', () => {
  it('rangée dans `ui_preferences` et assainie aux deux lectures', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const prefs = readFileSync(resolve(process.cwd(), 'src/lib/stores/preferences.ts'), 'utf-8');
    expect(prefs).toContain('ordreManuelCollections: { smart: [], normale: [] }');
    expect((prefs.match(/normaliserOrdreManuel\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
