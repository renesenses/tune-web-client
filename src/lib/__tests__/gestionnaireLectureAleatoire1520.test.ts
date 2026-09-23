// @vitest-environment jsdom
//
// web#1520 — JPierre, fil 1903 (Windows, 0.9.162), 23/09/2026 : « Les
// Playlists (personnelles donc en local) n'ont pas de bouton "lecture
// Aléatoire" ».
//
// #1947 avait posé « Lecture aléatoire » dans `PlaylistDetailV2`, l'overlay
// ouvert depuis `PlaylistsV2`. L'entrée « Playlists » de la barre latérale
// monte un AUTRE écran, le gestionnaire hérité, dont la barre `detail-actions`
// n'offrait que « Lire ». Ce fichier MONTE ce gestionnaire (jsdom) et tient :
//
//   1. « Lire » et « Lecture aléatoire » sont tous deux dans l'en-tête ;
//   2. « Lire » lance la playlist par son identifiant (`playlist_id`) ;
//   3. « Lecture aléatoire » passe par `lireListeAleatoire` — la liste
//      mélangée part en `track_ids`, et le drapeau `shuffle` de la zone
//      n'est PAS touché (arbitrage de #1947 / #2055).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, type Component } from 'svelte';
import PlaylistManagerView from '../../components/v2-heritage/PlaylistManagerView.svelte';
import { locale } from '../i18n';
import fr from '../locales/fr';
import { preferences } from '../stores/preferences';
import {
  pendingPlaylistId,
  playlists,
  playlistsLoaded,
  streamingPlaylistsCache,
  streamingPlaylistsLoaded,
} from '../stores/playlists';
import { currentProfileId } from '../stores/profile';
import { currentZoneId, zones } from '../stores/zones';
import type { Track } from '../types';

// Monter un écran de plus de quatre mille lignes compile beaucoup : 5 s
// donneraient un rouge de CHARGE, pas de code.
vi.setConfig({ testTimeout: 60_000 });

const FR = fr as Record<string, string>;
const PISTES: Track[] = [
  { id: 101, title: 'Première', artist_name: 'A', album_title: 'X', duration_ms: 1000, source: 'local' } as Track,
  { id: 102, title: 'Deuxième', artist_name: 'B', album_title: 'X', duration_ms: 2000, source: 'local' } as Track,
  { id: 103, title: 'Troisième', artist_name: 'C', album_title: 'X', duration_ms: 3000, source: 'local' } as Track,
];

/** Ce que le faux serveur a reçu : la méthode, l'URL et le corps. */
let appels: { method: string; url: string; body: unknown }[] = [];

function corpsPour(url: string): unknown {
  if (url.includes('/playlists/42/tracks')) return PISTES;
  if (/\/playlists(\?|$)/.test(url)) return [{ id: 42, name: 'Nocturnes', track_count: 3 }];
  return [];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 4) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

async function monter<P extends Record<string, unknown>>(Vue: Component<P>, props: P) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(Vue, { target: hote, props });
  flushSync();
  await souffler();
  return hote;
}

/** La fiche de la playlist 42, ouverte : `loadAll()` lit `pendingPlaylistId`. */
async function monterLaFiche() {
  pendingPlaylistId.set(42);
  const el = await monter(PlaylistManagerView, { onAddToPlaylist: () => {} });
  await souffler(6);
  expect(appels.some((a) => a.url.includes('/playlists/42/tracks')), 'la fiche n’a pas chargé ses pistes').toBe(true);
  return el;
}

const lignes = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('.track-list [role="row"].trow'));
const poignees = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLButtonElement>('.poignee'));
const dernierAppel = (motif: RegExp) => [...appels].reverse().find((a) => motif.test(`${a.method} ${a.url}`));

beforeEach(() => {
  appels = [];
  localStorage.clear();
  locale.set('fr');
  // Expert rend le TABLEAU (`MODES_BRANCHES`) : c'est la forme qu'ont les
  // fiches de playlist ; le mode lignes est éprouvé à part, plus bas.
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown = null;
      try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { body = init?.body; }
      appels.push({ method: (init?.method ?? 'GET').toUpperCase(), url: String(url), body });
      const corps = corpsPour(String(url));
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps,
        text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  pendingPlaylistId.set(null);
  currentProfileId.set(null);
  playlists.set([]);
  playlistsLoaded.set(false);
  streamingPlaylistsCache.set({});
  streamingPlaylistsLoaded.set(false);
  vi.unstubAllGlobals();
});

const ZONE = { id: 7, name: 'Salon', state: 'stopped', shuffle: false } as unknown as import('../types').Zone;

const enTete = (el: HTMLElement) => el.querySelector<HTMLElement>('.detail-actions');
const appelsDeLecture = () => appels.filter((a) => a.method === 'POST' && /\/zones\/7\/play$/.test(a.url));

describe('Gestionnaire de playlists — Lire et Lecture aléatoire (web#1520)', () => {
  beforeEach(() => {
    zones.set([ZONE]);
    currentZoneId.set(7);
  });
  afterEach(() => {
    zones.set([]);
    currentZoneId.set(null);
    vi.restoreAllMocks();
  });

  it('🔴 l’en-tête du détail porte « Lire » ET « Lecture aléatoire »', async () => {
    const el = await monterLaFiche();
    const barre = enTete(el);
    expect(barre, 'pas de barre detail-actions').not.toBeNull();
    const libelles = Array.from(barre!.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(libelles, 'pas de bouton Lire').toContain(FR['common.play']);
    expect(libelles, 'pas de bouton Lecture aléatoire').toContain(FR['library.shuffle']);
  });

  it('« Lire » lance la playlist par son identifiant', async () => {
    const el = await monterLaFiche();
    enTete(el)!.querySelector<HTMLButtonElement>('.play-all-btn')!.click();
    await souffler();
    const lectures = appelsDeLecture();
    expect(lectures.length, 'aucun appel de lecture').toBe(1);
    expect(lectures[0].body).toEqual({ playlist_id: 42 });
  });

  it('🔴 « Lecture aléatoire » envoie la liste MÉLANGÉE et ne touche pas le drapeau shuffle', async () => {
    // Math.random = 0 : Fisher-Yates échange toujours avec le rang 0, la
    // permutation est connue et différente de l'ordre de la playlist.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const el = await monterLaFiche();
    const bouton = Array.from(enTete(el)!.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === FR['library.shuffle'],
    );
    expect(bouton, 'pas de bouton Lecture aléatoire').toBeDefined();
    bouton!.click();
    await souffler();
    const lectures = appelsDeLecture();
    expect(lectures.length, 'aucun appel de lecture').toBe(1);
    const corps = lectures[0].body as { track_ids?: number[]; playlist_id?: number };
    expect(corps.playlist_id, 'l’aléatoire ne doit pas relancer la playlist dans son ordre').toBeUndefined();
    expect([...(corps.track_ids ?? [])].sort()).toEqual([101, 102, 103]);
    expect(corps.track_ids, 'la liste est partie dans son ordre : rien n’a été mélangé').not.toEqual([101, 102, 103]);
    expect(appels.some((a) => /\/zones\/7\/shuffle/.test(a.url)), 'le drapeau shuffle de la zone a été touché').toBe(false);
  });
});
