// @vitest-environment jsdom
//
// tune-server-rust#7532 (web#2545) — « DEFAULT » RESTE VISIBLE TANT QU'IL
// PORTE DES DONNÉES (décision de Bertrand du 30/10/2026).
//
// r5yk5 (fil 2558, client VIP) : ses favoris étaient sur Default ; son
// navigateur s'est rouvert sur un second profil, vierge, et la règle de
// web#1672 masquait Default dès qu'un profil personnel existait. Les favoris
// étaient intacts, mais inaccessibles depuis le sélecteur.
//
// Règle : Default est montré s'il a au moins un favori, une playlist ou de
// l'historique ; masqué (web#1672) seulement s'il est vide.
//
// 🔴 Les témoins montent le VRAI écran `ProfilsV2` après un VRAI
// `loadProfiles` contre un faux serveur.
// Contre-épreuve : `profilsVisibles` remis sur sa règle seule (paramètre
// `defaultAvecDonnees` ignoré) fait rougir « un favori », « une playlist »,
// « de l'historique » et « navigateur neuf ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('../auth', () => ({ getToken: () => null, clearToken: () => {} }));

const DEFAULT = { id: 1, name: 'Default', avatar_color: '#6366f1' };
const R5YK5 = { id: 2, name: 'r5yk5@example.org', display_name: 'r5yk5', avatar_color: '#22c55e' };

const reponse = (corps: unknown, status = 200) => ({
  ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Erreur',
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => corps,
  text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
} as unknown as Response);

type Donnees = {
  favoris?: Record<string, number>;
  ecoutes?: number;
  playlists?: unknown[];
  statsEnPanne?: boolean;
};
let appels: { url: string; init: RequestInit }[] = [];

function serveur(d: Donnees, profils = [DEFAULT, R5YK5]) {
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    appels.push({ url: u, init });
    if (u.includes('/profiles/1/stats')) {
      if (d.statsEnPanne) return reponse({ error: 'boom' }, 500);
      return reponse({
        profile_id: 1,
        favorites_by_type: d.favoris ?? {},
        listening: { total_listens: d.ecoutes ?? 0 },
      });
    }
    if (u.includes('/playlists?')) {
      const h = (init.headers ?? {}) as Record<string, string>;
      // Le faux serveur répond PAR PROFIL, comme `ActiveProfile`.
      return reponse(h['X-Profile-Id'] === '1' ? (d.playlists ?? []) : []);
    }
    if (u.includes('/profiles/dernier-choisi')) return reponse({ profile_id: null });
    if (/\/profiles(\?|$)/.test(u)) return reponse(profils);
    return reponse([]);
  }));
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let demonter: ((m: Record<string, unknown>) => void) | null = null;

beforeEach(() => {
  localStorage.clear();
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte && demonter) demonter(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** Charge les profils (navigateur déjà sur `actif`), puis monte l'écran. */
async function charger(d: Donnees, actif: number | null = R5YK5.id) {
  serveur(d);
  vi.resetModules();
  if (actif !== null) localStorage.setItem('tune-profile-id', String(actif));
  const magasin = await import('../stores/profile');
  const ok = await magasin.loadProfiles();
  expect(ok).toBe(true);
  // Svelte rechargé avec le reste (`resetModules`) : un seul runtime.
  const { flushSync, mount, unmount } = await import('svelte');
  demonter = (m) => unmount(m);
  const { default: ProfilsV2 } = await import('../../components/v2/ProfilsV2.svelte');
  monte = mount(ProfilsV2, { target: hote! });
  flushSync();
  const noms = [...hote!.querySelectorAll('ul.liste > li .nom')].map((n) => n.textContent?.trim() ?? '');
  return { magasin, noms };
}

describe('#7532 — Default visible tant qu’il porte des données', () => {
  it('Default vide : masqué (règle web#1672 inchangée)', async () => {
    const { noms, magasin } = await charger({});
    expect(noms).toEqual(['r5yk5']);
    expect(get(magasin.defaultPorteDesDonnees)).toBe(false);
  });

  it('un favori sur Default : Default est montré', async () => {
    const { noms } = await charger({ favoris: { album: 402 } });
    expect(noms).toEqual(['Default', 'r5yk5']);
  });

  it('une playlist sur Default : montré, et la sonde a demandé le profil 1', async () => {
    const { noms } = await charger({ playlists: [{ id: 9, name: 'Dimanche' }] });
    expect(noms).toEqual(['Default', 'r5yk5']);
    const sonde = appels.find((a) => a.url.includes('/playlists?'));
    expect((sonde!.init.headers as Record<string, string>)['X-Profile-Id']).toBe('1');
  });

  it('de l’historique sur Default : montré', async () => {
    const { noms } = await charger({ ecoutes: 12 });
    expect(noms).toEqual(['Default', 'r5yk5']);
  });

  it('sonde des compteurs en panne, aucune playlist : masqué, comme avant', async () => {
    const { noms } = await charger({ statsEnPanne: true });
    expect(noms).toEqual(['r5yk5']);
  });

  it('navigateur neuf (rien de mémorisé) : s’ouvre sur Default s’il porte les favoris', async () => {
    const { magasin } = await charger({ favoris: { album: 402 } }, null);
    expect(get(magasin.currentProfileId)).toBe(1);
  });

  it('Default seul : aucune sonde, il reste visible', async () => {
    serveur({}, [DEFAULT]);
    vi.resetModules();
    const magasin = await import('../stores/profile');
    await magasin.loadProfiles();
    expect(appels.some((a) => a.url.includes('/stats'))).toBe(false);
    expect(get(magasin.visibleProfiles).map((p) => p.id)).toEqual([1]);
  });
});
