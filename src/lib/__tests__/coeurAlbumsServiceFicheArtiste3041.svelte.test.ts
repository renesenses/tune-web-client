// @vitest-environment jsdom
//
// tune-web-client#3041 — FICHE ARTISTE : LE CŒUR SUR LES ALBUMS DE SERVICE.
//
// Didier (Gros Bidon), forum 2818, 14/11/2026 : depuis la fiche d'un artiste,
// il repère deux albums Qobuz « à écouter » et cherche « le petit cœur sur ces
// albums pour les mettre en préférence mais il n'y en a pas ».
//
// La grille (`DiscographieCommune`) ne posait qu'un favori LOCAL. Ces témoins
// MONTENT la grille, regardent le cœur et CLIQUENT : l'appel doit partir par
// le chemin unique des favoris de service (`/favorites/streaming/add`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, tick } from 'svelte';
import { get } from 'svelte/store';
import DiscographieCommune from '../../components/v2/DiscographieCommune.svelte';
import { currentProfileId, favoriteStreamingKeys, streamingFavKey } from '../stores/profile';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: ReturnType<typeof mount> | null = null;
let appels: { url: string; methode: string; corps: any }[] = [];

beforeEach(() => {
  try { localStorage.clear(); } catch { /* sans stockage */ }
  appels = [];
  currentProfileId.set(7);
  favoriteStreamingKeys.set(new Set());
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entree instanceof Request ? entree.url : entree);
    let corps: any = null;
    try { corps = init?.body ? JSON.parse(String(init.body)) : null; } catch { corps = init?.body; }
    appels.push({ url, methode: init?.method ?? 'GET', corps });
    // Les relectures (GET) rendent des listes vides ; les écritures, `{}`.
    const vide = (init?.method ?? 'GET') === 'GET' ? '[]' : '{}';
    return new Response(vide, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  favoriteStreamingKeys.set(new Set());
});

function poserGrille(props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(DiscographieCommune, { target: hote, props: { onOuvrir: () => {}, onLire: () => {}, ...props } as any });
  flushSync();
  return hote;
}

const carteDe = (racine: Element, titre: string) =>
  [...racine.querySelectorAll('.carte')].find((c) => c.querySelector('.ct')?.textContent?.trim() === titre) ?? null;
const coeurDe = (carte: Element | null) => carte?.querySelector<HTMLButtonElement>('button.coin.tl') ?? null;

const LOCAL = { id: 12, title: 'Premier album', year: 2001, source: 'local', artist_name: 'Didier' } as unknown as Album;
const QOBUZ = { id: null, source_id: 'kxend2k5wdg06', title: 'Deuxième album', year: 2005, artist_name: 'Didier', cover_path: 'https://static.qobuz.com/x.jpg' } as unknown as Album;
const TIDAL = { id: null, source_id: '987654', title: 'Troisième album', year: 2009, artist_name: 'Didier' } as unknown as Album;

describe('#3041 — cœur favori sur les albums de service de la fiche artiste', () => {
  it('une vignette Qobuz ou TIDAL porte un cœur, comme la vignette locale', () => {
    const racine = poserGrille({
      locaux: [LOCAL],
      services: [{ service: 'qobuz', albums: [QOBUZ] }, { service: 'tidal', albums: [TIDAL] }],
      nomArtiste: 'Didier',
    });
    expect(coeurDe(carteDe(racine, 'Premier album')), 'la vignette locale a perdu son cœur').not.toBeNull();
    expect(coeurDe(carteDe(racine, 'Deuxième album')), 'pas de cœur sur l’album Qobuz').not.toBeNull();
    expect(coeurDe(carteDe(racine, 'Troisième album')), 'pas de cœur sur l’album TIDAL').not.toBeNull();
  });

  it('le cœur est plein quand l’album Qobuz est déjà en favori', () => {
    favoriteStreamingKeys.set(new Set([streamingFavKey('album', 'qobuz', 'kxend2k5wdg06')]));
    const racine = poserGrille({ services: [{ service: 'qobuz', albums: [QOBUZ] }], nomArtiste: 'Didier' });
    expect(coeurDe(carteDe(racine, 'Deuxième album'))?.getAttribute('aria-pressed')).toBe('true');
  });

  it('cliquer le cœur appelle l’API des favoris de service, pour le profil courant', async () => {
    const racine = poserGrille({ services: [{ service: 'qobuz', albums: [QOBUZ] }], nomArtiste: 'Didier' });
    const coeur = coeurDe(carteDe(racine, 'Deuxième album'));
    expect(coeur).not.toBeNull();
    coeur!.click();
    await vi.waitFor(() => {
      expect(appels.some((a) => a.url.includes('/profiles/7/favorites/streaming/add'))).toBe(true);
    });
    const ajout = appels.find((a) => a.url.includes('/profiles/7/favorites/streaming/add'))!;
    expect(ajout.methode).toBe('POST');
    expect(ajout.corps).toMatchObject({ item_type: 'album', service: 'qobuz', service_id: 'kxend2k5wdg06', title: 'Deuxième album' });
    await tick();
    expect(get(favoriteStreamingKeys).has(streamingFavKey('album', 'qobuz', 'kxend2k5wdg06'))).toBe(true);
  });

  it('un cœur plein se retire par le même chemin', async () => {
    favoriteStreamingKeys.set(new Set([streamingFavKey('album', 'qobuz', 'kxend2k5wdg06')]));
    const racine = poserGrille({ services: [{ service: 'qobuz', albums: [QOBUZ] }], nomArtiste: 'Didier' });
    coeurDe(carteDe(racine, 'Deuxième album'))!.click();
    await vi.waitFor(() => {
      expect(appels.some((a) => a.url.includes('/profiles/7/favorites/streaming/remove'))).toBe(true);
    });
    const retrait = appels.find((a) => a.url.includes('/profiles/7/favorites/streaming/remove'))!;
    expect(retrait.corps).toMatchObject({ item_type: 'album', service: 'qobuz', service_id: 'kxend2k5wdg06' });
  });

  it('un album aussi présent en bibliothèque garde le cœur LOCAL (pas d’appel de service)', async () => {
    const memeQobuz = { ...QOBUZ, title: 'Premier album', year: 2001 } as unknown as Album;
    const racine = poserGrille({ locaux: [LOCAL], services: [{ service: 'qobuz', albums: [memeQobuz] }], nomArtiste: 'Didier' });
    const cartes = [...racine.querySelectorAll('.carte')].filter((c) => c.querySelector('.ct')?.textContent?.trim() === 'Premier album');
    expect(cartes.length).toBe(1);
    coeurDe(cartes[0])!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(appels.some((a) => a.url.includes('/favorites/streaming/'))).toBe(false);
  });
});
