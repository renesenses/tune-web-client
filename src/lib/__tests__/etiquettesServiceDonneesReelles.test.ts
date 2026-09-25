// @vitest-environment jsdom
//
// Bertrand, 25/09/2026, sur le .18 (web + serveur v0.9.165) : « Le CTA tag est
// toujours absent des albums et playlists de streaming !! »
//
// #1594 avait posé le coin « Étiquettes » sur les vignettes d'ALBUM de
// service. Ses bancs montaient `PageWidgets` et `DiscographieCommune` avec
// une nouveauté écrite à la main. Celui-ci sert les RÉPONSES RÉELLES du .18
// (`qobuz18Etiquettes.fixture.json`, relevées le 25/09/2026 : nouveautés,
// sections éditoriales, playlists du compte et éditoriales, favoris du
// compte et du profil, recherche, parutions des artistes) à CHAQUE écran qui
// montre une vignette de service, et compte les coins rendus.
//
// Ce que la mesure a établi sur origin/main (= v0.9.165) :
//  - les vignettes d'ALBUM portent bien leur coin sur tous ces écrans ;
//  - AUCUNE vignette de PLAYLIST de service n'en porte : l'onglet Playlists
//    de l'écran Streaming (`tile(…, 'playlist')` → `null`), les bandes
//    « Playlists » de l'éditorial Qobuz et de l'accueil (`PageWidgets`, qui
//    ne passait que `el.fiche`, l'ALBUM), l'onglet d'un service de l'écran
//    Playlists (`PochetteActions` sans `etiquettes`). Le serveur les tient
//    pourtant (`playlist` ∈ `TAGGABLE_ITEM_TYPES`, #3699).
//
// Les écrans sont importés à la COLLECTE (#1326 / #1333).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import StreamingV2 from '../../components/v2/StreamingV2.svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import FavoritesV2 from '../../components/v2/FavoritesV2.svelte';
import PlaylistsV2 from '../../components/v2/PlaylistsV2.svelte';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { catalogueService, cleService } from '../widgetsService';
import { widgetParId } from '../accueilWidgets';
import { cibleEtiquetteAlbum, cibleEtiquettePlaylist } from '../cibleEtiquette';
import { activeStreamingService } from '../stores/streaming';
import { currentProfileId } from '../stores/profile';
import { currentZoneId } from '../stores/zones';
import Q from './qobuz18Etiquettes.fixture.json';

vi.setConfig({ testTimeout: 60_000 });

function reponse(corps: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

/** Copie profonde : un écran qui tamponne `source` ne doit pas salir le suivant. */
const frais = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Le serveur du .18, réduit aux routes que ces écrans appellent. */
function route(u: string): unknown {
  const p = new URL(u, 'http://x').pathname.replace(/^\/api\/v1/, '');
  if (p === '/streaming/services') return Q.services;
  const m = p.match(/^\/streaming\/qobuz\/(.*)$/);
  if (m) {
    const r = m[1];
    if (r === 'favorites/albums') return Q.favAlbums;
    if (r === 'favorites/tracks') return Q.favTracks;
    if (r === 'favorites/artists') return Q.favArtists;
    if (r === 'favorites/playlists') return Q.favPlaylists;
    if (r === 'featured/sections') return [{ id: 'new-releases', name: 'New Releases' }, { id: 'editor-picks', name: 'Editor Picks' }];
    if (r.startsWith('featured/')) return Q.featuredEditorPicks;
    if (r === 'featured') return Q.featured;
    if (r === 'new-releases') return Q.newReleases;
    if (/^playlists\/[^/]+\/tracks$/.test(r)) return [];
    if (/^playlists\/[^/]+$/.test(r)) return Q.playlistDetail;
    if (r === 'playlists') return Q.playlists;
    if (/^genres\/[^/]+\/albums$/.test(r)) return Q.genreAlbums;
    if (r === 'genres') return Q.genres;
    if (r === 'search') return Q.search;
    if (/^artists\/[^/]+\/albums$/.test(r)) return Q.artistAlbums;
    if (/^artists\/[^/]+$/.test(r)) return Q.artist;
    return [];
  }
  if (p === '/streaming/tidal/playlists') return Q.tidalPlaylists;
  if (p.startsWith('/streaming/')) return [];
  if (p === '/search') {
    return { local: { tracks: [], albums: [], artists: [], playlists: [] }, services: { qobuz: Q.search } };
  }
  if (/^\/profiles\/\d+\/favorites\/streaming/.test(p)) return Q.profilFavorisStreaming;
  if (p === '/home/artist-releases') return Q.artistReleases;
  if (p === '/profiles') return [{ id: 1, name: 'Default', avatar_color: '#6366f1' }];
  return [];
}

let parties: string[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  parties = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      parties.push(String(url));
      return reponse(frais(route(String(url))));
    }),
  );
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  currentProfileId.set(1);
  currentZoneId.set(1);
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  document.querySelectorAll('.fond').forEach((n) => n.remove());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const souffler = (ms = 10) => new Promise((r) => setTimeout(r, ms));
async function respirer(tours = 60, pret: () => boolean = () => false) {
  for (let i = 0; i < tours; i++) {
    await souffler();
    flushSync();
    if (pret()) break;
  }
}

