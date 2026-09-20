// @vitest-environment jsdom
//
// LA DISCOGRAPHIE S'ARRÊTAIT À LA PREMIÈRE PAGE — #1343.
//
// FabienM, fil forum 1859 (20/09/2026), v0.9.158, point 5 :
//
//   « La liste des albums d'un artiste est incomplète. Exemple. Neil Young
//     vient de sortir un album "Second Song", il est référencé dans Qobuz […]
//     Mais je ne vois pas cet album quand je cherche l'artiste Neil Young ou
//     que j'accède à la page de l'artiste Neil Young […] Est-ce que Tune ne
//     remonte pas l'album car l'album a 2 artistes ? »
//
// 🔴 NON — ET C'EST MESURÉ. Le ticket retenait l'hypothèse de FabienM : Qobuz
// rattacherait « Second Song » à une SECONDE entité (« Neil Young & The
// Chrome Hearts ») que la résolution par nom ne retient pas. Trois appels au
// .18 le 20/09/2026 l'écartent :
//
//   GET /streaming/qobuz/search?q=Second Song Neil Young
//     → {"title":"Second Song","artist_id":"35865","artist_name":"Neil Young"}
//   GET /streaming/qobuz/artists/35865/albums
//     → 50 albums, « Second Song » ABSENT
//   GET /streaming/qobuz/artists/35865/albums?offset=50
//     → 50 albums, « Second Song » PRÉSENT
//
// L'album est sous l'entité « Neil Young » — celle que le client résout déjà.
// Il est à la DEUXIÈME page, et le client n'en demandait qu'une : la route ne
// connaît que `offset` (`tune-streaming-http/src/lib.rs:611`, `limit` n'y est
// pas lu — `limit=200` rend 50), `getStreamingArtistAlbums` portait ce
// paramètre depuis toujours, et AUCUN appelant ne s'en servait.
//
// ⚠️ CE QUE CE TÉMOIN GARDE. Pas une URL dans du texte : l'écran est MONTÉ,
// `fetch` est bouchonné, et la garde lit les URL réellement demandées et les
// vignettes réellement rendues. Le décor reproduit la mesure ci-dessus —
// page pleine sans l'album, page 2 avec, page 3 courte.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ArtistesV2 from '../../components/v2/ArtistesV2.svelte';
import * as api from '../api';
import { streamingServices } from '../stores/streaming';
import { currentZoneId } from '../stores/zones';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });

/**
 * La taille d'une page et le plafond sont écrits ICI EN CLAIR, et non repris
 * de `api` : un décor bâti sur les constantes du correctif s'effondrerait
 * `undefined` sans lui, et le rouge ne dirait plus rien du défaut. Un témoin
 * plus bas vérifie que le module annonce bien ces deux valeurs.
 */
const PAGE = 50;
const PAGES_MAX = 6;

/** L'identifiant que Qobuz rend pour « Neil Young » — mesuré, pas inventé. */
const QID = '35865';
const ARTISTE = { id: 3, name: 'Neil Young', image_path: null, musicbrainz_id: null };
const LOCAUX: Partial<Album>[] = [{ id: 11, title: 'Harvest', year: 1972 }];

/** Une page PLEINE : c'est sa taille qui dit au client qu'il en reste. */
function page(prefixe: string, n = PAGE): Partial<Album>[] {
  return Array.from({ length: n }, (_, i) => ({
    id: null, title: `${prefixe} ${i + 1}`, source_id: `${prefixe}-${i + 1}`, year: 1970 + i,
  }));
}

/** La deuxième page, celle qui porte l'album de Fabien. */
const PAGE_2 = [
  { id: null, title: 'Second Song', source_id: 'atua1kxxk4tis', year: 2026 },
  ...page('P2', PAGE - 1),
];

