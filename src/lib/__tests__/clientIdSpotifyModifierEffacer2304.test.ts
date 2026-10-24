// @vitest-environment jsdom
//
// web#2304 (fils 2384 et 2385, rc7 Windows) — « J'ai rentré une mauvaise id
// pour Spotify, comment réparer cette erreur ? ». Un Client ID enregistré ne
// se corrigeait ni ne s'effaçait : la ligne Spotify de Services & Jetons
// arrivait avec `fields: []`, donc sans bouton, et le champ de la carte
// Streaming disparaît dès qu'un Client ID est posé.
//
// Ces témoins MONTENT `SettingsV2` (section Services & Jetons) devant un faux
// serveur. « Effacer » doit passer par `DELETE /services/tokens/spotify/client-id`
// (tune-server-rust#6777), JAMAIS par `DELETE /services/tokens/spotify`, qui
// emporte toutes les clés `spotify_*`. Le Client ID employé est factice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { dialogs } from '../stores/dialogs';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import type { V2SettingsTabId } from '../v2Settings';
import { gestesClientIdSpotify } from '../clientIdSpotify';
import lFr from '../locales/fr';

vi.setConfig({ testTimeout: 30_000 });

const fr = lFr as unknown as Record<string, string>;
const CLIENT_ID = '0123456789abcdef0123456789abcdef';

class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 8) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

let appels: { methode: string; url: string; corps: unknown }[] = [];
let ligne: Record<string, unknown> = {};

function serveur(depart: Record<string, unknown>) {
  ligne = { id: 'spotify', name: 'Spotify', kind: 'oauth', configured: false, fields: [], ...depart };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const methode = (init?.method ?? 'GET').toUpperCase();
      let charge: unknown = {};
      if (url.includes('/services/tokens/spotify/client-id') && methode === 'DELETE') {
        appels.push({ methode, url, corps: null });
        ligne = { ...ligne, spotify_client_id_configure: false, spotify_client_id_source: null };
        charge = { ok: true, spotify_client_id_configure: false, spotify_client_id_source: null };
      } else if (url.includes('/services/tokens/spotify') && methode !== 'GET') {
        appels.push({ methode, url, corps: init?.body ? JSON.parse(String(init.body)) : null });
        if (methode === 'POST') {
          ligne = { ...ligne, spotify_client_id_configure: true };
          charge = { valid: true, etat: 'enregistre', spotify_client_id_configure: true, validation_message: 'ok' };
        }
      } else if (url.endsWith('/services/tokens')) {
        charge = [ligne];
      } else if (url.includes('/system/env')) {
        charge = { TUNE_PORT: '8888', spotify_client_id_configure: ligne.spotify_client_id_configure };
      } else if (url.includes('/streaming/services')) {
        charge = { spotify: { enabled: true, authenticated: false } };
      } else if (url.includes('/streaming/spotify/status')) {
        charge = { service: 'spotify', enabled: true, authenticated: false };
      } else if (url.includes('/system/health')) charge = { status: 'ok' };
      else if (url.includes('/zones') || url.includes('/devices')) charge = [];
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => JSON.stringify(charge),
        json: async () => charge,
      } as unknown as Response;
    }),
  );
}

async function monterJetons() {
  locale.set('fr');
  v2SettingsTarget.set({ tab: 'access' as V2SettingsTabId, section: 'tokens' });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  await souffler();
  return hote;
}

const bloc = (h: HTMLElement) => h.querySelector<HTMLElement>('[data-spotify-client-id]');

beforeEach(() => {
  appels = [];
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  v2SettingsTarget.set(null);
  for (const r of get(dialogs)) dialogs.settle(r.id, null);
  vi.unstubAllGlobals();
});

