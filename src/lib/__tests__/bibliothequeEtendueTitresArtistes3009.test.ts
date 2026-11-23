// @vitest-environment jsdom
//
// Fil 3009, point 6 (FabienM, v1.0.0-rc13) — « Menu bibliothèque : onglets
// titres et artistes : la source Qobuz est absente (alors que j'ai des titres
// et artistes favoris Qobuz). Le paramètre "Bibliothèque élargie aux favoris
// des services" est activé. »
//
// Le réglage (#6482, #7780) n'élargissait que l'onglet ALBUMS : seul lui
// demandait `/profiles/{id}/favorites/streaming`. Les onglets Titres et
// Artistes ne connaissaient que la bibliothèque, et leur menu « Source » ne
// pouvait pas proposer Qobuz.
//
// Les témoins MONTENT la Bibliothèque, ouvrent l'onglet, puis le menu Source.
// Contre-épreuve : avec `LibraryV2` et `ArtistesV2` de `origin/main`
// (a10e4118), aucun favori de titre ni d'artiste n'est demandé, le menu n'a
// pas d'entrée QOBUZ : les deux témoins d'écran rougissent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { currentProfileId } from '../stores/profile';
import { currentZoneId as zoneCourante } from '../stores/zones';
import { _remiseAZeroPourTests as remiseAlbums } from '../stores/albumsPagines';
import { _remiseAZeroPourTests as remisePistes } from '../stores/pistesEntieres';
import { _remiseAZeroPourTests as remisePagination } from '../pistesPaginees';
import { sourcesArtistesServeur } from '../stores/sourcesArtistesServeur';
import {
  artistesDesFavorisDeService, artistesSansDoublon, bibliothequeEtendueActive, comptesAvecFavoris, estSourceDeService,
  pistesDesFavorisDeService, reglageEtendueLu, titresAbsentsDeLaBibliotheque, titresSansDoublon,
} from '../bibliothequeEtendue';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
vi.setConfig({ testTimeout: 30_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

const FAVORIS_TITRES = [
  { id: 1, profile_id: 1, item_type: 'track', service: 'qobuz', service_id: '59983347', title: 'Sugar Man', artist: 'Rodriguez', album: 'Cold Fact', album_id_service: '0060253753283' },
  { id: 2, profile_id: 1, item_type: 'track', service: 'qobuz', service_id: '82542200', title: "Ça c'est fait", artist: 'Sébastien Tellier' },
  // En double : écarté.
  { id: 3, profile_id: 1, item_type: 'track', service: 'qobuz', service_id: '59983347', title: 'Sugar Man' },
  // Déjà dans la bibliothèque (même titre, même interprète, casse et accents près) : une seule ligne.
  { id: 5, profile_id: 1, item_type: 'track', service: 'qobuz', service_id: '11111111', title: 'PISTE LOCALE', artist: 'A' },
];
const FAVORIS_ARTISTES = [
  { id: 4, profile_id: 1, item_type: 'artist', service: 'qobuz', service_id: '453411', title: 'Alela Diane', cover_url: 'https://static.qobuz.com/a.jpg' },
  // Déjà dans la bibliothèque, et déjà apporté par Qobuz : une seule carte chacun.
  { id: 6, profile_id: 1, item_type: 'artist', service: 'qobuz', service_id: '777', title: 'Artiste LOCAL' },
  { id: 7, profile_id: 1, item_type: 'artist', service: 'tidal', service_id: '888', title: 'Alela Diane' },
];
const LOCALES = [
  { id: 1, title: 'Piste locale', album_id: 1, artist_id: 1, artist_name: 'A', source: 'local' },
  // Une piste de la BIBLIOTHÈQUE venue de Qobuz : choisir QOBUZ la garde (la liste est COMPLÉTÉE, pas remplacée).
  { id: 2, title: 'Importée Qobuz', album_id: 2, artist_id: 2, artist_name: 'B', source: 'qobuz' },
];

let urls: string[] = [];
function corpsPour(u: string): unknown {
  if (/\/profiles\/1\/settings\/bibliotheque-etendue/.test(u)) return { enabled: true };
  if (/\/profiles\/1\/favorites\/streaming\?item_type=track/.test(u)) return FAVORIS_TITRES;
  if (/\/profiles\/1\/favorites\/streaming\?item_type=artist/.test(u)) return FAVORIS_ARTISTES;
  if (/\/profiles\/1\/favorites\/streaming/.test(u)) return [];
  if (/\/library\/tracks\?/.test(u)) {
    const p = new URL(u, 'http://x').searchParams;
    const prov = p.get('provenance');
    const search = (p.get('search') ?? '').toLowerCase();
    const items = LOCALES.filter((t) => (!prov || t.source === prov) && (!search || t.title.toLowerCase().includes(search)));
    // Un serveur qui PAGINE : il renvoie `sort` et `order` (sinon le client retombe sur la liste entière).
    const corps: Record<string, unknown> = {
      items, total: items.length, limit: Number(p.get('limit') ?? 50), offset: 0, sort: p.get('sort'), order: p.get('order') ?? 'asc',
    };
    if (p.get('counts') === 'sources') { corps.source_counts = { local: 1, qobuz: 1 }; corps.total_all_sources = LOCALES.length; }
    return corps;
  }
  if (/\/library\/artists/.test(u)) {
    const items = [{ id: 1, name: 'Artiste local', ...(/provenances=1/.test(u) ? { provenances: { local: { albums: 1, pistes: 1 } } } : {}) }];
    return { items, total: items.length };
  }
  if (/\/library\/albums/.test(u)) return { items: [], total: 0 };
  if (/\/library\/stats/.test(u)) return { tracks: 1 };
  if (/\/(zones|playlists|network)/.test(u)) return [];
  return {};
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function jusqua(c: () => boolean, borne = 8000) {
  const fin = Date.now() + borne;
  for (;;) { flushSync(); if (c() || Date.now() >= fin) return; await respirer(); }
}

beforeEach(() => {
  urls = [];
  remiseAlbums(); remisePistes(); remisePagination();
  sourcesArtistesServeur.set(null);
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  localStorage.clear();
  currentProfileId.set(1);
  zoneCourante.set(1);
  bibliothequeEtendueActive.set(true); reglageEtendueLu.set(false);
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    urls.push(u);
    const corps = corpsPour(u);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  albumsStore.set([]);
  sourcesArtistesServeur.set(null);
  activeView.set('home');
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function ouvrirOnglet(cle: string): Promise<HTMLElement> {
  activeView.set('library');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as any });
  for (let i = 0; i < 10; i++) await respirer();
  const b = [...hote.querySelectorAll('button.tab')].find((x) => (x.textContent ?? '').trim().startsWith(fr[cle]));
  expect(b, `aucun onglet ${cle}`).toBeTruthy();
  (b as HTMLElement).click();
  for (let i = 0; i < 30; i++) await respirer();
  flushSync();
  return hote;
}

/** Les entrées du menu Source, une fois ses comptes arrivés. */
async function entreesSource(el: HTMLElement): Promise<string[]> {
  const puce = el.querySelector<HTMLElement>('[data-puce="provenance"] > button.chip');
  expect(puce, 'pas de menu Source').toBeTruthy();
  // L'approche du menu demande ses comptes (#4800), comme le survol réel.
  el.querySelector('[data-puce="provenance"]')!.dispatchEvent(new Event('pointerenter'));
  puce!.click();
  const lire = () => [...el.querySelectorAll('[data-puce="provenance"] .menu button')].map((b) => (b.textContent ?? '').trim().replace(/\s+/g, ' '));
  await jusqua(() => lire().some((t) => t.startsWith('QOBUZ')), 4000);
  return lire();
}

function choisir(el: HTMLElement, prefixe: string) {
  const b = [...el.querySelectorAll<HTMLButtonElement>('[data-puce="provenance"] .menu button')].find((x) => (x.textContent ?? '').trim().startsWith(prefixe));
  expect(b, `pas d'entrée ${prefixe}`).toBeTruthy();
  b!.click();
}

describe('fil 3009, point 6 — Bibliothèque élargie : onglets Titres et Artistes', () => {
  it('Titres : le menu Source propose QOBUZ, et le choisir montre les titres favoris Qobuz', async () => {
    const el = await ouvrirOnglet('favorites.tracks');
    expect(urls.some((u) => /favorites\/streaming\?item_type=track&pour=bibliotheque/.test(u)), 'les titres favoris des services ne sont pas demandés').toBe(true);
    const entrees = await entreesSource(el);
    expect(entrees.some((e) => /^QOBUZ\b/.test(e)), `pas de QOBUZ dans le menu Source : ${JSON.stringify(entrees)}`).toBe(true);
    choisir(el, 'QOBUZ');
    // La fenêtre précédente reste affichée tant que celle de QOBUZ n'est pas arrivée.
    await jusqua(() => { const t = el.querySelector('.tracklist')?.textContent ?? ''; return t.includes('Sugar Man') && !t.includes('Piste locale'); });
    const liste = el.querySelector('.tracklist')?.textContent ?? '';
    expect(liste).toContain('Sugar Man');
    expect(liste).toContain("Ça c'est fait");
    expect(liste).not.toContain('Piste locale');
    // Relecture du 23/11 : la bibliothèque de cette provenance reste, les favoris la complètent.
    expect(liste).toContain('Importée Qobuz');
  });

  it('Titres, « Toutes les sources » (décision du 23/11) : la bibliothèque, puis ses favoris absents, sans doublon', async () => {
    const el = await ouvrirOnglet('favorites.tracks');
    const texte = () => el.querySelector('.tracklist')?.textContent ?? '';
    await jusqua(() => texte().includes('Sugar Man'));
    expect(texte()).toContain('Piste locale');
    expect(texte()).toContain('Sugar Man');
    expect(texte()).toContain("Ça c'est fait");
    // Le favori qui double la piste locale ne fait pas de seconde ligne.
    expect(texte().match(/piste locale/gi) ?? []).toHaveLength(1);
    expect(texte()).toContain('Importée Qobuz');
    expect(el.querySelectorAll('.tracklist .trow')).toHaveLength(4);
    // La bibliothèque reste servie par pages : aucune liste entière demandée.
    expect(urls.filter((u) => /\/library\/tracks\?limit=5000/.test(u)), 'URLS').toEqual([]);
  });

  it('Artistes : le menu Source propose QOBUZ, et le choisir montre les artistes favoris Qobuz', async () => {
    const el = await ouvrirOnglet('favorites.artists');
    expect(urls.some((u) => /favorites\/streaming\?item_type=artist&pour=bibliotheque/.test(u)), 'les artistes favoris des services ne sont pas demandés').toBe(true);
    const entrees = await entreesSource(el);
    expect(entrees.some((e) => /^QOBUZ\b/.test(e)), `pas de QOBUZ dans le menu Source : ${JSON.stringify(entrees)}`).toBe(true);
    choisir(el, 'QOBUZ');
    const noms = () => [...el.querySelectorAll('.grille.artistes .carte .ct')].map((e) => e.textContent?.trim());
    await jusqua(() => noms().includes('Alela Diane'));
    expect(noms()).toEqual(['Alela Diane', 'Artiste LOCAL']);
  });

  it('Artistes, « Toutes les sources » (décision du 23/11) : bibliothèque et favoris réunis, chacun une fois', async () => {
    const el = await ouvrirOnglet('favorites.artists');
    const noms = () => [...el.querySelectorAll('.grille.artistes .carte .ct')].map((e) => e.textContent?.trim());
    await jusqua(() => noms().includes('Alela Diane'));
    expect(noms()).toEqual(['Alela Diane', 'Artiste local']);
  });
});

describe('fil 3009, point 6 — dédoublonnage (décision du 23/11)', () => {
  it('titres : la bibliothèque l’emporte, puis le premier service ; casse, accents et espaces ne comptent pas', () => {
    const locaux = [{ title: 'Été indien', artist_name: 'Joe Dassin' }];
    const favoris = [
      { title: 'ete  INDIEN', artist_name: 'joe dassin', source: 'qobuz' },
      { title: 'Sugar Man', artist_name: 'Rodriguez', source: 'qobuz' },
      { title: 'Sugar man', artist_name: 'RODRIGUEZ', source: 'tidal' },
      { title: 'Sugar Man', artist_name: 'Autre interprète', source: 'tidal' },
    ];
    expect(titresSansDoublon(locaux, favoris).map((f) => [f.title, f.source])).toEqual([['Sugar Man', 'qobuz'], ['Sugar Man', 'tidal']]);
  });

  it('artistes : même règle sur le nom', () => {
    const r = artistesSansDoublon([{ name: 'Björk' }], [{ name: 'bjork' }, { name: 'Alela Diane' }, { name: ' alela  diane ' }, { name: '' }]);
    expect(r.map((a) => a.name)).toEqual(['Alela Diane']);
  });

  it('liste paginée : un titre cherché une fois, réponse retenue, échec = présent (jamais de doublon)', async () => {
    const cache = new Map<string, boolean>();
    const demandes: string[] = [];
    const chercher = async (t: string) => {
      demandes.push(t);
      if (t === 'Panne') throw new Error('réseau');
      return t === 'Locale' ? [{ id: 9, source: 'local', title: 'Locale', artist_name: 'A' }, { id: null, source: 'qobuz', title: 'Absente', artist_name: 'A' }] : [];
    };
    const favoris = [
      { title: 'Locale', artist_name: 'A' }, { title: 'Absente', artist_name: 'A' },
      { title: 'Absente', artist_name: 'A' }, { title: 'Panne', artist_name: 'A' },
    ];
    expect((await titresAbsentsDeLaBibliotheque(favoris, chercher, cache)).map((f) => f.title)).toEqual(['Absente']);
    expect(demandes.sort()).toEqual(['Absente', 'Locale', 'Panne']);
    await titresAbsentsDeLaBibliotheque(favoris, chercher, cache);
    expect(demandes).toHaveLength(3);
  });
});

describe('fil 3009, point 6 — conversions', () => {
  it('titres et artistes favoris : un seul type chacun, dédoublonnés, jamais une source de bibliothèque', () => {
    const pistes = pistesDesFavorisDeService([...FAVORIS_TITRES, ...FAVORIS_ARTISTES, { item_type: 'track', service: 'local', service_id: '9' }] as any);
    expect(pistes.map((p) => [p.source, p.source_id, p.title])).toEqual([['qobuz', '59983347', 'Sugar Man'], ['qobuz', '82542200', "Ça c'est fait"], ['qobuz', '11111111', 'PISTE LOCALE']]);
    expect(pistes[0].id).toBeNull();
    expect((pistes[0] as any).album_id_service).toBe('0060253753283');
    const artistes = artistesDesFavorisDeService([...FAVORIS_TITRES, ...FAVORIS_ARTISTES] as any);
    expect(artistes.map((a) => [a.source, a.source_id, a.name])).toEqual([['qobuz', '453411', 'Alela Diane'], ['qobuz', '777', 'Artiste LOCAL'], ['tidal', '888', 'Alela Diane']]);
  });

  it('comptes : seuls les services s’ajoutent, la bibliothèque garde les siens', () => {
    const c = comptesAvecFavoris(new Map([['local', 3]]), [{ source: 'qobuz' }, { source: 'qobuz' }, { source: 'local' }, { source: 'tidal' }]);
    expect([...c]).toEqual([['local', 3], ['qobuz', 2], ['tidal', 1]]);
    expect(estSourceDeService('qobuz')).toBe(true);
    expect(estSourceDeService('local')).toBe(false);
    expect(estSourceDeService('upnp:uuid:s1')).toBe(false);
    expect(estSourceDeService(null)).toBe(false);
  });
});
