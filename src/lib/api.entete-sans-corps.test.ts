import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #4447 — un POST sans corps ne doit pas annoncer `application/json`.
 *
 * Mesure sur le .18 en v0.9.155, ecran Studio → Metadonnees → Manquants :
 * « Retrouver genres et annees » affichait
 * `Failed to parse the request body as JSON: EOF while parsing a value at
 * line 1 column 0`. Cote serveur, un extracteur `Option<Json<T>>` ne rend
 * `None` que si l'en-tete `Content-Type` est ABSENT ; present avec zero octet,
 * il tente la deserialisation et rejette la requete en 400.
 *
 * Le serveur est corrige de son cote (il lit les octets, plus l'en-tete), mais
 * le client ne doit pas decrire un corps qu'il n'envoie pas : c'est la moitie
 * du defaut, et c'est celle qui protege les serveurs deja publies.
 */

vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:8888' } });
vi.mock('./auth', () => ({ getToken: () => null, clearToken: () => {} }));
vi.mock('./stores/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const api = await import('./api');

/** Capture l'appel `fetch` et rend une reponse vide acceptee. */
function espion(charge = '') {
  const appels: Array<{ url: string; init: RequestInit }> = [];
  const faux = vi.fn(async (url: string, init: RequestInit) => {
    appels.push({ url, init });
    return {
      ok: true,
      status: 202,
      headers: new Headers(),
      text: async () => charge,
      json: async () => JSON.parse(charge || '{}'),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', faux);
  return appels;
}

/** Lecture insensible a la casse : `Headers` normalise, un objet nu non. */
function contentType(init: RequestInit): string | undefined {
  const h = init.headers as Record<string, string>;
  const cle = Object.keys(h).find((k) => k.toLowerCase() === 'content-type');
  return cle ? h[cle] : undefined;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:8888' } });
});

describe('#4447 — Content-Type et corps de requete', () => {
  it("startBatchEnrich (POST sans corps) n'annonce pas application/json", async () => {
    const appels = espion();
    await api.startBatchEnrich();
    expect(appels).toHaveLength(1);
    expect(appels[0].init.body).toBeUndefined();
    expect(contentType(appels[0].init)).toBeUndefined();
  });

  it("clearQueue (POST sans corps, via fetchVoid) n'annonce pas application/json", async () => {
    const appels = espion();
    await api.clearQueue(1);
    expect(appels).toHaveLength(1);
    expect(appels[0].init.body).toBeUndefined();
    expect(contentType(appels[0].init)).toBeUndefined();
  });

  it("startAutoFix (POST sans corps) n'annonce pas application/json", async () => {
    // Charge non vide : le `fetchJSON` de `api/_client.ts` — un jumeau de
    // celui d'`api.ts` — n'accepte pas une reponse vide. Hors sujet ici.
    const appels = espion('{"ok":true}');
    const metadata = await import('./api/metadata');
    await metadata.startAutoFix();
    expect(appels).toHaveLength(1);
    expect(appels[0].init.body).toBeUndefined();
    expect(contentType(appels[0].init)).toBeUndefined();
  });

  it('un GET non plus', async () => {
    const appels = espion('[]');
    await api.getZones();
    expect(contentType(appels[0].init)).toBeUndefined();
  });

  it("un POST AVEC corps annonce toujours application/json — c'est la contrepartie", async () => {
    const appels = espion();
    await api.createPlaylist('Ma liste');
    expect(appels).toHaveLength(1);
    expect(appels[0].init.body).toBeTruthy();
    expect(contentType(appels[0].init)).toBe('application/json');
  });
});
