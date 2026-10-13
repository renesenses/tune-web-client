// @vitest-environment jsdom
//
// web#1716, étape 2 — décision de Bertrand du 13/10/2026 : `/library/artists`
// rend les sources de chaque artiste (`provenances=1`), et l'onglet Artistes ne
// charge plus ni toutes les pistes ni tous les albums pour le menu Source.
//
// Mesuré avant (Chromium sans tête, base de test de 95 925 pistes) : vingt
// pages `/library/tracks?limit=5000` et cinq `/library/albums?limit=2000` à
// l'ouverture de l'onglet, pour cette seule information.
//
// 🔴 Les témoins MONTENT `LibraryV2` (ou `ArtistesV2`) et lisent les REQUÊTES
// réellement émises et le DOM rendu.
// Contre-épreuve : `artistesSansLaListe` forcé à `false` dans `LibraryV2` →
// « aucune piste ni album entier » échoue (requêtes `/library/tracks`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import ArtistesV2 from '../../components/v2/ArtistesV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { sourcesArtistesServeur, pagePorteLesSources, sourcesDepuisLeServeur } from '../stores/sourcesArtistesServeur';
import { _remiseAZeroPourTests as remisePistes } from '../stores/pistesEntieres';
import type { ComptesArtistesSources } from '../provenanceBibliotheque';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
vi.setConfig({ testTimeout: 30_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

const AVEC_SOURCES = [
  { id: 1, name: 'Local Seul', provenances: { local: { albums: 1, pistes: 9 } } },
  { id: 2, name: 'Deux Sources', provenances: { local: { albums: 1, pistes: 3 }, 'upnp:uuid:s1': { albums: 1, pistes: 2 } } },
  { id: 3, name: 'UPnP Seul', provenances: { 'upnp:uuid:s2': { albums: 2, pistes: 20 } } },
];
const SANS_SOURCES = AVEC_SOURCES.map(({ provenances: _p, ...a }) => a);

let urls: string[] = [];
let artistes: unknown[] = AVEC_SOURCES;
/** Retient la réponse `provenances=1` tant qu'on ne la libère pas (13/10). */
let porteSources: Promise<void> | null = null;

function corpsPour(u: string): unknown {
  // La liste sans sources n'a pas de `provenances`, comme le vrai serveur.
  if (/\/library\/artists/.test(u) && !/provenances=1/.test(u)) {
    const nus = (artistes as any[]).map(({ provenances: _p, ...a }) => a);
    return { items: nus, total: nus.length };
  }
  if (/\/library\/artists/.test(u)) return { items: artistes, total: artistes.length };
  if (/\/library\/tracks/.test(u)) return { items: [], total: 0 };
  if (/\/library\/albums/.test(u)) return { items: [], total: 0 };
  if (/\/library\/stats/.test(u)) return { tracks: 34 };
  if (/\/(zones|playlists)/.test(u)) return [];
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
  artistes = AVEC_SOURCES;
  porteSources = null;
  // La liste des pistes est mémorisée par génération : un témoin précédent
  // qui l'aurait chargée masquerait la requête du repli.
  remisePistes();
  sourcesArtistesServeur.set(null);
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    urls.push(u);
    if (porteSources && /provenances=1/.test(u)) await porteSources;
    const corps = corpsPour(u);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
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

async function ouvrirLesArtistes(): Promise<HTMLElement> {
  activeView.set('library');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as any });
  for (let i = 0; i < 10; i++) await respirer();
  const b = [...hote.querySelectorAll('button.tab')].find((x) => (x.textContent ?? '').trim().startsWith(fr['favorites.artists']));
  expect(b, 'aucun onglet Artistes').toBeTruthy();
  (b as HTMLElement).click();
  await jusqua(() => hote!.querySelectorAll('.grille.artistes .carte').length === 3);
  for (let i = 0; i < 20; i++) await respirer();
  flushSync();
  return hote;
}

const pistesEntieres = () => urls.filter((u) => /\/library\/tracks/.test(u) && !/[?&]folder=/.test(u));
const albumsEntiers = () => urls.filter((u) => /\/library\/albums\?limit=2000/.test(u));

describe('web#1716 — les sources des artistes viennent du serveur', () => {
  it('serveur récent : aucune piste ni album entier à l’ouverture de l’onglet', async () => {
    await ouvrirLesArtistes();
    expect(urls.some((u) => /\/library\/artists\?.*provenances=1/.test(u)), 'les sources ne sont pas demandées').toBe(true);
    expect(get(sourcesArtistesServeur)).toBe(true);
    expect(pistesEntieres(), 'toutes les pistes sont encore chargées').toEqual([]);
    expect(albumsEntiers(), 'tous les albums sont encore chargés').toEqual([]);
  });

  it('serveur ancien : on retombe sur le calcul d’avant (pistes chargées)', async () => {
    artistes = SANS_SOURCES;
    await ouvrirLesArtistes();
    await jusqua(() => pistesEntieres().length > 0);
    expect(get(sourcesArtistesServeur)).toBe(false);
    expect(pistesEntieres().length, 'le repli ne charge plus les pistes').toBeGreaterThan(0);
  });
});

describe('web#1716 — filtre et comptes du menu Source sur les sources du serveur', () => {
  it('filtre par source et compte chaque artiste une fois', async () => {
    let comptes: ComptesArtistesSources | null = null;
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ArtistesV2, {
      target: hote,
      props: { q: '', provenance: 'upnp', onComptesSources: (c: ComptesArtistesSources) => { comptes = c; } },
    });
    const noms = () => [...hote!.querySelectorAll('.grille.artistes .carte .ct')].map((e) => e.textContent?.trim());
    await jusqua(() => noms().length > 0);
    // `upnp` est l'agrégat des serveurs : « Deux Sources » (s1) et « UPnP Seul » (s2).
    expect(noms()).toEqual(['Deux Sources', 'UPnP Seul']);
    expect(comptes!.total).toBe(3);
    expect(Object.fromEntries(comptes!.comptes)).toEqual({
      local: 2, upnp: 2, 'upnp:uuid:s1': 1, 'upnp:uuid:s2': 1,
    });
  });

  it('une page sans sources ne se fait pas passer pour « aucune source »', () => {
    expect(pagePorteLesSources([])).toBeNull();
    expect(pagePorteLesSources(SANS_SOURCES as any)).toBe(false);
    expect(pagePorteLesSources(AVEC_SOURCES as any)).toBe(true);
    expect([...sourcesDepuisLeServeur(AVEC_SOURCES as any).get(2)!]).toEqual(['local', 'upnp:uuid:s1']);
  });
});

