// @vitest-environment jsdom
//
// renesenses/tune-server-rust#8198, volet 3 — la carte Spotify montée :
// - l'assistant en 4 écrans s'ouvre quand il manque le Client ID, se saute ;
// - l'interrupteur « Retour automatique par mozaiklabs.fr » est DÉCOCHÉ par
//   défaut, rien ne l'active seul, et un serveur sans relais (404) le masque ;
// - relais actif : « Se connecter » envoie `origine`, l'adresse à déclarer
//   devient celle du relais, et le champ de collage passe en repli.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import type { V2SettingsTabId } from '../v2Settings';
import { relaisSpotify, RELAIS_INCONNU } from '../relaisSpotify';
import { CLE_SAUT } from '../assistantSpotify';
import { dictionnaire } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 30_000 });

const URI = 'http://127.0.0.1:8888/api/v1/streaming/spotify/callback';
const RELAIS = 'https://mozaiklabs.fr/spotify-callback';
const fr = dictionnaire('fr');

class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let puts: unknown[] = [];
let auths: unknown[] = [];

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
    statusText: status === 404 ? 'Not Found' : 'OK',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => JSON.stringify(charge),
    json: async () => charge,
  } as unknown as Response;
}

function serveur(opts: { relais: boolean | 404; clientIdManque?: boolean }) {
  let actif = opts.relais === true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const methode = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/streaming/spotify/relais')) {
        if (opts.relais === 404) return reponse(404, { error: 'not found' });
        if (methode === 'PUT') {
          const corps = JSON.parse(String(init?.body));
          puts.push(corps);
          actif = corps.actif === true;
        }
        return reponse(200, { actif, redirect_uri: RELAIS });
      }
      if (url.includes('/streaming/spotify/auth') && methode === 'POST') {
        auths.push(init?.body ? JSON.parse(String(init.body)) : null);
        return reponse(200, { authenticated: false, verification_url: 'https://accounts.spotify.com/authorize?x=1' });
      }
      let charge: unknown = {};
      if (url.endsWith('/services/tokens')) charge = [];
      else if (url.includes('/system/env')) {
        // `spotify_redirect_uri` ne change PAS quand le relais est actif.
        charge = { TUNE_PORT: '8888', spotify_redirect_uri: URI, spotify_redirect_uri_refus: null, spotify_client_id_configure: !opts.clientIdManque };
      } else if (url.includes('/streaming/services')) charge = { spotify: { enabled: true, authenticated: false } };
      else if (url.includes('/streaming/spotify/status')) charge = { service: 'spotify', enabled: true, authenticated: false };
      else if (url.includes('/system/health')) charge = { status: 'ok' };
      else if (url.includes('/zones') || url.includes('/devices')) charge = [];
      return reponse(200, charge);
    }),
  );
}

async function monter() {
  locale.set('fr');
  v2SettingsTarget.set({ tab: 'access' as V2SettingsTabId, section: 'streaming' });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  await souffler();
  return hote;
}

function cliquer(h: HTMLElement, sel: string) {
  const b = h.querySelector<HTMLElement>(sel);
  expect(b, sel).toBeTruthy();
  b!.click();
  flushSync();
}

