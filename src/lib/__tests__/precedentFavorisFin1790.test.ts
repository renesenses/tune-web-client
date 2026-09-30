// @vitest-environment jsdom
//
// web#1790 — FIN DU POINT 9 DE FABIEN (fil 2037) : ce que #1807 et #1812
// laissaient ouvert.
//
// MESURÉ ici, avant correctif, sur `origin/main` 3920a962 :
//   • une playlist INTELLIGENTE ou une COLLECTION ouverte depuis les Favoris
//     écrivait DEUX entrées (`#smartplaylists` / `#collections`, la liste
//     jamais vue, puis le détail — ou rien du tout pour la playlist
//     intelligente, dont l'écran n'empilait pas son détail) ;
//   • le bouton Retour de la page artiste rouvrait les Favoris sur « Albums » :
//     il change de vue vers `vueDeRetour`, une entrée neuve sans onglet.
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

const SMART_PL = { id: 5, name: 'Nuit calme', description: null, rules: [], match_mode: 'all', sort_by: 'title', sort_order: 'asc', max_tracks: 50, track_count: 0 };
const SMART_COL = { id: 3, name: 'Audiophile', description: null, covers: [], album_count: 0 };
const ARTISTE_SERVICE = { item_type: 'artist', service: 'qobuz', service_id: '88', title: 'Anette Askvik', artist: null, album: null, cover_url: null, created_at: '2026-09-25T21:35:00Z' };

function corpsPour(url: string): unknown {
  const u = new URL(url, 'http://localhost');
  const p = u.pathname.replace(/^\/api\/v1/, '');
  if (p === '/profiles' || p === '/profiles/') return [{ id: 1, name: 'Default', avatar_color: '#6366f1' }];
  if (p.includes('/favorites/streaming')) return [ARTISTE_SERVICE];
  if (p.includes('/favorites/facets')) return [];
  if (/^\/profiles\/1\/favorites\/?$/.test(p)) {
    return [
      { item_type: 'smart_playlist', item_id: 5 },
      { item_type: 'smart_collection', item_id: 3 },
    ];
  }
  if (p === '/library/smart-playlists') return [SMART_PL];
  if (p === '/library/smart-playlists/5') return SMART_PL;
  if (p === '/library/smart-playlists/5/tracks') return [];
  if (p === '/library/smart-collections') return [SMART_COL];
  if (p === '/library/smart-collections/3/albums') return [];
  if (p === '/library/collections') return [];
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
  localStorage.setItem('tune_v2_ecran_fav.playlists.display', 'list');
  currentProfileId.set(1);
  favoriteStreamingKeys.set(new Set([streamingFavKey('artist', 'qobuz', '88')]));
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

function monter(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote, props: {} });
  flushSync();
  return hote;
}

/** Accueil → Favoris → l'onglet demandé. */
async function favorisSurLOnglet(cle: string): Promise<HTMLDivElement> {
  const el = monter();
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

async function ouvrirLaLigne(el: HTMLDivElement, nom: string): Promise<number> {
  const ligne = () => [...el.querySelectorAll<HTMLElement>('.v2-fav .simple')].find((e) => e.textContent?.includes(nom));
  await attendreQue(() => !!ligne(), `la ligne ${nom}`);
  const hauteur = history.length;
  ligne()!.click();
  return hauteur;
}

async function revenirAuxFavorisSur(el: HTMLDivElement, cle: string): Promise<void> {
  expect(get(activeView), 'le premier Précédent n’est pas revenu aux Favoris').toBe('favorites');
  await attendreQue(() => !!el.querySelector('.v2-fav nav.tabs button.on'), 'les Favoris remontés');
  expect(ongletActif(el), 'les Favoris sont revenus sur un autre onglet').toContain(libelle(cle));
}

describe('web#1790 — une playlist intelligente ouverte depuis les Favoris', () => {
  it('🔴 n’écrit qu’UNE entrée, et le Précédent ramène aux Favoris › Playlists', async () => {
    const el = await favorisSurLOnglet('favorites.playlists');
    const hauteur = await ouvrirLaLigne(el, 'Nuit calme');
    await attendreQue(() => !!el.querySelector('.sp-view .sp-header'), 'le détail de la playlist intelligente');
    await stabiliser();
    expect(get(activeView)).toBe('smartplaylists');
    expect(history.length, 'un clic, deux entrées').toBe(hauteur + 1);
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'smartplaylists', detail: 'smartplaylists:5' });
    await precedent();
    await revenirAuxFavorisSur(el, 'favorites.playlists');
  });
});

