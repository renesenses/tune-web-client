// @vitest-environment jsdom
//
// renesenses/tune-web-client#1838, suite — l'artiste de SERVICE déposé dans
// une étiquette depuis son menu « … » partait sans image : `objetArtiste` ne
// retenait pas `image_path`, et `cibleEtiquetteObjet` ne le transmettait pas.
// Le serveur rend l'instantané tel quel (`/tags/{id}/artists` → `image_path`).
//
// Forme RÉELLE, .18, 30/09/2026 :
//   GET /streaming/qobuz/search?q=bowie&type=artists →
//     {"artists":[{"id":"38326","image_path":"https://static.qobuz.com/images/
//       artists/covers/large/8f5a98b96bec48c6857e555532186131.jpg","name":"David Bowie"}, …]}
// L'écran Streaming la complète en `{...ar, source: active, source_id: ar.id}`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cibleEtiquetteObjet, objetArtiste } from '../gestesObjet';
import { poserEtiquette } from '../cibleEtiquette';

const IMG_BOWIE = 'https://static.qobuz.com/images/artists/covers/large/8f5a98b96bec48c6857e555532186131.jpg';
const RECHERCHE = { id: '38326', image_path: IMG_BOWIE, name: 'David Bowie' };

const appels: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  appels.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    appels.push({ url: String(entree), init });
    return {
      ok: true, status: 201, statusText: 'Created',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({}), text: async () => '{}',
    } as unknown as Response;
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function corpsDuDepot(o: ReturnType<typeof objetArtiste>): Promise<Record<string, unknown>> {
  const cible = cibleEtiquetteObjet(o);
  expect(cible, 'aucune cible — témoin sans objet').toBeTruthy();
  await poserEtiquette(6, cible!);
  const post = appels.find((a) => /\/tags\/6\/streaming-items$/.test(a.url));
  expect(post, 'aucun dépôt envoyé').toBeTruthy();
  return JSON.parse(String(post!.init?.body ?? '{}'));
}

describe('#1838 — le dépôt d’un artiste de service emporte son image', () => {
  it('🔴 forme de l’écran Streaming (recherche Qobuz du .18) : cover_url = image_path', async () => {
    const o = objetArtiste({ ...RECHERCHE, source: 'qobuz', source_id: RECHERCHE.id });
    expect(o.pochette).toBe(IMG_BOWIE);
    expect(await corpsDuDepot(o)).toMatchObject({
      item_type: 'artist', source: 'qobuz', source_id: '38326', title: 'David Bowie', cover_url: IMG_BOWIE,
    });
  });

  it('🔴 artiste déjà étiqueté (ligne de /tags/{id}/artists) : son image_path repart', async () => {
    const ligne = { id: null, name: 'David Bowie', image_path: IMG_BOWIE, source: 'qobuz', source_id: '38326' };
    expect(await corpsDuDepot(objetArtiste(ligne))).toMatchObject({ cover_url: IMG_BOWIE });
  });

  it('artiste de service sans image : rien d’inventé (cover_url null)', async () => {
    const o = objetArtiste({ name: 'X', source: 'tidal', source_id: '9' });
    expect(o).toEqual({ type: 'artiste', service: 'tidal', sourceId: '9', nom: 'X' });
    expect(await corpsDuDepot(o)).toMatchObject({ cover_url: null });
  });

  it('artiste de bibliothèque : désigné par son id, sans pochette', () => {
    const o = objetArtiste({ id: 42, name: 'Genesis', image_path: '/api/v1/library/artwork/a.jpg' });
    expect(o).toEqual({ type: 'artiste', id: 42, nom: 'Genesis' });
    expect(cibleEtiquetteObjet(o)).toEqual({ itemType: 'artist', itemId: 42 });
  });
});
