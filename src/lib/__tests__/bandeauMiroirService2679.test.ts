// @vitest-environment jsdom
//
// web#2679, point 1 — « Le dernier rafraîchissement des favoris de service a
// échoué » restait affiché des jours sans dire QUEL service échouait ni
// POURQUOI (fil « Page des Favoris, je comprends pas tout ! », rc10).
//
// L'en-tête `X-Tune-Favoris-Miroir` ne porte qu'un état global ; le serveur
// sert pourtant le détail par service sur
// `GET /profiles/{id}/favorites/streaming/miroir` (tune-server-rust#5997).
// Le témoin monte le VRAI `FavoritesV2` : en échec, le bandeau nomme le
// service et son motif.
//
// Contre-épreuve : sur `origin/main`, le bandeau ne nomme ni Qobuz ni le motif.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import FavoritesV2 from '../../components/v2/FavoritesV2.svelte';
import { etatMiroirFavoris, servicesEnEchec } from '../stores/favorisMiroir';
import { currentProfileId, favoriteStreamingKeys } from '../stores/profile';
import { streamingServices } from '../stores/streaming';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

const MOTIF = 'HTTP 401 — jeton Qobuz expiré';
let detail: unknown = null;
let lecturesDetail = 0;
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function corps(url: string): unknown {
  if (/\/favorites\/streaming\/miroir/.test(url)) { lecturesDetail++; return detail; }
  return [];
}

beforeEach(() => {
  locale.set('fr');
  detail = {
    ttl_s: 60, periode_s: 0,
    services: {
      qobuz: { statut: 'echec', erreur: MOTIF, en_attente: 0 },
      tidal: { statut: 'non_connecte', erreur: 'service non connecté', en_attente: 0 },
    },
  };
  lecturesDetail = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    const h = new Map([['content-type', 'application/json']]);
    if (/\/favorites\/streaming(\?|$)/.test(u)) h.set('x-tune-favoris-miroir', 'echec');
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null },
      json: async () => corps(u), text: async () => JSON.stringify(corps(u)),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as never);
  etatMiroirFavoris.set(null);
  streamingServices.set({});
  currentProfileId.set(1);
  favoriteStreamingKeys.set(new Set());
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  localStorage.clear();
  etatMiroirFavoris.set(null);
});

const respirer = (ms = 200) => new Promise((r) => setTimeout(r, ms));
async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(FavoritesV2, { target: hote, props: {} as never }) as Record<string, unknown>;
  flushSync();
  await respirer();
  flushSync();
  return hote;
}

describe('web#2679 — le bandeau d’échec nomme le service et son motif', () => {
  it('🔴 Qobuz en échec : nommé, avec le motif du serveur', async () => {
    const h = await poser();
    const etat = h.querySelector('[data-testid="miroir-favoris-etat"]');
    expect(etat, 'aucun bandeau').toBeTruthy();
    const texte = etat!.textContent ?? '';
    expect(texte, 'le service fautif n’est pas nommé (#2679)').toContain('Qobuz');
    expect(texte, 'le motif n’est pas dit (#2679)').toContain(MOTIF);
    expect(texte, 'un service NON connecté n’est pas un échec (#6369)').not.toContain('TIDAL');
  });

  it('détail illisible (serveur ancien) : le texte d’avant', async () => {
    detail = { erreur: 'introuvable' };
    const h = await poser();
    const texte = h.querySelector('[data-testid="miroir-favoris-etat"]')?.textContent ?? '';
    expect(texte).toContain('Le dernier rafraîchissement des favoris de service a échoué');
  });

  it('en anglais aussi', async () => {
    locale.set('en');
    const h = await poser();
    const texte = h.querySelector('[data-testid="miroir-favoris-etat"]')?.textContent ?? '';
    expect(texte).toContain('The last refresh of Qobuz favourites failed');
    expect(texte).toContain('Reason:');
  });

  it('le détail n’est lu que s’il y a un échec à expliquer', async () => {
    await poser();
    expect(lecturesDetail).toBeGreaterThan(0);
  });

  it('servicesEnEchec : seuls les `echec`, motif vide → null', () => {
    expect(servicesEnEchec({ services: { qobuz: { statut: 'echec', erreur: '  ' }, tidal: { statut: 'ok' } } }))
      .toEqual([{ service: 'qobuz', erreur: null }]);
    expect(servicesEnEchec(null)).toEqual([]);
    expect(servicesEnEchec([] as never)).toEqual([]);
  });
});
