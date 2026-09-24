// @vitest-environment jsdom
//
// renesenses/tune-server-rust#4577 — les deux points qui restaient ouverts
// après #1370 (normalisation de la clé) et #1400 (cœur sur la vignette
// d'album), tels que le ticket les énumère :
//
//   « 3. Le client peut cesser d'émettre la recopie vers
//        /streaming/bandcamp/favorites/… — `favoris_ecrivables()` le lui dit
//        désormais. »
//
//   et, du point 4 de FabienM (fil forum 1862, 0.9.158) : « on ne peut pas
//   mettre un ARTISTE ou un album issus de Bandcamp en favori ». L'album a été
//   traité par #1400 ; l'artiste ne l'a été NULLE PART.
//
// ## Ce que le serveur publie déjà
//
// `tune-core/src/streaming/registry.rs:67` ajoute `favoris_ecrivables` à
// chaque entrée de `GET /api/v1/streaming/services`, et
// `plugins/tune-bandcamp/src/service.rs:600` le rend `false` — les deux sont
// livrés depuis la v0.9.159. Le client ne lisait pas ce champ : il n'existait
// même pas dans `StreamingServiceStatus`. Seize `POST`/`DELETE` partaient donc
// pour rien dans le journal de FabienM, tous en 501.
//
// ## 🔴 Pourquoi un témoin de MODULE ne suffit pas ici
//
// Le garde-fou se lit dans un MAGASIN (`streamingServices`). Un témoin qui le
// remplit à la main prouverait la règle et tairait la seule question qui
// compte : quelqu'un remplit-il ce magasin au moment où le cœur est cliqué ?
// `albumsArtisteStreaming.ts` porte justement, en commentaire, la trace du
// jour où la réponse était « non » (#4330). Le dernier cas MONTE l'écran réel,
// ne pose aucun magasin, et lit les requêtes réellement parties.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import StreamingV2 from '../../components/v2/StreamingV2.svelte';
import {
  favKeyOf,
  refFavoriDeVignette,
  toggleStreamingFavorite,
  favorisRecopiablesVers,
} from '../streamingFavorites';
import { BANDCAMP_EXT, BANDCAMP_SVC } from '../ongletsStreaming';
import { streamingServices } from '../stores/streaming';
import { currentProfileId, favoriteStreamingKeys, streamingFavKey } from '../stores/profile';

vi.setConfig({ testTimeout: 30_000 });

/** L'artiste de la mesure — celui dont FabienM lisait la page. */
const URL_ARTISTE = 'https://sodablonde.bandcamp.com';
const NOM_ARTISTE = 'Soda Blonde';
const URL_ALBUM = 'https://sodablonde.bandcamp.com/album/dream-big';

type Partie = { url: string; method: string; body: any };
let parties: Partie[] = [];

function reponse(corps: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

/** Le 501 mesuré : Bandcamp refuse qu'on écrive ses favoris. */
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

const PROFILS = [{ id: 1, name: 'Default', avatar_color: '#6366f1' }];
const TAGS = { tags: ['rock'], genres: [{ slug: 'rock', label: 'Rock', sous_genres: [] }] };

/**
 * Ce que `/ext/bandcamp/search` rend réellement : les artistes ne portent
 * qu'un `url` et un `titre`. Ni `source`, ni `source_id` — comme les albums
 * de #1400.
 */
const RECHERCHE = {
  q: 'soda',
  artistes: [{ titre: NOM_ARTISTE, artiste: null, url: URL_ARTISTE, pochette: null }],
  albums: [],
  pistes: [],
};

/** La discographie rendue par `/ext/bandcamp/artist` — elle porte l'URL de la
 *  page de l'artiste, qui EST son identité. */
const DISCO = {
  url: URL_ARTISTE,
  count: 1,
  albums: [{ titre: 'Dream Big', url: URL_ALBUM, pochette: null, type: 'album' }],
};

/** Le serveur tel qu'il répond depuis la v0.9.159 : Bandcamp dit non. */
function servicesAvecDeclaration(ecrivables: boolean | undefined) {
  const bc: Record<string, unknown> = { enabled: true, authenticated: true, username: 'berthos' };
  if (ecrivables !== undefined) bc.favoris_ecrivables = ecrivables;
  return { bandcamp: bc };
}

function serveur(services: Record<string, unknown>) {
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

      if (/\/ext\/bandcamp\/search/.test(u)) return reponse(RECHERCHE);
      if (/\/ext\/bandcamp\/artist/.test(u)) return reponse(DISCO);
      if (/\/ext\/bandcamp\/tags/.test(u)) return reponse(TAGS);
      if (/\/ext\/bandcamp\/discover/.test(u)) {
        return reponse({ tag: '', sort: 'top', page: 0, items: [], qualite: 'mp3-128', lossless: false });
      }
      if (/\/streaming\/services/.test(u)) return reponse(services);
      if (/\/streaming\/\w+\/favorites\//.test(u)) return cinqCentUn();
      if (/\/profiles\/\d+\/favorites\/streaming(\?|$)/.test(u)) return reponse([]);
      if (/\/profiles\/\d+\/favorites\/facets/.test(u)) return reponse([]);
      if (/\/profiles\/\d+\/favorites/.test(u)) return reponse({});
      if (/\/profiles(\?|$)/.test(u)) return reponse(PROFILS);
      return reponse([]);
    }),
  );
}

