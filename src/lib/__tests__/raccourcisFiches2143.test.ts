// @vitest-environment jsdom
//
// Fil forum 2143, point 2 — FabienM, v1.0.0-rc2 : « Les raccourcis sont
// limités à l'accueil d'un menu. Il est impossible par exemple de définir un
// raccourci sur un sous menu, sur une playlist ouverte, un album ouvert, une
// page artiste... »
//
// Quatre volets, un témoin chacun :
//   1. la PLAYLIST ouverte depuis l'entrée « Playlists » de la barre
//      (`PlaylistManagerView`) se déclare comme cible — c'était le défaut ;
//   2. la FICHE D'ALBUM se déclare (bibliothèque et service), rend la cible de
//      l'écran dessous en se refermant, et le raccourci la rouvre ;
//   3. le SOUS-MENU (`ongletCourant`) est figé puis reposé ; la Bibliothèque
//      le lit au montage ;
//   4. la PAGE D'ARTISTE garde son chemin (#1501), sans régression.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import PlaylistManagerView from '../../components/v2-heritage/PlaylistManagerView.svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import {
  captureCurrentView, currentShortcutTarget, navigateToShortcut, setShortcutTarget, clearShortcutTarget,
  type Shortcut,
} from '../stores/shortcuts';
import { activeView, pendingLibraryAlbum, vueDeRetour } from '../stores/navigation';
import { ficheAlbumService } from '../stores/streaming';
import { ongletCourant } from '../historiqueCoquille';
import { cibleRaccourciAlbum } from '../raccourciAlbum';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

const LOCALE = { id: 42, name: 'Nocturnes', track_count: 3 };
const ALBUM = { id: 55, title: '101 (CD1)', artist_id: 994, artist_name: 'Depeche Mode', year: 1989 };

function corpsPour(url: string): unknown {
  if (url.includes('/playlist-manager/services')) return {};
  if (url.includes('/streaming/services')) return {};
  if (/\/playlists\/\d+\/tracks/.test(url)) return [];
  if (/\/playlists(\?|$)/.test(url)) return [LOCALE];
  if (/\/library\/albums\/55\/tracks/.test(url)) return [];
  if (/\/library\/albums\/55(\?|$)/.test(url)) return ALBUM;
  if (/\/library\/albums/.test(url)) return [ALBUM];
  if (/\/library\/(artists|tracks)/.test(url)) return [];
  if (/\/zones/.test(url)) return [];
  return {};
}

class Inerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function tourner(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

function monter(C: any, props: Record<string, unknown> = {}) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(C, { target: hote, props: props as any });
  flushSync();
  return hote;
}

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const c = corpsPour(String(typeof url === 'string' ? url : url?.url ?? ''));
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => c, text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
  activeView.set('home');
  ongletCourant.set(null);
  clearShortcutTarget();
  pendingLibraryAlbum.set(null);
  ficheAlbumService.set(null);
  vueDeRetour.set(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fil 2143 point 2 — une playlist ouverte depuis « Playlists »', () => {
  it('🔴 la playlist ouverte se déclare comme cible, et la liste l’oublie', async () => {
    activeView.set('playlistmanager');
    const el = monter(PlaylistManagerView, { onAddToPlaylist: () => {} });
    await tourner();
    const ouvrir = el.querySelector<HTMLButtonElement>('.pl-carte button.ouvrir');
    expect(ouvrir, 'aucune carte de playlist — le témoin ne mesure rien').not.toBeNull();
    ouvrir!.click();
    await tourner();
    const cible = get(currentShortcutTarget);
    expect(cible?.key, 'la playlist ouverte ne se déclare pas — fil 2143, point 2').toBe('playlists:42');
    expect(cible?.label).toBe('Nocturnes');
    // La même charge que `PlaylistsV2` : l'un rouvre ce que l'autre a posé.
    expect(cible?.restore?.kind).toBe('local');
    expect(captureCurrentView()).toMatchObject({ view: 'playlistmanager', state: { target: { key: 'playlists:42' } } });
  });

  it('le raccourci rouvre la playlist dans cet écran', async () => {
    activeView.set('playlistmanager');
    const el = monter(PlaylistManagerView, { onAddToPlaylist: () => {} });
    await tourner();
    window.dispatchEvent(new CustomEvent('tune:shortcut-restore', {
      detail: { view: 'playlistmanager', target: { key: 'playlists:42', restore: { id: 42, name: 'Nocturnes' } } },
    }));
    await tourner();
    expect(get(currentShortcutTarget)?.key).toBe('playlists:42');
    expect(el.querySelector('.pl-carte'), 'la liste est restée affichée').toBeNull();
  });

  it('une playlist intelligente ouverte dans l’écran Playlists se rouvre dans SA vue', () => {
    activeView.set('playlistmanager');
    setShortcutTarget({ key: 'smartplaylists:3', restore: { id: 3, name: 'X' } });
    expect(captureCurrentView().view).toBe('smartplaylists');
  });
});

