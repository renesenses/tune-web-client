// @vitest-environment jsdom
//
// tune-server-rust#7532 (web#2545, fil forum 2558, client VIP) — L'APERÇU ET
// LE CONTENU D'UNE COLLECTION INTELLIGENTE PARLENT DU MÊME PROFIL.
//
// r5yk5, rc9 : « Favoris » vide ; l'éditeur de collection « Favori est Album
// favori » annonçait 402 albums, la collection enregistrée était vide.
// `fetchJSON` faisait `fetch(url, { headers, ...options })` : le
// `headers: { 'Content-Type': … }` de l'aperçu (POST) REMPLAÇAIT les en-têtes
// communs, `X-Profile-Id` et `Authorization` compris. L'aperçu partait sans
// profil (le serveur lisait le profil global, celui des favoris), le GET du
// contenu partait avec celui du navigateur (un autre, vide).
//
// Contre-épreuve : `fetchJSON` (lib/api.ts) remis sur
// `{ headers, ...options }` fait rougir les témoins « aperçu/contenu »,
// « création/modification » et « multipart par fetchJSON » ; `_client.ts`
// remis de même fait rougir « mergeAlbums ».
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth', () => ({ getToken: () => 'jeton-r5yk5', clearToken: () => {} }));
vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const api = await import('../api');
const { fusionnerEntetes, corpsJson } = await import('../fusionEntetes');

type Appel = { url: string; init: RequestInit };
let appels: Appel[] = [];

function serveur(corps: unknown = {}) {
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    appels.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
}

/** Lecture insensible à la casse, comme HTTP. Rend TOUTES les valeurs du nom. */
function entete(init: RequestInit, nom: string): string[] {
  const h = init.headers;
  if (!h) return [];
  if (h instanceof Headers) return h.has(nom) ? [h.get(nom)!] : [];
  return Object.entries(h as Record<string, string>)
    .filter(([k]) => k.toLowerCase() === nom.toLowerCase())
    .map(([, v]) => v);
}

const PROFIL = '2';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('tune-profile-id', PROFIL);
});

describe('#7532 — fetchJSON ne perd plus les en-têtes communs', () => {
  it("l'aperçu POST et le GET du contenu envoient le MÊME X-Profile-Id et la même Authorization", async () => {
    serveur({ total: 0, albums: [] });
    await api.previewSmartCollection({ rules: [{ field: 'favorite', operator: 'is', value: 'album' }] });
    await api.getSmartCollectionAlbums(7);
    expect(appels).toHaveLength(2);
    const [apercu, contenu] = appels;
    expect(apercu.url).toContain('/library/smart-collections/preview');
    expect(apercu.init.method).toBe('POST');
    expect(contenu.url).toContain('/library/smart-collections/7/albums');

    expect(entete(apercu.init, 'X-Profile-Id'), 'aperçu sans profil').toEqual([PROFIL]);
    expect(entete(contenu.init, 'X-Profile-Id')).toEqual([PROFIL]);
    expect(entete(apercu.init, 'Authorization'), 'aperçu sans jeton').toEqual(['Bearer jeton-r5yk5']);
    expect(entete(contenu.init, 'Authorization')).toEqual(['Bearer jeton-r5yk5']);
    expect(entete(apercu.init, 'Accept-Language').length, 'aperçu sans langue').toBe(1);
    // Un seul Content-Type, celui du JSON.
    expect(entete(apercu.init, 'Content-Type')).toEqual(['application/json']);
  });

  it('création et modification gardent le profil', async () => {
    serveur({ id: 7 });
    await api.createSmartCollection({ name: 'Favoris', rules: [] } as any);
    await api.updateSmartCollection(7, { name: 'Favoris', rules: [] });
    for (const a of appels) {
      expect(entete(a.init, 'X-Profile-Id'), `${a.init.method} ${a.url}`).toEqual([PROFIL]);
      expect(entete(a.init, 'Authorization')).toEqual(['Bearer jeton-r5yk5']);
    }
  });

  it("le jumeau de api/_client.ts (mergeAlbums) garde le profil", async () => {
    serveur({ ok: true });
    await api.mergeAlbums([1, 2]);
    expect(appels).toHaveLength(1);
    expect(entete(appels[0].init, 'X-Profile-Id')).toEqual([PROFIL]);
    expect(entete(appels[0].init, 'Authorization')).toEqual(['Bearer jeton-r5yk5']);
  });

  it("un appel peut viser un autre profil : son X-Profile-Id l'emporte, sans doublon", async () => {
    serveur([]);
    await api.getPlaylistsDuProfil(1, 1);
    expect(entete(appels[0].init, 'X-Profile-Id')).toEqual(['1']);
    expect(entete(appels[0].init, 'Authorization')).toEqual(['Bearer jeton-r5yk5']);
  });
});

describe('#7532 — envoi multipart : pas de Content-Type forcé', () => {
  it('fetchJSON avec un FormData garde le profil et laisse le navigateur poser le multipart', async () => {
    serveur({ ok: true });
    const form = new FormData();
    form.append('file', new Blob(['x']), 'a.m3u');
    await api.fetchJSON(`${api.BASE}/playlists/import`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: form,
    });
    const init = appels[0].init;
    expect(entete(init, 'Content-Type'), 'Content-Type forcé sur un multipart').toEqual([]);
    expect(entete(init, 'X-Profile-Id')).toEqual([PROFIL]);
    expect(entete(init, 'Authorization')).toEqual(['Bearer jeton-r5yk5']);
    expect(init.body).toBe(form);
  });

  it("importPlaylists (fetch direct + authHeaders) : profil et jeton, aucun Content-Type", async () => {
    serveur({ imported: 0 });
    await api.importPlaylists(new File(['#EXTM3U'], 'a.m3u'));
    const init = appels[0].init;
    expect(init.body).toBeInstanceOf(FormData);
    expect(entete(init, 'Content-Type')).toEqual([]);
    expect(entete(init, 'X-Profile-Id'), 'authHeaders sans profil').toEqual([PROFIL]);
    expect(entete(init, 'Authorization')).toEqual(['Bearer jeton-r5yk5']);
  });
});

describe('#7532 — règles pures', () => {
  it('fusionnerEntetes : ajoute, remplace sans tenir compte de la casse, accepte Headers et tableaux', () => {
    const communs = { 'Content-Type': 'application/json', 'X-Profile-Id': '2', Authorization: 'Bearer t' };
    expect(fusionnerEntetes(communs, { 'content-type': 'text/plain' })).toEqual({
      'X-Profile-Id': '2', Authorization: 'Bearer t', 'content-type': 'text/plain',
    });
    const h = fusionnerEntetes(communs, new Headers({ 'X-Extra': 'oui' }));
    expect(h['X-Profile-Id']).toBe('2');
    expect(h['x-extra']).toBe('oui');
    expect(fusionnerEntetes(communs, [['X-Profile-Id', '1']])['X-Profile-Id']).toBe('1');
    expect(fusionnerEntetes(communs, undefined)).toEqual(communs);
  });

  it('corpsJson : chaîne oui ; rien, FormData, Blob, octets, URLSearchParams non', () => {
    expect(corpsJson('{}')).toBe(true);
    expect(corpsJson(undefined)).toBe(false);
    expect(corpsJson(null)).toBe(false);
    expect(corpsJson(new FormData())).toBe(false);
    expect(corpsJson(new Blob(['x']))).toBe(false);
    expect(corpsJson(new Uint8Array(2))).toBe(false);
    expect(corpsJson(new ArrayBuffer(2))).toBe(false);
    expect(corpsJson(new URLSearchParams('a=1'))).toBe(false);
  });
});