describe('web#1790 — une collection ouverte depuis les Favoris', () => {
  it('🔴 n’écrit qu’UNE entrée, et le Précédent ramène aux Favoris › Collections', async () => {
    const el = await favorisSurLOnglet('v2.nav.collections');
    const hauteur = await ouvrirLaLigne(el, 'Audiophile');
    await attendreQue(() => el.querySelector('.v2-collections .v2-top.detail h1')?.textContent?.trim() === 'Audiophile', 'la collection ouverte');
    await stabiliser();
    expect(get(activeView)).toBe('collections');
    expect(history.length, 'un clic, deux entrées').toBe(hauteur + 1);
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'collections', detail: 'smartcollections:3' });
    await precedent();
    await revenirAuxFavorisSur(el, 'v2.nav.collections');
  });
});

describe('web#1790 — l’écran des playlists intelligentes empile son détail', () => {
  it('🔴 Précédent → la liste des playlists intelligentes ; le Retour dépile sans cran mort', async () => {
    const el = monter();
    activeView.set('smartplaylists');
    flushSync();
    const carte = () => el.querySelector<HTMLButtonElement>('.sp-view button.meta');
    await attendreQue(() => !!carte(), 'la carte Nuit calme');
    await stabiliser();
    carte()!.click();
    await attendreQue(() => !!el.querySelector('.sp-view .sp-header'), 'le détail');
    await stabiliser();
    expect(history.state).toMatchObject({ vue: 'smartplaylists', detail: 'smartplaylists:5' });
    await precedent();
    expect(get(activeView)).toBe('smartplaylists');
    expect(el.querySelector('.sp-view .sp-header'), 'le Précédent n’a pas refermé le détail').toBeNull();
    carte()!.click();
    await attendreQue(() => !!el.querySelector('.sp-view .sp-header'), 'le détail, rouvert');
    await stabiliser();
    const attente = new Promise<void>((r) => window.addEventListener('popstate', () => r(), { once: true }));
    el.querySelector<HTMLButtonElement>('.sp-view .sp-header button.back-btn')!.click();
    await attente;
    flushSync();
    await stabiliser();
    expect(el.querySelector('.sp-view .sp-header')).toBeNull();
    expect(history.state).toMatchObject({ vue: 'smartplaylists', detail: null });
    await precedent();
    expect(get(activeView), 'un Précédent après le Retour est resté sur place : cran mort').toBe('home');
  });
});

describe('web#1790 — le bouton Retour de la page artiste', () => {
  it('🔴 rouvre les Favoris sur l’onglet Artistes', async () => {
    const el = await favorisSurLOnglet('favorites.artists');
    const nom = () => [...el.querySelectorAll<HTMLButtonElement>('.v2-fav .art button.an')].find((b) => b.textContent?.includes('Anette Askvik'));
    await attendreQue(() => !!nom(), 'l’artiste Anette Askvik');
    nom()!.click();
    await attendreQue(() => !!el.querySelector('.v2-fas button.retour'), 'la page de l’artiste');
    await stabiliser();
    el.querySelector<HTMLButtonElement>('.v2-fas button.retour')!.click();
    flushSync();
    await stabiliser();
    await revenirAuxFavorisSur(el, 'favorites.artists');
    expect(history.state).toMatchObject({ vue: 'favorites', onglet: 'artists' });
  });

  it('témoin : ouvrir la page artiste depuis ailleurs ne pose aucun onglet au Retour', async () => {
    const el = await favorisSurLOnglet('favorites.artists');
    activeView.set('home');
    flushSync();
    await stabiliser();
    vueDeRetour.set('favorites'); // posé depuis un autre écran que les Favoris
    activeView.set('favorites');
    flushSync();
    await attendreQue(() => !!el.querySelector('.v2-fav nav.tabs button.on'), 'les Favoris');
    expect(ongletActif(el)).toContain(libelle('favorites.albums'));
  });
});
