// @vitest-environment jsdom
//
// Fil 3009 (FabienM, 1.0.0-rc13), point 16 — « Menu Qobuz : page artiste, il
// faut ajouter le drapeau du pays d'origine de l'artiste ».
//
// Qobuz ne publie pas le pays d'un artiste. La fiche le reprend de l'artiste
// du MÊME nom dans la bibliothèque, dont le serveur a lu le pays sur la fiche
// MusicBrainz (tune-server-rust#8090) — et que seule `GET /library/artists/{id}`
// rend : la recherche, qui sert à résoudre l'homonyme, ne le porte pas.
//
// Ce banc MONTE `ArtisteServiceV2` sur un artiste Qobuz et lit l'en-tête.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ArtisteServiceV2 from '../../components/v2/ArtisteServiceV2.svelte';
import { ficheArtisteService, streamingServices } from '../stores/streaming';
import { currentProfileId, favoriteStreamingKeys } from '../stores/profile';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

const QOBUZ = { id: '61592', name: 'Alela Diane', image_path: 'https://static.qobuz.com/a.jpg' };
/** L'artiste de la bibliothèque, tel que la RECHERCHE le rend : sans pays. */
const LOCAL_RECHERCHE = { id: 42, name: 'Alela Diane', image_path: null };
/** Le même, tel que sa fiche le rend : avec le pays MusicBrainz. */
let ficheLocale: Record<string, unknown> = { ...LOCAL_RECHERCHE, country: 'US' };
let rechercheLocale: unknown[] = [LOCAL_RECHERCHE];
/** Relecture du 23/11 : l'homonyme n'est retenu que si ses albums recoupent ceux du service. */
const ALBUMS_QOBUZ = [{ id: null, title: 'Cusp', source: 'qobuz', source_id: 'a-1', year: 2018 }];
let albumsLocaux: unknown[] = [{ id: 7, title: 'Cusp', year: 2018 }];

function corpsPour(url: string): unknown {
  if (/\/streaming\/qobuz\/artists\/61592\/albums/.test(url)) return ALBUMS_QOBUZ;
  if (/\/streaming\/qobuz\/artists\/61592\/top-tracks/.test(url)) return [];
  if (/\/streaming\/qobuz\/artists\/61592/.test(url)) return QOBUZ;
  if (/\/streaming\/services/.test(url)) return { qobuz: { enabled: true, authenticated: true } };
  if (/\/library\/search\?/.test(url)) return { artists: rechercheLocale, albums: [], tracks: [] };
  if (/\/library\/artists\/4[23]\/albums/.test(url)) return albumsLocaux;
  if (/\/library\/artists\/42(\?|$)/.test(url)) return ficheLocale;
  return /\/(profiles|zones|playlists|devices|favorites|history|artists|albums|tracks)(\?|\/|$)/.test(url) ? [] : {};
}

let requetes: string[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  requetes = [];
  ficheLocale = { ...LOCAL_RECHERCHE, country: 'US' };
  rechercheLocale = [LOCAL_RECHERCHE];
  albumsLocaux = [{ id: 7, title: 'Cusp', year: 2018 }];
  locale.set('fr');
  streamingServices.set({ qobuz: { enabled: true, authenticated: true } } as any);
  vi.stubGlobal('fetch', vi.fn(async (input: any) => {
    const url = String(input);
    requetes.push(url);
    const corps = corpsPour(url);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  currentProfileId.set(2);
  favoriteStreamingKeys.set(new Set());
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  ficheArtisteService.set(null);
  vi.unstubAllGlobals();
});

async function jusqua(condition: () => boolean, borne = 8000) {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition() || Date.now() >= fin) return;
    await new Promise((r) => setTimeout(r, 0));
  }
}
const drapeau = () => hote!.querySelector<HTMLButtonElement>('[data-pays-artiste]');
const ouvrirQobuz = () => {
  ficheArtisteService.set({ service: 'qobuz', id: '61592', nom: 'Alela Diane' } as any);
  monte = mount(ArtisteServiceV2, { target: hote!, props: {} as any });
};

describe('fil 3009 point 16 — le drapeau du pays sur la fiche d’un artiste Qobuz', () => {
  it('🔴 l’artiste est dans la bibliothèque avec un pays : la fiche Qobuz montre son drapeau', async () => {
    ouvrirQobuz();
    await jusqua(() => !!drapeau());
    expect(drapeau(), 'la fiche Qobuz n’affiche pas le pays de l’artiste').toBeTruthy();
    expect(drapeau()!.getAttribute('data-pays-artiste')).toBe('US');
    expect(drapeau()!.textContent).toContain('🇺🇸');
    // Le pays vient de la fiche locale, pas de la recherche (qui ne le porte pas).
    expect(requetes.some((u) => /\/library\/artists\/42(\?|$)/.test(u))).toBe(true);
  });

  it('l’homonyme local n’a pas de pays (pas de MBID) : pas de drapeau', async () => {
    ficheLocale = { ...LOCAL_RECHERCHE, country: null };
    ouvrirQobuz();
    await jusqua(() => requetes.some((u) => /\/library\/artists\/42(\?|$)/.test(u)));
    await jusqua(() => false, 200);
    expect(drapeau()).toBeNull();
  });

  it('aucun artiste de ce nom dans la bibliothèque : pas de drapeau, et rien n’est deviné', async () => {
    rechercheLocale = [{ id: 43, name: 'Alela Diane & Wild Divine', image_path: null }];
    ouvrirQobuz();
    await jusqua(() => requetes.some((u) => /\/library\/search\?/.test(u)));
    await jusqua(() => false, 200);
    expect(drapeau()).toBeNull();
    expect(requetes.some((u) => /\/library\/artists\/43(\?|$)/.test(u))).toBe(false);
  });

  it('🔴 DEUX homonymes « Alela Diane » dans la bibliothèque : on ne sait pas lequel, pas de drapeau', async () => {
    rechercheLocale = [LOCAL_RECHERCHE, { id: 43, name: 'Alela Diane', image_path: null }];
    ouvrirQobuz();
    await jusqua(() => requetes.some((u) => /\/library\/artists\/42\/albums/.test(u)));
    await jusqua(() => false, 200);
    expect(drapeau()).toBeNull();
    expect(requetes.some((u) => /\/library\/artists\/4[23](\?|$)/.test(u))).toBe(false);
  });

  it('🔴 homonyme dont aucun album ne recoupe ceux du service : un autre artiste, pas de drapeau', async () => {
    albumsLocaux = [{ id: 8, title: 'Un tout autre disque', year: 1999 }];
    ouvrirQobuz();
    await jusqua(() => requetes.some((u) => /\/library\/artists\/42\/albums/.test(u)));
    await jusqua(() => false, 200);
    expect(drapeau()).toBeNull();
    expect(requetes.some((u) => /\/library\/artists\/42(\?|$)/.test(u))).toBe(false);
  });
});
