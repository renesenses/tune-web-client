// @vitest-environment jsdom
//
// renesenses/tune-web-client#1719 (FabienM, fil 2013, point 4, v0.9.167).
//
// > « 4 - Proposer l'icone affichage grille dans le menu favoris pour les
// >   albums et playlists et aussi dans le menu Playlists »
//
// La bascule existait — dans UN seul écran, écrite en clair dans le gabarit de
// `LibraryV2.svelte` (#929). Ce témoin garde les trois surfaces demandées ET
// le fait qu'il n'y ait qu'UNE définition du bouton.
//
// 🔴 Il MONTE les écrans et lit ce qui est réellement dessiné : les classes de
// la grille, le choix réellement écrit dans le magasin de préférences, les
// requêtes réellement émises. Aucun appel à une fonction interne — une garde
// qui appellerait `affichageSuivant` elle-même ne dirait rien du branchement.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import FavoritesV2 from '../../components/v2/FavoritesV2.svelte';
import PlaylistsV2 from '../../components/v2/PlaylistsV2.svelte';
import { affichageSuivant, GRILLE_OU_LISTE, AFFICHAGES } from '../affichage';
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

describe('#1719 — la bascule d’affichage, la MÊME, sur les trois écrans', () => {
  it('🔴 Favoris › Albums : la bascule est là, et elle couche la grille', async () => {
    const h = poser(FavoritesV2);
    await respirer();
    flushSync();

    expect(h.querySelector('.grid'), 'la grille d’albums n’est pas rendue').toBeTruthy();
    const b = bascule(h);
    expect(b, 'aucune bascule d’affichage dans Favoris › Albums').toBeTruthy();
    // Le mode COURANT est porté par le bouton : c'est lui qui rend un second
    // cran atteignable sans inventer un second bouton.
    expect(b!.getAttribute('data-vue')).toBe('grid');
    expect(b!.querySelectorAll('.vpts i').length, 'les pastilles de cran manquent').toBe(2);

    b!.click();
    flushSync();
    expect(
      h.querySelector('.grid')?.classList.contains('liste'),
      'un clic sur la bascule ne passe pas les albums favoris en liste',
    ).toBe(true);
    // Le CONTENU ne change pas : la liste est la grille couchée, pas une
    // seconde branche de gabarit qui perdrait des cartes.
    expect(h.querySelectorAll('.grid .card').length).toBe(1);
    expect(bascule(h)!.getAttribute('data-vue')).toBe('list');
  });

  it('🔴 Favoris › Albums : le choix est RETENU d’une visite à l’autre', async () => {
    const h = poser(FavoritesV2);
    await respirer();
    flushSync();
    bascule(h)!.click();
    flushSync();
    await respirer(20);

    // Le magasin d'écran de la Bibliothèque, pas un second (préfixe
    // `tune_v2_ecran_`, voir `lib/preferencesEcran`).
    expect(
      localStorage.getItem('tune_v2_ecran_fav.albums.display'),
      'le choix d’affichage des albums favoris n’est pas retenu',
    ).toBe('list');

    // Second montage : l'écran repart sur le choix retenu.
    const h2 = poser(FavoritesV2);
    await respirer();
    flushSync();
    expect(
      h2.querySelector('.grid')?.classList.contains('liste'),
      'le choix retenu n’est pas relu au montage suivant',
    ).toBe(true);
  });

  it('🔴 Favoris › Playlists : depuis la liste, la GRILLE est possible', async () => {
    // web#1650 : la grille est devenue le DÉFAUT. On part donc d'un choix
    // « liste » RETENU, pour garder le passage liste → grille sous témoin.
    localStorage.setItem('tune_v2_ecran_fav.playlists.display', 'list');
    const h = poser(FavoritesV2);
    await ongletFavoris(h, /playlist/i);

    expect(h.querySelector('.simples'), 'le choix « liste » retenu n’est pas relu').toBeTruthy();
    const b = bascule(h);
    expect(b, 'aucune bascule d’affichage dans Favoris › Playlists').toBeTruthy();
    expect(b!.getAttribute('data-vue')).toBe('list');

    b!.click();
    flushSync();
    await respirer(120);
    flushSync();

    const noms = Array.from(h.querySelectorAll('.grid .card .ct')).map((e) => e.textContent?.trim());
    expect(noms, 'les playlists favorites ne passent pas en grille de vignettes').toEqual(['Route 66']);
    expect(
      localStorage.getItem('tune_v2_ecran_fav.playlists.display'),
      'le choix d’affichage des playlists favorites n’est pas retenu',
    ).toBe('grid');
    // La pochette d'une playlist locale se compose de celles de ses pistes :
    // la requête ne part QU'EN grille.
    expect(
      appels.some((u) => /\/playlists\/7\/tracks/.test(u)),
      'la mosaïque n’a pas été demandée : la vignette reste sans pochette',
    ).toBe(true);
  });

  it('🔴 Favoris › Playlists : en LISTE, aucune mosaïque n’est demandée', async () => {
    localStorage.setItem('tune_v2_ecran_fav.playlists.display', 'list');
    const h = poser(FavoritesV2);
    await ongletFavoris(h, /playlist/i);
    await respirer(120);
    expect(
      appels.some((u) => /\/playlists\/7\/tracks/.test(u)),
      'la liste paie des requêtes de pochettes qu’elle n’affiche pas',
    ).toBe(false);
  });

  it('🔴 Gestionnaire de playlists : la bascule est là, et le choix est retenu', async () => {
    activeView.set('playlists' as any);
    const h = poser(PlaylistsV2);
    await respirer(200);
    flushSync();

    const b = bascule(h);
    expect(b, 'aucune bascule d’affichage dans le Gestionnaire de playlists').toBeTruthy();
    expect(b!.getAttribute('data-vue')).toBe('grid');

    b!.click();
    flushSync();
    await respirer(20);
    const grilles = Array.from(h.querySelectorAll('.grid'));
    expect(grilles.length, 'aucune grille rendue — témoin sans objet').toBeGreaterThan(0);
    expect(
      grilles.every((g) => g.classList.contains('liste')),
      'un clic sur la bascule ne couche pas les playlists du gestionnaire',
    ).toBe(true);
    expect(
      localStorage.getItem('tune_v2_ecran_pl.display'),
      'le choix d’affichage du gestionnaire n’est pas retenu',
    ).toBe('list');
  });

  it('🔴 UNE seule définition du bouton : la Bibliothèque emploie le composant partagé', () => {
    const lib = readFileSync(resolve(process.cwd(), 'src/components/v2/LibraryV2.svelte'), 'utf-8');
    expect(
      lib.includes('<BasculeAffichage'),
      'la Bibliothèque n’emploie pas le composant partagé',
    ).toBe(true);
    // 🔴 Le bouton en clair a bien DISPARU du gabarit : sans ce contrôle, la
    // Bibliothèque garderait sa copie et les deux divergeraient au premier
    // changement. `data-vue` est ce qui distingue la bascule du bouton de
    // re-tirage (#4558), qui partage la classe `viewtog`.
    expect(
      lib.includes('class="viewtog" data-vue'),
      'la Bibliothèque garde une SECONDE définition du bouton',
    ).toBe(false);
  });

  it('la rotation des modes est celle de #929, et un mode absent retombe', () => {
    expect(affichageSuivant(GRILLE_OU_LISTE, 'grid')).toBe('list');
    expect(affichageSuivant(GRILLE_OU_LISTE, 'list')).toBe('grid');
    expect(affichageSuivant(AFFICHAGES, 'list')).toBe('carousel');
    expect(affichageSuivant(AFFICHAGES, 'carousel')).toBe('grid');
    // Hors de l'onglet Albums, la Bibliothèque retire le carrousel : un choix
    // « carousel » retenu doit y retomber sur la grille.
    expect(affichageSuivant(GRILLE_OU_LISTE, 'carousel')).toBe('grid');
  });
});