let appels: string[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function corpsPour(url: string): unknown {
  if (/\/streaming\/services/.test(url)) {
    return { qobuz: { enabled: true, authenticated: true } };
  }
  if (/\/search\?/.test(url)) {
    return {
      local: { tracks: [], albums: [], artists: [], playlists: [] },
      services: {
        qobuz: { tracks: [], albums: [], artists: [{ id: QID, name: 'Neil Young' }], playlists: [] },
      },
    };
  }
  const albums = new RegExp(`/streaming/qobuz/artists/${QID}/albums`).test(url);
  if (albums) {
    const off = Number(new URL(url, 'http://x').searchParams.get('offset') ?? 0);
    // Le décor de la mesure : deux pages pleines, la troisième courte.
    if (off === 0) return page('P1');
    if (off === PAGE) return PAGE_2;
    if (off === PAGE * 2) return page('P3', 3);
    return [];
  }
  if (new RegExp(`/streaming/qobuz/artists/${QID}/top-tracks`).test(url)) return [];
  if (/\/library\/artists\/3\/bio/.test(url)) return { artist: 'Neil Young', bio: '' };
  if (/\/library\/artists\/3\/albums/.test(url)) return LOCAUX;
  if (/\/library\/artists/.test(url)) return [ARTISTE];
  return {};
}

beforeEach(() => {
  appels = [];
  currentZoneId.set(1);
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  streamingServices.set({ qobuz: { enabled: true, authenticated: true } as never });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      appels.push(String(url));
      const corps = corpsPour(String(url));
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps,
        text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  streamingServices.set({});
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

async function poserFiche(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ArtistesV2, { target: hote, props: { q: '', ouvrirId: 3 } });
  for (let i = 0; i < 16; i++) await respirer();
  flushSync();
  return hote;
}

const titres = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('.carte .ct')).map((n) => n.textContent);

const offsets = () =>
  appels
    .filter((u) => new RegExp(`/streaming/qobuz/artists/${QID}/albums`).test(u))
    .map((u) => Number(new URL(u, 'http://x').searchParams.get('offset') ?? 0))
    .sort((a, b) => a - b);

describe('#1343 — la fiche artiste demande TOUTES les pages du service', () => {
  it('« Second Song » est à l’écran — le cas de FabienM', async () => {
    const el = await poserFiche();
    const vus = titres(el);
    expect(
      vus,
      'l’album de la DEUXIÈME page de Qobuz manque : c’est mot pour mot le signalement.\n' +
        `offsets demandés : ${JSON.stringify(offsets())}`,
    ).toContain('Second Song');
  });

  it('la deuxième page est bel et bien demandée', async () => {
    await poserFiche();
    expect(
      offsets(),
      'le client n’a demandé que la première page — `offset` existait et ne servait à rien',
    ).toContain(PAGE);
  });

  it('une page COURTE arrête la pagination : rien au-delà', async () => {
    // Sans cet arrêt, la fiche enchaînerait des pages vides jusqu'au plafond.
    await poserFiche();
    expect(
      offsets().filter((o) => o > PAGE * 2),
      'la pagination a continué après une page incomplète',
    ).toEqual([]);
  });

  it('la première page reste demandée SANS `offset` — l’URL d’avant ne change pas', async () => {
    await poserFiche();
    expect(
      appels.some((u) => new RegExp(`/streaming/qobuz/artists/${QID}/albums$`).test(u)),
      'la première page doit garder son URL nue',
    ).toBe(true);
  });
});

describe('#1343 — `getStreamingArtistAlbumsAll`, appelée pour de bon', () => {
  it('le module annonce la page mesurée et son plafond', () => {
    expect(api.ALBUMS_ARTISTE_PAGE, 'la route rend 50 albums par appel, mesuré sur le .18').toBe(PAGE);
    expect(api.ALBUMS_ARTISTE_PAGES_MAX).toBe(PAGES_MAX);
  });

  it('enchaîne les pages pleines et les concatène dans l’ordre', async () => {
    const tout = await api.getStreamingArtistAlbumsAll('qobuz', QID);
    expect(tout).toHaveLength(PAGE * 2 + 3);
    expect(tout.map((a) => a.title)).toContain('Second Song');
    expect(offsets()).toEqual([0, PAGE, PAGE * 2]);
  });

  it('🔴 BORNÉE : des pages toujours pleines ne font pas tourner la boucle sans fin', async () => {
    // Neil Young compte 811 albums chez Qobuz (mesuré : `offset=800` en rend
    // 11). Le plafond est ce qui empêche seize allers-retours par service.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        appels.push(String(url));
        const corps = page('SANS FIN');
        return {
          ok: true, status: 200, statusText: 'OK',
          headers: new Map([['content-type', 'application/json']]),
          json: async () => corps, text: async () => JSON.stringify(corps),
        } as unknown as Response;
      }),
    );
    const tout = await api.getStreamingArtistAlbumsAll('qobuz', QID);
    expect(offsets()).toHaveLength(PAGES_MAX);
    expect(tout).toHaveLength(PAGE * PAGES_MAX);
  });

  it('une page VIDE d’entrée rend une liste vide, et un seul appel', async () => {
    const tout = await api.getStreamingArtistAlbumsAll('qobuz', 'INCONNU');
    expect(tout).toEqual([]);
    expect(appels.filter((u) => /INCONNU/.test(u))).toHaveLength(1);
  });
});
