// @vitest-environment jsdom
//
// Testeur Alex, 26/10/2026, client web v1.0.0-rc8, interface en anglais.
//
// #2406 — un mauvais mot de passe Qobuz s'affichait BRUT sous le formulaire :
//
//     qobuz login: 401 {"status":"error","code":401,"message":"Invalid username\/email and password combination"}
//
// #2408 — Qobuz « Connected / Active » dans Réglages, mais la barre latérale
// ne montrait que TIDAL sous « Streaming ». L'écran ne mettait à jour que son
// état local ; la barre lit le magasin `streamingServices`, chargé une fois.
//
// Ces témoins MONTENT `SettingsV2` (et `Sidebar` pour le second) et lisent ce
// qui est rendu. Aucun mot de passe réel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import Sidebar from '../../components/v2/Sidebar.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { streamingServices } from '../stores/streaming';
import type { V2SettingsTabId } from '../v2Settings';
import { natureErreurConnexion } from '../erreurConnexionService';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hoteReglages: HTMLDivElement | null = null;
let hoteBarre: HTMLDivElement | null = null;
let montes: Record<string, unknown>[] = [];

/** Ce que le faux serveur répond à `POST /streaming/qobuz/auth`. */
let refusAuth: { status: number; type: 'json' | 'texte'; corps: string } | null = null;
let services: Record<string, any> = {};
let lectures = 0;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 12) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

function reponse(status: number, type: 'json' | 'texte', corps: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Bad Request',
    headers: new Headers({ 'Content-Type': type === 'json' ? 'application/json' : 'text/plain' }),
    text: async () => corps,
    json: async () => JSON.parse(corps),
  } as unknown as Response;
}

function serveur() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const methode = (init?.method ?? 'GET').toUpperCase();
      const json = (o: unknown) => reponse(200, 'json', JSON.stringify(o));
      if (url.includes('/streaming/qobuz/auth') && methode === 'POST') {
        if (refusAuth) return reponse(refusAuth.status, refusAuth.type, refusAuth.corps);
        services = { ...services, qobuz: { enabled: true, authenticated: true, username: 'Alex' } };
        return json({ service: 'qobuz', authenticated: true, username: 'Alex' });
      }
      if (url.includes('/streaming/qobuz/disconnect') && methode === 'POST') {
        services = { ...services, qobuz: { enabled: true, authenticated: false, username: null } };
        return json({ disconnected: true });
      }
      if (url.includes('/streaming/services')) {
        lectures++;
        return json(services);
      }
      if (url.includes('/system/health')) return json({ status: 'ok' });
      if (url.includes('/zones') || url.includes('/devices')) return json([]);
      if (url.includes('/config')) return json({});
      return json([]);
    }),
  );
}

async function monterReglages() {
  v2SettingsTarget.set({ tab: 'access' as V2SettingsTabId, section: 'streaming' });
  hoteReglages = document.createElement('div');
  document.body.appendChild(hoteReglages);
  montes.push(mount(SettingsV2, { target: hoteReglages, props: {} }));
  await souffler();
  return hoteReglages;
}

async function monterBarre() {
  hoteBarre = document.createElement('div');
  document.body.appendChild(hoteBarre);
  montes.push(mount(Sidebar as any, { target: hoteBarre }));
  await souffler();
  return hoteBarre;
}

/** Saisit identifiant et mot de passe de la carte Qobuz, puis clique « Sign in ». */
async function seConnecterQobuz(h: HTMLElement) {
  const user = h.querySelector<HTMLInputElement>('input[autocomplete="username"]');
  const pass = h.querySelector<HTMLInputElement>('input[autocomplete="current-password"]');
  expect(user && pass, 'la carte Qobuz doit offrir identifiant et mot de passe').toBeTruthy();
  user!.value = 'alex@example.org';
  user!.dispatchEvent(new Event('input', { bubbles: true }));
  pass!.value = 'pas-le-bon';
  pass!.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  pass!.closest('.inline')!.querySelector<HTMLButtonElement>('button.lnk')!.click();
  await souffler();
}

const entreeQobuz = (b: HTMLElement) => b.querySelector('button.nav.svc[data-service="qobuz"]');
const entreeTidal = (b: HTMLElement) => b.querySelector('button.nav.svc[data-service="tidal"]');

beforeEach(() => {
  locale.set('en');
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  refusAuth = null;
  lectures = 0;
  services = {
    qobuz: { enabled: true, authenticated: false, username: null },
    tidal: { enabled: true, authenticated: true, username: null },
  };
  streamingServices.set({});
  serveur();
});

