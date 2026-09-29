// @vitest-environment jsdom
//
// renesenses/tune-web-client#1650, second point — Bertrand, 29/09/2026 :
// dans Favoris › Playlists, la GRILLE devient l'affichage par défaut.
//
// Seul le DÉFAUT change : un choix retenu (`tune_v2_ecran_fav.playlists.display`,
// clé inchangée depuis #1719) continue de primer, et le défaut n'est plus
// ÉCRIT au montage — sans quoi il se figerait comme un faux choix et aucun
// changement de défaut n'atteindrait plus personne.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import FavoritesV2 from '../../components/v2/FavoritesV2.svelte';
import { currentProfileId, favoriteAlbumIds, favoritePlaylistIds } from '../stores/profile';
import { activeView } from '../stores/navigation';

const ALBUM = {
  id: 11, title: 'Kind of Blue', artist_name: 'Miles Davis',
  cover_path: '/c/11.jpg', created_at: '2026-09-20T10:00:00Z',
};
const PLAYLIST = { id: 7, name: 'Route 66', track_count: 3 };

const appels: string[] = [];

function corps(url: string): unknown {
  if (url.includes('/favorites/streaming')) return [];
  if (url.includes('/favorites/facets')) return [];
  // `/profiles/{id}/favorites` rend des LIGNES, et chaque objet est relu un à
  // un (`getAlbum`, `getPlaylist`) — c'est la forme réelle de la route.
  if (url.includes('/favorites')) {
    return [
      { item_type: 'album', item_id: 11, created_at: '2026-09-20T10:00:00Z' },
      { item_type: 'playlist', item_id: 7, created_at: '2026-09-21T10:00:00Z' },
    ];
  }
  // La mosaïque d'une playlist locale se compose des pochettes de ses PISTES :
  // le serveur ne rend aucune pochette avec `/playlists`.
  if (/\/playlists\/7\/tracks/.test(url)) {
    return [
      { id: 1, title: 'Get Your Kicks', cover_path: '/c/a.jpg' },
      { id: 2, title: 'Nat King Cole', cover_path: '/c/b.jpg' },
    ];
  }
  if (/\/albums\/11(\?|$)/.test(url)) return ALBUM;
  if (/\/playlists\/7(\?|$)/.test(url)) return PLAYLIST;
  if (url.includes('/playlists/all')) return [];
  if (url.includes('/smart-playlists')) return [];
  if (url.includes('/playlists')) return [PLAYLIST];
  if (url.includes('/streaming/services')) return {};
  return [];
}

const montes: { m: Record<string, any>; h: HTMLDivElement }[] = [];
const poser = (C: any) => {
  const h = document.createElement('div');
  document.body.appendChild(h);
  const m = mount(C, { target: h, props: {} as any });
  montes.push({ m, h });
  flushSync();
  return h;
};
const respirer = (ms = 160) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  appels.length = 0;
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (entree: RequestInfo | URL) => {
    const url = String(entree);
    appels.push(url);
    const b = corps(url);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => b, text: async () => JSON.stringify(b),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close(){} addEventListener(){} removeEventListener(){} send(){} } as any);
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  vi.stubGlobal('IntersectionObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  currentProfileId.set(1);
  favoriteAlbumIds.set(new Set([11]));
  favoritePlaylistIds.set(new Set([7]));
  activeView.set('favorites' as any);
});

afterEach(() => {
  for (const { m, h } of montes.splice(0)) { unmount(m); h.remove(); }
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** La bascule, telle qu'un utilisateur la trouve : le bouton de la barre. */
function bascule(h: HTMLElement): HTMLButtonElement | null {
  return h.querySelector<HTMLButtonElement>('button.viewtog[data-vue]');
}

async function ongletFavoris(h: HTMLElement, motif: RegExp): Promise<void> {
  await respirer();
  flushSync();
  const b = Array.from(h.querySelectorAll<HTMLButtonElement>('.tabs button'))
    .find((x) => motif.test(x.textContent ?? ''));
  expect(b, `l’onglet ${motif} est introuvable — témoin sans objet`).toBeTruthy();
  b!.click();
  flushSync();
  await respirer(80);
  flushSync();
}

const CLE = 'tune_v2_ecran_fav.playlists.display';

describe('#1650 — Favoris › Playlists : la grille par défaut, le choix retenu prime', () => {
  it('🔴 sans choix retenu, les playlists favorites arrivent en GRILLE', async () => {
    const h = poser(FavoritesV2);
    await ongletFavoris(h, /playlist/i);
    await respirer(120);
    flushSync();

    const noms = Array.from(h.querySelectorAll('.grid .card .ct')).map((e) => e.textContent?.trim());
    expect(noms, 'les playlists favorites ne sont pas en grille par défaut').toEqual(['Route 66']);
    expect(h.querySelector('.simples'), 'la liste est encore le défaut').toBeNull();
    expect(bascule(h)!.getAttribute('data-vue')).toBe('grid');
  });

  it('🔴 le défaut n’est PAS écrit au montage : seul un clic enregistre un choix', async () => {
    const h = poser(FavoritesV2);
    await ongletFavoris(h, /playlist/i);
    expect(localStorage.getItem(CLE), 'le défaut est retenu comme un choix').toBeNull();
    expect(localStorage.getItem('tune_v2_ecran_fav.albums.display')).toBeNull();

    bascule(h)!.click();
    flushSync();
    expect(localStorage.getItem(CLE), 'le clic n’est pas retenu').toBe('list');
  });

  it('🔴 un choix « liste » déjà retenu prime sur le nouveau défaut', async () => {
    localStorage.setItem(CLE, 'list');
    const h = poser(FavoritesV2);
    await ongletFavoris(h, /playlist/i);

    expect(h.querySelector('.simples'), 'le choix « liste » retenu est écrasé par le défaut').toBeTruthy();
    expect(bascule(h)!.getAttribute('data-vue')).toBe('list');
    expect(localStorage.getItem(CLE)).toBe('list');
  });
});
