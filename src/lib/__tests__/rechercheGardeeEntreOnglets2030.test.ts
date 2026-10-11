// @vitest-environment jsdom
/**
 * #2030 — fil forum 2128 (Didier, 09/10/2026, 1.0.0-rc2) : sur la page d'un
 * service, cliquer sur un onglet (Éditorial, Playlists, Favoris, Genres)
 * EFFAÇAIT la zone de recherche.
 *
 * Décision de Bertrand (09/10, rc4) : la saisie est GARDÉE au changement
 * d'onglet, et elle s'APPLIQUE au nouvel onglet — sur Éditorial elle cherche
 * dans le catalogue du service, sur Playlists, Favoris et Genres elle filtre
 * ce que l'onglet montre.
 *
 * Témoin COMPORTEMENTAL : vrai écran monté, `fetch` simulé, on tape, on clique.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { activeView } from '../stores/navigation';
import { activeStreamingService, streamingServices } from '../stores/streaming';
import StreamingV2 from '../../components/v2/StreamingV2.svelte';

vi.setConfig({ testTimeout: 60_000 });

const SERVICES = { qobuz: { enabled: true, authenticated: true, username: 'Didier' } } as any;
const RESULTATS = {
  albums: [{ id: 'a1', title: 'Avalon', artist: 'Roxy Music' }],
  artists: [], tracks: [], playlists: [], has_more: false,
};
const LISTES_COMPTE = [
  { source_id: 'p1', name: 'Roxy Music Essentials', track_count: 12, duration_ms: 1 },
  { source_id: 'p2', name: 'Jazz du soir', track_count: 8, duration_ms: 1 },
];
const FAV_ALBUMS = {
  albums: [
    { source_id: 'f1', title: 'Siren', artist_name: 'Roxy Music' },
    { source_id: 'f2', title: 'Kind of Blue', artist_name: 'Miles Davis' },
  ],
};

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function laisserTourner(n = 40) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}
const sousOnglets = () => Array.from(hote!.querySelectorAll('nav.subs > button')) as HTMLButtonElement[];
// Ordre des sous-onglets d'un service à compte (sans genres servis) :
// Éditorial, Playlists, Favoris — repérés par leur RANG, la langue du banc
// n'entre pas en jeu.
const EDITORIAL = 0, PLAYLISTS = 1, FAVORIS = 2;
const libelleDe = (i: number) => sousOnglets()[i]?.textContent?.trim() ?? null;
const sousOngletAllume = () => hote!.querySelector('nav.subs > button.on')?.textContent?.trim() ?? null;
const affiche = (s: string) => (hote!.querySelector('.scroll')?.textContent ?? '').includes(s);
const champ = () => hote!.querySelector('header input') as HTMLInputElement | null;

async function monterEtChercher() {
  monte = mount(StreamingV2 as any, { target: hote! });
  for (let i = 0; i < 60 && !sousOnglets().length; i++) await laisserTourner(1);
  expect(sousOnglets().length, 'aucun sous-onglet rendu').toBeGreaterThan(1);
  const input = champ();
  expect(input, 'le champ de recherche du service a disparu').not.toBeNull();
  input!.value = 'Roxy Music';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  await new Promise((r) => setTimeout(r, 320));
  await laisserTourner(20);
  expect(affiche('Avalon'), 'les résultats de recherche ne sont pas affichés').toBe(true);
}

async function cliquer(rang: number) {
  const b = sousOnglets()[rang] ?? null;
  expect(b, `sous-onglet n° ${rang} introuvable`).not.toBeNull();
  b!.click();
  flushSync();
  await new Promise((r) => setTimeout(r, 320));
  await laisserTourner(20);
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/ext\/bandcamp\/tags/.test(u)) throw new Error('extension non chargée');
    if (/\/streaming\/services/.test(u)) return reponse(SERVICES);
    if (/\/streaming\/qobuz\/search/.test(u)) return reponse(RESULTATS);
    if (/\/streaming\/qobuz\/playlists/.test(u)) return reponse(LISTES_COMPTE);
    if (/\/streaming\/qobuz\/favorites\/albums/.test(u)) return reponse(FAV_ALBUMS);
    if (/\/streaming\/qobuz\/favorites\//.test(u)) return reponse({});
    if (/\/config/.test(u)) return reponse({});
    return reponse([]);
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeStreamingService.set(null);
  streamingServices.set({});
  activeView.set('streaming');
});

afterEach(() => {
  try { if (monte) unmount(monte); } catch { /* hors sujet */ }
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('#2030 — la recherche est gardée d’un onglet à l’autre', () => {
  it('Playlists : la saisie reste et filtre les playlists du compte', async () => {
    await monterEtChercher();
    await cliquer(PLAYLISTS);
    expect(champ()!.value, 'la saisie a été effacée au clic sur Playlists').toBe('Roxy Music');
    expect(sousOngletAllume()).toBe(libelleDe(PLAYLISTS));
    expect(affiche('Roxy Music Essentials'), 'la playlist qui correspond n’est pas affichée').toBe(true);
    expect(affiche('Jazz du soir'), 'une playlist qui ne correspond pas est affichée').toBe(false);
  });

  it('Favoris : la saisie reste et filtre les favoris', async () => {
    await monterEtChercher();
    await cliquer(FAVORIS);
    expect(champ()!.value, 'la saisie a été effacée au clic sur Favoris').toBe('Roxy Music');
    expect(affiche('Siren')).toBe(true);
    expect(affiche('Kind of Blue'), 'un favori qui ne correspond pas est affiché').toBe(false);
  });

  it('retour sur Éditorial : la saisie cherche de nouveau dans le catalogue', async () => {
    await monterEtChercher();
    await cliquer(PLAYLISTS);
    await cliquer(EDITORIAL);
    expect(champ()!.value).toBe('Roxy Music');
    expect(affiche('Avalon'), 'les résultats du catalogue ne reviennent pas sur Éditorial').toBe(true);
    expect(sousOngletAllume()).toBe(libelleDe(EDITORIAL));
  });

  it('témoin : sans saisie, Playlists montre toutes les playlists', async () => {
    monte = mount(StreamingV2 as any, { target: hote! });
    for (let i = 0; i < 60 && !sousOnglets().length; i++) await laisserTourner(1);
    await cliquer(PLAYLISTS);
    expect(affiche('Roxy Music Essentials')).toBe(true);
    expect(affiche('Jazz du soir')).toBe(true);
  });
});
