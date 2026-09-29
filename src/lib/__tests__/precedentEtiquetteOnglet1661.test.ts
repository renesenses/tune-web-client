// @vitest-environment jsdom
//
// web#1661 — LE PRÉCÉDENT APRÈS UNE PLAYLIST OUVERTE DEPUIS UNE ÉTIQUETTE.
//
// FabienM, fil 1990 (0.9.166), point 3 : « Le bouton BACK du navigateur ne
// revient pas à l'endroit souhaité quand j'ouvre une playlist. Il revient à la
// page d'accueil de l'étiquette alors qu'il devrait revenir à l'onglet
// Playlists de l'étiquette ».
//
// MESURÉ ici même, avant correctif, sur `origin/main` cfdc755e :
//
//     étiquette ouverte  : #tags            (rien d'empilé)
//     playlist « ouverte » : #playlists      (la LISTE : `PlaylistsV2` ignorait
//                                            `restore: { id, name }`)
//     Précédent          : #tags → écran REMONTÉ, `ouverte = null`
//                          → la liste de TOUTES les étiquettes
//
// Le chemin ne passe jamais par `tune:shortcut-restore` : c'est l'étiquette
// entière qui se perd au remontage, pas seulement l'onglet.
//
// ON MONTE LA VRAIE `ShellV2` et l'on clique là où le testeur clique ; le test
// n'appelle jamais `pushState` lui-même.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, pendingLibraryAlbum, vueDeRetour } from '../stores/navigation';
import { detailOuvert } from '../historiqueCoquille';
import { t } from '../i18n';
import { reculer } from './reculer';

vi.setConfig({ testTimeout: 30_000 });

const TAG = { id: 3, name: 'Soirée', color: null };
const ALBUM = { id: 11, title: 'Kind of Blue', artist_name: 'Miles Davis', cover_path: null };
const PLAYLIST = { id: 5, name: 'Dimanche', track_count: 2 };

function corpsPour(url: string): unknown {
  const u = new URL(url, 'http://localhost');
  const p = u.pathname.replace(/^\/api\/v1/, '');
  if (p === '/tags/' || p === '/tags') return [TAG];
  if (p === '/tags/3/albums') return { albums: [ALBUM], count: 1 };
  if (p === '/tags/3/artists') return { artists: [], count: 0 };
  if (p === '/tags/3/tracks') return { tracks: [], count: 0 };
  if (p === '/tags/3/playlists') return { playlists: [PLAYLIST], count: 1 };
  if (p === '/tags/3/smart-playlists') return { smart_playlists: [], count: 0 };
  if (p === '/tags/3/collections') return { collections: [], count: 0 };
  if (p === '/tags/3/smart-collections') return { smart_collections: [], count: 0 };
  if (p === '/playlists') return [PLAYLIST];
  if (p === '/playlists/5') return PLAYLIST;
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

const titre = (el: HTMLElement) => el.querySelector('.v2-tags h1')?.textContent?.trim() ?? null;
const ongletActif = (el: HTMLElement) => el.querySelector('.v2-tags .onglets button.on')?.textContent ?? null;
const detailPlaylist = (el: HTMLElement) => el.querySelector('.v2-pldetail');
const libelle = (cle: string) => get(t)(cle as any);

async function precedent(): Promise<void> {
  await reculer();
  flushSync();
  await stabiliser(20);
}

/** Accueil → Étiquettes → « Soirée ». */
async function ouvrirLEtiquette(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote, props: {} });
  flushSync();
  const el = hote;
  activeView.set('tags');
  flushSync();
  await attendreQue(() => !!el.querySelector('.v2-tags button.tag'), 'la liste des étiquettes');
  el.querySelector<HTMLButtonElement>('.v2-tags button.tag')!.click();
  await attendreQue(() => !!el.querySelector('.v2-tags .onglets'), 'les onglets de l’étiquette');
  await stabiliser();
  return el;
}

