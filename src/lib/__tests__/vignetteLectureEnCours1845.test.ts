// @vitest-environment jsdom
//
// web#1845 — le réglage « Lecture en cours ouvre l'album ou la playlist »
// (web#1784) valait pour l'entrée de la barre latérale, pas pour la VIGNETTE
// de la barre de lecture, qui menait toujours à l'écran Lecture en cours.
// Go de Bertrand du 30/09/2026 (« go vignette ») : la vignette suit la même
// règle ; décochée, rien ne change.
//
// Ce banc MONTE la vraie `TransportBar`, clique la vignette réellement peinte
// (`.track-mini-clickable`) et lit où l'on arrive (`activeView`,
// `pendingLibraryAlbum`, l'événement de réouverture de l'écran Playlists) et
// quelles requêtes sont parties. Il ne cherche aucune chaîne dans les sources.
//
// CONTRE-ÉPREUVE (jouée sur Shrek le 30/09/2026) : contre la barre
// d'origin/main (vignette = `activeView.set('nowplaying')` sans condition),
// les témoins 🔴 « réglage coché » (playlist, album) rougissent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { activeView, gestesNavigationService, pendingLibraryAlbum } from '../stores/navigation';
import { zones, currentZoneId } from '../stores/zones';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';

const PISTE_LOCALE = {
  track_id: 77, album_id: 5, artist_id: 3,
  title: 'Video Games', artist_name: 'Lana Del Rey', album_title: 'Born To Die',
  source: 'local', duration_ms: 281000,
};
const RADIO = { title: 'FIP', artist_name: 'FIP', source: 'radio', source_id: 'fip-hifi' };

type Contexte = { type: string | null; id: string | null; source: string | null };

/** La zone telle que la rend `GET /zones/1` — contexte de session compris. */
let zoneServeur: Record<string, unknown> = {};
/** Réponses particulières, par motif d'URL. */
let routes: Array<[RegExp, number, unknown]> = [];
let appels: string[] = [];
let evenements: any[] = [];
const ecouter = (ev: Event) => evenements.push((ev as CustomEvent).detail?.target);

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

function repondre(url: string): Response {
  appels.push(url);
  for (const [motif, status, corps] of routes) if (motif.test(url)) return reponse(status, corps);
  if (/\/zones\/1(\?|$)/.test(url)) return reponse(200, zoneServeur);
  if (/\/(zones|profiles|devices|playlists|shortcuts|plugins|sources|queue)(\?|$)/.test(url)) return reponse(200, []);
  return reponse(200, {});
}

function poserZone(piste: unknown, ctx: Contexte | null): void {
  const z = {
    id: 1, name: 'Salon', state: 'playing', online: true, volume: 0.4, output_type: 'dlna',
    current_track: piste, position_ms: 1000,
    ...(ctx ? {
      session_context_type: ctx.type, session_context_id: ctx.id, session_context_source: ctx.source,
    } : {}),
  };
  zoneServeur = z;
  // Le MAGASIN ne porte pas le contexte : il n'arrive pas par les événements
  // de lecture. La vignette doit faire relire la zone, pas se fier au magasin.
  zones.set([{ ...z, session_context_type: undefined, session_context_id: undefined, session_context_source: undefined }] as any);
  currentZoneId.set(1);
}

const respirer = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/** Monte la barre et rend la vignette PEINTE ; échoue si elle ne l'est pas. */
function vignette(): HTMLElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TransportBar, { target: hote });
  flushSync();
  const v = hote.querySelector<HTMLElement>('.track-mini-clickable');
  expect(v, 'la vignette n’est pas peinte — témoin sans objet').toBeTruthy();
  return v!;
}

async function cliquer(el: HTMLElement): Promise<void> {
  el.click();
  flushSync();
  await respirer();
  flushSync();
}

const reglage = (on: boolean) => preferences.update((p) => ({ ...p, lienLectureVersSource: on }));

beforeEach(() => {
  locale.set('fr');
  appels = [];
  evenements = [];
  routes = [];
  vi.stubGlobal('fetch', vi.fn(async (e: unknown) =>
    repondre(String(typeof e === 'string' ? e : (e as Request)?.url ?? e))));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  // `AudioVisualizer` observe son canvas : sans ResizeObserver, le montage tombe.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  window.addEventListener('tune:shortcut-restore', ecouter);
  activeView.set('home');
  pendingLibraryAlbum.set(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  window.removeEventListener('tune:shortcut-restore', ecouter);
  zones.set([]);
  currentZoneId.set(null as any);
  gestesNavigationService.set(null);
  pendingLibraryAlbum.set(null);
  activeView.set('home');
  reglage(false);
  vi.unstubAllGlobals();
});

describe('web#1845 — réglage DÉCOCHÉ : la vignette garde son geste', () => {
  it('(a) une lecture de playlist mène à l’écran Lecture en cours, sans requête /zones/1', async () => {
    reglage(false);
    poserZone(PISTE_LOCALE, { type: 'playlist', id: '12', source: 'local' });
    const v = vignette();
    await respirer();
    appels = [];
    await cliquer(v);
    expect(get(activeView)).toBe('nowplaying');
    expect(evenements, 'une playlist a été rouverte alors que le réglage est décoché').toEqual([]);
    expect(get(pendingLibraryAlbum)).toBeNull();
    expect(appels.filter((u) => /\/zones\/1(\/|\?|$)|\/playlists\/12/.test(u)),
      'décoché, le clic ne doit interroger ni la zone ni la playlist').toEqual([]);
  });
});

describe('web#1845 — réglage COCHÉ : la vignette mène à ce qui joue', () => {
  it('🔴 (b) lecture lancée depuis une playlist LOCALE → la fiche de la playlist', async () => {
    reglage(true);
    poserZone(PISTE_LOCALE, { type: 'playlist', id: '12', source: 'local' });
    routes.push([/\/playlists\/12(\?|$)/, 200, { id: 12, name: 'Du soir', track_count: 9 }]);
    await cliquer(vignette());
    expect(get(activeView)).toBe('playlists');
    expect(evenements.map((e) => e?.key)).toEqual(['playlists:12']);
    expect(get(pendingLibraryAlbum), 'la playlist prime sur l’album de la piste').toBeNull();
  });

  it('🔴 (c) lecture d’un album de la bibliothèque → la fiche de l’album', async () => {
    reglage(true);
    poserZone(PISTE_LOCALE, { type: 'album', id: '5', source: 'local' });
    routes.push([/\/zones\/1\/album-en-cours/, 200,
      { zone_id: 1, kind: 'library', service: 'local', album_id: '5', artist_id: '3', path: '/albums/5', origin: 'session_context' }]);
    await cliquer(vignette());
    expect(get(activeView)).toBe('library');
    expect(get(pendingLibraryAlbum)).toBe(5);
    expect(evenements).toEqual([]);
  });

  it('(d) repli : une RADIO mène à l’écran Lecture en cours', async () => {
    reglage(true);
    poserZone(RADIO, null);
    const v = vignette();
    await respirer();
    appels = [];
    await cliquer(v);
    expect(get(activeView)).toBe('nowplaying');
    expect(get(pendingLibraryAlbum)).toBeNull();
    expect(evenements).toEqual([]);
  });
});
