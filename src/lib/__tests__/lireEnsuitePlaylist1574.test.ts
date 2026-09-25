// @vitest-environment jsdom
//
// #1574 — FabienM, fil 1924, 24/09/2026 : « Reprendre la fonction "Lire
// ensuite" d'un titre et la proposer sur un album et une playlist sous forme
// d'un bouton. […] insérer l'album ou la playlist dans la file de lecture en
// 2eme position (après le titre en cours) ».
//
// La fiche album l'avait depuis le 06/09. La fiche playlist (`PlaylistDetailV2`)
// et le gestionnaire (`PlaylistManagerView`, monté par l'entrée « Playlists »
// de la barre latérale) n'offraient que Lire / Aléatoire (/ Ajouter à la file).
//
// Ce fichier MONTE les deux écrans (jsdom) et tient :
//
//   1. le bouton « Lire ensuite » est dans l'en-tête ;
//   2. un clic envoie UNE requête `POST /zones/{id}/queue/add` au rang
//      `queuePosition + 1`, la liste entière dans l'ordre ;
//   3. playlist de SERVICE : les pistes sans `id` local partent en `tracks[]`
//      (paire `source` + `source_id`) — pas une requête vide ;
//   4. une seule règle de rang : `rangLireEnsuite`, partagée avec l'album et
//      la piste.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync, mount, unmount, type Component } from 'svelte';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
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
import { queuePosition } from '../stores/queue';
import { currentZoneId, zones } from '../stores/zones';
import type { Track } from '../types';

vi.setConfig({ testTimeout: 60_000 });

const FR = fr as Record<string, string>;
const LIRE_ENSUITE = FR['v2.album.playNext'];

const LOCALES: Track[] = [
  { id: 101, title: 'Première', artist_name: 'A', album_title: 'X', duration_ms: 1000, source: 'local' } as Track,
  { id: 102, title: 'Deuxième', artist_name: 'B', album_title: 'X', duration_ms: 2000, source: 'local' } as Track,
  { id: 103, title: 'Troisième', artist_name: 'C', album_title: 'X', duration_ms: 3000, source: 'local' } as Track,
];
/** Ce que rend `/streaming/qobuz/playlists/…/tracks` : aucun `id` local. */
const QOBUZ = [
  { source_id: 'q1', title: 'Un', artist_name: 'Q', album_title: 'Y', duration_ms: 1000 },
  { source_id: 'q2', title: 'Deux', artist_name: 'Q', album_title: 'Y', duration_ms: 2000 },
];

let appels: { method: string; url: string; body: unknown }[] = [];

function corpsPour(url: string): unknown {
  if (url.includes('/playlists/42/tracks')) return LOCALES;
  if (url.includes('/streaming/qobuz/playlists/pq/tracks')) return QOBUZ;
  if (/\/playlists(\?|$)/.test(url)) return [{ id: 42, name: 'Nocturnes', track_count: 3 }];
  if (/\/queue\/add$/.test(url)) return { queue_length: 10 };
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
  await souffler(6);
  return hote;
}

const ajouts = () => appels.filter((a) => a.method === 'POST' && /\/zones\/7\/queue\/add$/.test(a.url));
const boutonLireEnsuite = (racine: HTMLElement | null) =>
  Array.from(racine?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (b) => b.textContent?.trim() === LIRE_ENSUITE,
  );

const ZONE = { id: 7, name: 'Salon', state: 'playing', shuffle: false } as unknown as import('../types').Zone;

beforeEach(() => {
  appels = [];
  localStorage.clear();
  locale.set('fr');
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
  zones.set([ZONE]);
  currentZoneId.set(7);
  // Le titre en cours est le QUATRIÈME de la file (rang 3) : « Lire ensuite »
  // doit insérer au rang 4.
  queuePosition.set(3);
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
  zones.set([]);
  currentZoneId.set(null);
  queuePosition.set(0);
  vi.unstubAllGlobals();
});

