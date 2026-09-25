// @vitest-environment jsdom
//
// Bertrand, 25/09/2026 : « Tags sur album de streaming : il manque un CTA sur
// les covers Qobuz ! »
//
// La FICHE d'un album Qobuz/Tidal/Bandcamp avait son bouton « Étiquettes »
// (#1238, route `POST /tags/{id}/streaming-items`, serveur #3699). Ses
// VIGNETTES non : les bandes éditoriales de l'écran Streaming et de l'accueil
// (`PageWidgets`) et la page artiste (`DiscographieCommune`) ne passaient à
// `PochetteActions` que l'identifiant de BIBLIOTHÈQUE — un album de service
// n'avait donc pas de coin « Étiquettes », il fallait ouvrir sa fiche.
//
// Ce banc MONTE les deux écrans, clique le coin rendu et lit la requête
// RÉELLEMENT partie : la cible (`source`, `source_id`, type `album`) est celle
// que le panneau interroge.
//
// Les écrans sont importés à la COLLECTE (#1326 / #1333) : pas d'`import()`
// paresseux dans un cas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import DiscographieCommune from '../../components/v2/DiscographieCommune.svelte';
import { catalogueService, cleService } from '../widgetsService';
import { cibleEtiquetteAlbum } from '../cibleEtiquette';
import { BANDCAMP_EXT } from '../ongletsStreaming';
import { currentProfileId } from '../stores/profile';
import { currentZoneId } from '../stores/zones';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });

/** La nouveauté Qobuz mesurée sur le .18 le 23/09/2026 (`/new-releases`). */
const NOUVEAUTE = {
  artist_id: '551325',
  artist_name: 'Agnes Obel',
  source_id: 'e3j7lzexax05q',
  title: 'The Meaning of Flowers',
  cover_path: '/covers/flowers.jpg',
};

type Partie = { url: string; method: string };
let parties: Partie[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

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

beforeEach(() => {
  parties = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      parties.push({ url: u, method: (init?.method ?? 'GET').toUpperCase() });
      if (u.includes('/new-releases')) return reponse([NOUVEAUTE]);
      return reponse([]);
    }),
  );
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  currentProfileId.set(1);
  currentZoneId.set(1);
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  document.querySelectorAll('.fond').forEach((n) => n.remove());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const souffler = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function respirer(tours = 40, pret: () => boolean = () => false) {
  for (let i = 0; i < tours; i++) {
    await souffler(10);
    flushSync();
    if (pret()) break;
  }
}

/** Le coin « Étiquettes » de `PochetteActions` : en bas à droite. */
const coinEtiquettes = (carte: Element) => carte.querySelector('button.coin.br') as HTMLButtonElement | null;
const panneau = () => document.querySelector('[role="dialog"]');
const lecturesEtiquettes = () => parties.filter((p) => p.url.includes('/tags/for'));

async function ouvrirEtiquettes(carte: Element) {
  const b = coinEtiquettes(carte);
  expect(b, 'la vignette ne porte AUCUN coin « Étiquettes »').toBeTruthy();
  b!.click();
  await respirer(40, () => !!panneau() && lecturesEtiquettes().length > 0);
}

describe('Étiquettes depuis la vignette d’un album Qobuz — bande éditoriale', () => {
  it('le coin est présent, et ouvre le panneau sur la paire source + source_id', async () => {
    const catalogue = await catalogueService('qobuz');
    const w = catalogue.find((x) => x.id === 'qobuz-nouveautes');
    expect(w, 'la bande « Nouveautés » Qobuz a disparu du catalogue').toBeTruthy();
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(PageWidgets, {
      target: hote,
      props: { catalogue: [w!], dispositionDefaut: [w!.id], cle: cleService('qobuz') },
    });
    await respirer(40, () => !!hote!.querySelector('.carte'));
    const carte = hote.querySelector('.carte');
    expect(carte, 'la bande n’a monté aucune vignette').toBeTruthy();

    await ouvrirEtiquettes(carte!);

    expect(panneau(), 'le clic n’a ouvert aucun panneau d’étiquettes').toBeTruthy();
    const lue = lecturesEtiquettes().map((p) => new URL(p.url, 'http://x'));
    expect(lue.length, 'le panneau n’a interrogé aucune étiquette').toBeGreaterThan(0);
    expect(lue[0].pathname).toMatch(/\/tags\/for-streaming$/);
    expect(lue[0].searchParams.get('item_type')).toBe('album');
    expect(lue[0].searchParams.get('source')).toBe('qobuz');
    expect(lue[0].searchParams.get('source_id')).toBe('e3j7lzexax05q');
    // Le clic n'ouvre PAS la fiche.
    expect(document.querySelector('.v2-album, .v2-albumdetail')).toBeNull();
  });
});

