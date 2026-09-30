// @vitest-environment jsdom
//
// web#1790 (chemins d et e) — LE PRÉCÉDENT DEPUIS LES FAVORIS RAMÈNE AU BON ONGLET.
//
// FabienM, fil 2037 (0.9.168), point 9 : « dans le menu Favoris, on ouvre une
// playlist favorite, on ne revient pas sur l'onglet playlists favoris. Pour
// les artistes favoris, on ouvre et le BACK ne renvoit pas à l'onglet
// Artistes favoris ».
//
// MESURÉ ici, avant correctif, sur `origin/main` 95f2e8ec :
//   • l'entrée `#favorites` ne portait pas l'onglet : `FavoritesV2`, remonté
//     par le Précédent, repartait sur « Albums » ;
//   • ouvrir une playlist favorite écrivait DEUX entrées (`#playlists`, la
//     liste jamais vue, puis `#playlists/<clé>`) : le premier Précédent
//     tombait sur la liste des playlists.
//
// ON MONTE LA VRAIE `ShellV2` et l'on clique là où le testeur clique.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, pendingLibraryAlbum, vueDeRetour } from '../stores/navigation';
import { detailOuvert, ongletCourant } from '../historiqueCoquille';
import { currentProfileId, favoriteStreamingKeys, streamingFavKey } from '../stores/profile';
import { t } from '../i18n';
import { reculer } from './reculer';

vi.setConfig({ testTimeout: 30_000 });

const FAVORIS_SERVICE = [
  { item_type: 'playlist', service: 'qobuz', service_id: '77', title: 'Sleepy Mix', artist: null, album: null, cover_url: null, created_at: '2026-09-25T21:34:00Z' },
  { item_type: 'artist', service: 'qobuz', service_id: '88', title: 'Anette Askvik', artist: null, album: null, cover_url: null, created_at: '2026-09-25T21:35:00Z' },
];

function corpsPour(url: string): unknown {
  const u = new URL(url, 'http://localhost');
  const p = u.pathname.replace(/^\/api\/v1/, '');
  if (p === '/profiles' || p === '/profiles/') return [{ id: 1, name: 'Default', avatar_color: '#6366f1' }];
  if (p.includes('/favorites/streaming')) return FAVORIS_SERVICE;
  if (p.includes('/favorites/facets')) return [];
  if (p.includes('/streaming/qobuz/playlists/77/tracks')) {
    return [{ id: 't1', source_id: 't1', title: 'Berceuse', artist: 'X', duration_ms: 1000, source: 'qobuz' }];
  }
  if (p.includes('/streaming/qobuz/artists/88')) return p.endsWith('/88') ? { name: 'Anette Askvik', source: 'qobuz', source_id: '88' } : [];
  if (p.includes('/streaming/services')) return {};
  if (p.startsWith('/radio-favorites')) return [];
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
  // La LIGNE de liste des playlists favorites (web#1650 : grille par défaut).
  localStorage.setItem('tune_v2_ecran_fav.playlists.display', 'list');
  currentProfileId.set(1);
  favoriteStreamingKeys.set(new Set([
    streamingFavKey('playlist', 'qobuz', '77'),
    streamingFavKey('artist', 'qobuz', '88'),
  ]));
  activeView.set('home');
  pendingLibraryAlbum.set(null);
  vueDeRetour.set(null);
  detailOuvert.set(null);
  ongletCourant.set(null);
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

const libelle = (cle: string) => get(t)(cle as any);
const ongletActif = (el: HTMLElement) => el.querySelector('.v2-fav nav.tabs button.on')?.textContent ?? null;

/** Accueil → Favoris → l'onglet demandé. */
async function favorisSurLOnglet(cle: string): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote, props: {} });
  flushSync();
  const el = hote;
  activeView.set('favorites');
  flushSync();
  await attendreQue(() => !!el.querySelector('.v2-fav nav.tabs button'), 'les onglets des Favoris');
  [...el.querySelectorAll<HTMLButtonElement>('.v2-fav nav.tabs button')]
    .find((b) => b.textContent?.includes(libelle(cle)))!.click();
  flushSync();
  await stabiliser();
  expect(ongletActif(el)).toContain(libelle(cle));
  return el;
}

