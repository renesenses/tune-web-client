// @vitest-environment jsdom
//
// renesenses/tune-web-client#1400 — FabienM, 0.9.158, forum fil 1862, point 4 :
//
//   « Les favoris bandcamp sont mal gérés: on ne peut pas mettre un artiste ou
//     un album issus de Bandcamp en favori (pas d'icone coeur ni de bouton
//     'mettre en favori'). »
//
// La moitié « pas conservé » du même point est livrée en v0.9.159
// (`identiteDeFavori`, gardée par `favorisBandcampCleResignee.test.ts`).
// Celle-ci est l'autre : le cœur n'existait PAS sur une vignette Bandcamp.
//
// ## 🔴 Ce qu'un test du seul module NE VERRAIT PAS
//
// `favKeyOf` et `favoriExterneService` étaient déjà justes : appelés avec
// `{service:'bandcamp', serviceId:'<url>'}`, ils rendaient une clé et un cœur.
// C'est l'ÉCRAN qui ne les appelait jamais ainsi — il composait la référence
// avec la clé d'ONGLET `__bandcamp__` et un `source_id` que les articles de
// `/ext/bandcamp/…` ne portent pas. Un témoin de module serait donc resté vert
// pendant que l'écran n'affichait aucun cœur. Ce fichier MONTE l'écran réel,
// sert les réponses mesurées sur le .18, CLIQUE le cœur rendu, et lit la
// requête RÉELLEMENT partie.
//
// ## 🔴 L'écran est importé à la COLLECTE, pas dans le cas — #1326 / #1333
//
// `StreamingV2` fait plus de mille six cents lignes ; un `await import()` posé
// dans le cas fait compiler vite sous le chronomètre, expire sous la charge de
// la porte, et la continuation abandonnée va monter l'écran dans l'hôte du cas
// SUIVANT. Import statique, `mount` synchrone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import StreamingV2 from '../../components/v2/StreamingV2.svelte';
import { favKeyOf, refFavoriDeVignette } from '../streamingFavorites';
import { BANDCAMP_EXT, BANDCAMP_SVC } from '../ongletsStreaming';
import { currentProfileId, favoriteStreamingKeys, streamingFavKey } from '../stores/profile';

vi.setConfig({ testTimeout: 30_000 });

/** L'album de la mesure : « Dream Big », Soda Blonde — celui du fil 1862. */
const URL_ALBUM = 'https://sodablonde.bandcamp.com/album/dream-big';
const TITRE_ALBUM = 'Dream Big';
const ARTISTE = 'Soda Blonde';

/** Un second album, pour la contre-épreuve « un cœur, un album ». */
const URL_AUTRE = 'https://sodablonde.bandcamp.com/album/small-talk';

/**
 * Ce que `/ext/bandcamp/discover` rend réellement (forme `BandcampResultat` /
 * `BandcampItem`) : `url`, `titre`/`title`, `artist`, `pochette`. Ni `source`,
 * ni `source_id` — c'est tout le sujet.
 */
const DECOUVERTE = {
  tag: '',
  sort: 'top',
  page: 0,
  qualite: 'mp3-128',
  lossless: false,
  items: [
    { title: TITRE_ALBUM, artist: ARTISTE, type: 'album', url: URL_ALBUM, pochette: null },
    { title: 'Small Talk', artist: ARTISTE, type: 'album', url: URL_AUTRE, pochette: null },
  ],
};

/** Seul Bandcamp est connecté : l'écran s'ouvre sur son onglet, « Découvrir ». */
const SERVICES = {
  bandcamp: { enabled: true, authenticated: true, username: 'berthos' },
};

const TAGS = { tags: ['rock'], genres: [{ slug: 'rock', label: 'Rock', sous_genres: [] }] };

const PROFILS = [{ id: 1, name: 'Default', avatar_color: '#6366f1' }];

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

/** Un 501 tel que Bandcamp le rend sur la RECOPIE vers le service. */
function cinqCentUn() {
  return {
    ok: false,
    status: 501,
    statusText: 'Not Implemented',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({ error: "Bandcamp : ajouter un favori demande une session d'achat." }),
    text: async () => "Bandcamp : ajouter un favori demande une session d'achat.",
  } as unknown as Response;
}

class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

type Partie = { url: string; method: string; body: any };

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let parties: Partie[] = [];

/**
 * Le serveur. `favorisRanges` est ce que `GET /profiles/1/favorites/streaming`
 * rend — c'est par lui qu'on rejoue un RECHARGEMENT de l'écran.
 */
