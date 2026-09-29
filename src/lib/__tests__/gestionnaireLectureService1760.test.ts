// @vitest-environment jsdom
//
// web#1760 — LE BOUTON LECTURE ORANGE D'UNE PLAYLIST QOBUZ OU TIDAL NE FAISAIT
// RIEN (Bertrand, réunion du 28/09/2026).
//
// La grille de `PlaylistManagerView` câble le `.centre` de `PochetteActions`
// sur `lirePlaylist(item)`, qui appelait `playStreamingPlaylist(item.streaming)`
// SANS le service. Celle-ci retombait sur `pl.source || selectedService` :
//
//   · `GET /streaming/{qobuz,tidal}/playlists` ne rend AUCUN champ `source`
//     (relevé sur le .18 : `cover_path, covers, description, name, owner,
//     source_id, track_count`) ;
//   · sur la grille, `selectedService` vaut `''` (vidé par `goBack()`).
//
// D'où un `return` muet : ni requête, ni message. Les playlists de ce banc
// sont donc SANS `source`, comme le vrai serveur — le banc voisin
// `gestionnairePlaylistsCoinsPartages` en posait un, et ne pouvait pas voir le
// défaut.
//
// On MONTE l'écran, on CLIQUE le bouton, on lit ce que le faux serveur reçoit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import PlaylistManagerView from '../../components/v2-heritage/PlaylistManagerView.svelte';
import { locale } from '../i18n';
import fr from '../locales/fr';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';
import { notifications } from '../stores/notifications';
import {
  pendingPlaylistId,
  playlists,
  playlistsLoaded,
  streamingPlaylistsCache,
  streamingPlaylistsLoaded,
} from '../stores/playlists';
import { currentProfileId } from '../stores/profile';
import { currentZoneId, zones } from '../stores/zones';

vi.setConfig({ testTimeout: 60_000 });

const FR = fr as Record<string, string>;

const LOCALE = { id: 42, name: 'Nocturnes', track_count: 3 };
// 🔴 AUCUN `source` : c'est la forme exacte que rend le serveur.
const QOBUZ = { source_id: 'q-777', name: 'Matin Qobuz', track_count: 12, cover_path: null };
const TIDAL = { source_id: 't-888', name: 'Soir TIDAL', track_count: 7, cover_path: null };
const ORPHELINE = { source_id: 'x-999', name: 'Sans service', track_count: 1, cover_path: null };

/** Les services annoncés par le faux serveur — modifiable par cas. */
let services: Record<string, { authenticated: boolean }> = {};
let appels: { method: string; url: string; body: unknown }[] = [];

function corpsPour(url: string): unknown {
  if (/\/zones\/7\/play$/.test(url)) return { id: 7, name: 'Salon', state: 'playing' };
  if (url.includes('/playlist-manager/services')) return {};
  if (url.includes('/streaming/services')) return services;
  if (url.includes('/streaming/qobuz/playlists')) return [QOBUZ];
  if (url.includes('/streaming/tidal/playlists')) return [TIDAL];
  if (url.includes('/streaming//playlists')) return [ORPHELINE];
  if (/\/playlists(\?|$)/.test(url)) return [LOCALE];
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

async function monterLaGrille(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistManagerView, { target: hote, props: { onAddToPlaylist: () => {} } });
  flushSync();
  await souffler(8);
  expect(hote.querySelector('.pl-grille'), 'la grille de playlists n’est pas peinte').not.toBeNull();
  return hote;
}

function carte(el: HTMLElement, nom: string): HTMLElement {
  const c = [...el.querySelectorAll<HTMLElement>('.pl-grille > .pl-carte')].find(
    (x) => x.querySelector('.pl-nom')?.textContent?.trim() === nom,
  );
  expect(c, `aucune carte nommée « ${nom} »`).toBeDefined();
  return c!;
}

/** Le bouton lecture orange, au centre de la pochette. */
function boutonLire(c: HTMLElement): HTMLButtonElement {
  const b = c.querySelector<HTMLButtonElement>('.pl-vignette .pa button.centre');
  expect(b, 'pas de bouton lecture au centre de la pochette').not.toBeNull();
  return b!;
}

