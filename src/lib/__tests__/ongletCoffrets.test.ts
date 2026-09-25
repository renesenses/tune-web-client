// @vitest-environment jsdom
//
// L'onglet « Coffrets » de la Bibliothèque — GO de Bertrand du 25/09/2026 :
// « regroupement automatique + ajoute une entrée Coffrets dans la barre
// supérieure ».
//
// Le serveur réunit désormais tout seul les coffrets rangés un dossier par
// disque (« Early Works, Disc 1 / Disc 2 »), et liste les coffrets réunis —
// automatiques et manuels — par `GET /library/coffrets`. Cet onglet les montre
// en grille ; le clic ouvre la fiche d'album habituelle, celle qui affiche un
// en-tête par disque depuis la v0.9.162.
//
// Ce témoin MONTE le vrai écran, CLIQUE l'onglet par son libellé comme un
// utilisateur, et mesure le DOM rendu. Il ne lit pas le source.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { locale } from '../i18n';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 60_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

const ALBUMS: Album[] = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  title: `Album ${String(i + 1).padStart(2, '0')}`,
  artist_name: `Artiste ${(i % 4) + 1}`,
  year: 1990 + i,
})) as unknown as Album[];

/** Ce que rend `GET /library/coffrets` : un coffret automatique, un manuel. */
const COFFRETS = {
  count: 2,
  items: [
    { id: 11049, title: 'Early Works', artist_name: 'Laurent Garnier', cover_path: null, disc_count: 2, coffret: 'auto' },
    { id: 7001, title: '101', artist_name: 'Depeche Mode', cover_path: null, disc_count: 2, coffret: 'manuel' },
  ],
};

/** `null` : la route répond 404 (serveur antérieur au lot des coffrets). */
let reponseCoffrets: unknown = COFFRETS;
const appels: string[] = [];

function corpsPour(url: string): unknown {
  if (/\/library\/coffrets(\?|$)/.test(url)) return reponseCoffrets;
  if (/\/library\/albums\/\d+(\?|$)/.test(url)) return COFFRETS.items[0];
  if (url.includes('/stats')) return { track_count: 0, album_count: ALBUMS.length };
  return [];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

async function poserEcran(): Promise<HTMLElement> {
  activeView.set('library');
  albumsStore.set([...ALBUMS]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as never });
  for (let i = 0; i < 14; i++) await respirer();
  flushSync();
  return hote;
}

async function cliquerOnglet(el: HTMLElement, libelle: string): Promise<void> {
  const bouton = [...el.querySelectorAll<HTMLButtonElement>('nav.tabs button.tab')]
    .find((b) => (b.textContent ?? '').trim() === libelle);
  if (!bouton) {
    const vus = [...el.querySelectorAll('nav.tabs button.tab')].map((b) => (b.textContent ?? '').trim());
    throw new Error(`onglet « ${libelle} » absent — présents : ${vus.join(' | ')}`);
  }
  bouton.click();
  for (let i = 0; i < 14; i++) await respirer();
  flushSync();
}

beforeEach(() => {
  locale.set('fr');
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  localStorage.clear();
  reponseCoffrets = COFFRETS;
  appels.length = 0;
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    appels.push(url);
    const corps = corpsPour(url);
    if (corps === null) {
      const erreur = { error: 'not found', path: '/api/v1/library/coffrets' };
      return {
        ok: false, status: 404, statusText: 'Not Found',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => erreur,
        text: async () => JSON.stringify(erreur),
      } as unknown as Response;
    }
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  albumsStore.set([]);
  activeView.set('home');
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('Bibliothèque — l’onglet « Coffrets »', () => {
  it('🟢 CONTRE-ÉPREUVE : avant le clic, aucune route des coffrets n’est appelée', async () => {
    const el = await poserEcran();
    expect(appels.some((u) => u.includes('/library/coffrets'))).toBe(false);
    expect(el.querySelectorAll('.body .coffrets').length).toBe(0);
  });

  it('🔴 l’onglet est dans la barre supérieure et liste les coffrets en grille', async () => {
    const el = await poserEcran();
    await cliquerOnglet(el, 'Coffrets');
    expect(appels.some((u) => /\/library\/coffrets(\?|$)/.test(u))).toBe(true);
    const cartes = [...el.querySelectorAll<HTMLElement>('.body .coffrets .grille .carte')];
    expect(cartes.map((c) => c.dataset.coffret)).toEqual(['11049', '7001']);
    expect(cartes[0].textContent).toContain('Early Works');
    expect(cartes[0].textContent).toContain('2 disques');
  });

  it('🔴 le clic ouvre la fiche d’album existante — celle des en-têtes de disque', async () => {
    const el = await poserEcran();
    await cliquerOnglet(el, 'Coffrets');
    expect(el.querySelectorAll('.v2-detail').length, 'une fiche ouverte avant le clic').toBe(0);
    el.querySelector<HTMLButtonElement>('.body .coffrets .carte[data-coffret="11049"]')!.click();
    for (let i = 0; i < 14; i++) await respirer();
    flushSync();
    expect(el.querySelectorAll('.v2-detail').length).toBe(1);
  });

  it('🔴 recherche, filtres et frise ne sont pas offerts : l’onglet a sa propre source', async () => {
    const el = await poserEcran();
    await cliquerOnglet(el, 'Coffrets');
    for (const selecteur of ['.filters button.chip.count', '.filters .v2-rech', '.navmode button', '.frise']) {
      expect(el.querySelectorAll(selecteur).length, `${selecteur} rendu sur l’onglet Coffrets`).toBe(0);
    }
  });

  it('🔴 un serveur sans la route (404) le DIT, au lieu d’annoncer « aucun coffret »', async () => {
    reponseCoffrets = null;
    const el = await poserEcran();
    await cliquerOnglet(el, 'Coffrets');
    const texte = el.querySelector('.body .coffrets')?.textContent ?? '';
    expect(texte).toContain('mettez-le à jour');
    expect(texte).not.toContain('Aucun coffret');
  });

  it('🟢 une bibliothèque sans coffret le dit', async () => {
    reponseCoffrets = { count: 0, items: [] };
    const el = await poserEcran();
    await cliquerOnglet(el, 'Coffrets');
    expect(el.querySelector('.body .coffrets')?.textContent ?? '').toContain('Aucun coffret');
  });
});