describe('web#2304 — Services & Jetons : corriger ou effacer le Client ID Spotify', () => {
  it('🔴 enregistré en base : « Effacer » confirme en page puis n’efface QUE le Client ID', async () => {
    serveur({ spotify_client_id_configure: true, spotify_client_id_source: 'db' });
    const h = await monterJetons();
    expect(bloc(h), 'la ligne Spotify doit offrir un geste').toBeTruthy();
    expect(bloc(h)!.textContent).toContain(fr['v2.set.spotifyClientIdStored']);
    expect(h.querySelector('[data-modifier-client-id]')).toBeTruthy();
    const effacer = h.querySelector<HTMLButtonElement>('[data-effacer-client-id]');
    expect(effacer, '« Effacer » doit être offert').toBeTruthy();

    effacer!.click();
    await souffler();
    const boite = get(dialogs)[0];
    expect(boite?.kind, 'confirmation EN PAGE').toBe('confirm');
    dialogs.settle(boite!.id, true);
    await souffler();

    expect(appels.map((a) => `${a.methode} ${a.url.replace(/^.*\/api\/v1/, '')}`))
      .toEqual(['DELETE /services/tokens/spotify/client-id']);
    // La ligne relue ne porte plus de Client ID : plus de geste à offrir.
    expect(bloc(h)).toBeNull();
  });

  it('refuser la confirmation n’efface rien', async () => {
    serveur({ spotify_client_id_configure: true, spotify_client_id_source: 'db' });
    const h = await monterJetons();
    h.querySelector<HTMLButtonElement>('[data-effacer-client-id]')!.click();
    await souffler();
    dialogs.settle(get(dialogs)[0]!.id, false);
    await souffler();
    expect(appels).toEqual([]);
  });

  it('« Modifier » rouvre le champ, VIDE, et enregistre le nouveau Client ID', async () => {
    serveur({ spotify_client_id_configure: true, spotify_client_id_source: 'db' });
    const h = await monterJetons();
    h.querySelector<HTMLButtonElement>('[data-modifier-client-id]')!.click();
    await souffler();
    const champ = h.querySelector<HTMLInputElement>('[data-saisie-client-id]');
    expect(champ, 'le champ revient').toBeTruthy();
    expect(champ!.value).toBe('');
    champ!.value = CLIENT_ID;
    champ!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    h.querySelector<HTMLButtonElement>('[data-enregistrer-client-id]')!.click();
    await souffler();
    expect(appels).toEqual([
      expect.objectContaining({ methode: 'POST', corps: { client_id: CLIENT_ID } }),
    ]);
    expect(h.querySelector('[data-saisie-client-id]'), 'enregistré : le champ se referme').toBeNull();
  });

  it('imposé par le serveur : on le dit, sans geste', async () => {
    serveur({ spotify_client_id_configure: true, spotify_client_id_source: 'env' });
    const h = await monterJetons();
    expect(bloc(h)!.textContent).toContain(fr['v2.set.spotifyClientIdImposed']);
    expect(h.querySelector('[data-modifier-client-id]')).toBeNull();
    expect(h.querySelector('[data-effacer-client-id]')).toBeNull();
  });

  it('serveur sans `spotify_client_id_source` : « Modifier » seulement, jamais l’ancienne route qui efface tout', async () => {
    serveur({ spotify_client_id_configure: true });
    const h = await monterJetons();
    expect(h.querySelector('[data-modifier-client-id]')).toBeTruthy();
    expect(h.querySelector('[data-effacer-client-id]')).toBeNull();
  });
});

describe('web#2304 — gestesClientIdSpotify', () => {
  it('les quatre cas', () => {
    expect(gestesClientIdSpotify({ spotify_client_id_configure: false })).toBeNull();
    expect(gestesClientIdSpotify(null)).toBeNull();
    expect(gestesClientIdSpotify({ spotify_client_id_configure: true, spotify_client_id_source: 'db' }))
      .toEqual({ cle: 'v2.set.spotifyClientIdStored', modifier: true, effacer: true });
    expect(gestesClientIdSpotify({ spotify_client_id_configure: true, spotify_client_id_source: 'config' }))
      .toEqual({ cle: 'v2.set.spotifyClientIdImposed', modifier: false, effacer: false });
    expect(gestesClientIdSpotify({ spotify_client_id_configure: true }))
      .toEqual({ cle: 'v2.set.spotifyClientIdConfigured', modifier: true, effacer: false });
  });
});
