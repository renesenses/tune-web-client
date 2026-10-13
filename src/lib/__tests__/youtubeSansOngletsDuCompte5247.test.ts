// @vitest-environment jsdom
//
// renesenses/tune-server-rust#5247 — YOUTUBE N'A PLUS D'ONGLETS PLAYLISTS NI
// FAVORIS, ET LE MESSAGE VIDE N'ACCUSE PLUS LE COMPTE.
//
// Levente Toth, fil 1995 (27/09/2026) : « I have playlists setup on Youtube +
// favorites, but they don't show in Tune ». L'écran disait « No playlist in
// your Youtube account. » Or Tune ne lit RIEN du compte YouTube :
// `tune-core/src/streaming/youtube.rs:3118`, `get_user_playlists` rend
// `Ok(vec![])` en dur (« Requires Google OAuth — not implemented for now »),
// tout comme `get_user_albums` et `get_user_artists`. Décision de Bertrand
// (27/09) : retirer les deux onglets de YouTube, et corriger le message qui
// affirmait à tort un compte vide.
//
// 🔴 CES TÉMOINS MONTENT LE VRAI `StreamingV2` et lisent la rangée des
// sous-onglets (`nav.subs`). Un service qui SAIT lire son compte (Qobuz) garde
// les deux onglets : c'est l'autre sens, et il doit rester vert.
//
// Contre-épreuve : `StreamingV2.svelte` remis à sa base (les deux onglets
// inconditionnels) fait rougir le témoin YouTube.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import { activeStreamingService } from '../stores/streaming';
import { t } from '../i18n';
import StreamingV2 from '../../components/v2/StreamingV2.svelte';
import * as onglets from '../ongletsStreaming';

vi.setConfig({ testTimeout: 60_000 });

const SERVICES = {
  youtube: { enabled: true, authenticated: true, username: 'Levente Toth' },
  qobuz: { enabled: true, authenticated: true, username: 'Levente' },
} as any;

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

/** La réponse de `/streaming/youtube/library` pour l'épreuve en cours. */
let bibliotheque: () => Response = () => reponse([]);
let appelsBibliotheque = 0;

function echec(status: number) {
  return {
    ok: false, status, statusText: 'Bad Gateway',
    headers: new Map([['content-type', 'text/plain']]),
    json: async () => { throw new Error('pas du JSON'); },
    text: async () => 'YouTube a refusé : 403 accessNotConfigured',
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

const sousOnglets = () =>
  Array.from(hote!.querySelectorAll('nav.subs > button')).map((b) => (b.textContent ?? '').trim());

async function monterSur(service: string) {
  activeStreamingService.set(service);
  monte = mount(StreamingV2 as any, { target: hote! });
  for (let i = 0; i < 80; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    if (sousOnglets().length) break;
  }
  expect(sousOnglets().length, 'aucun sous-onglet rendu').toBeGreaterThan(0);
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/ext\/bandcamp\/tags/.test(u)) throw new Error('extension absente');
    if (/\/streaming\/services/.test(u)) return reponse(SERVICES);
    if (/\/streaming\/youtube\/library/.test(u)) { appelsBibliotheque++; return bibliotheque(); }
    if (/\/config/.test(u)) return reponse({});
    return reponse([]);
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* hors sujet */ } }
  monte = null;
  hote?.remove();
  hote = null;
  activeStreamingService.set(null as any);
  vi.unstubAllGlobals();
  bibliotheque = () => reponse([]);
  appelsBibliotheque = 0;
});

const PLAYLISTS = () => get(t)('v2.nav.playlists' as any);
const FAVORIS = () => get(t)('v2.nav.favorites' as any);

describe('tune-server-rust#5247 — onglets du compte YouTube', () => {
  it('YouTube sans preuve du serveur : ni Playlists ni Favoris dans les sous-onglets', async () => {
    await monterSur('youtube');
    const s = sousOnglets();
    expect(s).not.toContain(PLAYLISTS());
    expect(s).not.toContain(FAVORIS());
    // L'éditorial et la découverte YouTube Music restent.
    expect(s).toContain(get(t)('v2.str.editorial' as any));
  });

  // Depuis la rc4 (PR serveur #5958), le serveur SAIT lire le compte, mais
  // l'accès dépend de Google. Les onglets reviennent sur PREUVE seulement.
  async function attendreLaSonde() {
    for (let i = 0; i < 40; i++) {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      flushSync();
    }
  }

  it('YouTube : la route du compte répond 200 { playlists, tracks } → Playlists et Favoris reviennent', async () => {
    bibliotheque = () => reponse({ playlists: [{ id: 'PL1', name: 'Mes titres' }], tracks: [] });
    await monterSur('youtube');
    await attendreLaSonde();
    expect(appelsBibliotheque, 'la sonde du compte doit partir').toBeGreaterThan(0);
    const s = sousOnglets();
    expect(s).toContain(PLAYLISTS());
    expect(s).toContain(FAVORIS());
  });

  it('YouTube : Google refuse (502) → les onglets du compte restent masqués', async () => {
    bibliotheque = () => echec(502);
    await monterSur('youtube');
    await attendreLaSonde();
    expect(appelsBibliotheque).toBeGreaterThan(0);
    const s = sousOnglets();
    expect(s).not.toContain(PLAYLISTS());
    expect(s).not.toContain(FAVORIS());
  });

  it('YouTube : l\'ancien talon (200, sans `tracks`) ne prouve rien → onglets masqués', async () => {
    bibliotheque = () => reponse({ playlists: [], albums: [], artists: [] });
    await monterSur('youtube');
    await attendreLaSonde();
    const s = sousOnglets();
    expect(s).not.toContain(PLAYLISTS());
    expect(s).not.toContain(FAVORIS());
  });

  it('Qobuz, qui lit son compte : Playlists et Favoris restent', async () => {
    await monterSur('qobuz');
    const s = sousOnglets();
    expect(s).toContain(PLAYLISTS());
    expect(s).toContain(FAVORIS());
  });

  it('la règle pure : YouTube seul est privé de bibliothèque de compte', () => {
    expect(typeof onglets.aUneBibliothequeDeCompte, 'aUneBibliothequeDeCompte absente').toBe('function');
    expect(onglets.aUneBibliothequeDeCompte('youtube')).toBe(false);
    expect(onglets.aUneBibliothequeDeCompte('youtube', new Set(['youtube']))).toBe(true);
    expect(onglets.reponseProuveLaBibliotheque({ playlists: [], tracks: [] })).toBe(true);
    expect(onglets.reponseProuveLaBibliotheque({ playlists: [], albums: [], artists: [] })).toBe(false);
    expect(onglets.reponseProuveLaBibliotheque([])).toBe(false);
    for (const svc of ['qobuz', 'tidal', 'deezer', 'spotify', 'amazon']) {
      expect(onglets.aUneBibliothequeDeCompte(svc), svc).toBe(true);
    }
  });

  it('le message vide ne dit plus que le COMPTE est vide, dans aucune des onze langues', async () => {
    const anciens: Record<string, string[]> = {
      en: ['No playlist in your {s} account.', 'No favourite in your {s} account.'],
      fr: ['Aucune playlist dans votre compte {s}.', 'Aucun favori dans votre compte {s}.'],
    };
    for (const l of ONZE_LANGUES) {
      const dict = dictionnaire(l);
      for (const cle of ['v2.str.noPlaylistsInAccount', 'v2.str.noFavoritesInAccount']) {
        expect(dict[cle], `${cle} manque en ${l}`).toContain('{s}');
        for (const ancien of anciens[l] ?? []) expect(dict[cle]).not.toBe(ancien);
      }
    }
  });
});