function serveur(favorisRanges: any[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      const method = (init?.method ?? 'GET').toUpperCase();
      let body: any = null;
      if (init?.body) {
        try { body = JSON.parse(String(init.body)); } catch { body = String(init.body); }
      }
      parties.push({ url: u, method, body });

      if (/\/ext\/bandcamp\/discover/.test(u)) return reponse(DECOUVERTE);
      if (/\/ext\/bandcamp\/tags/.test(u)) return reponse(TAGS);
      if (/\/streaming\/services/.test(u)) return reponse(SERVICES);
      // 🔴 La RECOPIE vers le service refuse : c'est le 501 du journal de
      // FabienM. Le cœur de Tune ne doit pas en dépendre.
      if (/\/streaming\/bandcamp\/favorites\//.test(u)) return cinqCentUn();
      if (/\/profiles\/\d+\/favorites\/streaming(\?|$)/.test(u)) return reponse(favorisRanges);
      if (/\/profiles\/\d+\/favorites\/facets/.test(u)) return reponse([]);
      if (/\/profiles\/\d+\/favorites/.test(u)) return reponse({});
      if (/\/profiles(\?|$)/.test(u)) return reponse(PROFILS);
      return reponse([]);
    }),
  );
}

/** Les vignettes rendues, dans l'ordre du DOM. */
const vignettes = () => Array.from(hote!.querySelectorAll('.card')) as HTMLElement[];
/** Le cœur d'une vignette — `PochetteActions` le pose en haut à gauche. */
const coeur = (c: HTMLElement) => c.querySelector('button.coin.tl') as HTMLButtonElement | null;

async function respirer(tours = 40, pret: () => boolean = () => false) {
  for (let i = 0; i < tours; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    if (pret()) break;
  }
  flushSync();
}

async function monterEcran(favorisRanges: any[] = []) {
  serveur(favorisRanges);
  // 🔴 Le profil est désigné APRÈS le serveur, jamais avant : c'est son
  // abonnement (`currentProfileId.subscribe(loadFavoriteIds)`) qui va chercher
  // `GET /profiles/1/favorites/streaming`. Posé avant le `stubGlobal`, l'appel
  // partait sur le vrai `fetch`, échouait, et `favoriteStreamingKeys` restait
  // vide — le témoin du rechargement aurait été rouge pour la mauvaise raison.
  currentProfileId.set(1);
  await respirer(20, () => parties.some((p) => /favorites\/streaming/.test(p.url)));
  monte = mount(StreamingV2 as any, { target: hote! });
  await respirer(60, () => vignettes().length > 0);
}