describe('fil 2143 point 2 — la fiche d’album', () => {
  it('la cible : bibliothèque, service ; ni dépôt distant ni Bandcamp', () => {
    expect(cibleRaccourciAlbum({ album: ALBUM })).toMatchObject({ key: 'album:local:55', restore: { id: 55 }, label: '101 (CD1)' });
    const svc = cibleRaccourciAlbum({ album: { title: 'Q', source_id: 'abc', artist_name: 'A' }, service: 'qobuz' });
    expect(svc).toMatchObject({ key: 'album:qobuz:abc', restore: { fiche: { service: 'qobuz', id: 'abc', titre: 'Q', artiste: 'A' } } });
    expect(cibleRaccourciAlbum({ album: ALBUM, depot: { url: 'x' } })).toBeNull();
    expect(cibleRaccourciAlbum({ album: { title: 'B' }, bandcamp: 'https://b.example/album/x' })).toBeNull();
    expect(cibleRaccourciAlbum({ album: { title: 'Q' }, service: 'qobuz' })).toBeNull();
  });

  it('🔴 la fiche se déclare, puis rend la cible de l’écran dessous en se refermant', async () => {
    activeView.set('collections');
    const dessous = { key: 'collections:7', restore: { id: 7 }, label: 'Ma collection' };
    setShortcutTarget(dessous);
    monter(AlbumDetailV2, { album: ALBUM, onClose: () => {} });
    await tourner(4);
    expect(get(currentShortcutTarget)?.key, 'la fiche d’album ne se déclare pas — fil 2143, point 2').toBe('album:local:55');
    // Le raccourci vise l'ALBUM, pas l'écran d'où il a été posé.
    expect(captureCurrentView()).toEqual({
      view: 'library',
      state: { target: { key: 'album:local:55', restore: { id: 55, titre: '101 (CD1)' } } },
    });
    unmount(monte!);
    monte = null;
    expect(get(currentShortcutTarget)).toEqual(dessous);
  });

  it('le raccourci rouvre un album de la bibliothèque par « Aller à l’album »', () => {
    const sc: Shortcut = {
      id: 'a', name: '101', icon: '⭐', view: 'library',
      state: { target: { key: 'album:local:55', restore: { id: 55, titre: '101' } } },
    };
    navigateToShortcut(sc);
    expect(get(pendingLibraryAlbum)).toBe(55);
    expect(get(activeView)).toBe('library');
  });

  it('le raccourci rouvre un album de service sur sa fiche, Retour vers l’écran de départ', () => {
    activeView.set('favorites');
    const fiche = { service: 'qobuz', id: 'abc', titre: 'Q', pochette: null, artiste: 'A', artisteId: null };
    navigateToShortcut({
      id: 'b', name: 'Q', icon: '⭐', view: 'streamingalbum',
      state: { target: { key: 'album:qobuz:abc', restore: { fiche } } },
    });
    expect(get(ficheAlbumService)).toEqual(fiche);
    expect(get(activeView)).toBe('streamingalbum');
    expect(get(vueDeRetour)).toBe('favorites');
  });
});

describe('fil 2143 point 2 — le sous-menu', () => {
  it('🔴 l’onglet courant est figé, puis reposé après le changement de vue', () => {
    vi.useFakeTimers();
    activeView.set('favorites');
    ongletCourant.set('playlists');
    const capte = captureCurrentView();
    expect(capte.state?.onglet, 'le sous-menu n’est pas retenu — fil 2143, point 2').toBe('playlists');

    activeView.set('home');
    navigateToShortcut({ id: 'c', name: 'F', icon: '⭐', view: 'favorites', state: capte.state! });
    expect(get(activeView)).toBe('favorites');
    expect(get(ongletCourant)).toBe('playlists');
    // Un écran déjà monté qui repasse sur son défaut le récupère au délai.
    ongletCourant.set('albums');
    vi.advanceTimersByTime(200);
    expect(get(ongletCourant)).toBe('playlists');
  });

  it('🔴 la Bibliothèque publie son onglet et ouvre celui que la coquille lui donne', async () => {
    activeView.set('library');
    ongletCourant.set('tracks');
    const el = monter(LibraryV2);
    await tourner(4);
    expect(
      el.querySelector('button.tab.active')?.getAttribute('data-onglet'),
      'la Bibliothèque ignore l’onglet du raccourci — fil 2143, point 2',
    ).toBe('tracks');
    el.querySelector<HTMLButtonElement>('button.tab[data-onglet="albums"]')!.click();
    flushSync();
    expect(get(ongletCourant)).toBe('albums');
  });
});

describe('fil 2143 point 2 — la page d’artiste (#1501) reste visée', () => {
  it('une cible d’artiste garde sa vue', () => {
    activeView.set('streamingartist');
    setShortcutTarget({ key: 'artiste:local:9', restore: { id: 9, name: 'X', source: 'local' } });
    expect(captureCurrentView()).toMatchObject({ view: 'streamingartist', state: { target: { key: 'artiste:local:9' } } });
  });
});