/** Le coin « Étiquettes » de `PochetteActions` : en bas à droite. */
const coin = (c: Element) => c.querySelector('button.coin.br') as HTMLButtonElement | null;
/** Les vignettes SANS coin, par leur texte — c'est ce que l'échec doit nommer. */
function sansCoin(sel: string): string[] {
  return Array.from(hote!.querySelectorAll(sel))
    .filter((c) => !coin(c))
    .map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40));
}
const cartes = (sel: string) => hote!.querySelectorAll(sel).length;
const lecturesEtiquettes = () =>
  parties.filter((u) => u.includes('/tags/for-streaming')).map((u) => new URL(u, 'http://x').searchParams);

function cliquer(texte: RegExp) {
  const b = (Array.from(hote!.querySelectorAll('button')) as HTMLButtonElement[]).find((x) =>
    texte.test((x.textContent ?? '').trim()),
  );
  expect(b, `aucun bouton ${texte}`).toBeTruthy();
  b!.click();
}

describe('La règle, sur les objets tels que le .18 les rend', () => {
  it('un album Qobuz de /new-releases (ni `source` ni `id`) : la paire, par l’onglet', () => {
    const a = Q.newReleases[0];
    expect(cibleEtiquetteAlbum(a, 'qobuz')).toMatchObject({ itemType: 'album', source: 'qobuz', sourceId: a.source_id });
  });

  it('une playlist Qobuz de /playlists (ni `source` ni `id`) : la paire, par le service', () => {
    const pl = Q.playlists[0];
    expect(cibleEtiquettePlaylist(pl, 'qobuz')).toEqual({
      itemType: 'playlist',
      source: 'qobuz',
      sourceId: '70608857',
      titre: pl.name,
      artiste: null,
      album: null,
      pochette: pl.cover_path,
    });
  });

  it('une playlist Tidal (identifiant UUID) et une playlist éditoriale Qobuz', () => {
    expect(cibleEtiquettePlaylist(Q.tidalPlaylists[0], 'tidal')).toMatchObject({
      itemType: 'playlist', source: 'tidal', sourceId: Q.tidalPlaylists[0].source_id,
    });
    expect(cibleEtiquettePlaylist(Q.featured[0], 'qobuz')).toMatchObject({
      itemType: 'playlist', source: 'qobuz', sourceId: Q.featured[0].source_id,
    });
  });

  it('une playlist LOCALE garde son identifiant ; sans rien d’exploitable, pas de bouton', () => {
    expect(cibleEtiquettePlaylist({ id: 12, name: 'Soir' })).toEqual({ itemType: 'playlist', itemId: 12 });
    expect(cibleEtiquettePlaylist({ id: 12, name: 'Soir', source: 'local' }, 'qobuz')).toEqual({ itemType: 'playlist', itemId: 12 });
    expect(cibleEtiquettePlaylist({ id: 0, name: 'Soir' })).toBeNull();
    expect(cibleEtiquettePlaylist({ name: 'Sans id' }, 'qobuz')).toBeNull();
    expect(cibleEtiquettePlaylist(null, 'qobuz')).toBeNull();
  });
});

