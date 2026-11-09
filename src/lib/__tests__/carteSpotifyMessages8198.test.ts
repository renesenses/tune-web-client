// @vitest-environment jsdom
//
// renesenses/tune-server-rust#8198, volet 1 — la carte Spotify de Réglages ▸
// Accès ▸ Services de streaming :
// - « Vérifier la configuration » lit `GET /streaming/spotify/diagnostic` et
//   en montre la liste lisible, chaque problème avec son geste ;
// - un serveur qui répond 404 n'affiche ni bouton ni erreur ;
// - un accès refusé (ancien jeton) se dit dès l'ouverture ;
// - un refus de connexion nommé (`spotify_*`) s'affiche traduit, pas le
//   texte brut du serveur.
//
// Ces témoins MONTENT `SettingsV2`, sur un faux serveur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import type { V2SettingsTabId } from '../v2Settings';
import { dictionnaire } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 30_000 });

const URI = 'http://127.0.0.1:8888/api/v1/streaming/spotify/callback';
const fr = dictionnaire('fr');

class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let appelsDiag = 0;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

function reponse(status: number, charge: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? 'Not Found' : status === 400 ? 'Bad Request' : 'OK',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => JSON.stringify(charge),
    json: async () => charge,
  } as unknown as Response;
}

/**
 * `diag` : le diagnostic rendu, ou `404` (serveur plus ancien).
 * `auth` : la réponse de `POST /streaming/spotify/auth`.
 */
function serveur(opts: { diag: unknown | 404; connecte?: boolean; auth?: [number, unknown] }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const methode = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/streaming/spotify/diagnostic')) {
        appelsDiag++;
        return opts.diag === 404 ? reponse(404, { error: 'not found' }) : reponse(200, opts.diag);
      }
      if (url.includes('/streaming/spotify/auth') && methode === 'POST') {
        const [s, c] = opts.auth ?? [200, { authenticated: false }];
        return reponse(s, c);
      }
      let charge: unknown = {};
      if (url.endsWith('/services/tokens')) charge = [];
      else if (url.includes('/system/env')) {
        charge = { TUNE_PORT: '8888', spotify_redirect_uri: URI, spotify_redirect_uri_refus: null, spotify_client_id_configure: true };
      } else if (url.includes('/streaming/services')) {
        charge = { spotify: { enabled: true, authenticated: !!opts.connecte, username: opts.connecte ? 'Alex' : null } };
      } else if (url.includes('/streaming/spotify/status')) {
        charge = { service: 'spotify', enabled: true, authenticated: !!opts.connecte };
      } else if (url.includes('/system/health')) charge = { status: 'ok' };
      else if (url.includes('/zones') || url.includes('/devices')) charge = [];
      return reponse(200, charge);
    }),
  );
}

async function monterCarteStreaming() {
  locale.set('fr');
  v2SettingsTarget.set({ tab: 'access' as V2SettingsTabId, section: 'streaming' });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  await souffler();
  return hote;
}

const DIAG_A_CORRIGER = {
  service: 'spotify',
  client_id: { etat: 'ok' },
  redirect_uri: { valeur: URI, etat: 'ok', relais: false },
  connexion: { etat: 'non_connecte', compte: null },
  acces_api: { etat: 'non_verifie', detail: null },
  premium: { etat: 'inconnu' },
  derniere_erreur: { code: 'spotify_code_invalide', quand: '2026-11-09T14:00:00Z' },
  a_corriger: ['non_connecte', 'spotify_code_invalide'],
};

beforeEach(() => {
  appelsDiag = 0;
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
  vi.unstubAllGlobals();
});

describe('#8198 — « Vérifier la configuration »', () => {
  it('🔴 montre la liste lisible, l’adresse à copier et chaque geste à faire', async () => {
    serveur({ diag: DIAG_A_CORRIGER });
    const h = await monterCarteStreaming();
    const bouton = h.querySelector<HTMLButtonElement>('[data-verifier-spotify]');
    expect(bouton, 'le bouton est offert quand le serveur connaît le diagnostic').toBeTruthy();
    expect(bouton!.textContent).toContain(fr['v2.spotify.diag.verifier']);
    bouton!.click();
    await souffler();

    const lignes = [...h.querySelectorAll('[data-ligne]')].map((x) => x.getAttribute('data-ligne'));
    expect(lignes).toEqual(['client_id', 'redirect_uri', 'connexion', 'acces_api', 'premium']);
    expect(h.querySelector('[data-ligne="redirect_uri"] code')?.textContent).toBe(URI);
    expect(h.querySelector('[data-copier-redirect]')).toBeTruthy();
    expect(h.querySelector('[data-ligne="premium"]')?.textContent).toContain(fr['v2.spotify.diag.premiumInconnu']);
    expect(h.querySelector('[data-a-corriger="non_connecte"]')?.textContent?.trim()).toBe(fr['v2.spotify.fix.nonConnecte']);
    expect(h.querySelector('[data-a-corriger="spotify_code_invalide"]')?.textContent?.trim()).toBe(fr['v2.spotify.err.codeInvalide']);
  });

  it('tout va bien : la carte le dit', async () => {
    serveur({
      diag: { ...DIAG_A_CORRIGER, connexion: { etat: 'connecte', compte: 'Alex' }, acces_api: { etat: 'ok' }, derniere_erreur: null, a_corriger: [] },
      connecte: true,
    });
    const h = await monterCarteStreaming();
    h.querySelector<HTMLButtonElement>('[data-verifier-spotify]')!.click();
    await souffler();
    expect(h.querySelector('[data-spotify-tout-va-bien]')).toBeTruthy();
    expect(h.querySelector('[data-spotify-acces-refuse]')).toBeNull();
  });

  it('serveur plus ancien (404) : ni bouton, ni erreur', async () => {
    serveur({ diag: 404 });
    const h = await monterCarteStreaming();
    expect(appelsDiag, 'la carte a bien sondé le diagnostic').toBeGreaterThan(0);
    expect(h.querySelector('[data-verifier-spotify]')).toBeNull();
    expect(h.querySelector('[data-verification-spotify]')).toBeNull();
    expect(h.querySelector('.serr')).toBeNull();
  });

  it('un ancien jeton refusé (compte hors User Management) se dit dès l’ouverture', async () => {
    serveur({
      diag: { ...DIAG_A_CORRIGER, connexion: { etat: 'connecte', compte: 'Alex' }, acces_api: { etat: 'compte_non_autorise' }, a_corriger: ['compte_non_autorise'] },
      connecte: true,
    });
    const h = await monterCarteStreaming();
    expect(h.querySelector('[data-spotify-acces-refuse]')?.textContent).toBe(fr['v2.spotify.err.compteNonAutorise']);
  });
});

describe('#8198 — un refus de connexion nommé, traduit', () => {
  it('🔴 « Se connecter » refusé (`spotify_client_id_absent`) : la phrase traduite, pas le texte du serveur', async () => {
    serveur({
      diag: 404,
      auth: [400, { code: 'spotify_client_id_absent', service: 'spotify', error: 'client id absent' }],
    });
    const h = await monterCarteStreaming();
    const se = [...h.querySelectorAll<HTMLButtonElement>('.svc button')].find((b) => b.textContent?.trim() === 'Se connecter');
    expect(se).toBeTruthy();
    se!.click();
    await souffler();
    const err = h.querySelector('.serr')?.textContent ?? '';
    expect(err).toBe(fr['v2.spotify.err.clientIdAbsent']);
    expect(err).not.toContain('client id absent');
  });
});
