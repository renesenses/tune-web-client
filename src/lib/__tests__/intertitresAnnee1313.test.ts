// @vitest-environment jsdom
//
// #1313 — Jean Valjean, fil 1671, réponse 6538, 19/09/2026 :
//
//   « Quand on fait un tri par année sur la totalité de la bibliothèque, les
//     années n'apparaissent pas lors du défilement. Il n'y a donc pas de
//     séparation. »
//
// 🔴 Ce témoin MONTE `LibraryV2` triée par année (le choix que l'écran
// persiste lui-même, `lib.sort`), en grille puis en liste, au niveau par
// défaut — sans frise —, et lit dans le DOM la suite intertitres / albums.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { locale } from '../i18n';
import { intertitresAnnee } from '../intertitresAnnee';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

const ALBUMS: Album[] = [
  { id: 1, title: 'Blue', artist_name: 'Joni Mitchell', year: 1971 },
  { id: 2, title: 'Hunky Dory', artist_name: 'David Bowie', year: 1971 },
  { id: 3, title: 'Horses', artist_name: 'Patti Smith', year: 1975 },
  { id: 4, title: 'Low', artist_name: 'David Bowie', year: 1977 },
  { id: 5, title: 'Bootleg', artist_name: 'X', year: null },
] as unknown as Album[];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

async function poser(display: 'grid' | 'list', sort = 'year'): Promise<HTMLDivElement> {
  localStorage.setItem('tune_v2_ecran_lib.sort', sort);
  localStorage.setItem('tune_v2_ecran_lib.display', display);
  activeView.set('library');
  albumsStore.set([...ALBUMS]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as never });
  for (let i = 0; i < 12; i++) await respirer();
  flushSync();
  return hote;
}

/** La suite rendue : « # 1971 (2) » pour un intertitre, le titre pour un album. */
function suite(el: HTMLElement): string[] {
  return [...el.querySelectorAll('.yinter, .grid .card .ct, .rows .lrow .ltt')].map((n) =>
    n.classList.contains('yinter')
      ? `# ${n.querySelector('span')?.textContent?.trim()} (${n.querySelector('.yn')?.textContent?.trim()})`
      : (n.textContent ?? '').trim(),
  );
}

beforeEach(() => {
  locale.set('fr');
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}), text: async () => '{}',
  } as unknown as Response)));
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

describe('#1313 — triée par année, la Bibliothèque sépare les années', () => {
  for (const display of ['grid', 'list'] as const) {
    it(`🔴 ${display} : un intertitre devant chaque année, avec son compte`, async () => {
      const el = await poser(display);
      const s = suite(el);
      // Les cinq albums sont rendus (contre-épreuve du montage).
      expect(s.filter((x) => !x.startsWith('#'))).toHaveLength(5);
      const titres = s.filter((x) => x.startsWith('#'));
      expect(titres, 'aucune séparation entre les années').toHaveLength(4);
      // Chaque intertitre précède ses albums, dans l'ordre du tri.
      const i71 = s.indexOf('# 1971 (2)');
      const i75 = s.indexOf('# 1975 (1)');
      expect(i71).toBeGreaterThan(-1);
      expect(i75).toBeGreaterThan(-1);
      expect(s.indexOf('Horses')).toBe(i75 + 1);
      expect(s.slice(i71 + 1, i71 + 3).sort()).toEqual(['Blue', 'Hunky Dory']);
      // L'album sans date est rangé en dernier, sous « Année inconnue ».
      expect(s.at(-2)).toBe('# Année inconnue (1)');
      expect(s.at(-1)).toBe('Bootleg');
    });
  }

  it('trié par titre, aucun intertitre : la séparation n’a de sens que sur l’année', async () => {
    const el = await poser('grid', 'title');
    expect(el.querySelectorAll('.grid .card').length).toBe(5);
    expect(el.querySelectorAll('.yinter').length).toBe(0);
  });
});

describe('intertitresAnnee — la règle, appelée', () => {
  it('un intertitre au début de chaque suite, pas un regroupement', () => {
    const m = intertitresAnnee([1971, 1971, 1975, null, null], (x) => x);
    expect([...m.entries()]).toEqual([
      [0, { annee: 1971, n: 2 }],
      [2, { annee: 1975, n: 1 }],
      [3, { annee: null, n: 2 }],
    ]);
    // Une année qui revient après une autre rouvre une suite : l'ordre du tri prime.
    expect([...intertitresAnnee([1, 2, 1], (x) => x).keys()]).toEqual([0, 1, 2]);
    expect(intertitresAnnee([], (x: number) => x).size).toBe(0);
  });
});
