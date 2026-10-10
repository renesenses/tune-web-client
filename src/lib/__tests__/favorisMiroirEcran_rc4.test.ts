// @vitest-environment jsdom
//
// rc4 — miroir des favoris de service (`tune-server-rust#6011`), côté ÉCRAN.
//
// À l'ouverture des Favoris, le serveur rafraîchit le miroir (cache de 60 s)
// et le dit dans l'en-tête `X-Tune-Favoris-Miroir` : `ok`, `en_attente`,
// `echec` ou `aucun`. Ce fichier éprouve :
//   1. que l'en-tête est LU et rangé ;
//   2. que l'écran Favoris en tire un état DISCRET (en attente / échec), et
//      rien quand tout va bien ou que le serveur est ancien (en-tête absent) ;
//   3. que l'ouverture de l'écran remet les CŒURS d'un service en miroir à la
//      liste du serveur : un favori retiré dans l'app Qobuz ne doit pas garder
//      son cœur plein ailleurs dans Tune ;
//   4. qu'un changement de profil recharge la liste.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import FavoritesV2 from '../../components/v2/FavoritesV2.svelte';
import * as api from '../api';
import { etatMiroirFavoris } from '../stores/favorisMiroir';
import { currentProfileId, favoriteStreamingKeys, streamingFavKey } from '../stores/profile';
import { streamingServices } from '../stores/streaming';

const RESTE = {
  item_type: 'track', service: 'qobuz', service_id: '1', title: 'Get Lucky', artist: 'Daft Punk',
  album: 'Random Access Memories', cover_url: null, created_at: '2026-10-01T10:00:00Z',
  miroir_etat: 'synchro',
};

let entete: string | null = null;
let lectures: string[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function corps(url: string): unknown {
  if (url.includes('/favorites/streaming')) return [RESTE];
  if (url.includes('/favorites/facets')) return [];
  if (url.includes('/favorites')) return [];
  return [];
}

beforeEach(() => {
  entete = null;
  lectures = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (/\/profiles\/\d+\/favorites\/streaming(\?|$)/.test(u)) lectures.push(u);
    const h = new Map([['content-type', 'application/json']]);
    if (entete !== null && u.includes('/favorites/streaming')) h.set('x-tune-favoris-miroir', entete);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null },
      json: async () => corps(u), text: async () => JSON.stringify(corps(u)),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close(){} addEventListener(){} removeEventListener(){} send(){} } as any);
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  etatMiroirFavoris.set(null);
  streamingServices.set({});
  currentProfileId.set(1);
  favoriteStreamingKeys.set(new Set());
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
  localStorage.clear();
  streamingServices.set({});
  etatMiroirFavoris.set(null);
});

const poser = () => {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(FavoritesV2, { target: hote, props: {} as any });
  flushSync();
  return hote;
};
const respirer = (ms = 160) => new Promise((r) => setTimeout(r, ms));

describe('rc4 — l’en-tête `X-Tune-Favoris-Miroir`', () => {
  it('🔴 il est lu et rangé', async () => {
    entete = 'en_attente';
    await api.getProfileStreamingFavorites(1);
    expect(get(etatMiroirFavoris)).toBe('en_attente');
  });

  it('CONTRE-ÉPREUVE — serveur ancien, en-tête absent : rien', async () => {
    etatMiroirFavoris.set('echec');
    entete = null;
    await api.getProfileStreamingFavorites(1);
    expect(get(etatMiroirFavoris)).toBeNull();
  });

  it('une valeur inconnue n’est pas rangée', async () => {
    entete = 'n_importe_quoi';
    await api.getProfileStreamingFavorites(1);
    expect(get(etatMiroirFavoris)).toBeNull();
  });
});

describe('rc4 — l’écran Favoris montre l’état du miroir, discrètement', () => {
  it('🔴 `en_attente` : une ligne discrète', async () => {
    entete = 'en_attente';
    const h = poser();
    await respirer();
    flushSync();
    const etat = h.querySelector('[data-testid="miroir-favoris-etat"]');
    expect(etat, `aucun état ; rendu : ${(h.textContent ?? '').slice(0, 200)}`).toBeTruthy();
    expect(etat!.getAttribute('role')).toBe('status');
  });

  it('🔴 `echec` : une ligne discrète aussi', async () => {
    entete = 'echec';
    const h = poser();
    await respirer();
    flushSync();
    expect(h.querySelector('[data-testid="miroir-favoris-etat"]')).toBeTruthy();
  });

  it('CONTRE-ÉPREUVE — `ok`, `aucun` ou absent : rien', async () => {
    for (const v of ['ok', 'aucun', null]) {
      entete = v;
      const h = poser();
      await respirer();
      flushSync();
      expect(h.querySelector('[data-testid="miroir-favoris-etat"]'), `affiché pour ${v}`).toBeNull();
      unmount(monte!); monte = null; h.remove(); hote = null;
    }
  });
});

describe('rc4 — l’ouverture recharge les favoris et remet les cœurs au miroir', () => {
  it('🔴 un favori retiré dans l’app Qobuz perd son cœur à l’ouverture', async () => {
    streamingServices.set({ qobuz: { enabled: true, authenticated: true, favoris_miroir: true } } as any);
    favoriteStreamingKeys.set(new Set([
      streamingFavKey('track', 'qobuz', '1'),
      streamingFavKey('track', 'qobuz', '2'), // retiré chez Qobuz
      streamingFavKey('album', 'deezer', '9'), // hors miroir : intouché
    ]));
    poser();
    await respirer();
    flushSync();
    const cles = get(favoriteStreamingKeys);
    expect(cles.has(streamingFavKey('track', 'qobuz', '1'))).toBe(true);
    expect(cles.has(streamingFavKey('track', 'qobuz', '2')), 'cœur fantôme').toBe(false);
    expect(cles.has(streamingFavKey('album', 'deezer', '9'))).toBe(true);
  });

  it('CONTRE-ÉPREUVE — serveur ancien (champ absent) : les cœurs ne sont pas retirés', async () => {
    streamingServices.set({ qobuz: { enabled: true, authenticated: true } } as any);
    favoriteStreamingKeys.set(new Set([streamingFavKey('track', 'qobuz', '2')]));
    poser();
    await respirer();
    flushSync();
    expect(get(favoriteStreamingKeys).has(streamingFavKey('track', 'qobuz', '2'))).toBe(true);
  });

  it('un changement de profil relit la liste', async () => {
    poser();
    await respirer();
    const avant = lectures.length;
    expect(avant, 'l’ouverture n’a rien lu').toBeGreaterThan(0);
    currentProfileId.set(2);
    flushSync();
    await respirer();
    expect(lectures.slice(avant).some((u) => u.includes('/profiles/2/'))).toBe(true);
  });
});
