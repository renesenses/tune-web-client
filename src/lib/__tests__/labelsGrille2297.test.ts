// @vitest-environment jsdom
//
// web#2297 — Bertrand, 22/10 : « Vue Library / Labels : vue grille à minima
// avec icône des labels à récupérer chez Qobuz ! »
//
// Ce témoin MONTE la Bibliothèque, ouvre l'onglet Labels, et regarde ce qui
// est à l'écran : la bascule liste / grille, le logo que le serveur annonce
// (`GET /library/labels`, tune-server-rust#6736), le monogramme d'un label
// sans logo, le nombre d'albums, et le choix retenu d'un montage à l'autre.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { locale } from '../i18n';
import type { Album } from '../types';
import { preferences } from '../stores/preferences';
import { carteDesLogos, cleDeLabel, logoDuLabel, monogramme } from '../logosLabels';
import { getLibraryLabels } from '../api';

vi.setConfig({ testTimeout: 60_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

const LABELS = ['Blue Note', 'Factory', 'Rough Trade'];
const ALBUMS: Album[] = Array.from({ length: 24 }, (_, i) => ({
  id: i + 1,
  title: `Album ${String(i + 1).padStart(2, '0')}`,
  artist_name: `Artiste ${(i % 5) + 1}`,
  year: 1978 + (i % 6),
  label: LABELS[i % 3],
})) as unknown as Album[];
const CONDENSAT = 'ab'.repeat(32);

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let routeLabels: () => { status: number; corps: unknown };
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserVivre(n = 14): Promise<void> {
  for (let i = 0; i < n; i++) await respirer();
  flushSync();
}

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

async function ongletLabels(): Promise<HTMLElement> {
  activeView.set('library');
  albumsStore.set([...ALBUMS]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as never });
  await laisserVivre();
  const onglet = hote.querySelector<HTMLButtonElement>('.tab[data-onglet="labels"]');
  expect(onglet, 'onglet Labels absent').not.toBeNull();
  onglet!.click();
  await laisserVivre();
  return hote;
}

function demonter() {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
}

beforeEach(() => {
  locale.set('fr');
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  routeLabels = () => ({ status: 200, corps: [
    { name: 'Blue Note', album_count: 8, image_url: `/api/v1/library/artwork/${CONDENSAT}`, qobuz_label_id: '7' },
    { name: 'Factory', album_count: 8 },
  ] });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).endsWith('/library/labels')) {
      const r = routeLabels();
      return reponse(r.status, r.corps);
    }
    return reponse(200, []);
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
});

afterEach(() => {
  demonter();
  albumsStore.set([]);
  activeView.set('home');
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('web#2297 — la grille de l’onglet Labels', () => {
  it('s’ouvre en LISTE, et la bascule montre la grille : logo, monogramme, nom, nombre d’albums', async () => {
    const el = await ongletLabels();
    expect(el.querySelectorAll('.fliste .fl').length, 'la liste reste le défaut').toBe(3);
    expect(el.querySelector('.lgcase')).toBeNull();

    const bascule = el.querySelector<HTMLButtonElement>('.viewtog');
    expect(bascule?.dataset.vue).toBe('list');
    bascule!.click();
    await laisserVivre();

    const cases = [...el.querySelectorAll<HTMLElement>('.fliste .lgcase')];
    expect(cases.map((c) => c.dataset.label)).toEqual(LABELS);
    const [blue, factory, rough] = cases;
    const img = blue.querySelector('img');
    expect(img, 'le logo annoncé par le serveur est affiché').not.toBeNull();
    expect(img!.getAttribute('src')).toContain(`/library/artwork/${CONDENSAT}?size=200`);
    expect(factory.querySelector('img'), 'sans logo : jamais une image').toBeNull();
    expect(factory.querySelector('.lgmono')?.textContent).toBe('F');
    expect(rough.querySelector('.lgmono')?.textContent).toBe('RT');
    expect(blue.querySelector('.lgnom')?.textContent).toBe('Blue Note');
    expect(blue.querySelector('.lgn')?.textContent).toBe('8 albums');
    expect(blue.querySelector('.lgouvrir')!.getAttribute('aria-label')).toBe('Blue Note, 8 albums');
    // Le cœur de facette et le menu « … » restent atteignables en grille.
    expect(blue.querySelector('.fcoeur'), 'cœur de facette perdu en grille').not.toBeNull();
  });

  it('le choix GRILLE est retenu d’un montage à l’autre', async () => {
    let el = await ongletLabels();
    el.querySelector<HTMLButtonElement>('.viewtog')!.click();
    await laisserVivre();
    expect(localStorage.getItem('tune_v2_ecran_lib.labelsVue')).toBe('grid');
    demonter();

    el = await ongletLabels();
    expect(el.querySelectorAll('.fliste .lgcase').length).toBe(3);
    // Et il ne touche pas l'affichage des albums.
    expect(localStorage.getItem('tune_v2_ecran_lib.display')).not.toBe('list');
  });

  it('une case ouvre le label, avec ses albums', async () => {
    const el = await ongletLabels();
    el.querySelector<HTMLButtonElement>('.viewtog')!.click();
    await laisserVivre();
    el.querySelector<HTMLButtonElement>('.lgcase[data-label="Factory"] .lgouvrir')!.click();
    await laisserVivre();
    const s = el.querySelector<HTMLElement>('.facets section.facet[data-facette]');
    expect(s?.dataset.facette).toBe('Factory');
    expect(s!.querySelectorAll('.card, .lrow').length).toBe(8);
  });

  it('un serveur sans la route (404) : la grille tient en monogrammes', async () => {
    routeLabels = () => ({ status: 404, corps: { detail: 'Not Found' } });
    const el = await ongletLabels();
    el.querySelector<HTMLButtonElement>('.viewtog')!.click();
    await laisserVivre();
    expect(el.querySelectorAll('.fliste .lgcase').length).toBe(3);
    expect(el.querySelectorAll('.fliste .lgcase img').length).toBe(0);
    expect(el.querySelectorAll('.fliste .lgmono').length).toBe(3);
  });
});

describe('web#2297 — logos et monogrammes', () => {
  it('le monogramme prend les initiales des deux premiers mots', () => {
    expect(monogramme('Deutsche Grammophon')).toBe('DG');
    expect(monogramme('Verve')).toBe('V');
    expect(monogramme('ECM Records')).toBe('ER');
    expect(monogramme('  4AD ')).toBe('4');
    expect(monogramme('Rough-Trade')).toBe('RT');
    expect(monogramme('élan vital')).toBe('ÉV');
    expect(monogramme('!!!')).toBe('?');
  });

  it('la carte des logos se lit par la clé du serveur, et ignore ce qui n’a pas d’image', () => {
    const carte = carteDesLogos([
      { name: 'Blue  Note', album_count: 1, image_url: '/api/v1/library/artwork/x' },
      { name: 'Factory', album_count: 1 },
    ]);
    expect(cleDeLabel(' Blue   NOTE ')).toBe('blue note');
    expect(logoDuLabel(carte, 'blue note')).toBe('/api/v1/library/artwork/x');
    expect(logoDuLabel(carte, 'Factory')).toBeNull();
    expect(carteDesLogos(null).size).toBe(0);
  });

  it('getLibraryLabels rend une liste vide sur un refus', async () => {
    routeLabels = () => ({ status: 500, corps: { detail: 'panne' } });
    expect(await getLibraryLabels()).toEqual([]);
  });
});
