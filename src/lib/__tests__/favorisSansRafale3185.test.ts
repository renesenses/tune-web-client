/**
 * renesenses/tune-web-client#3185 — Rob Sykes, fil 2889 (18/11/2026, rc12).
 *
 * À l'ouverture de l'Accueil, `loadFavoriteIds` → `getFavorites` relisait
 * CHAQUE favori un par un, les quatre seaux en même temps, sans borne :
 * 693 `GET /library/artists/{id}` refusés par Chromium
 * (`net::ERR_INSUFFICIENT_RESOURCES`), le bandeau réseau, et des favoris jetés
 * — leurs cœurs s'éteignaient.
 *
 * Ce que ces tests verrouillent, avec 1 000 favoris :
 *  - le démarrage (`loadFavoriteIds`) ne fait AUCUNE requête par favori ;
 *  - un favori dont la relecture est refusée garde son cœur ;
 *  - `getFavorites`, quand il doit détailler, n'a jamais plus de
 *    `FAVORIS_EN_VOL` requêtes en vol ;
 *  - les bandes de l'Accueil partagent UN chargement.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

// Chaque test réimporte `api` et le store de profil (`vi.resetModules`) : la
// première transformation dépasse les 5 s par défaut sur une machine chargée.
vi.setConfig({ testTimeout: 60_000 });

vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k),
});

const N = 1000;
/** 1 000 favoris : 700 artistes, 200 albums, 100 pistes. */
const LIGNES = Array.from({ length: N }, (_, i) => ({
  item_type: i < 700 ? 'artist' : i < 900 ? 'album' : 'track',
  item_id: i + 1,
  created_at: '2026-11-18T07:00:00Z',
}));

let enVol = 0;
let maxEnVol = 0;
let urls: string[] = [];
/** Ids dont la relecture est REFUSÉE par le navigateur (pas de statut HTTP). */
let refuses = new Set<number>();

function reponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function installerFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      const detail = /\/library\/(artists|albums|tracks)\/(\d+)/.exec(url);
      if (/\/profiles\/7\/favorites(\?|$)/.test(url)) return reponse(LIGNES);
      if (!detail) return reponse([]);
      enVol++;
      maxEnVol = Math.max(maxEnVol, enVol);
      try {
        await new Promise((r) => setTimeout(r, 1));
        const id = Number(detail[2]);
        if (refuses.has(id)) throw new TypeError('Failed to fetch (net::ERR_INSUFFICIENT_RESOURCES)');
        return reponse({ id, name: `objet ${id}`, title: `objet ${id}` });
      } finally {
        enVol--;
      }
    }),
  );
}

const relectures = () => urls.filter((u) => /\/library\/(artists|albums|tracks)\/\d+/.test(u));

beforeEach(() => {
  enVol = 0;
  maxEnVol = 0;
  urls = [];
  refuses = new Set();
  storage.clear();
  vi.resetModules();
  installerFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('#3185 — favoris au démarrage', () => {
  it("loadFavoriteIds ne relit AUCUN favori : une requête, 1 000 cœurs", async () => {
    const profil = await import('../stores/profile');
    await new Promise((r) => setTimeout(r, 0));
    urls = [];
    await profil.loadFavoriteIds(7);

    expect(relectures(), 'aucune requête par favori au démarrage').toHaveLength(0);
    expect(urls.filter((u) => /\/profiles\/7\/favorites(\?|$)/.test(u))).toHaveLength(1);
    expect(get(profil.favoriteArtistIds).size).toBe(700);
    expect(get(profil.favoriteAlbumIds).size).toBe(200);
    expect(get(profil.favoriteTrackIds).size).toBe(100);
  });

  it("un favori dont l'objet ne se relit pas garde son cœur, sans bandeau", async () => {
    for (let i = 1; i <= 700; i++) refuses.add(i);
    const { notifications } = await import('../stores/notifications');
    const profil = await import('../stores/profile');
    await profil.loadFavoriteIds(7);

    expect(get(profil.favoriteArtistIds).has(1)).toBe(true);
    expect(get(profil.favoriteArtistIds).size).toBe(700);
    expect(notifications.error).not.toHaveBeenCalled();
  });
});

describe('#3185 — getFavorites détaillé', () => {
  it(`au plus FAVORIS_EN_VOL requêtes en vol pour 1 000 favoris`, async () => {
    const api = await import('../api');
    const f = await api.getFavorites(7);

    expect(maxEnVol, 'requêtes simultanées').toBeLessThanOrEqual(6);
    expect(maxEnVol).toBeLessThanOrEqual(api.FAVORIS_EN_VOL);
    expect(relectures()).toHaveLength(N);
    expect(f.artists).toHaveLength(700);
    expect(f.albums).toHaveLength(200);
    expect(f.tracks).toHaveLength(100);
  });

  it('deux getFavorites simultanés partagent la même borne', async () => {
    const api = await import('../api');
    await Promise.all([api.getFavorites(7), api.getFavorites(7, 'artist')]);
    expect(maxEnVol).toBeLessThanOrEqual(6);
  });

  it('une relecture refusée par le navigateur est rejouée une fois', async () => {
    let premier = true;
    const fetchBase = globalThis.fetch as any;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (premier && /\/library\/artists\/5$/.test(url.split('?')[0])) {
          premier = false;
          throw new TypeError('Failed to fetch');
        }
        return fetchBase(url, init);
      }),
    );
    const api = await import('../api');
    const f = await api.getFavorites(7, 'artist');
    expect(f.artists.some((a: any) => a.id === 5)).toBe(true);
  });
});

describe('#3185 — bandes de l’Accueil', () => {
  it('trois bandes simultanées ne relisent les favoris qu’une fois', async () => {
    const { chargerFavorisFusionnes } = await import('../favorisFusionnes');
    await Promise.all([
      chargerFavorisFusionnes(7),
      chargerFavorisFusionnes(7),
      chargerFavorisFusionnes(7),
    ]);
    expect(urls.filter((u) => /\/profiles\/7\/favorites(\?|$)/.test(u))).toHaveLength(1);
    expect(relectures()).toHaveLength(N);
  });
});