describe('Fiche playlist — « Lire ensuite » (#1574)', () => {
  it('🔴 playlist LOCALE : le bouton existe et insère toute la liste au rang queuePosition + 1', async () => {
    const el = await monter(PlaylistDetailV2, {
      item: { kind: 'local', pl: { id: 42, name: 'Nocturnes', track_count: 3 } as any },
      onClose: () => {},
    });
    const b = boutonLireEnsuite(el.querySelector('.actions'));
    expect(b, 'pas de bouton « Lire ensuite » dans l’en-tête de la fiche playlist').toBeDefined();
    b!.click();
    await souffler();
    const a = ajouts();
    expect(a.length, 'une requête, pas une par piste').toBe(1);
    expect(a[0].body).toEqual({ track_ids: [101, 102, 103], position: 4 });
  });

  it('🔴 playlist de SERVICE : les pistes sans id local partent en tracks[], au même rang', async () => {
    const el = await monter(PlaylistDetailV2, {
      item: { kind: 'streaming', service: 'qobuz', pl: { source_id: 'pq', name: 'Qobuz Jazz' } as any },
      onClose: () => {},
    });
    const b = boutonLireEnsuite(el.querySelector('.actions'));
    expect(b, 'pas de bouton « Lire ensuite » sur une playlist de service').toBeDefined();
    b!.click();
    await souffler();
    const a = ajouts();
    expect(a.length, 'rien envoyé pour une playlist de service').toBe(1);
    const corps = a[0].body as { track_ids?: number[]; tracks?: { source: string; source_id: string }[]; position?: number };
    expect(corps.position).toBe(4);
    expect(corps.track_ids).toBeUndefined();
    expect(corps.tracks?.map((t) => [t.source, t.source_id])).toEqual([['qobuz', 'q1'], ['qobuz', 'q2']]);
  });

  it('« Ajouter à la file » d’une playlist de service n’est plus une requête perdue (sans rang)', async () => {
    const el = await monter(PlaylistDetailV2, {
      item: { kind: 'streaming', service: 'qobuz', pl: { source_id: 'pq', name: 'Qobuz Jazz' } as any },
      onClose: () => {},
    });
    const b = Array.from(el.querySelectorAll<HTMLButtonElement>('.actions button')).find(
      (x) => x.textContent?.trim() === FR['v2.ms.addToQueue'],
    );
    b!.click();
    await souffler();
    const a = ajouts();
    expect(a.length).toBe(1);
    const corps = a[0].body as { tracks?: unknown[]; position?: number };
    expect(corps.tracks?.length).toBe(2);
    expect(corps).not.toHaveProperty('position');
  });
});

describe('Gestionnaire de playlists — « Lire ensuite » (#1574)', () => {
  it('🔴 l’en-tête du détail porte « Lire ensuite », qui insère au rang queuePosition + 1', async () => {
    pendingPlaylistId.set(42);
    const el = await monter(PlaylistManagerView, { onAddToPlaylist: () => {} });
    await souffler(6);
    expect(appels.some((a) => a.url.includes('/playlists/42/tracks')), 'la fiche n’a pas chargé ses pistes').toBe(true);
    const b = boutonLireEnsuite(el.querySelector('.detail-actions'));
    expect(b, 'pas de bouton « Lire ensuite » dans le gestionnaire').toBeDefined();
    b!.click();
    await souffler();
    const a = ajouts();
    expect(a.length).toBe(1);
    expect(a[0].body).toEqual({ track_ids: [101, 102, 103], position: 4 });
  });
});

describe('Une seule règle de rang (#1574)', () => {
  const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
  it('toutes les surfaces « Lire ensuite » passent par rangLireEnsuite, aucune ne recopie queuePosition + 1', () => {
    for (const f of [
      'src/components/v2/AlbumDetailV2.svelte',
      'src/components/v2/PisteActions.svelte',
      'src/components/partages/MenuPisteV1.svelte',
      'src/components/v2/PlaylistDetailV2.svelte',
      'src/components/v2-heritage/PlaylistManagerView.svelte',
    ]) {
      const src = lire(f);
      expect(src.indexOf('rangLireEnsuite()'), `${f} n’appelle pas rangLireEnsuite`).toBeGreaterThan(-1);
      expect(src, `${f} recopie la règle`).not.toMatch(/queuePosition\)\s*\+\s*1/);
    }
  });
});
