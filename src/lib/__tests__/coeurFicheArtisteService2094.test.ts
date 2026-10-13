// @vitest-environment jsdom
//
// web#2094 (FabienM, fil forum 2236, point 2, 1.0.0-rc4) — « Pas de
// possibilité de mettre en favori un artiste du service (Qobuz, Bandcamp,
// Tidal) ». La vignette d'artiste de service portait le cœur, la FICHE non.
// Ce banc MONTE `ArtisteServiceV2` sur un artiste Qobuz et lit les requêtes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ArtisteServiceV2 from '../../components/v2/ArtisteServiceV2.svelte';
import { ficheArtisteService, streamingServices } from '../stores/streaming';
import { currentProfileId, favoriteStreamingKeys, streamingFavKey } from '../stores/profile';
import { locale } from '../i18n';
import lFr from '../locales/fr';

vi.setConfig({ testTimeout: 30_000 });
const fr = lFr as unknown as Record<string, string>;

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];

const ARTISTE = { id: '4626308', name: "Somebody's Child", image_path: 'https://static.qobuz.com/a.jpg' };

function corpsPour(url: string): unknown {
  if (/\/streaming\/qobuz\/artists\/4626308\/(albums|top-tracks)/.test(url)) return [];
  if (/\/streaming\/qobuz\/artists\/4626308/.test(url)) return ARTISTE;
  if (/\/favorites\/streaming\/add/.test(url)) return { ok: true };
  if (/\/streaming\/services/.test(url)) return { qobuz: { enabled: true, authenticated: true } };
  return /\/(profiles|zones|playlists|devices|favorites|history|artists|albums|tracks)(\?|\/|$)/.test(url) ? [] : {};
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  requetes = [];
  locale.set('fr');
  streamingServices.set({ qobuz: { enabled: true, authenticated: true } } as any);
  vi.stubGlobal('fetch', vi.fn(async (input: any, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ method, url, body });
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
const coeur = () => hote!.querySelector<HTMLButtonElement>('button.coeur-artiste');

describe('#2094 — le cœur sur la fiche d’un artiste de service', () => {
  it('🔴 fiche Qobuz : un cœur, et le clic pose le favori artiste chez le service', async () => {
    ficheArtisteService.set({ service: 'qobuz', id: '4626308', nom: "Somebody's Child" } as any);
    monte = mount(ArtisteServiceV2, { target: hote!, props: {} as any });
    await jusqua(() => !!coeur());
    expect(coeur(), 'la fiche artiste de service n’a pas de cœur').toBeTruthy();
    expect(coeur()!.getAttribute('aria-pressed')).toBe('false');
    coeur()!.click();
    await jusqua(() => requetes.some((r) => r.method === 'POST' && r.url.includes('/favorites/streaming/add')));
    const w = requetes.find((r) => r.method === 'POST' && r.url.includes('/favorites/streaming/add'));
    expect(w?.url).toMatch(/\/profiles\/2\/favorites\/streaming\/add$/);
    expect(w?.body).toEqual(expect.objectContaining({ item_type: 'artist', service: 'qobuz', service_id: '4626308' }));
  });

  it('un artiste déjà en favori : le cœur est plein', async () => {
    favoriteStreamingKeys.set(new Set([streamingFavKey('artist', 'qobuz', '4626308')]));
    ficheArtisteService.set({ service: 'qobuz', id: '4626308', nom: "Somebody's Child" } as any);
    monte = mount(ArtisteServiceV2, { target: hote!, props: {} as any });
    await jusqua(() => !!coeur());
    expect(coeur()!.getAttribute('aria-pressed')).toBe('true');
    expect(coeur()!.textContent?.trim()).toBe(fr['favorites.inFavorites']);
  });

  it('un artiste de la BIBLIOTHÈQUE : pas ce cœur-là', async () => {
    ficheArtisteService.set({ service: null, id: '7', nom: 'Leprous' } as any);
    monte = mount(ArtisteServiceV2, { target: hote!, props: {} as any });
    await jusqua(() => (hote!.textContent ?? '').includes('Leprous'));
    expect(coeur()).toBeNull();
  });
});
