// @vitest-environment jsdom
//
// renesenses/tune-web-client#1838 — « Écouter plus tard » : les éléments de la
// grille n'ont pas de pochette. Bertrand, .18, v0.9.169, 30/09/2026.
//
// Formes RÉELLES relevées sur le .18 le 30/09/2026 (lecture seule) :
//
//   GET /tags/6/playlists →
//     {"cover_path":null,"description":null,"id":null,
//      "name":"Inspired by PWK : The Lost Tapes","source":"qobuz",
//      "source_id":"69669008","tagged_at":"2026-09-29T15:18:39Z","track_count":null}
//   GET /streaming/qobuz/playlists/69669008 →
//     {"cover_path":"https://static.qobuz.com/images/playlists/69669008_…_rectangle.jpg",…}
//   GET /playlists → {"description":"Importée au scan","id":23,
//      "name":"00. Genesis - Genesis","track_count":9}   (aucune image)
//   GET /playlists/23/tracks → [{"cover_path":"5796e66f…","album_title":"The Shorts",…}]
//   GET /tags/4/albums → {"cover_path":"https://static.qobuz.com/images/covers/…_600.jpg",
//      "id":null,"source":"qobuz","source_id":"i96wb9kyuzrea",…}
//
// Deux causes, deux témoins : l'écran (les lignes déjà posées sans image) et
// le DÉPÔT (qui les posait sans image).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import EcouterPlusTardV2 from '../../components/v2/EcouterPlusTardV2.svelte';
import { oublierSas } from '../ecouterPlusTard';
import { currentProfileId } from '../stores/profile';
import { cibleEtiquetteObjet, objetPlaylist } from '../gestesObjet';
import { poserEtiquette } from '../cibleEtiquette';

const IMG_PWK = 'https://static.qobuz.com/images/playlists/69669008_d44a7c93dede8e1b68c251a08209b772_rectangle.jpg';
const IMG_BOWIE = 'https://static.qobuz.com/images/covers/ea/zr/i96wb9kyuzrea_600.jpg';
const H1 = '5796e66f0c5a90711fa78e8405a838bc3a3d514176d59855f8e5de53a9fd1669';
const H2 = '79c0ef56e751b650672ad24cea44f0902fe7546ddba953dcfbc3e17d750ad2f9';

const ALBUMS = [
  { artist_name: 'David Bowie', cover_path: IMG_BOWIE, id: null, source: 'qobuz', source_id: 'i96wb9kyuzrea',
    tagged_at: '2026-09-22T09:47:42Z', title: "I Can't Give Everything Away (2002 - 2016)" },
];
const LISTES = [
  { cover_path: null, description: null, id: null, name: 'Inspired by PWK : The Lost Tapes', source: 'qobuz',
    source_id: '69669008', tagged_at: '2026-09-29T15:18:39Z', track_count: null },
  { id: 23, name: '00. Genesis - Genesis', description: 'Importée au scan', track_count: 9,
    tagged_at: '2026-09-29T15:10:00Z' },
];
const PISTES_23 = [
  { id: 128299, title: 'Mama', album_id: 11520, album_title: 'The Shorts', cover_path: H1, source: 'local' },
  { id: 128300, title: 'Home by the Sea', album_id: 11521, album_title: 'Genesis', cover_path: H2, source: 'local' },
];

let serviceEnPanne = false;
const appels: { url: string; init?: RequestInit }[] = [];

function reponse(url: string): { status: number; corps: unknown } {
  if (/\/profiles\/1\/settings/.test(url)) return { status: 200, corps: { ecouterPlusTardEtiquette: 6 } };
  if (/\/tags\/6\/albums/.test(url)) return { status: 200, corps: { tag_id: 6, albums: ALBUMS, count: 1 } };
  if (/\/tags\/6\/tracks/.test(url)) return { status: 200, corps: { tag_id: 6, tracks: [], count: 0 } };
  if (/\/tags\/6\/playlists/.test(url)) return { status: 200, corps: { tag_id: 6, playlists: LISTES, count: 2 } };
  if (/\/tags\/6\/streaming-items/.test(url)) return { status: 201, corps: {} };
  if (/\/tags\/?(\?|$)/.test(url)) return { status: 200, corps: [{ id: 6, name: 'Écouter plus tard', color: '#808080', count: 3 }] };
  if (/\/streaming\/qobuz\/playlists\/69669008$/.test(url)) {
    return serviceEnPanne
      ? { status: 502, corps: { error: 'qobuz /playlist/get: 404' } }
      : { status: 200, corps: { cover_path: IMG_PWK, name: 'Inspired by PWK : The Lost Tapes', source_id: '69669008', track_count: 24 } };
  }
  if (/\/playlists\/23\/tracks/.test(url)) return { status: 200, corps: PISTES_23 };
  return { status: 200, corps: [] };
}

const montes: { m: Record<string, any>; h: HTMLDivElement }[] = [];
const respirer = (ms = 150) => new Promise((r) => setTimeout(r, ms));

async function poser(): Promise<HTMLDivElement> {
  const h = document.createElement('div');
  document.body.appendChild(h);
  const m = mount(EcouterPlusTardV2, { target: h, props: {} as any });
  montes.push({ m, h });
  flushSync();
  await respirer();
  flushSync();
  await respirer();
  flushSync();
  return h;
}