describe('Étiquettes depuis la vignette — page artiste (DiscographieCommune)', () => {
  const al = (o: Record<string, unknown>) => o as unknown as Album;
  function poser() {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(DiscographieCommune, {
      target: hote,
      props: {
        locaux: [al({ id: 7, title: 'Philharmonics', artist_name: 'Agnes Obel', source: 'local' })],
        services: [{
          service: 'qobuz',
          albums: [
            al({ id: null, source: 'qobuz', source_id: 'q2', title: 'Citizen of Glass', artist_name: 'Agnes Obel' }),
            al({ id: null, source: 'qobuz', source_id: null, title: 'Aventine', artist_name: 'Agnes Obel' }),
          ],
        }],
        onOuvrir: () => {},
        onLire: () => {},
        nomArtiste: 'Agnes Obel',
      },
    });
    flushSync();
    return hote;
  }
  const carteDe = (h: HTMLElement, titre: string) =>
    [...h.querySelectorAll('.carte')].find((c) => c.textContent?.includes(titre)) ?? null;

  it('album de SERVICE : coin présent, panneau sur la paire', async () => {
    const h = poser();
    const carte = carteDe(h, 'Citizen of Glass');
    expect(carte, 'l’album Qobuz n’a pas de vignette').toBeTruthy();
    await ouvrirEtiquettes(carte!);
    expect(panneau()).toBeTruthy();
    const u = new URL(lecturesEtiquettes()[0].url, 'http://x');
    expect(u.pathname).toMatch(/\/tags\/for-streaming$/);
    expect(u.searchParams.get('source')).toBe('qobuz');
    expect(u.searchParams.get('source_id')).toBe('q2');
    expect(u.searchParams.get('item_type')).toBe('album');
  });

  it('album de service SANS identifiant : pas de coin (pas de geste muet)', () => {
    const h = poser();
    const carte = carteDe(h, 'Aventine');
    expect(carte, 'l’album sans identifiant n’a pas de vignette').toBeTruthy();
    expect(coinEtiquettes(carte!)).toBeNull();
  });

  it('album LOCAL : coin présent, panneau sur l’identifiant de bibliothèque', async () => {
    const h = poser();
    const carte = carteDe(h, 'Philharmonics');
    expect(carte).toBeTruthy();
    await ouvrirEtiquettes(carte!);
    expect(panneau()).toBeTruthy();
    expect(lecturesEtiquettes()[0].url).toMatch(/\/tags\/for\/album\/7$/);
  });
});

describe('cibleEtiquetteAlbum — la règle unique', () => {
  it('bibliothèque : l’entier, et seulement un entier strictement positif', () => {
    expect(cibleEtiquetteAlbum({ id: 42 })).toEqual({ itemType: 'album', itemId: 42 });
    expect(cibleEtiquetteAlbum({ id: 0 })).toBeNull();
    expect(cibleEtiquetteAlbum({ id: null })).toBeNull();
    expect(cibleEtiquetteAlbum(null)).toBeNull();
  });
  it('service : la paire, la source de l’onglet en repli', () => {
    expect(cibleEtiquetteAlbum({ id: null, source_id: 'kxend2k5wdg06', title: 'X' }, 'qobuz')).toMatchObject({
      itemType: 'album', source: 'qobuz', sourceId: 'kxend2k5wdg06', titre: 'X',
    });
    expect(cibleEtiquetteAlbum({ id: null, source: 'tidal', source_id: null })).toBeNull();
    // Un `id` texte de service n'est pas un identifiant de bibliothèque.
    expect(cibleEtiquetteAlbum({ id: 'abc', source: 'qobuz', source_id: 'abc' })).toMatchObject({ sourceId: 'abc' });
  });
  it('Bandcamp : l’adresse de page, sous la clé du SERVEUR', () => {
    const url = 'https://sodablonde.bandcamp.com/album/dream-big';
    expect(cibleEtiquetteAlbum({ url, title: 'Dream Big' }, BANDCAMP_EXT)).toMatchObject({
      source: 'bandcamp', sourceId: url,
    });
  });
});
