// @vitest-environment jsdom
//
// web#2700 — Gestionnaire de playlists : les pastilles de filtre par source
// sont juste sous le titre et les onglets, AVANT toute liste. Avec la pastille
// « Tune Circle », la section de cercle était rendue AVANT les pastilles et les
// repoussait sous la dernière playlist partagée.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PlaylistManagerView from '../../components/v2-heritage/PlaylistManagerView.svelte';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

const CERCLE = [
  { id: 'c-1', name: 'Alpha', owner: { user_id: 7, name: 'Auteur' }, count: 3, version: 1, mine: false, circle_id: null, circle_name: 'Groupe' },
  { id: 'c-2', name: 'Beta', owner: { user_id: 7, name: 'Auteur' }, count: 5, version: 1, mine: false, circle_id: null, circle_name: 'Groupe' },
];
const LOCALES = [{ id: 1, name: 'Locale un', track_count: 2 }];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) { for (let i = 0; i < n; i++) { await respirer(); flushSync(); } }

beforeEach(() => {
  try { localStorage.clear(); localStorage.setItem('tune-profile-id', '5'); } catch { /* sans stockage */ }
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url).split('?')[0];
    let corps: unknown = {};
    if (/\/ext\/circle\/playlists$/.test(u)) corps = CERCLE;
    else if (/\/playlists$/.test(u)) corps = LOCALES;
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  vi.unstubAllGlobals();
});

async function monter(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistManagerView, { target: hote, props: { onAddToPlaylist: () => {} } });
  flushSync();
  await souffler(15);
  return hote;
}
const avant = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const puceCercle = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('.filter-chip-circle');

describe('web#2700 — pastilles de source du Gestionnaire de playlists', () => {
  it('les pastilles suivent le titre et les onglets, et précèdent la section Tune Circle et la grille', async () => {
    const el = await monter();
    const chips = el.querySelector('.filter-chips')!;
    expect(chips, 'pas de rangée de pastilles').toBeTruthy();
    expect(puceCercle(el), 'pas de pastille Tune Circle').toBeTruthy();
    expect(avant(el.querySelector('.pm-header')!, chips)).toBe(true);
    puceCercle(el)!.click();
    await souffler();
    const section = el.querySelector('section.pl-cercle');
    expect(section, 'la section Tune Circle ne s’affiche pas').toBeTruthy();
    expect(avant(chips, section!), 'les pastilles doivent précéder la liste de cercle').toBe(true);
    const grille = el.querySelector('.pl-grille');
    if (grille) expect(avant(chips, grille)).toBe(true);
  });

  it('le filtre opère toujours : la pastille active change et la section n’apparaît que sur Tune Circle', async () => {
    const el = await monter();
    expect(el.querySelector('section.pl-cercle')).toBeNull();
    puceCercle(el)!.click();
    await souffler();
    expect(puceCercle(el)!.classList.contains('active')).toBe(true);
    expect(el.querySelectorAll('li.playlist-cercle')).toHaveLength(2);
    const toutes = el.querySelector<HTMLButtonElement>('.filter-chips .filter-chip')!;
    toutes.click();
    await souffler();
    expect(toutes.classList.contains('active')).toBe(true);
    expect(el.querySelector('section.pl-cercle')).toBeNull();
  });
});