describe('web#1716 — décision du 13/10 : la liste avant les sources', () => {
  function monter(provenance: string | null) {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ArtistesV2, { target: hote, props: { q: '', provenance } });
    return () => [...hote!.querySelectorAll('.grille.artistes .carte .ct')].map((e) => e.textContent?.trim());
  }

  it('la grille s’affiche pendant que les sources sont en route', async () => {
    let liberer!: () => void;
    porteSources = new Promise<void>((r) => { liberer = r; });
    const noms = monter(null);
    await jusqua(() => noms().length === 3);
    // Les cartes sont là alors que la réponse `provenances=1` n'est pas arrivée.
    expect(noms(), 'la grille attend encore les sources').toHaveLength(3);
    expect(urls.some((u) => /provenances=1/.test(u)), 'les sources ne sont pas demandées').toBe(true);
    expect(get(sourcesArtistesServeur)).toBeNull();
    liberer();
    await jusqua(() => get(sourcesArtistesServeur) === true);
    expect(get(sourcesArtistesServeur)).toBe(true);
  });

  it('un filtre Source attend les sources, puis filtre', async () => {
    let liberer!: () => void;
    porteSources = new Promise<void>((r) => { liberer = r; });
    const noms = monter('upnp');
    await jusqua(() => urls.some((u) => /provenances=1/.test(u)));
    for (let i = 0; i < 10; i++) await respirer();
    flushSync();
    expect(noms(), 'le filtre a tranché sans les sources').toEqual([]);
    expect(hote!.querySelector('.etat')?.textContent?.trim()).toBe(fr['common.loading']);
    liberer();
    await jusqua(() => noms().length === 2);
    expect(noms()).toEqual(['Deux Sources', 'UPnP Seul']);
  });
});