beforeEach(() => {
  puts = [];
  auths = [];
  relaisSpotify.set(RELAIS_INCONNU);
  try { localStorage.removeItem(CLE_SAUT); } catch {}
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

describe('#8198 — l’assistant pas à pas', () => {
  it('🔴 sans Client ID : quatre écrans, valeurs à copier, adresse du serveur, Premium et 5 utilisateurs', async () => {
    serveur({ relais: false, clientIdManque: true });
    const h = await monter();
    const a = () => h.querySelector('[data-assistant-spotify]');
    expect(a()?.getAttribute('data-etape')).toBe('1');
    expect(h.querySelector('[data-assistant-dashboard]')?.getAttribute('href')).toBe('https://developer.spotify.com/dashboard');
    expect(h.querySelector('[data-assistant-guide]')?.getAttribute('href')).toBe('https://mozaiklabs.fr/docs/spotify');
    expect(a()?.textContent).toContain('Web API');

    cliquer(h, '[data-assistant-suivant]');
    expect(a()?.getAttribute('data-etape')).toBe('2');
    expect(h.querySelector('[data-assistant-adresse]')?.textContent).toBe(URI);
    expect(h.querySelector('[data-assistant-copier-adresse]')).toBeTruthy();

    cliquer(h, '[data-assistant-suivant]');
    expect(h.querySelector('[data-assistant-premium]')?.textContent).toBe(fr['v2.spotify.asst.e3Premium']);

    cliquer(h, '[data-assistant-suivant]');
    expect(a()?.getAttribute('data-etape')).toBe('4');
    expect(h.querySelector('[data-assistant-suivant]'), 'pas de « Suivant » au dernier écran').toBeNull();
    expect(h.querySelector('[data-client-id-spotify] input'), 'le champ Client ID est juste en dessous').toBeTruthy();
  });

  it('« J’ai déjà mon Client ID » replie l’assistant, et le lien le rouvre', async () => {
    serveur({ relais: false, clientIdManque: true });
    const h = await monter();
    cliquer(h, '[data-assistant-sauter]');
    expect(h.querySelector('[data-assistant-spotify]')).toBeNull();
    cliquer(h, '[data-assistant-ouvrir]');
    expect(h.querySelector('[data-assistant-spotify]')?.getAttribute('data-etape')).toBe('1');
  });

  it('avec un Client ID configuré, l’assistant reste replié derrière son lien', async () => {
    serveur({ relais: false, clientIdManque: false });
    const h = await monter();
    expect(h.querySelector('[data-assistant-spotify]')).toBeNull();
    expect(h.querySelector('[data-assistant-ouvrir]')).toBeTruthy();
  });
});

describe('#8198 — l’option relais', () => {
  it('🔴 décochée par défaut, aucune écriture tant qu’on n’y touche pas ; « Se connecter » sans origine', async () => {
    serveur({ relais: false });
    const h = await monter();
    const boite = h.querySelector<HTMLInputElement>('[data-relais-interrupteur]');
    expect(boite, 'l’option est offerte par un serveur récent').toBeTruthy();
    expect(boite!.checked).toBe(false);
    expect(puts, 'rien ne l’active tout seul').toEqual([]);
    const se = [...h.querySelectorAll<HTMLButtonElement>('.svc button')].find((b) => b.textContent?.trim() === 'Se connecter');
    se!.click();
    await souffler();
    expect(auths).toHaveLength(1);
    expect(JSON.stringify(auths[0] ?? {})).not.toContain('origine');
  });

  it('activée par l’utilisateur : PUT, adresse du relais à déclarer, `origine` envoyée, collage en repli', async () => {
    serveur({ relais: false, clientIdManque: true });
    const h = await monter();
    const boite = h.querySelector<HTMLInputElement>('[data-relais-interrupteur]')!;
    boite.checked = true;
    boite.dispatchEvent(new Event('change', { bubbles: true }));
    await souffler();
    expect(puts).toEqual([{ actif: true }]);
    expect(h.querySelector('[data-relais-adresse]')?.textContent).toBe(RELAIS);
    expect(h.textContent, 'l’adresse 127.0.0.1 n’est plus celle qu’on demande de déclarer').not.toContain(fr['v2.set.spotifyRedirectDeclare']);
    cliquer(h, '[data-assistant-suivant]');
    expect(h.querySelector('[data-assistant-adresse]')?.textContent).toBe(RELAIS);
  });

  it('relais déjà actif : `origine: location.origin` part avec « Se connecter », le collage reste en repli', async () => {
    serveur({ relais: true });
    const h = await monter();
    const se = [...h.querySelectorAll<HTMLButtonElement>('.svc button')].find((b) => b.textContent?.trim() === 'Se connecter');
    se!.click();
    await souffler();
    expect(auths).toEqual([{ origine: location.origin }]);
    const repli = h.querySelector('[data-spotify-repli]');
    expect(repli, 'le champ de collage reste offert, replié').toBeTruthy();
    expect(repli?.querySelector('summary')?.textContent).toBe(fr['v2.spotify.relais.repli']);
    expect(repli?.querySelector('input')).toBeTruthy();
  });

  it('serveur sans relais (404) : ni interrupteur, ni erreur', async () => {
    serveur({ relais: 404 });
    const h = await monter();
    expect(h.querySelector('[data-relais-spotify]')).toBeNull();
    expect(h.querySelector('.serr')).toBeNull();
  });
});
