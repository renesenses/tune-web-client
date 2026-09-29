// @vitest-environment jsdom
//
// web#1790 — LE PRÉCÉDENT DU NAVIGATEUR DANS UNE PLAYLIST ET DANS UNE COLLECTION.
//
// FabienM, fil 2037 (0.9.168), point 9 : « Le BACK navigateur à l'intérieur
// d'une collection ne revient sur l'accueil des collections. Idem pour à
// l'intérieur d'une playlist dans le menu Playlist : on ouvre une playlist et
// la BACK ne revient pas à l'accueil des playlists. »
//
// Cause, lue puis MESURÉE ici avant correctif : l'entrée « Playlists » de la
// barre latérale monte `PlaylistManagerView` (vue `playlistmanager`), et
// l'entrée « Collections » monte `CollectionsV2`. Dans les deux, ouvrir
// l'élément bascule un `$state` local sans rien écrire dans l'historique :
// l'entrée courante reste `#playlistmanager` / `#collections`, et le Précédent
// dépile celle d'AVANT — il quitte l'écran.
//
// ON MONTE LA VRAIE `ShellV2` et l'on clique là où le testeur clique ; le test
// n'appelle jamais `pushState` lui-même.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, pendingLibraryAlbum, vueDeRetour } from '../stores/navigation';
import { detailOuvert } from '../historiqueCoquille';
import { reculer } from './reculer';

vi.setConfig({ testTimeout: 30_000 });

const PLAYLIST = { id: 5, name: 'Dimanche', track_count: 1 };
const PISTE = { id: 77, title: 'So What', artist_name: 'Miles Davis', album_title: 'Kind of Blue', duration_ms: 540000, source: 'local' };
const COLLECTION = { id: 3, name: 'Audiophile', description: null, covers: [], album_count: 1 };
const ALBUM = { id: 11, title: 'Kind of Blue', artist_name: 'Miles Davis', cover_path: null };

function corpsPour(url: string): unknown {
  const u = new URL(url, 'http://localhost');
  const p = u.pathname.replace(/^\/api\/v1/, '');
  if (p === '/playlists') return [PLAYLIST];
  if (p === '/playlists/5/tracks') return [PISTE];
  if (p === '/playlists/5') return PLAYLIST;
  if (p === '/library/smart-collections') return [COLLECTION];
  if (p === '/library/smart-collections/3/albums') return [ALBUM];
  if (p === '/library/collections') return [];
  if (/\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres|featured|new-releases|smart-playlists)(\/|$)/.test(p)) return [];
  return {};
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function stabiliser(tours = 10): Promise<void> {
  for (let i = 0; i < tours; i++) { await respirer(); flushSync(); }
}
async function attendreQue(cond: () => boolean, quoi: string, ms = 4_000): Promise<void> {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error(`jamais atteint : ${quoi}`);
    await respirer();
    flushSync();
  }
}
async function precedent(): Promise<void> {
  await reculer();
  flushSync();
  await stabiliser(20);
}
async function retourPar(bouton: HTMLButtonElement): Promise<void> {
  const attente = new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
  bouton.click();
  await attente;
  flushSync();
  await stabiliser();
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const corps = corpsPour(String(url));
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver);
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof IntersectionObserver);
  try { localStorage.clear(); } catch { /* */ }
  activeView.set('home');
  pendingLibraryAlbum.set(null);
  vueDeRetour.set(null);
  detailOuvert.set(null);
  history.replaceState(null, '', '/');
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function monter(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote, props: {} });
  flushSync();
  return hote;
}

/* ------------------------------------------------------------------ */
/* Chemin b — barre latérale › Playlists › une playlist › Précédent    */
/* ------------------------------------------------------------------ */

const detailPl = (el: HTMLElement) => el.querySelector('.pm-view .detail-header');

/** Accueil → Playlists (barre latérale) → « Dimanche ». */
async function ouvrirLaPlaylist(): Promise<{ el: HTMLDivElement; hauteur: number }> {
  const el = monter();
  activeView.set('playlistmanager');
  flushSync();
  await attendreQue(() => !!el.querySelector('.pm-view .pl-carte button.ouvrir'), 'la carte de la playlist Dimanche');
  await stabiliser();
  const hauteur = history.length;
  el.querySelector<HTMLButtonElement>('.pm-view .pl-carte button.ouvrir')!.click();
  await attendreQue(() => !!detailPl(el), 'le détail de la playlist Dimanche');
  await stabiliser();
  return { el, hauteur };
}

