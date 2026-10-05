// @vitest-environment jsdom
//
// Forum, fil 221 (Yan Tasset) — le Client ID Spotify se saisit sur la carte
// Streaming.
//
// La carte Spotify de Réglages ▸ Accès ▸ Services de streaming n'avait aucun
// champ pour le Client ID : il ne se posait que côté serveur, au démarrage.
// Le testeur a collé son Client ID dans le seul champ offert, celui de
// l'adresse de retour, et Spotify a répondu `invalid_client`.
//
// Quand le serveur publie `spotify_client_id_configure: false`
// (`GET /system/env`), la carte offre un champ « Client ID » et
// « Enregistrer », qui passent par `POST /services/tokens/spotify`. Une fois
// enregistré, « Se connecter » revient. Sur un serveur plus ancien (champ
// absent), la carte ne change pas.
//
// Ces témoins MONTENT `SettingsV2` et lisent la carte rendue. Le Client ID
// employé est factice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import type { V2SettingsTabId } from '../v2Settings';
import { clientIdSpotifyManquant, lireRetourClientId } from '../clientIdSpotify';

vi.setConfig({ testTimeout: 30_000 });

const CLIENT_ID = '0123456789abcdef0123456789abcdef';
const URI = 'http://127.0.0.1:8888/api/v1/streaming/spotify/callback';

class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let postes: { url: string; corps: unknown }[] = [];

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 8) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

/**
 * Un faux serveur. `configure` : ce que publie `GET /system/env`
 * (`undefined` = serveur antérieur au fil 221). `reponse` : ce qu'il rend
 * à l'enregistrement.
 */
function serveur(configure: boolean | undefined, reponse: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const methode = (init?.method ?? 'GET').toUpperCase();
      let charge: unknown = {};
      if (url.includes('/services/tokens/spotify') && methode === 'POST') {
        postes.push({ url, corps: init?.body ? JSON.parse(String(init.body)) : null });
        charge = reponse;
      } else if (url.endsWith('/services/tokens')) {
        charge = [{ id: 'spotify', name: 'Spotify', kind: 'oauth', configured: false, fields: [] }];
      } else if (url.includes('/system/env')) {
        charge = {
          TUNE_PORT: '8888',
          spotify_redirect_uri: URI,
          spotify_redirect_uri_refus: null,
          ...(configure === undefined ? {} : { spotify_client_id_configure: configure }),
        };
      } else if (url.includes('/streaming/services')) {
        charge = { spotify: { enabled: false, authenticated: false } };
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

async function monterCarteStreaming() {
  locale.set('fr');
  v2SettingsTarget.set({ tab: 'access' as V2SettingsTabId, section: 'streaming' });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  await souffler();
  return hote;
}

async function saisirEtEnregistrer(h: HTMLElement, valeur: string) {
  const champ = h.querySelector<HTMLInputElement>('[data-client-id-spotify] input');
  expect(champ, 'le champ Client ID doit être offert sur la carte Spotify').toBeTruthy();
  champ!.value = valeur;
  champ!.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  h.querySelector<HTMLButtonElement>('[data-client-id-enregistrer]')!.click();
  await souffler();
}

function boutons(h: HTMLElement) {
  return [...h.querySelectorAll<HTMLButtonElement>('.svc button')].map((b) => (b.textContent ?? '').trim());
}

beforeEach(() => {
  postes = [];
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

describe('fil 221 — le Client ID Spotify sur la carte Streaming', () => {
  it('🔴 sans Client ID, la carte le demande, l’envoie à Accès et jetons, puis rend « Se connecter »', async () => {
    serveur(false, {
      valid: true, etat: 'enregistre', spotify_client_id_configure: true,
      validation_message: 'Client ID Spotify enregistré. Vous pouvez maintenant vous connecter.',
    });
    const h = await monterCarteStreaming();

    expect(
      h.querySelector('[data-client-id-spotify] input'),
      'fil 221 : sans Client ID, la carte Spotify doit offrir le champ',
    ).toBeTruthy();
    expect(boutons(h), '« Se connecter » est voué à invalid_client tant qu’il manque').not.toContain('Se connecter');
    const lien = h.querySelector<HTMLAnchorElement>('a[href="https://developer.spotify.com/dashboard"]');
    expect(lien, 'l’aide renvoie au tableau de bord Spotify').toBeTruthy();
    expect(h.textContent, 'l’URI de redirection à déclarer reste affichée').toContain(URI);

    await saisirEtEnregistrer(h, `  ${CLIENT_ID} `);

    expect(postes.length, 'le Client ID doit partir vers POST /services/tokens/spotify').toBe(1);
    expect(postes[0].corps).toEqual({ client_id: CLIENT_ID });
    const retour = h.querySelector('[data-client-id-retour]');
    expect(retour?.getAttribute('data-client-id-retour')).toBe('enregistre');
    expect(retour?.textContent).toContain('Client ID enregistré');
    expect(h.querySelector('[data-client-id-spotify]'), 'une fois enregistré, le champ s’efface').toBeNull();
    expect(boutons(h), 'le flux habituel revient').toContain('Se connecter');
  });

  it('un Client ID refusé se dit refusé, et le champ reste', async () => {
    serveur(false, {
      valid: false, etat: 'refuse',
      validation_message: 'Ce n’est pas un Client ID Spotify',
    });
    const h = await monterCarteStreaming();
    await saisirEtEnregistrer(h, 'http://127.0.0.1:8888/cb?code=abc');
    const retour = h.querySelector('[data-client-id-retour]');
    expect(retour?.getAttribute('data-client-id-retour')).toBe('refuse');
    expect(retour?.textContent).toContain('Client ID refusé');
    expect(h.querySelector('[data-client-id-spotify] input')).toBeTruthy();
  });

  it('avec un Client ID configuré, la carte ne change pas', async () => {
    serveur(true, {});
    const h = await monterCarteStreaming();
    expect(h.querySelector('[data-client-id-spotify]')).toBeNull();
    expect(boutons(h)).toContain('Se connecter');
  });

  it('sur un serveur plus ancien (sans le drapeau), la carte ne change pas', async () => {
    serveur(undefined, {});
    const h = await monterCarteStreaming();
    expect(h.querySelector('[data-client-id-spotify]'), 'aucun champ sur un serveur antérieur').toBeNull();
    expect(boutons(h)).toContain('Se connecter');
  });
});

describe('fil 221 — la lecture du drapeau et de la réponse', () => {
  it('seul `false` dit le Client ID manquant', () => {
    expect(clientIdSpotifyManquant({ spotify_client_id_configure: false })).toBe(true);
    expect(clientIdSpotifyManquant({ spotify_client_id_configure: true })).toBe(false);
    expect(clientIdSpotifyManquant({})).toBe(false);
    expect(clientIdSpotifyManquant(null)).toBe(false);
  });

  it('les trois états, et un repli sur `valid` sans `etat`', () => {
    expect(lireRetourClientId({ valid: false, etat: 'impose' } as any).etat).toBe('impose');
    expect(lireRetourClientId({ valid: false, etat: 'refuse' } as any).etat).toBe('refuse');
    expect(lireRetourClientId({ valid: true, etat: 'enregistre' } as any).etat).toBe('enregistre');
    expect(lireRetourClientId({ valid: true }).etat).toBe('enregistre');
    expect(lireRetourClientId({ valid: false }).etat).toBe('refuse');
  });
});