describe('web#1790 (d) — Favoris › Playlists › une playlist › Précédent', () => {
  async function ouvrirLaPlaylist(): Promise<{ el: HTMLDivElement; hauteur: number }> {
    const el = await favorisSurLOnglet('favorites.playlists');
    const ligne = () => [...el.querySelectorAll<HTMLElement>('.v2-fav .simple')].find((e) => e.textContent?.includes('Sleepy Mix'));
    await attendreQue(() => !!ligne(), 'la ligne Sleepy Mix');
    const hauteur = history.length;
    ligne()!.click();
    await attendreQue(() => !!el.querySelector('.v2-pldetail'), 'le détail de la playlist Sleepy Mix');
    await stabiliser();
    return { el, hauteur };
  }

  it('🔴 ouvrir la playlist favorite n’écrit qu’UNE entrée', async () => {
    const { hauteur } = await ouvrirLaPlaylist();
    expect(get(activeView)).toBe('playlists');
    expect(history.length, 'un clic, deux entrées : le Précédent tomberait sur la liste des playlists').toBe(hauteur + 1);
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'playlists', detail: 'streamingplaylists:qobuz:77' });
  });

  it('🔴 le geste de Fabien : le Précédent ramène aux Favoris, sur l’onglet Playlists', async () => {
    const { el } = await ouvrirLaPlaylist();
    await precedent();
    expect(get(activeView), 'le premier Précédent n’est pas revenu aux Favoris').toBe('favorites');
    await attendreQue(() => !!el.querySelector('.v2-fav nav.tabs button.on'), 'les Favoris remontés');
    expect(ongletActif(el), 'le Précédent a rouvert les Favoris sur un autre onglet').toContain(libelle('favorites.playlists'));
  });
});

describe('web#1790 (e) — Favoris › Artistes › un artiste › Précédent', () => {
  it('🔴 le geste de Fabien : le Précédent ramène aux Favoris, sur l’onglet Artistes', async () => {
    const el = await favorisSurLOnglet('favorites.artists');
    const nom = () => [...el.querySelectorAll<HTMLButtonElement>('.v2-fav .art button.an')].find((b) => b.textContent?.includes('Anette Askvik'));
    await attendreQue(() => !!nom(), 'l’artiste Anette Askvik');
    nom()!.click();
    await attendreQue(() => get(activeView) === 'streamingartist', 'la page de l’artiste');
    await stabiliser();
    await precedent();
    expect(get(activeView)).toBe('favorites');
    await attendreQue(() => !!el.querySelector('.v2-fav nav.tabs button.on'), 'les Favoris remontés');
    expect(ongletActif(el), 'le Précédent a rouvert les Favoris sur un autre onglet').toContain(libelle('favorites.artists'));
  });
});

describe('web#1790 — l’onglet ne coûte aucun cran', () => {
  it('changer d’onglet réécrit l’entrée sans empiler ; un Précédent quitte les Favoris', async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ShellV2, { target: hote, props: {} });
    flushSync();
    activeView.set('favorites');
    flushSync();
    const el = hote;
    await attendreQue(() => !!el.querySelector('.v2-fav nav.tabs button'), 'les onglets des Favoris');
    const hauteur = history.length;
    [...el.querySelectorAll<HTMLButtonElement>('.v2-fav nav.tabs button')]
      .find((b) => b.textContent?.includes(libelle('favorites.artists')))!.click();
    flushSync();
    await stabiliser();
    expect(history.length, 'un onglet a empilé une entrée').toBe(hauteur);
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'favorites', detail: null, onglet: 'artists' });
    await precedent();
    expect(get(activeView)).toBe('home');
    expect(history.state?.onglet, 'l’onglet des Favoris a débordé sur l’entrée d’avant').toBeUndefined();
  });

  it('revenir aux Favoris par la barre (sans Précédent) les ouvre sur leur onglet par défaut', async () => {
    const el = await favorisSurLOnglet('favorites.artists');
    activeView.set('home');
    flushSync();
    await stabiliser();
    activeView.set('favorites');
    flushSync();
    await attendreQue(() => !!el.querySelector('.v2-fav nav.tabs button.on'), 'les Favoris');
    expect(ongletActif(el)).toContain(libelle('favorites.albums'));
  });
});
