// @vitest-environment jsdom
//
// tune-server-rust#5916 — LE PROFIL CHOISI SURVIT À UN NAVIGATEUR QUI OUBLIE.
//
// Gérard, fil 2168 (11-12/10, Linux, Firefox/Brave/Falkon/GNOME Web) : quand
// toutes les fenêtres du navigateur sont fermées, Tune revient sur le premier
// profil, avec les réglages de celui-ci. Le profil actif ne vivait que dans
// `localStorage['tune-profile-id']` ; un navigateur qui efface les données des
// sites à sa fermeture (ou la navigation privée) le perdait à chaque fois.
//
// Le serveur garde désormais le dernier profil choisi par appareil
// (`GET`/`PUT /api/v1/profiles/dernier-choisi`). Ces témoins vérifient que le
// client le REPREND quand son stockage est vide, et qu'il le MET À JOUR.
//
// Contre-épreuve : `loadProfiles` remis sur `profilsVisibles(list)[0]` sans
// `profilRetenuParLeServeur` fait rougir le premier témoin (2 au lieu de 3).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import * as magasinCharge from '../stores/profile';

const DEFAULT = { id: 1, name: 'Default', avatar_color: '#6366f1' };
const GERARD = { id: 2, name: 'gerard', display_name: 'Gérard', avatar_color: '#22c55e' };
const ANNE = { id: 3, name: 'anne', display_name: 'Anne', avatar_color: '#f59e0b' };

const reponse = (corps: unknown, status = 200) => ({
  ok: status < 400, status, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
} as unknown as Response);

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];

/** Un serveur qui a retenu `retenu` pour cet appareil. */
function serveur(retenu: unknown) {
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    appels.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : null });
    const u = String(url);
    if (u.endsWith('/profiles/dernier-choisi') && method === 'GET') return reponse(retenu);
    if (u.endsWith('/profiles/dernier-choisi') && method === 'PUT') return reponse(undefined, 204);
    if (u.endsWith('/profiles')) return reponse([DEFAULT, GERARD, ANNE]);
    return reponse([]);
  }));
}

/**
 * Le magasin, son profil courant remis à « rien » : c'est l'état d'un
 * chargement dont le `localStorage` est vide.
 */
async function magasin() {
  magasinCharge.currentProfileId.set(null);
  localStorage.clear();
  return magasinCharge;
}

/** Le magasin chargé À NEUF : il lit `localStorage` à son import. */
async function magasinNeuf() {
  vi.resetModules();
  return import('../stores/profile');
}

const puts = () => appels.filter((a) => a.method === 'PUT' && a.url.endsWith('/profiles/dernier-choisi'));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('#5916 — localStorage vide : le profil retenu par le serveur est repris', () => {
  it('reprend Anne, retenue par le serveur, au lieu du premier profil (Gérard)', async () => {
    serveur({ profile_id: ANNE.id, source: 'appareil' });
    const m = await magasin();

    await m.loadProfiles();

    expect(get(m.currentProfileId)).toBe(ANNE.id);
    expect(localStorage.getItem('tune-profile-id')).toBe(String(ANNE.id));
  });

  it('le repli « tous appareils » est repris lui aussi', async () => {
    serveur({ profile_id: ANNE.id, source: 'tous_appareils' });
    const m = await magasin();

    await m.loadProfiles();

    expect(get(m.currentProfileId)).toBe(ANNE.id);
  });

  it('rien de retenu, ou un profil disparu : premier profil visible, comme avant', async () => {
    for (const retenu of [{ profile_id: null, source: null }, { profile_id: 99, source: 'appareil' }]) {
      serveur(retenu);
      const m = await magasin();
      await m.loadProfiles();
      expect(get(m.currentProfileId)).toBe(GERARD.id);
    }
  });

  it('un serveur sans la route (réponse en erreur) : premier profil visible', async () => {
    appels = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      String(url).endsWith('/profiles/dernier-choisi')
        ? reponse({ error: 'bad request' }, 400)
        : reponse([DEFAULT, GERARD, ANNE])));
    const m = await magasin();

    await m.loadProfiles();

    expect(get(m.currentProfileId)).toBe(GERARD.id);
  });
});

describe('#5916 — un changement de profil met à jour le serveur', () => {
  it('selectProfile envoie le choix au serveur', async () => {
    serveur({ profile_id: null, source: null });
    const m = await magasin();
    await m.loadProfiles();

    await m.selectProfile(ANNE.id);

    expect(puts().map((a) => a.body)).toContainEqual({ profile_id: ANNE.id });
  });

  it('un choix que seul ce navigateur connaissait est appris par le serveur, sans lui demander le sien', async () => {
    localStorage.setItem('tune-profile-id', String(ANNE.id));
    serveur({ profile_id: GERARD.id, source: 'appareil' });
    const m = await magasinNeuf();

    await m.loadProfiles();

    expect(get(m.currentProfileId)).toBe(ANNE.id);
    expect(appels.some((a) => a.method === 'GET' && a.url.endsWith('/profiles/dernier-choisi'))).toBe(false);
    expect(puts().map((a) => a.body)).toEqual([{ profile_id: ANNE.id }]);
    // Un import à neuf du graphe d'`api.ts` est long sur une machine chargée.
  }, 30_000);
});
