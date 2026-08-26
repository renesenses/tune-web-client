/**
 * Favoris de PLAYLIST et de LABEL — #2442 (FabienM, fil forum 1557).
 *
 * > « Tune gère les favoris des titres, albums et artistes mais il manque de
 * >   pouvoir mettre en favoris une PLAYLIST et un LABEL ! »
 *
 * Deux chemins DIFFÉRENTS, et c'est tout l'objet de ce fichier :
 *
 *  - une playlist LOCALE porte un `INTEGER PRIMARY KEY` : elle entre dans la
 *    table `favorites`, comme un titre ou un album, sans migration ;
 *  - un LABEL n'a aucune identité côté serveur — ni table, ni identifiant, ni
 *    route bibliothèque : l'onglet Labels lit une FACETTE et sélectionne par
 *    CHAÎNE. `favorites.item_id` étant un entier, il ne peut pas y entrer. Il
 *    passe donc par `favorite_facets`, désigné par sa VALEUR.
 *
 * Ce que ces tests verrouillent : le client envoie la bonne requête sur le bon
 * chemin, et relit ce qu'il a écrit. Sans quoi on retombe sur « le pire des
 * deux mondes » déjà décrit sur #2370 — un favori écrit puis jamais réaffiché.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k),
});
vi.stubGlobal('window', { ...globalThis.window, location: { hash: '' } });

let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

/** Répond selon l'URL appelée : `getFavorites` fait plusieurs requêtes. */
function mockFetchPar(routeur: (url: string) => unknown) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    const body = routeur(url);
    const texte = JSON.stringify(body ?? null);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => body,
      text: async () => texte,
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

let api: typeof import('../api');

beforeEach(async () => {
  fetchCalls = [];
  storage.clear();
  vi.resetModules();
  api = await import('../api');
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

const corps = (i: number) => JSON.parse(String(fetchCalls[i].init?.body ?? '{}'));

describe('favori de playlist locale', () => {
  it('poser le cœur écrit item_type "playlist" dans les favoris locaux', async () => {
    mockFetchPar(() => ({ ok: true }));
    await api.addFavorite(3, { playlist_id: 42 });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain('/profiles/3/favorites/add');
    expect(corps(0)).toEqual({ item_type: 'playlist', item_id: 42 });
  });

  it('retirer le cœur vise le même couple type/id', async () => {
    mockFetchPar(() => ({ ok: true }));
    await api.removeFavorite(3, { playlist_id: 42 });

    expect(fetchCalls[0].url).toContain('/profiles/3/favorites/remove');
    expect(corps(0)).toEqual({ item_type: 'playlist', item_id: 42 });
  });

  it("getFavorites hydrate les playlists : un favori écrit doit pouvoir être relu", async () => {
    // Le défaut à éviter, déjà constaté sur les favoris de streaming : la
    // ligne est bien écrite, mais aucun écran ne sait la rouvrir.
    mockFetchPar((url) => {
      if (url.includes('/favorites')) {
        return [{ item_type: 'playlist', item_id: 42 }];
      }
      if (url.includes('/playlists/42')) {
        return { id: 42, name: 'Dimanche matin', track_count: 12 };
      }
      return [];
    });

    const favs = await api.getFavorites(7);

    expect(favs.playlists).toHaveLength(1);
    expect(favs.playlists[0].name).toBe('Dimanche matin');
    // L'hydratation passe par la route playlist, pas par une devinette.
    expect(fetchCalls.some((c) => c.url.includes('/playlists/42'))).toBe(true);
  });

  it("une playlist favorite disparue ne casse pas la liste", async () => {
    // `Promise.allSettled` : un item supprimé depuis est écarté, il n'annule
    // pas les autres onglets.
    mockFetchPar((url) => {
      if (url.includes('/favorites')) {
        return [
          { item_type: 'playlist', item_id: 42 },
          { item_type: 'playlist', item_id: 99 },
        ];
      }
      if (url.includes('/playlists/42')) return { id: 42, name: 'Dimanche matin' };
      throw new Error('404');
    });

    const favs = await api.getFavorites(7);
    expect(favs.playlists.map((p) => p.id)).toEqual([42]);
  });
});

describe('favori de label (facette)', () => {
  it("le cœur d'un label n'écrit PAS dans favorites : il passe par les facettes", async () => {
    mockFetchPar(() => ({ ok: true }));
    await api.addFacetFavorite(3, 'label', 'ECM Records');

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain('/profiles/3/favorites/facets/add');
    // Une VALEUR, pas un identifiant : c'est tout le sujet.
    expect(corps(0)).toEqual({ facet: 'label', value: 'ECM Records' });
    expect(corps(0)).not.toHaveProperty('item_id');
  });

  it('retirer le cœur du label vise la même valeur', async () => {
    mockFetchPar(() => ({ ok: true }));
    await api.removeFacetFavorite(3, 'label', 'ECM Records');

    expect(fetchCalls[0].url).toContain('/profiles/3/favorites/facets/remove');
    expect(corps(0)).toEqual({ facet: 'label', value: 'ECM Records' });
  });

  it('la relecture filtre sur la facette demandée', async () => {
    mockFetchPar(() => [{ profile_id: 3, facet: 'label', value: 'ECM Records' }]);
    const rows = await api.getFacetFavorites(3, 'label');

    expect(fetchCalls[0].url).toContain('/profiles/3/favorites/facets?facet=label');
    expect(rows.map((r) => r.value)).toEqual(['ECM Records']);
  });

  it('une valeur de label à espaces ou barre oblique reste intacte dans l’URL', async () => {
    // Les labels sont des chaînes libres et sales : « Blue Note / EMI »
    // existe. Sans encodage, la route se casserait en deux segments.
    mockFetchPar(() => []);
    await api.getFacetFavorites(3, 'label');
    expect(fetchCalls[0].url).toContain('facet=label');

    fetchCalls = [];
    mockFetchPar(() => ({ ok: true }));
    await api.addFacetFavorite(3, 'label', 'Blue Note / EMI');
    // La valeur voyage dans le CORPS, jamais dans le chemin : rien à encoder,
    // rien à casser.
    expect(fetchCalls[0].url).not.toContain('Blue%20Note');
    expect(corps(0).value).toBe('Blue Note / EMI');
  });
});