describe('Écran Streaming > Qobuz, sur les réponses du .18', () => {
  async function monterQobuz() {
    activeStreamingService.set('qobuz');
    monte = mount(StreamingV2, { target: hote! });
    await respirer(80, () => cartes('.carte') > 0);
  }

  it('Éditorial : chaque vignette — album ET playlist — porte son coin', async () => {
    await monterQobuz();
    expect(cartes('.carte'), 'l’éditorial n’a monté aucune vignette').toBeGreaterThan(0);
    expect(sansCoin('.carte'), 'vignettes de l’éditorial sans coin « Étiquettes »').toEqual([]);
  });

  it('Playlists : chaque playlist du compte porte son coin, qui interroge la paire playlist', async () => {
    await monterQobuz();
    cliquer(/^Playlists$/);
    await respirer(60, () => cartes('.card') > 0);
    expect(cartes('.card'), 'l’onglet Playlists n’a monté aucune vignette').toBe(Q.playlists.length);
    expect(sansCoin('.card'), 'playlists Qobuz sans coin « Étiquettes »').toEqual([]);

    coin(hote!.querySelector('.card')!)!.click();
    await respirer(60, () => lecturesEtiquettes().length > 0);
    const q = lecturesEtiquettes()[0];
    expect(q, 'le panneau n’a interrogé aucune étiquette').toBeTruthy();
    expect(q.get('item_type')).toBe('playlist');
    expect(q.get('source')).toBe('qobuz');
    expect(q.get('source_id')).toBe(Q.playlists[0].source_id);
  });

  it('Favoris : chaque album favori du compte porte son coin', async () => {
    await monterQobuz();
    cliquer(/^Favoris$/);
    await respirer(60, () => cartes('.card') > 0);
    expect(cartes('.card')).toBe(Q.favAlbums.albums.length);
    expect(sansCoin('.card')).toEqual([]);
  });
});

describe('PageWidgets, sur les réponses du .18', () => {
  it('le catalogue Qobuz entier (nouveautés, sections, playlists, favoris, genres)', async () => {
    const catalogue = await catalogueService('qobuz');
    monte = mount(PageWidgets, {
      target: hote!,
      props: { catalogue, dispositionDefaut: catalogue.map((w) => w.id), cle: cleService('qobuz') },
    });
    await respirer(100, () => cartes('.carte') > 20);
    expect(cartes('.carte')).toBeGreaterThan(0);
    expect(sansCoin('.carte'), 'vignettes Qobuz sans coin « Étiquettes »').toEqual([]);
  });

  it('l’accueil : favoris du profil (Qobuz + Tidal) et nouveautés de vos artistes', async () => {
    const ws = ['favoris', 'nouveautes-artistes'].map((i) => widgetParId(i)!);
    monte = mount(PageWidgets, {
      target: hote!,
      props: { catalogue: ws, dispositionDefaut: ws.map((w) => w.id), cle: 'accueil_etiquettes_test' },
    });
    await respirer(100, () => cartes('.carte') >= 6);
    expect(cartes('.carte')).toBe(Q.profilFavorisStreaming.length + Q.artistReleases.length);
    expect(sansCoin('.carte')).toEqual([]);
  });
});

describe('Autres écrans, sur les réponses du .18', () => {
  it('Recherche : les albums Qobuz trouvés portent leur coin', async () => {
    monte = mount(SearchV2, { target: hote! });
    await respirer(40);
    const champ = hote!.querySelector('input') as HTMLInputElement;
    expect(champ, 'la recherche n’a pas de champ').toBeTruthy();
    champ.value = 'parisien';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await respirer(150, () => cartes('.card') > 0);
    expect(cartes('.card')).toBe(Q.search.albums.length);
    expect(sansCoin('.card')).toEqual([]);
  });

  it('Favoris : les albums de service du profil portent leur coin', async () => {
    monte = mount(FavoritesV2, { target: hote! });
    await respirer(80, () => cartes('.card') > 0);
    expect(cartes('.card')).toBe(Q.profilFavorisStreaming.length);
    expect(sansCoin('.card')).toEqual([]);
  });

  it('Playlists > Qobuz : chaque playlist du service porte son coin', async () => {
    monte = mount(PlaylistsV2, { target: hote! });
    // La pastille porte la clé du service, en minuscules.
    await respirer(80, () => !!hote!.querySelector('nav.srcs'));
    cliquer(/^qobuz/);
    await respirer(60, () => cartes('.card') > 0);
    expect(cartes('.card')).toBe(Q.playlists.length);
    expect(sansCoin('.card'), 'playlists Qobuz de l’écran Playlists sans coin').toEqual([]);
  });

  it('la fiche d’une playlist Qobuz garde son bouton, par la même règle', async () => {
    monte = mount(PlaylistDetailV2, {
      target: hote!,
      props: { item: { kind: 'streaming', service: 'qobuz', pl: frais(Q.playlists[0]) as any }, onClose: () => {} },
    });
    await respirer(40);
    const b = (Array.from(hote!.querySelectorAll('button')) as HTMLButtonElement[]).find((x) =>
      /Étiquettes/.test(x.textContent ?? ''),
    );
    expect(b, 'la fiche n’a plus de bouton « Étiquettes »').toBeTruthy();
  });
});
