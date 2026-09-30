// @vitest-environment jsdom
//
// web #1757, renesenses/tune-server-rust#4803 — « Voir plus sur <Service> ».
//
// Bertrand, 29/09/2026 : sous chaque section de type, un bouton par service
// qui a encore des résultats pour ce type ; il charge la page suivante de CE
// service seulement (`sources=<svc>&service_offsets=<svc>:<n>&service_limits=
// <svc>:50`), ajoute à la suite sans doublon, et disparaît quand `has_more`
// passe à faux. Un service sans pagination (page unique pleine : `has_more`
// vrai mais `total` = ce qui est rendu) et un serveur antérieur (aucun champ
// de pagination) n'ont PAS de bouton.
//
// Le témoin MONTE l'écran et regarde ce qui PART sur le réseau.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import { setSearchCriteria } from '../stores/shortcuts';
import { preferences } from '../stores/preferences';
import { aUneSuite, decalageSuivant, fusionnerSuiteService, servicesAvecSuite } from '../rechercheSuiteService';

vi.setConfig({ testTimeout: 30_000 });

const piste = (svc: string, i: number) => ({
  id: `${svc}-${i}`, title: `Blue in Green ${svc} ${i}`, artist: 'Bill Evans', duration_ms: 1000,
});
const pistes = (svc: string, de: number, a: number) =>
  Array.from({ length: a - de + 1 }, (_, k) => piste(svc, de + k));

// Qobuz pagine : 86 titres annoncés, 36 servis en première page (36 + 2 + 2 =
// 40 lignes : le révélateur local n'a rien à montrer de plus).
const QOBUZ_P1 = {
  artists: [], albums: [], playlists: [], tracks: pistes('qobuz', 1, 36),
  offset: 0, limit: 36, total: { tracks: 86, albums: 0, artists: 0, playlists: 0 }, has_more: true, truncated: false,
};
// Page 2 : reprend le 36 (doublon à écarter), puis 37..86 ; fin de liste.
const QOBUZ_P2 = {
  artists: [], albums: [], playlists: [], tracks: pistes('qobuz', 36, 86),
  offset: 36, limit: 50, total: { tracks: 86, albums: 0, artists: 0, playlists: 0 }, has_more: false, truncated: false,
};
// Un service SANS pagination : page unique pleine, `has_more` vrai, total = rendu.
const TIDAL = {
  artists: [], albums: [], playlists: [], tracks: pistes('tidal', 1, 2),
  offset: 0, limit: 2, total: { tracks: 2, albums: 0, artists: 0, playlists: 0 }, has_more: true, truncated: true,
};
// Un serveur antérieur à #4803 : aucun champ de pagination.
const DEEZER_ANCIEN = { artists: [], albums: [], playlists: [], tracks: pistes('deezer', 1, 2) };

describe('#1757 — la règle', () => {
  it('une suite par famille, bornée par le total annoncé', () => {
    expect(aUneSuite(QOBUZ_P1 as any, 'tracks')).toBe(true);
    expect(aUneSuite(QOBUZ_P1 as any, 'albums')).toBe(false);
    expect(decalageSuivant(QOBUZ_P1 as any)).toBe(36);
  });
  it('page unique pleine d’un service sans pagination : pas de suite', () => {
    expect(aUneSuite(TIDAL as any, 'tracks')).toBe(false);
  });
  it('serveur antérieur : ni suite ni erreur', () => {
    expect(aUneSuite(DEEZER_ANCIEN as any, 'tracks')).toBe(false);
    expect(decalageSuivant(DEEZER_ANCIEN as any)).toBeNull();
    expect(servicesAvecSuite({ qobuz: QOBUZ_P1, tidal: TIDAL, deezer: DEEZER_ANCIEN } as any, 'tracks')).toEqual(['qobuz']);
  });
  it('la suite s’ajoute sans doublon et éteint le bouton', () => {
    const deux = fusionnerSuiteService(QOBUZ_P1 as any, QOBUZ_P2 as any);
    expect(deux.tracks).toHaveLength(86);
    expect(new Set(deux.tracks.map((t: any) => t.id)).size).toBe(86);
    expect(aUneSuite(deux, 'tracks')).toBe(false);
  });
});

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function jusqua(condition: () => boolean, borne = 5000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await respirer();
  }
}

const LOCAL_VIDE = {
  artists: [], albums: [], labels: [], playlists: [], tracks: [],
  totals: { artists: 0, albums: 0, tracks: 0, tracks_via_metadata: 0 },
  has_more: { artists: false, albums: false, tracks: false }, limit: 40, offset: 0,
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let urls: string[] = [];

beforeEach(() => {
  urls = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = decodeURIComponent(String(url));
    urls.push(u);
    if (/\/library\/search/.test(u)) return reponse(LOCAL_VIDE);
    if (/\/search\?/.test(u)) {
      if (/service_offsets=qobuz:36/.test(u)) return reponse({ local: LOCAL_VIDE, services: { qobuz: QOBUZ_P2 }, radios: [] });
      return reponse({ local: LOCAL_VIDE, services: { qobuz: QOBUZ_P1, tidal: TIDAL, deezer: DEEZER_ANCIEN }, radios: [] });
    }
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  setSearchCriteria(null);
  vi.unstubAllGlobals();
});

async function chercher(): Promise<HTMLDivElement> {
  setSearchCriteria({ q: 'blue in green' });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SearchV2, { target: hote, props: {} as any });
  await jusqua(() => hote!.textContent!.includes('Blue in Green qobuz 1'));
  return hote;
}

describe('#1757 — l’écran Recherche', () => {
  it('le premier appel demande la pagination', async () => {
    await chercher();
    expect(urls.some((u) => /\/search\?.*paged=true/.test(u)), urls.join(' | ')).toBe(true);
  });

  it('« Voir plus sur Qobuz » charge la page suivante de Qobuz seul, puis disparaît', async () => {
    const h = await chercher();
    const bouton = (svc: string) =>
      h.querySelector<HTMLButtonElement>(`button[data-suite-service="${svc}"][data-famille="tracks"]`);
    await jusqua(() => bouton('qobuz') !== null);
    expect(bouton('qobuz'), 'aucun bouton de suite pour Qobuz').not.toBeNull();
    expect(bouton('qobuz')!.textContent).toMatch(/Qobuz/);
    // Service sans pagination et serveur antérieur : pas de bouton.
    expect(bouton('tidal')).toBeNull();
    expect(bouton('deezer')).toBeNull();

    bouton('qobuz')!.click();
    await jusqua(() => h.textContent!.includes('Blue in Green qobuz 80'));
    const suite = urls.find((u) => /service_offsets=/.test(u)) ?? '';
    expect(suite, urls.join(' | ')).toMatch(/sources=qobuz(&|$)/);
    expect(suite).toMatch(/service_offsets=qobuz:36/);
    expect(suite).toMatch(/service_limits=qobuz:50/);
    expect(h.textContent).toContain('Blue in Green qobuz 80');
    // Sans doublon : le 36 repris par la page 2 n'apparaît qu'une fois.
    const quarante = [...h.querySelectorAll('*')].filter(
      (e) => e.children.length === 0 && e.textContent?.trim() === 'Blue in Green qobuz 36',
    );
    expect(quarante.length).toBe(1);
    // `has_more` faux : le bouton est retiré.
    await jusqua(() => bouton('qobuz') === null);
    expect(bouton('qobuz')).toBeNull();
  });
});
