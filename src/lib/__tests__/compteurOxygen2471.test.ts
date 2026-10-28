// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import OxygenView from '../../components/v2-heritage/OxygenView.svelte';
import { activeView, gestesNavigationService, pendingLibraryAlbum } from '../stores/navigation';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

class Inerte { observe() {} unobserve() {} disconnect() {} }

const PISTES = [
  { id: 7, title: 'Moonlight In Vermont', artist_name: 'Chris Connor', album_title: 'Chris Craft', album_id: 55, source: 'local', duration_ms: 198_000 },
  { id: 8, title: 'Sans album connu', artist_name: 'X', album_title: 'Inconnu', album_id: null, source: 'local', duration_ms: 100_000 },
];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let lectures: string[] = [];
let requetes: string[] = [];
let totalAlbums = 4;
let echecTotal = false;

const respirer = async () => {
  for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
};

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

beforeEach(() => {
  locale.set('fr');
  lectures = [];
  requetes = [];
  totalAlbums = 4;
  echecTotal = false;
  activeView.set('oxygen');
  pendingLibraryAlbum.set(null);
  gestesNavigationService.set({ ouvrirAlbum: () => {}, ouvrirArtiste: () => {} });
  preferences.update((p) => ({ ...p, oxygenView: 'grid' }));
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, init?: any) => {
    const url = String(typeof entree === 'string' ? entree : (entree as any)?.url ?? '');
    requetes.push(url);
    if (/\/library\/albums-detailed\?/.test(url)) {
      if (echecTotal) throw new Error('indisponible');
      const offset = Number(new URL(url, 'http://localhost').searchParams.get('offset'));
      return reponse({ items: [{ album_id: 10 + offset, title: 'Album carte', track_count: 7, duration_ms: 1000 }], total: totalAlbums });
    }
    if (init?.method === 'POST' && /\/play/.test(url)) lectures.push(url);
    if (/\/library\/tracks\?/.test(url)) return reponse({ items: PISTES, total: 40 });
    if (/\/library\/stats/.test(url)) return reponse({ tracks: 2, albums: 1, artists: 2 });
    if (/\/(zones|queue)/.test(url)) return reponse([]);
    return reponse({});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function monterOxygen() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(OxygenView, { target: hote });
  flushSync();
  await respirer();
  expect(hote.querySelector('.count'), 'compteur non rendu').not.toBeNull();
  return hote;
}

describe('web#2471 — unités des compteurs Oxygen', () => {
  for (const mode of ['grid', 'mur'] as const) {
    it(`${mode} compte deux pochettes et quatre albums, sans quarante titres`, async () => {
      preferences.update(p => ({ ...p, oxygenView: mode }));
      const page = await monterOxygen();
      expect(page.querySelector('.count')!.textContent?.replace(/\s/g, '')).toBe('2/4albums');
      expect(page.querySelector('.moretxt')!.textContent).toContain('2 / 4 albums');
      expect(requetes.some(u => /albums-detailed/.test(u) && u.includes('limit=1'))).toBe(true);
    });
  }
  it('les détails gardent un compte de titres et aucun appel de total album', async () => {
    preferences.update(p => ({ ...p, oxygenView: 'detail' }));
    const page = await monterOxygen();
    expect(page.querySelector('.count')!.textContent?.replace(/\s/g, '')).toBe('2/40titres');
    expect(requetes.some(u => /albums-detailed/.test(u))).toBe(false);
  });
  it('sans total album disponible, ne substitue jamais le total des pistes', async () => {
    echecTotal = true;
    const page = await monterOxygen();
    expect(page.querySelector('.count')!.textContent?.replace(/\s/g, '')).toBe('2albums');
    expect(page.querySelector('.moretxt')!.textContent).not.toContain('40');
  });
  it('les cartes utilisent leur total et paginent les albums plutôt que les pistes', async () => {
    preferences.update(p => ({ ...p, oxygenView: 'cards' }));
    const page = await monterOxygen();
    expect(page.querySelector('.count')!.textContent?.replace(/\s/g, '')).toBe('1/4albums');
    const appelsPistes = requetes.filter(u => /library\/tracks/.test(u)).length;
    page.querySelector<HTMLButtonElement>('.morebtn')!.click();
    await respirer();
    expect(page.querySelector('.count')!.textContent?.replace(/\s/g, '')).toBe('2/4albums');
    expect(requetes.some(u => /albums-detailed/.test(u) && u.includes('offset=1'))).toBe(true);
    expect(requetes.filter(u => /library\/tracks/.test(u))).toHaveLength(appelsPistes);
  });
});
