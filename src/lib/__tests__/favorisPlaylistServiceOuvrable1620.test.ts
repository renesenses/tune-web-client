// @vitest-environment jsdom
//
// renesenses/tune-web-client#1620 (FabienM, fil 1956, v0.9.165) — volet BUG.
//
// Favoris › Playlists : une playlist favorite de SERVICE (« Sleepy Mix »,
// Qobuz) s'affichait en ligne INERTE. Le commentaire de `FavoritesV2` le
// justifiait : « Une playlist de SERVICE n'a pas encore d'écran qui
// l'accueille ». Ce n'est plus vrai : l'écran Playlists ouvre une playlist
// Qobuz dans `PlaylistDetailV2` depuis le 13/09/2026.
//
// 🔴 Ce témoin prouve le CHEMIN entier, pas la présence d'un nom de fonction :
//   1. il monte les Favoris, clique la ligne, et capture l'événement parti ;
//   2. il monte l'écran Playlists, lui rejoue CET événement, et regarde la
//      fiche s'ouvrir — avec la requête des pistes du service.
// Si la clé ou la forme de `restore` s'écartait de ce qu'écoute `PlaylistsV2`,
// la seconde moitié resterait sur la liste.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import FavoritesV2 from '../../components/v2/FavoritesV2.svelte';
import PlaylistsV2 from '../../components/v2/PlaylistsV2.svelte';
import { currentProfileId, favoriteStreamingKeys, streamingFavKey } from '../stores/profile';
import { activeView } from '../stores/navigation';

const PL_SERVICE = {
  item_type: 'playlist', service: 'qobuz', service_id: '77',
  title: 'Sleepy Mix', artist: null, album: null,
  cover_url: 'https://x/c.jpg', created_at: '2026-09-25T21:34:00Z',
};

const appels: string[] = [];

function corps(url: string): unknown {
  // 🔴 L'ordre compte : `/favorites/streaming` et `/favorites/facets`
  // contiennent tous deux `/favorites`.
  if (url.includes('/favorites/streaming')) return [PL_SERVICE];
  if (url.includes('/favorites/facets')) return [];
  if (url.includes('/favorites')) return [];
  if (url.includes('/streaming/qobuz/playlists/77/tracks')) {
    return [{ id: 't1', source_id: 't1', title: 'Berceuse', artist: 'X', duration_ms: 1000, source: 'qobuz' }];
  }
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
  favoriteStreamingKeys.set(new Set([streamingFavKey('playlist', 'qobuz', '77')]));
  activeView.set('favorites' as any);
});

afterEach(() => {
  for (const { m, h } of montes.splice(0)) { unmount(m); h.remove(); }
  vi.unstubAllGlobals();
});

async function ligneDeLaPlaylist(h: HTMLElement): Promise<HTMLElement> {
  await respirer();
  flushSync();
  const ong = Array.from(h.querySelectorAll<HTMLButtonElement>('button'))
    .find((b) => /playlist/i.test(b.textContent ?? ''));
  if (ong) { ong.click(); flushSync(); await respirer(60); flushSync(); }
  const ligne = Array.from(h.querySelectorAll<HTMLElement>('.simple'))
    .find((e) => (e.textContent ?? '').includes('Sleepy Mix'));
  expect(ligne, 'la ligne « Sleepy Mix » n’est pas rendue — témoin sans objet').toBeTruthy();
  return ligne!;
}

describe('#1620 — une playlist favorite de service s’ouvre depuis les Favoris', () => {
  it('🔴 la ligne n’est plus inerte : elle se présente comme un bouton', async () => {
    const ligne = await ligneDeLaPlaylist(poser(FavoritesV2));
    expect(ligne.classList.contains('inerte'), 'la ligne est encore inerte').toBe(false);
    expect(ligne.getAttribute('role') ?? ligne.tagName.toLowerCase()).toBe('button');
    // Le cœur reste un bouton À PART, jamais imbriqué dans un autre bouton.
    expect(ligne.querySelector('button.sfav')).toBeTruthy();
    expect(ligne.tagName.toLowerCase()).not.toBe('button');
  });

  it('🔴 un clic mène à l’écran Playlists, qui OUVRE la fiche de la playlist Qobuz', async () => {
    const ligne = await ligneDeLaPlaylist(poser(FavoritesV2));

    let parti: CustomEvent | null = null;
    const capter = (e: Event) => { parti = e as CustomEvent; };
    window.addEventListener('tune:shortcut-restore', capter);
    ligne.click();
    await respirer(20);
    window.removeEventListener('tune:shortcut-restore', capter);

    expect(get(activeView), 'le clic doit mener à l’écran Playlists').toBe('playlists');
    expect(parti, 'aucune demande d’ouverture n’est partie').not.toBeNull();
    const cible = (parti as unknown as CustomEvent).detail.target;
    // La clé que `PlaylistsV2` publie elle-même pour une playlist de service.
    expect(cible.key).toBe('streamingplaylists:qobuz:77');

    // Seconde moitié : l'écran Playlists reçoit CET événement et ouvre la fiche.
    const ecran = poser(PlaylistsV2);
    await respirer();
    flushSync();
    appels.length = 0;
    window.dispatchEvent(new CustomEvent('tune:shortcut-restore', { detail: { target: cible } }));
    flushSync();
    await respirer();
    flushSync();
    expect(
      appels.some((u) => u.includes('/streaming/qobuz/playlists/77/tracks')),
      `la fiche n’a pas demandé les pistes Qobuz ; appels : ${appels.join(', ')}`,
    ).toBe(true);
    expect(ecran.textContent ?? '').toContain('Sleepy Mix');
  });

  it('Entrée sur le CŒUR ne ouvre pas la playlist (il est dans la ligne)', async () => {
    const ligne = await ligneDeLaPlaylist(poser(FavoritesV2));
    const coeur = ligne.querySelector<HTMLButtonElement>('button.sfav')!;
    coeur.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await respirer(20);
    expect(get(activeView)).toBe('favorites');
  });
});
