// @vitest-environment jsdom
//
// Fils 2384 et 2385 (rc14) — « Changer » et « Effacer » du Client ID Spotify
// n'existaient que dans Services & Jetons. Sur la carte Spotify de Services
// de streaming, une fois un Client ID (erroné) enregistré, le champ
// disparaissait et AUCUN geste ne restait : deux testeurs bloqués.
//
// Ces témoins MONTENT `SettingsV2` (section streaming) devant un faux serveur.
// « Effacer » passe par `DELETE /services/tokens/spotify/client-id`, jamais
// par `DELETE /services/tokens/spotify`. Le Client ID employé est factice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { dialogs } from '../stores/dialogs';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import type { V2SettingsTabId } from '../v2Settings';

vi.setConfig({ testTimeout: 30_000 });

const CLIENT_ID = '0123456789abcdef0123456789abcdef';

class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let appels: { methode: string; url: string; corps: unknown }[] = [];
let ligne: Record<string, unknown> = {};

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 8) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

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

async function monterCarte() {
  locale.set('fr');
  v2SettingsTarget.set({ tab: 'access' as V2SettingsTabId, section: 'streaming' });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  await souffler();
  return hote;
}

const carte = (h: HTMLElement) => h.querySelector<HTMLElement>('[data-carte-client-id-spotify]');

beforeEach(() => {
  appels = [];
  // Le niveau où la carte Streaming est offerte, sans aller jusqu'à Expert.
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
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

describe('fils 2384/2385 — Changer et Effacer le Client ID sur la carte Spotify', () => {
  it('🔴 enregistré en base : la carte offre « Changer » et « Effacer »', async () => {
    serveur({ spotify_client_id_configure: true, spotify_client_id_source: 'db' });
    const h = await monterCarte();
    expect(carte(h), 'la carte Spotify doit offrir les gestes').toBeTruthy();
    expect(h.querySelector('[data-carte-modifier-client-id]')).toBeTruthy();
    expect(h.querySelector('[data-carte-effacer-client-id]')).toBeTruthy();
  });

  it('🔴 « Effacer » confirme en page, n’efface QUE le Client ID, puis le champ revient', async () => {
    serveur({ spotify_client_id_configure: true, spotify_client_id_source: 'db' });
    const h = await monterCarte();
    h.querySelector<HTMLButtonElement>('[data-carte-effacer-client-id]')!.click();
    await souffler();
    const boite = get(dialogs)[0];
    expect(boite?.kind, 'confirmation EN PAGE').toBe('confirm');
    dialogs.settle(boite!.id, true);
    await souffler();
    expect(appels.map((a) => `${a.methode} ${a.url.replace(/^.*\/api\/v1/, '')}`))
      .toEqual(['DELETE /services/tokens/spotify/client-id']);
    expect(carte(h)).toBeNull();
    expect(h.querySelector('[data-client-id-spotify] input'), 'le champ de saisie revient').toBeTruthy();
  });

  it('🔴 « Changer » ouvre un champ vide et enregistre le nouveau Client ID', async () => {
    serveur({ spotify_client_id_configure: true, spotify_client_id_source: 'db' });
    const h = await monterCarte();
    h.querySelector<HTMLButtonElement>('[data-carte-modifier-client-id]')!.click();
    await souffler();
    const champ = h.querySelector<HTMLInputElement>('[data-carte-saisie-client-id]');
    expect(champ).toBeTruthy();
    expect(champ!.value).toBe('');
    champ!.value = CLIENT_ID;
    champ!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    h.querySelector<HTMLButtonElement>('[data-carte-enregistrer-client-id]')!.click();
    await souffler();
    expect(appels).toEqual([
      expect.objectContaining({ methode: 'POST', corps: { client_id: CLIENT_ID } }),
    ]);
    expect(h.querySelector('[data-carte-saisie-client-id]'), 'enregistré : le champ se referme').toBeNull();
  });

  it('imposé par le serveur : aucun geste sur la carte', async () => {
    serveur({ spotify_client_id_configure: true, spotify_client_id_source: 'env' });
    const h = await monterCarte();
    expect(carte(h)).toBeNull();
  });

  it('serveur sans `spotify_client_id_source` : « Changer » seulement', async () => {
    serveur({ spotify_client_id_configure: true });
    const h = await monterCarte();
    expect(h.querySelector('[data-carte-modifier-client-id]')).toBeTruthy();
    expect(h.querySelector('[data-carte-effacer-client-id]')).toBeNull();
  });
});