describe('#1400 — le cœur sur une vignette d’album Bandcamp', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
    if (!('IntersectionObserver' in globalThis)) {
      vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
    }
    parties = [];
    favoriteStreamingKeys.set(new Set());
    currentProfileId.set(null);
    hote = document.createElement('div');
    document.body.appendChild(hote);
  });

  afterEach(() => {
    if (monte) {
      try { unmount(monte); } catch { /* le démontage n'est pas le sujet */ }
      monte = null;
    }
    hote?.remove();
    hote = null;
    favoriteStreamingKeys.set(new Set());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('🔴 la vignette PORTE un cœur — elle n’en avait aucun', async () => {
    await monterEcran();
    const cartes = vignettes();
    expect(cartes.length, 'aucune vignette rendue : le décor du témoin est faux').toBe(2);
    // Sur le code d'avant le correctif, `favoriExterneService` rend `null` et
    // `PochetteActions` ne dessine pas le bouton du tout.
    expect(coeur(cartes[0]), 'la vignette Bandcamp n’a pas de cœur').not.toBeNull();
  });

  it('🔴 le clic envoie la clé du SERVEUR et l’URL de la page, pas `__bandcamp__` ni du vide', async () => {
    await monterEcran();
    parties = [];
    coeur(vignettes()[0])!.click();
    await respirer(30, () => parties.some((p) => /favorites\/streaming\/add/.test(p.url)));

    const ajout = parties.find((p) => /\/profiles\/1\/favorites\/streaming\/add$/.test(p.url));
    expect(
      ajout,
      `aucun ajout n’est parti — requêtes vues : ${parties.map((p) => `${p.method} ${p.url}`).join(', ')}`,
    ).toBeDefined();
    expect(ajout!.method).toBe('POST');
    expect(ajout!.body).toMatchObject({
      item_type: 'album',
      service: BANDCAMP_SVC,
      service_id: URL_ALBUM,
    });
    // 🔴 La clé d'onglet est LOCALE : elle ne doit jamais partir sur le réseau.
    expect(JSON.stringify(ajout!.body)).not.toContain(BANDCAMP_EXT);
    expect(ajout!.body.service_id, 'l’identifiant est reparti vide').not.toBe('');
  });

  it('le 501 de la recopie ne défait pas le cœur', async () => {
    // Le journal de FabienM ne montrait que des 501 : ils viennent de
    // `/streaming/bandcamp/favorites/…`, la recopie vers le service, que
    // `signalerRecopieManquee` ignore pour un 501. Le cœur de Tune tient.
    await monterEcran();
    coeur(vignettes()[0])!.click();
    await respirer(30, () => parties.some((p) => /\/streaming\/bandcamp\/favorites\//.test(p.url)));
    expect(
      parties.some((p) => /\/streaming\/bandcamp\/favorites\//.test(p.url)),
      'la recopie n’a même pas été tentée : le témoin ne prouve rien',
    ).toBe(true);
    flushSync();
    expect(coeur(vignettes()[0])!.getAttribute('aria-pressed')).toBe('true');
  });

  it('🔴 APRÈS RECHARGEMENT, le favori rangé par le serveur rallume le cœur', async () => {
    // L'écran est remonté à neuf : les articles repartent de
    // `/ext/bandcamp/discover` (objets NEUFS, toujours sans `source_id`) et les
    // favoris de `GET /profiles/1/favorites/streaming`. Si les deux côtés ne
    // s'accordaient pas sur l'identité, le cœur resterait vide — c'est le
    // symptôme « pas conservé » vu de l'écran.
    await monterEcran([
      { item_type: 'album', service: BANDCAMP_SVC, service_id: URL_ALBUM, title: TITRE_ALBUM },
    ]);
    await respirer(30, () => !!coeur(vignettes()[0])?.getAttribute('aria-pressed'));
    const cartes = vignettes();
    expect(
      coeur(cartes[0])!.getAttribute('aria-pressed'),
      'le cœur est resté vide sur un favori pourtant rangé',
    ).toBe('true');
    // CONTRE-ÉPREUVE : l'autre album de la même page ne s'allume pas.
    expect(
      coeur(cartes[1])!.getAttribute('aria-pressed'),
      'un favori a coché la vignette voisine',
    ).toBe('false');
  });

  it('CONTRE-ÉPREUVE — un onglet Qobuz garde exactement la référence d’avant', async () => {
    // `cleServeur` ne traduit QUE `__bandcamp__` ; tout le reste passe tel
    // quel, et un article de service garde son `source_id`.
    expect(refFavoriDeVignette('album', { source_id: 'kxend2k5wdg06' }, 'qobuz')).toEqual({
      itemType: 'album',
      service: 'qobuz',
      serviceId: 'kxend2k5wdg06',
    });
    // Un `source` porté par l'article prime sur l'onglet — recherche fédérée.
    expect(refFavoriDeVignette('album', { source: 'tidal', source_id: '77' }, 'qobuz').service)
      .toBe('tidal');
  });

  it('🔴 CONTRE-ÉPREUVE — une PISTE Bandcamp ne se replie PAS sur l’URL de page', async () => {
    // Son identité est l'URL de FLUX (`resolve_direct_url`), celle que la barre
    // de lecture met en favori. Lui donner l'adresse de sa page fabriquerait
    // deux clés pour un même titre — le défaut de #1478.
    const ref = refFavoriDeVignette('track', { url: URL_ALBUM }, BANDCAMP_EXT);
    expect(ref.serviceId).toBe('');
    expect(favKeyOf(ref)).toBeNull();
  });

  it('🔴 CONTRE-ÉPREUVE — la coupe de la signature resignée n’est PAS court-circuitée', async () => {
    // Quand l'identifiant EST une URL de flux, `favKeyOf` doit toujours passer
    // par `identiteDeFavori` : la référence composée ici ne normalise rien.
    const nue = 'https://t4.bcbits.com/stream/58db2888/mp3-128/2639113545';
    const signee = `${nue}?p=0&ts=1789982173&token=1789982173_7285db07`;
    const ref = refFavoriDeVignette('track', { source_id: signee }, BANDCAMP_EXT);
    expect(ref.serviceId, 'la référence a normalisé pour son compte').toBe(signee);
    expect(favKeyOf(ref)).toBe(streamingFavKey('track', BANDCAMP_SVC, nue));
  });
});