/**
 * Les RECOPIES vers le service — et elles seules.
 *
 * ⚠️ La méthode fait partie du filtre. `GET /streaming/<svc>/favorites/<type>`
 * est la LECTURE que `reprendreFavorisDesServices` lance au chargement du
 * profil (trois par service) ; un filtre sur la seule URL en comptait quatre
 * là où une seule recopie était partie, et faisait échouer la contre-épreuve
 * pour une raison qui n'était pas la sienne.
 */
const recopies = () =>
  parties.filter(
    (p) => /\/streaming\/\w+\/favorites\//.test(p.url) && (p.method === 'POST' || p.method === 'DELETE'),
  );
const ajoutsProfil = () =>
  parties.filter((p) => /\/profiles\/\d+\/favorites\/streaming\/(add|remove)$/.test(p.url));

async function respirer(tours = 40, pret: () => boolean = () => false) {
  for (let i = 0; i < tours; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    if (pret()) break;
  }
  flushSync();
}

beforeEach(() => {
  parties = [];
  streamingServices.set({});
  favoriteStreamingKeys.set(new Set());
  currentProfileId.set(null);
});

afterEach(() => {
  streamingServices.set({});
  favoriteStreamingKeys.set(new Set());
  currentProfileId.set(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('#4577 point 3 — la recopie ne part plus vers un service qui la refuse', () => {
  it('🔴 Bandcamp déclare `favoris_ecrivables: false` : AUCUNE recopie ne part', async () => {
    serveur(servicesAvecDeclaration(false));
    streamingServices.set(servicesAvecDeclaration(false) as any);
    currentProfileId.set(1);
    parties = [];

    const etat = await toggleStreamingFavorite({
      itemType: 'album', service: BANDCAMP_SVC, serviceId: URL_ALBUM, title: 'Dream Big',
    });
    await respirer(20);

    expect(etat, 'le cœur de Tune doit être posé quand même').toBe(true);
    expect(
      ajoutsProfil().length,
      'le favori de Tune n’a pas été écrit : le témoin ne prouve rien',
    ).toBe(1);
    expect(
      recopies().map((p) => `${p.method} ${p.url}`),
      'une recopie est partie vers un service qui annonce la refuser',
    ).toEqual([]);
  });

  it('CONTRE-ÉPREUVE — un service qui l’accepte reçoit toujours la recopie', async () => {
    const qobuz = { qobuz: { enabled: true, authenticated: true, favoris_ecrivables: true } };
    serveur(qobuz);
    streamingServices.set(qobuz as any);
    currentProfileId.set(1);
    parties = [];

    await toggleStreamingFavorite({ itemType: 'album', service: 'qobuz', serviceId: 'kxend2k5wdg06' });
    await respirer(20);

    expect(recopies().length, 'la recopie a été supprimée pour tout le monde').toBe(1);
    expect(recopies()[0].url).toContain('/streaming/qobuz/favorites/albums/');
  });

  it('CONTRE-ÉPREUVE — un serveur d’AVANT le champ garde le comportement d’avant', async () => {
    // `favoris_ecrivables` est absent d'un serveur < 0.9.159. L'absence n'est
    // pas un refus : on ne doit pas cesser de recopier chez Qobuz parce qu'un
    // vieux serveur se tait.
    const vieux = servicesAvecDeclaration(undefined);
    serveur(vieux);
    streamingServices.set(vieux as any);
    currentProfileId.set(1);
    parties = [];

    expect(favorisRecopiablesVers(BANDCAMP_SVC)).toBe(true);
    await toggleStreamingFavorite({ itemType: 'album', service: BANDCAMP_SVC, serviceId: URL_ALBUM });
    await respirer(20);
    expect(recopies().length).toBe(1);
  });

  it('CONTRE-ÉPREUVE — un magasin VIDE ne coupe rien', () => {
    // Le magasin peut n'avoir pas encore été rempli. Un service inconnu est
    // traité comme avant : on tente, et le 501 reste ignoré par
    // `signalerRecopieManquee`.
    streamingServices.set({});
    expect(favorisRecopiablesVers(BANDCAMP_SVC)).toBe(true);
    expect(favorisRecopiablesVers('qobuz')).toBe(true);
  });

  it('🔴 le RETRAIT non plus ne recopie pas vers Bandcamp', async () => {
    serveur(servicesAvecDeclaration(false));
    streamingServices.set(servicesAvecDeclaration(false) as any);
    currentProfileId.set(1);
    favoriteStreamingKeys.set(new Set([streamingFavKey('album', BANDCAMP_SVC, URL_ALBUM)]));
    parties = [];

    await toggleStreamingFavorite({ itemType: 'album', service: BANDCAMP_SVC, serviceId: URL_ALBUM });
    await respirer(20);

    expect(ajoutsProfil().length, 'le retrait côté profil n’a pas eu lieu').toBe(1);
    expect(recopies().map((p) => p.url)).toEqual([]);
  });
});

describe('#4577 point 4 — le favori d’ARTISTE Bandcamp', () => {
  it('🔴 un artiste Bandcamp a une identité : l’URL de sa page', () => {
    const ref = refFavoriDeVignette('artist', { url: URL_ARTISTE }, BANDCAMP_EXT);
    expect(ref.service, 'la clé d’onglet est partie telle quelle').toBe(BANDCAMP_SVC);
    expect(ref.serviceId, 'l’artiste Bandcamp n’avait aucun identifiant').toBe(URL_ARTISTE);
    expect(favKeyOf(ref)).toBe(streamingFavKey('artist', BANDCAMP_SVC, URL_ARTISTE));
  });

  it('CONTRE-ÉPREUVE — une PISTE Bandcamp ne se replie toujours PAS sur une URL de page', () => {
    // #1400 l'a écrit : l'identité d'une piste est son URL de FLUX. Élargir le
    // repli à l'artiste ne doit pas l'élargir à la piste.
    const ref = refFavoriDeVignette('track', { url: URL_ALBUM }, BANDCAMP_EXT);
    expect(ref.serviceId).toBe('');
    expect(favKeyOf(ref)).toBeNull();
  });

  it('CONTRE-ÉPREUVE — un `source_id` réel prime toujours sur le repli', () => {
    const ref = refFavoriDeVignette('artist', { source_id: '53675', url: URL_ARTISTE }, 'qobuz');
    expect(ref.serviceId).toBe('53675');
  });
});

describe('#4577 — sur l’ÉCRAN, sans poser aucun magasin à la main', () => {
  class ObservateurInerte {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
    if (!('IntersectionObserver' in globalThis)) {
      vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
    }
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
  });

  /** Ouvre l'écran, cherche « soda », et ouvre la discographie de l'artiste. */
  async function ouvrirDiscographie() {
    serveur(servicesAvecDeclaration(false));
    // 🔴 Aucun `streamingServices.set` ici : c'est tout l'objet du cas.
    currentProfileId.set(1);
    await respirer(20, () => parties.some((p) => /favorites\/streaming/.test(p.url)));
    monte = mount(StreamingV2 as any, { target: hote! });
    await respirer(40, () => !!hote!.querySelector('input'));

    const champ = hote!.querySelector('input') as HTMLInputElement;
    champ.value = 'soda';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    // La recherche est temporisée de 260 ms.
    await new Promise((r) => setTimeout(r, 400));
    await respirer(40, () => !!hote!.querySelector('button.chip'));

    const puce = hote!.querySelector('button.chip') as HTMLButtonElement | null;
    expect(puce, 'aucun artiste rendu : le décor du témoin est faux').not.toBeNull();
    puce!.click();
    await respirer(40, () => parties.some((p) => /\/ext\/bandcamp\/artist/.test(p.url)));
    await respirer(20);
  }

  /** Le cœur de l'en-tête de la discographie. */
  const coeurArtiste = () => hote!.querySelector('.bc-art-fav button.heart-btn') as HTMLButtonElement | null;

  it('🔴 la discographie d’un artiste Bandcamp PORTE un cœur', async () => {
    await ouvrirDiscographie();
    expect(coeurArtiste(), 'aucun cœur sur l’artiste Bandcamp').not.toBeNull();
  });

  it('🔴 le clic écrit `artist` + l’URL de la page, et n’émet AUCUNE recopie', async () => {
    await ouvrirDiscographie();
    parties = [];
    coeurArtiste()!.click();
    await respirer(40, () => ajoutsProfil().length > 0);
    await respirer(20);

    const ajout = ajoutsProfil()[0];
    expect(
      ajout,
      `aucun ajout n’est parti — requêtes vues : ${parties.map((p) => `${p.method} ${p.url}`).join(', ')}`,
    ).toBeDefined();
    expect(ajout.body).toMatchObject({
      item_type: 'artist',
      service: BANDCAMP_SVC,
      service_id: URL_ARTISTE,
    });
    expect(JSON.stringify(ajout.body)).not.toContain(BANDCAMP_EXT);
    // 🔴 Le point 3, vu de l'écran : le magasin a bien été rempli par le
    // chargement du profil, et la recopie n'est pas partie.
    expect(
      recopies().map((p) => `${p.method} ${p.url}`),
      'la recopie 501 part toujours',
    ).toEqual([]);
  });
});