afterEach(() => {
  for (const m of montes) {
    try { unmount(m); } catch { /* le démontage n'est pas le sujet */ }
  }
  montes = [];
  hoteReglages?.remove();
  hoteBarre?.remove();
  hoteReglages = hoteBarre = null;
  v2SettingsTarget.set(null);
  streamingServices.set({});
  vi.unstubAllGlobals();
});

describe('#2406 — le refus d’identifiants Qobuz se lit', () => {
  const BRUT =
    'qobuz login: 401 {"status":"error","code":401,"message":"Invalid username\\/email and password combination"}';

  it('🔴 serveur à code structuré : une phrase traduite, sans JSON', async () => {
    refusAuth = {
      status: 400,
      type: 'json',
      corps: JSON.stringify({ code: 'invalid_credentials', service: 'qobuz', error: 'qobuz: identifiants refusés' }),
    };
    const h = await monterReglages();
    await seConnecterQobuz(h);
    const erreur = h.querySelector('.serr')?.textContent?.trim();
    expect(erreur, 'aucun message affiché après un refus').toBeTruthy();
    expect(erreur).toBe('Email or password not recognised by Qobuz.');
  });

  it('🔴 serveur d’avant : le texte brut « qobuz login: 401 {…} » est reconnu aussi', async () => {
    refusAuth = { status: 400, type: 'texte', corps: BRUT };
    const h = await monterReglages();
    await seConnecterQobuz(h);
    const erreur = h.querySelector('.serr')?.textContent?.trim() ?? '';
    expect(erreur, `le JSON du service est affiché brut : « ${erreur} »`).not.toMatch(/[{}"]|401/);
    expect(erreur).toBe('Email or password not recognised by Qobuz.');
  });

  it('un autre JSON brut du service n’est jamais montré : message générique', async () => {
    refusAuth = { status: 400, type: 'texte', corps: 'qobuz login: 500 {"status":"error","code":500}' };
    const h = await monterReglages();
    await seConnecterQobuz(h);
    const erreur = h.querySelector('.serr')?.textContent?.trim() ?? '';
    expect(erreur).toBe('Could not connect.');
  });

  it('la nature se déduit du CODE d’abord, du texte ensuite', () => {
    expect(natureErreurConnexion({ code: 'invalid_credentials', message: 'x' })).toBe('identifiants');
    expect(natureErreurConnexion({ message: BRUT })).toBe('identifiants');
    expect(natureErreurConnexion({ message: 'profil introuvable' })).toBe('texte');
    expect(natureErreurConnexion({ message: 'tidal: {"error":"x"}' })).toBe('brut');
  });
});

describe('#2408 — la barre latérale suit la connexion et la déconnexion', () => {
  it('🔴 connexion Qobuz : l’entrée apparaît sous Streaming tout de suite', async () => {
    const barre = await monterBarre();
    expect(entreeTidal(barre), 'prémisse : TIDAL est connecté, donc dans la barre').not.toBeNull();
    expect(entreeQobuz(barre), 'prémisse : Qobuz n’est pas encore connecté').toBeNull();

    const h = await monterReglages();
    await seConnecterQobuz(h);

    expect(get(streamingServices).qobuz?.authenticated, 'le magasin n’a pas appris la connexion').toBe(true);
    expect(
      entreeQobuz(barre),
      'Qobuz est connecté dans Réglages mais absent de la barre latérale',
    ).not.toBeNull();
  });

  it('🔴 déconnexion : l’entrée disparaît, sans fausse alerte de session expirée', async () => {
    services = { ...services, qobuz: { enabled: true, authenticated: true, username: 'Alex' } };
    const barre = await monterBarre();
    expect(entreeQobuz(barre), 'prémisse : Qobuz connecté est dans la barre').not.toBeNull();

    const h = await monterReglages();
    const sortir = Array.from(h.querySelectorAll<HTMLButtonElement>('button.lnk.danger')).find(
      (b) => /sign out/i.test(b.textContent ?? ''),
    );
    expect(sortir, 'le bouton de déconnexion de la carte Qobuz').toBeTruthy();
    sortir!.click();
    await souffler();

    expect(entreeQobuz(barre), 'Qobuz déconnecté reste dans la barre latérale').toBeNull();
    const { expiredStreamingSession } = await import('../stores/streaming');
    expect(get(expiredStreamingSession), 'une déconnexion voulue levait « session expirée »').toBeNull();
  });
});
