// @vitest-environment jsdom
//
// renesenses/tune-web-client#1761 — Bertrand, réunion du 28/09/2026 :
//
//   « Bandcamp / ma collection : impossible d'ouvrir les albums ! »
//
// Le greffon pose `source: 'bandcamp'` (clé du SERVEUR) sur chaque article de
// « Ma collection » (`collection_mise_en_forme`, plugins/tune-bandcamp). Côté
// écran, l'onglet vaut `__bandcamp__` : `ouvrirFiche` ne reconnaissait pas
// l'article, rendait `null`, et la pochette retombait sur la LECTURE.
//
// Second défaut : `playBc` lisait `titre`/`artiste` (Découvrir, recherche)
// alors que la collection rend `title`/`artist`.
//
// L'écran réel est monté, les réponses du greffon sont servies telles que
// `collection_mise_en_forme` les compose, et on lit les requêtes parties.
//
// Import statique et `mount` synchrone : voir coeurAlbumBandcamp1400.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import StreamingV2 from '../../components/v2/StreamingV2.svelte';
import { currentZoneId } from '../stores/zones';
import { currentProfileId } from '../stores/profile';

vi.setConfig({ testTimeout: 30_000 });

const URL_ALBUM = 'https://sodablonde.bandcamp.com/album/dream-big';
const EXTRAIT = 'https://t4.bcbits.com/stream/58db2888/mp3-128/2639113545';

/** Forme exacte de `collection_mise_en_forme` (tune-bandcamp/src/lib.rs). */
function article(extra: Record<string, unknown>) {
  return {
    artist: 'Soda Blonde', title: 'Dream Big', type: 'album', url: URL_ALBUM,
    art_id: 123, pochette: null, extrait: EXTRAIT, qualite: 'mp3-128',
    lossless: false, source: 'bandcamp', sale_item: null, downloadable: false,
    ...extra,
  };
}

let collection: any[] = [];

const SERVICES = { bandcamp: { enabled: true, authenticated: true, username: 'berthos' } };

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

type Partie = { url: string; method: string; body: any };
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let parties: Partie[] = [];

function serveur() {
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    if (init?.body) { try { body = JSON.parse(String(init.body)); } catch { body = String(init.body); } }
    parties.push({ url: u, method, body });
    if (/\/ext\/bandcamp\/collection/.test(u)) {
      return reponse({ fan_id: 1, count: collection.length, items: collection, more_available: false });
    }
    if (/\/ext\/bandcamp\/album\?/.test(u)) {
      return reponse({ type: 'album', url: URL_ALBUM, artist: 'Soda Blonde', title: 'Dream Big', pochette: null, track_count: 0, tracks: [] });
    }
    if (/\/ext\/bandcamp\/discover/.test(u)) return reponse({ items: [] });
    if (/\/ext\/bandcamp\/tags/.test(u)) return reponse({ tags: [], genres: [] });
    if (/\/streaming\/services/.test(u)) return reponse(SERVICES);
    if (/\/zones\/\d+\/play$/.test(u)) return reponse({ id: 1, name: 'Z', state: 'playing' });
    if (/\/profiles(\?|$)/.test(u)) return reponse([{ id: 1, name: 'Default', avatar_color: '#6366f1' }]);
    return reponse([]);
  }));
}

async function respirer(tours = 40, pret: () => boolean = () => false) {
  for (let i = 0; i < tours; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    if (pret()) break;
  }
  flushSync();
}

const vignettes = () => Array.from(hote!.querySelectorAll('.achat .card')) as HTMLElement[];
const lectures = () => parties.filter((p) => p.method === 'POST' && /\/zones\/\d+\/play$/.test(p.url));
const fiches = () => parties.filter((p) => /\/ext\/bandcamp\/album\?/.test(p.url));

async function monterCollection() {
  serveur();
  currentZoneId.set(1);
  currentProfileId.set(1);
  monte = mount(StreamingV2 as any, { target: hote! });
  await respirer(60, () => hote!.querySelectorAll('nav.subs button').length >= 3);
  const onglets = Array.from(hote!.querySelectorAll('nav.subs button')) as HTMLButtonElement[];
  expect(onglets.length, 'les sous-onglets Bandcamp ne sont pas rendus').toBe(3);
  onglets[2].click(); // « Ma collection »
  await respirer(60, () => vignettes().length > 0);
  expect(vignettes().length, 'aucune vignette de collection rendue : le décor est faux').toBe(collection.length);
  parties = [];
}

describe('#1761 — Bandcamp, Ma collection : ouvrir l’album', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
    if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
    parties = [];
    collection = [article({})];
    hote = document.createElement('div');
    document.body.appendChild(hote);
  });

  afterEach(() => {
    if (monte) { try { unmount(monte); } catch { /* hors sujet */ } monte = null; }
    hote?.remove();
    hote = null;
    currentZoneId.set(null);
    currentProfileId.set(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('🔴 le clic sur la pochette OUVRE la fiche de l’album, sans lancer la lecture', async () => {
    await monterCollection();
    const ouvrir = vignettes()[0].querySelector('button.ouvrir') as HTMLButtonElement | null;
    expect(ouvrir, 'la pochette n’a pas de bouton « ouvrir »').not.toBeNull();
    ouvrir!.click();
    await respirer(40, () => fiches().length > 0);
    expect(lectures(), 'le clic sur la pochette a lancé la lecture').toEqual([]);
    expect(fiches().length, 'la fiche de l’album n’a pas été ouverte').toBeGreaterThan(0);
    expect(new URL(fiches()[0].url, 'http://x').searchParams.get('url')).toBe(URL_ALBUM);
  });

  it('le bouton lecture joue l’album par son adresse', async () => {
    await monterCollection();
    (vignettes()[0].querySelector('button.centre') as HTMLButtonElement).click();
    await respirer(40, () => lectures().length > 0);
    expect(lectures().length).toBe(1);
    expect(lectures()[0].body).toMatchObject({ source: 'bandcamp', streaming_album_id: URL_ALBUM });
  });

  it('🔴 le repli sur l’extrait transmet le titre et l’artiste de la collection', async () => {
    // Sans adresse, `playBc` retombe sur l'extrait : c'est là que `title` et
    // `artist` partent. Ils partaient vides (`titre`/`artiste` absents).
    collection = [article({ url: null })];
    await monterCollection();
    (vignettes()[0].querySelector('button.centre') as HTMLButtonElement).click();
    await respirer(40, () => lectures().length > 0);
    expect(lectures().length).toBe(1);
    expect(lectures()[0].body).toMatchObject({
      source: 'bandcamp', source_id: EXTRAIT, title: 'Dream Big', artist_name: 'Soda Blonde',
    });
  });
});