async function cliquerLire(el: HTMLElement, nom: string) {
  boutonLire(carte(el, nom)).click();
  await souffler(4);
}

const lectures = () => appels.filter((a) => a.method === 'POST' && /\/zones\/\d+\/play$/.test(a.url));
const erreurs = () => get(notifications).filter((n) => n.level === 'error').map((n) => n.message);

const ZONE = { id: 7, name: 'Salon', state: 'stopped', shuffle: false } as unknown as import('../types').Zone;

beforeEach(() => {
  appels = [];
  services = { qobuz: { authenticated: true }, tidal: { authenticated: true } };
  for (const n of get(notifications)) notifications.dismiss(n.id);
  localStorage.clear();
  locale.set('fr');
  zones.set([ZONE]);
  currentZoneId.set(7);
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
  for (const n of [...document.querySelectorAll('.fond')]) n.remove();
  pendingPlaylistId.set(null);
  currentProfileId.set(null);
  playlists.set([]);
  playlistsLoaded.set(false);
  streamingPlaylistsCache.set({});
  streamingPlaylistsLoaded.set(false);
  zones.set([]);
  currentZoneId.set(null);
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.unstubAllGlobals();
});

describe('Gestionnaire de playlists — le bouton lecture de la grille (web#1760)', () => {
  it('🔴 une playlist QOBUZ sans `source` part en lecture avec source « qobuz »', async () => {
    const el = await monterLaGrille();
    await cliquerLire(el, QOBUZ.name);
    const l = lectures();
    expect(l.length, 'le clic sur la playlist Qobuz n’a envoyé AUCUNE requête de lecture').toBe(1);
    expect(l[0].url).toMatch(/\/zones\/7\/play$/);
    expect(l[0].body).toEqual({ source: 'qobuz', streaming_playlist_id: 'q-777' });
    expect(erreurs()).toEqual([]);
  });

  it('🔴 une playlist TIDAL sans `source` part en lecture avec source « tidal »', async () => {
    const el = await monterLaGrille();
    await cliquerLire(el, TIDAL.name);
    const l = lectures();
    expect(l.length, 'le clic sur la playlist TIDAL n’a envoyé AUCUNE requête de lecture').toBe(1);
    expect(l[0].body).toEqual({ source: 'tidal', streaming_playlist_id: 't-888' });
  });

  it('une playlist de la BIBLIOTHÈQUE part toujours par son identifiant', async () => {
    const el = await monterLaGrille();
    await cliquerLire(el, LOCALE.name);
    const l = lectures();
    expect(l.length, 'le clic sur la playlist locale n’a envoyé aucune requête').toBe(1);
    expect(l[0].body).toEqual({ playlist_id: 42 });
  });

  it('🔴 un service INTROUVABLE se dit par un message, sans requête de lecture', async () => {
    // Une entrée de service dont la clé est vide : ni `item.service`, ni
    // `source`, ni `selectedService` ne désignent un service.
    services = { '': { authenticated: true } };
    const el = await monterLaGrille();
    await cliquerLire(el, ORPHELINE.name);
    expect(lectures().length, 'une lecture est partie sans service').toBe(0);
    expect(erreurs(), 'échec muet : aucun message pour un service inconnu').toContain(
      FR['playlistManager.unknownSource'],
    );
  });

  it('sans zone choisie, le clic le DIT au lieu de ne rien faire', async () => {
    currentZoneId.set(null);
    zones.set([]);
    const el = await monterLaGrille();
    await cliquerLire(el, QOBUZ.name);
    expect(lectures().length).toBe(0);
    expect(erreurs()).toContain(FR['library.noZoneSelected']);
  });

  it('la clé nouvelle existe dans les onze langues', () => {
    for (const l of ONZE_LANGUES) {
      expect(dictionnaire(l)['playlistManager.unknownSource'], `${l} : playlistManager.unknownSource manquante`).toBeTruthy();
    }
  });
});