/** … → onglet Playlists → « Dimanche » : le chemin du signalement. */
async function ouvrirLaPlaylistDeLEtiquette(): Promise<{ el: HTMLDivElement; hauteur: number }> {
  const el = await ouvrirLEtiquette();
  [...el.querySelectorAll<HTMLButtonElement>('.v2-tags .onglets button')]
    .find((b) => b.textContent?.includes(libelle('favorites.playlists')))!.click();
  flushSync();
  expect(ongletActif(el)).toContain(libelle('favorites.playlists'));
  await attendreQue(() => !!el.querySelector('.v2-tags button.meta'), 'la vignette Dimanche');
  const hauteur = history.length;
  el.querySelector<HTMLButtonElement>('.v2-tags button.meta')!.click();
  await attendreQue(() => !!detailPlaylist(el), 'le détail de la playlist Dimanche');
  await stabiliser();
  return { el, hauteur };
}

describe('web#1661 — étiquette, onglet Playlists, playlist, Précédent', () => {
  it('🔴 le clic OUVRE la playlist, en UNE entrée d’historique', async () => {
    const { el, hauteur } = await ouvrirLaPlaylistDeLEtiquette();
    expect(get(activeView)).toBe('playlists');
    expect(detailPlaylist(el)?.textContent).toContain('Dimanche');
    expect(history.length, 'un clic, plusieurs entrées : un Précédent tomberait sur la liste des playlists').toBe(hauteur + 1);
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'playlists', detail: 'playlists:5' });
  });

  it('🔴 le Précédent ramène à l’étiquette, sur l’onglet Playlists', async () => {
    const { el } = await ouvrirLaPlaylistDeLEtiquette();
    await precedent();
    expect(get(activeView), 'le Précédent a quitté les Étiquettes').toBe('tags');
    await attendreQue(() => !!el.querySelector('.v2-tags .onglets'), 'l’étiquette rouverte');
    expect(titre(el), 'le Précédent a perdu l’étiquette : liste de toutes les étiquettes').toBe('Soirée');
    expect(ongletActif(el), 'le Précédent a rouvert l’étiquette sur un autre onglet').toContain(libelle('favorites.playlists'));
  });

  it('ouvrir l’étiquette empile une entrée ; le Précédent la referme, puis quitte l’écran', async () => {
    const el = await ouvrirLEtiquette();
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'tags', detail: 'etiquette:3' });
    expect(ongletActif(el), 'une étiquette neuve s’ouvre sur son premier onglet non vide').toContain(libelle('favorites.albums'));
    await precedent();
    expect(get(activeView)).toBe('tags');
    expect(el.querySelector('.v2-tags .onglets'), 'le Précédent ne referme pas l’étiquette').toBeNull();
    await precedent();
    expect(get(activeView)).toBe('home');
  });

  it('le Retour de l’étiquette referme ET dépile : aucun cran mort derrière', async () => {
    const el = await ouvrirLEtiquette();
    const attente = new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
    el.querySelector<HTMLButtonElement>('.v2-tags button.back')!.click();
    await attente;
    flushSync();
    await stabiliser();
    expect(el.querySelector('.v2-tags .onglets')).toBeNull();
    expect(history.state).toMatchObject({ vue: 'tags', detail: null });
    await precedent();
    expect(get(activeView), 'un Précédent après le Retour est resté sur place : cran mort').toBe('home');
  });

  it('#980 tient : le Précédent referme l’album ouvert dans l’étiquette, et l’étiquette reste', async () => {
    const el = await ouvrirLEtiquette();
    el.querySelector<HTMLButtonElement>('.v2-tags button.meta')!.click();
    await attendreQue(() => !!el.querySelector('.v2-tags .v2-detail'), 'la fiche de l’album');
    expect(history.state).toMatchObject({ vue: 'tags', detail: 'album:11' });
    await precedent();
    expect(el.querySelector('.v2-tags .v2-detail'), 'le Précédent ne referme pas l’album').toBeNull();
    expect(titre(el)).toBe('Soirée');
    expect(history.state).toMatchObject({ vue: 'tags', detail: 'etiquette:3' });
  });
});