beforeEach(() => {
  serviceEnPanne = false;
  appels.length = 0;
  localStorage.clear();
  oublierSas();
  vi.stubGlobal('fetch', vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entree);
    appels.push({ url, init });
    const { status, corps } = reponse(url);
    return {
      ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Bad Gateway',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close(){} addEventListener(){} removeEventListener(){} send(){} } as any);
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  vi.stubGlobal('IntersectionObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  currentProfileId.set(1);
});

afterEach(() => {
  for (const { m, h } of montes.splice(0)) { unmount(m); h.remove(); }
  vi.unstubAllGlobals();
  localStorage.clear();
  oublierSas();
});

/** Les `src` d'images dessinées dans la carte dont le titre est `titre`. */
function images(h: HTMLElement, titre: string): string[] {
  const carte = Array.from(h.querySelectorAll<HTMLElement>('[data-genre]'))
    .find((c) => c.querySelector('.ct')?.textContent?.trim() === titre);
  expect(carte, `la carte « ${titre} » est absente — témoin sans objet`).toBeTruthy();
  return Array.from(carte!.querySelectorAll('img')).map((i) => decodeURIComponent(i.getAttribute('src') ?? ''));
}

describe('#1838 — l’écran du sas montre une image pour chaque élément', () => {
  it('🔴 playlist Qobuz déposée SANS image (forme du .18) : l’image du service, par la route d’artwork', async () => {
    const h = await poser();
    expect(appels.some((a) => /\/streaming\/qobuz\/playlists\/69669008$/.test(a.url))).toBe(true);
    const src = images(h, 'Inspired by PWK : The Lost Tapes');
    expect(src).toHaveLength(1);
    expect(src[0]).toContain('/library/artwork/proxy?url=');
    expect(src[0]).toContain(IMG_PWK);
  });

  it('🔴 playlist de BIBLIOTHÈQUE : la mosaïque des pochettes de ses pistes', async () => {
    const h = await poser();
    expect(appels.some((a) => /\/playlists\/23\/tracks/.test(a.url))).toBe(true);
    const src = images(h, '00. Genesis - Genesis');
    expect(src).toHaveLength(4);
    expect(src.some((s) => s.endsWith(`/library/artwork/${H1}`))).toBe(true);
    expect(src.some((s) => s.endsWith(`/library/artwork/${H2}`))).toBe(true);
  });

  it('album Qobuz : son cover_path, par le relais d’artwork (jamais brut en src)', async () => {
    const h = await poser();
    const src = images(h, "I Can't Give Everything Away (2002 - 2016)");
    expect(src).toHaveLength(1);
    expect(src[0]).toContain('/library/artwork/proxy?url=');
    expect(src[0]).not.toBe(IMG_BOWIE);
  });

  it('service en panne (502) : la playlist garde sa vignette de repli, les autres leur image', async () => {
    serviceEnPanne = true;
    const h = await poser();
    expect(images(h, 'Inspired by PWK : The Lost Tapes')).toEqual([]);
    const carte = Array.from(h.querySelectorAll<HTMLElement>('[data-genre="playlist"]'))
      .find((c) => c.textContent?.includes('PWK'));
    expect(carte?.querySelector('.repli')).toBeTruthy();
    expect(images(h, '00. Genesis - Genesis')).toHaveLength(4);
  });

  it('une playlist de service qui PORTE son image ne redemande rien au service', async () => {
    const avant = LISTES[0].cover_path;
    (LISTES[0] as any).cover_path = IMG_PWK;
    try {
      const h = await poser();
      expect(appels.some((a) => /\/streaming\/qobuz\/playlists\//.test(a.url))).toBe(false);
      expect(images(h, 'Inspired by PWK : The Lost Tapes')[0]).toContain(IMG_PWK);
    } finally {
      (LISTES[0] as any).cover_path = avant;
    }
  });
});

describe('#1838 — le dépôt d’une playlist de service emporte son image', () => {
  it('🔴 objetPlaylist → cibleEtiquetteObjet → POST streaming-items porte cover_url', async () => {
    // La forme de `/streaming/qobuz/featured-playlists/by-tag` sur le .18 :
    // pas de `source`, le service vient de l'onglet.
    const pl = { cover_path: IMG_PWK, name: 'Inspired by PWK : The Lost Tapes', owner: 'Mag Haute Fidélité',
      source_id: '69669008', track_count: 24 };
    const cible = cibleEtiquetteObjet(objetPlaylist(pl, 'qobuz'));
    expect(cible).toBeTruthy();
    await poserEtiquette(6, cible!);
    const post = appels.find((a) => /\/tags\/6\/streaming-items$/.test(a.url));
    expect(post, 'aucun dépôt envoyé').toBeTruthy();
    const corps = JSON.parse(String(post!.init?.body ?? '{}'));
    expect(corps).toMatchObject({ item_type: 'playlist', source: 'qobuz', source_id: '69669008', cover_url: IMG_PWK });
  });

  it('playlist locale : aucune pochette inventée, elle se désigne par son id', () => {
    const o = objetPlaylist({ id: 23, name: '00. Genesis - Genesis', track_count: 9 });
    expect(o).toEqual({ type: 'playlist', id: 23, nom: '00. Genesis - Genesis' });
    expect(cibleEtiquetteObjet(o)).toEqual({ itemType: 'playlist', itemId: 23 });
  });
});