describe('web#1790 (b) — Playlists de la barre latérale : le Précédent revient à la liste', () => {
  it('🔴 ouvrir la playlist empile UNE entrée qui la porte', async () => {
    const { el, hauteur } = await ouvrirLaPlaylist();
    expect(detailPl(el)?.textContent).toContain('Dimanche');
    expect(history.length, 'ouvrir la playlist n’a rien empilé : le Précédent quittera l’écran').toBe(hauteur + 1);
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'playlistmanager', detail: 'playlists:5' });
  });

  it('🔴 le geste de Fabien : Précédent → la liste des playlists, puis l’écran d’avant', async () => {
    const { el } = await ouvrirLaPlaylist();
    await precedent();
    expect(get(activeView), 'le Précédent a quitté l’écran Playlists').toBe('playlistmanager');
    expect(detailPl(el), 'le Précédent n’a pas refermé la playlist').toBeNull();
    expect(el.querySelector('.pm-view .pl-carte'), 'la liste des playlists n’est pas revenue').not.toBeNull();
    await precedent();
    expect(get(activeView)).toBe('home');
  });

  it('le Retour de l’écran referme ET dépile : aucun cran mort derrière', async () => {
    const { el } = await ouvrirLaPlaylist();
    await retourPar(el.querySelector<HTMLButtonElement>('.pm-view .detail-header button.back-btn')!);
    expect(detailPl(el)).toBeNull();
    expect(history.state).toMatchObject({ vue: 'playlistmanager', detail: null });
    await precedent();
    expect(get(activeView), 'un Précédent après le Retour est resté sur place : cran mort').toBe('home');
  });
});

/* ------------------------------------------------------------------ */
/* Chemin a — Collections › une collection › Précédent                 */
/* ------------------------------------------------------------------ */

const titreCollection = (el: HTMLElement) => el.querySelector('.v2-collections .v2-top.detail h1')?.textContent?.trim() ?? null;

/** Accueil → Collections → « Audiophile ». */
async function ouvrirLaCollection(): Promise<{ el: HTMLDivElement; hauteur: number }> {
  const el = monter();
  activeView.set('collections');
  flushSync();
  await attendreQue(() => !!el.querySelector('.v2-collections button.meta'), 'la carte de la collection Audiophile');
  await stabiliser();
  const hauteur = history.length;
  el.querySelector<HTMLButtonElement>('.v2-collections button.meta')!.click();
  await attendreQue(() => titreCollection(el) === 'Audiophile', 'la collection Audiophile ouverte');
  await stabiliser();
  return { el, hauteur };
}

describe('web#1790 (a) — Collections : le Précédent revient à l’accueil des collections', () => {
  it('🔴 ouvrir la collection empile UNE entrée qui la porte', async () => {
    const { hauteur } = await ouvrirLaCollection();
    expect(history.length, 'ouvrir la collection n’a rien empilé : le Précédent quittera l’écran').toBe(hauteur + 1);
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'collections', detail: 'smartcollections:3' });
  });

  it('🔴 le geste de Fabien : Précédent → l’accueil des collections, puis l’écran d’avant', async () => {
    const { el } = await ouvrirLaCollection();
    await precedent();
    expect(get(activeView), 'le Précédent a quitté les Collections').toBe('collections');
    expect(titreCollection(el), 'le Précédent n’a pas refermé la collection').toBeNull();
    expect(el.querySelector('.v2-collections button.meta'), 'la liste des collections n’est pas revenue').not.toBeNull();
    await precedent();
    expect(get(activeView)).toBe('home');
  });

  it('le Retour de la collection referme ET dépile : aucun cran mort derrière', async () => {
    const { el } = await ouvrirLaCollection();
    await retourPar(el.querySelector<HTMLButtonElement>('.v2-collections .v2-top.detail button.back')!);
    expect(titreCollection(el)).toBeNull();
    expect(history.state).toMatchObject({ vue: 'collections', detail: null });
    await precedent();
    expect(get(activeView), 'un Précédent après le Retour est resté sur place : cran mort').toBe('home');
  });

  async function ouvrirLAlbum(el: HTMLDivElement): Promise<void> {
    const vignette = () => [...el.querySelectorAll<HTMLButtonElement>('.v2-collections button.meta')]
      .find((b) => b.textContent?.includes('Kind of Blue'));
    await attendreQue(() => !!vignette(), 'la vignette de l’album');
    vignette()!.click();
    await attendreQue(() => !!el.querySelector('.v2-detail'), 'la fiche de l’album');
    await stabiliser();
    expect(history.state).toMatchObject({ vue: 'collections', detail: 'album:11' });
  }

  it('#980 tient : le Précédent referme l’album ouvert dans la collection, et la collection reste', async () => {
    const { el } = await ouvrirLaCollection();
    await ouvrirLAlbum(el);
    await precedent();
    expect(el.querySelector('.v2-detail'), 'le Précédent ne referme pas l’album').toBeNull();
    expect(titreCollection(el)).toBe('Audiophile');
    expect(history.state).toMatchObject({ vue: 'collections', detail: 'smartcollections:3' });
    await precedent();
    expect(titreCollection(el)).toBeNull();
    expect(get(activeView)).toBe('collections');
  });

  it('#980 tient : le Retour de l’album rend la collection, sans la refermer', async () => {
    const { el } = await ouvrirLaCollection();
    await ouvrirLAlbum(el);
    await retourPar(el.querySelector<HTMLButtonElement>('.v2-detail button.close')!);
    expect(el.querySelector('.v2-detail')).toBeNull();
    expect(titreCollection(el), 'le Retour de l’album a refermé la collection').toBe('Audiophile');
    expect(history.state).toMatchObject({ vue: 'collections', detail: 'smartcollections:3' });
  });
});
