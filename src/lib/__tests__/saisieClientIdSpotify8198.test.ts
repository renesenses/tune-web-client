// @vitest-environment jsdom
//
// renesenses/tune-server-rust#8198, volet 1 — le Client ID Spotify est vérifié
// AVANT tout envoi (vu en direct le 09/11/2026 : « INVALID_CLIENT » parce
// qu'autre chose que le Client ID avait été collé). L'identifiant de
// l'adresse du tableau de bord N'EST PAS le Client ID : rien n'en est extrait.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import type { V2SettingsTabId } from '../v2Settings';
import { analyserClientIdSpotify } from '../saisieClientIdSpotify';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 30_000 });

const ID = '0123456789abcdef0123456789ABCDEF';

describe('#8198 — analyserClientIdSpotify', () => {
  it('32 caractères hexadécimaux : accepté', () => {
    expect(analyserClientIdSpotify(ID)).toEqual({ etat: 'ok', clientId: ID });
  });

  it('espaces autour tolérés', () => {
    expect(analyserClientIdSpotify(`  ${ID}\n`)).toEqual({ etat: 'ok', clientId: ID });
  });

  it('🔴 adresse du tableau de bord, avec ou sans identifiant ni suite : refusée, rien n’est extrait', () => {
    for (const a of [
      'https://developer.spotify.com/dashboard',
      `https://developer.spotify.com/dashboard/${ID}`,
      `https://developer.spotify.com/dashboard/${ID}/settings`,
      `developer.spotify.com/dashboard/${ID}/users`,
      ` http://developer.spotify.com/dashboard/${ID}?tab=1 `,
    ]) {
      expect(analyserClientIdSpotify(a), a).toEqual({ etat: 'adresse_tableau_de_bord' });
    }
  });

  it('autre adresse refusée', () => {
    expect(analyserClientIdSpotify(`https://example.com/dashboard/${ID}`).etat).toBe('invalide');
    expect(analyserClientIdSpotify('http://127.0.0.1:8888/api/v1/streaming/spotify/callback?code=abc').etat).toBe('invalide');
  });

  it('longueur fausse refusée', () => {
    expect(analyserClientIdSpotify(ID.slice(1)).etat).toBe('invalide');
    expect(analyserClientIdSpotify(`${ID}a`).etat).toBe('invalide');
  });

  it('caractères non hexadécimaux refusés', () => {
    expect(analyserClientIdSpotify('g123456789abcdef0123456789abcdef').etat).toBe('invalide');
    expect(analyserClientIdSpotify('0123456789abcdef 123456789abcdef').etat).toBe('invalide');
  });

  it('vide : rien à faire', () => {
    expect(analyserClientIdSpotify('   ').etat).toBe('vide');
    expect(analyserClientIdSpotify(null).etat).toBe('vide');
  });

  it('la phrase existe dans les quinze langues et renvoie à Basic Information', () => {
    for (const l of ONZE_LANGUES) {
      expect(dictionnaire(l)['v2.spotify.cid.invalide'], l).toContain('Basic Information');
    }
  });
});

// ── La carte montée ─────────────────────────────────────────────────────────

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let postes: unknown[] = [];
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}

function serveur() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const methode = (init?.method ?? 'GET').toUpperCase();
    let charge: unknown = {};
    let status = 200;
    if (url.includes('/services/tokens/spotify') && methode === 'POST') {
      postes.push(JSON.parse(String(init?.body)));
      charge = { valid: true, etat: 'enregistre', spotify_client_id_configure: true, validation_message: 'ok' };
    } else if (url.endsWith('/services/tokens')) charge = [];
    else if (url.includes('/system/env')) charge = { spotify_redirect_uri: 'http://127.0.0.1:8888/cb', spotify_client_id_configure: false };
    else if (url.includes('/streaming/services')) charge = { spotify: { enabled: true, authenticated: false } };
    else if (url.includes('/streaming/spotify/diagnostic')) { status = 404; charge = { error: 'not found' }; }
    else if (url.includes('/streaming/spotify/status')) charge = { service: 'spotify', enabled: true, authenticated: false };
    else if (url.includes('/zones') || url.includes('/devices')) charge = [];
    return {
      ok: status === 200, status, statusText: status === 200 ? 'OK' : 'Not Found',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge), json: async () => charge,
    } as unknown as Response;
  }));
}

beforeEach(() => {
  postes = [];
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  v2SettingsTarget.set(null);
  vi.unstubAllGlobals();
});

async function monterEtSaisir(valeur: string) {
  serveur();
  locale.set('fr');
  v2SettingsTarget.set({ tab: 'access' as V2SettingsTabId, section: 'streaming' });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  await souffler();
  const champ = hote.querySelector<HTMLInputElement>('[data-client-id-spotify] input')!;
  expect(champ).toBeTruthy();
  champ.value = valeur;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  await souffler(3);
  return { h: hote, champ };
}

describe('#8198 — la carte refuse ou extrait avant d’envoyer', () => {
  it('🔴 autre chose qu’un Client ID : refusé à l’écran, rien n’est envoyé', async () => {
    const { h } = await monterEtSaisir('abc123');
    h.querySelector<HTMLButtonElement>('[data-client-id-enregistrer]')!.click();
    await souffler();
    expect(postes, 'rien ne part vers le serveur').toEqual([]);
    expect(h.querySelector('[data-client-id-retour="refuse"]')?.textContent).toContain(dictionnaire('fr')['v2.spotify.cid.invalide']);
  });

  it('🔴 adresse du tableau de bord collée : refusée, le champ n’est pas modifié, rien ne part', async () => {
    const adresse = `https://developer.spotify.com/dashboard/${ID}/settings`;
    const { h, champ } = await monterEtSaisir(adresse);
    expect(champ.value, 'le champ garde ce qui a été collé').toBe(adresse);
    h.querySelector<HTMLButtonElement>('[data-client-id-enregistrer]')!.click();
    await souffler();
    expect(postes).toEqual([]);
    expect(h.querySelector('[data-client-id-retour="refuse"]')?.textContent).toContain(dictionnaire('fr')['v2.spotify.cid.invalide']);
    expect(h.querySelector<HTMLInputElement>('[data-client-id-spotify] input')?.value).toBe(adresse);
  });

  it('un vrai Client ID part tel quel, sans les espaces', async () => {
    const { h } = await monterEtSaisir(`  ${ID} `);
    h.querySelector<HTMLButtonElement>('[data-client-id-enregistrer]')!.click();
    await souffler();
    expect(postes).toEqual([{ client_id: ID }]);
  });
});
