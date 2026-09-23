// @vitest-environment jsdom
//
// renesenses/tune-web-client#1486 — FabienM, fil « v0.9.162 : divers bugs »,
// 23/09/2026 11h59, Windows, point 1 :
//
//   « Lien artiste sur un album de Qobuz ou Bandcamp ne renvoie pas sur la
//     page artiste mais renvoie sur l'accueil du Streaming. »
//
// ⚠️ CE N'EST PAS UNE RÉGRESSION de #1359 (fermée le 20/09 sur la 0.9.159).
// Son correctif est intact et ces témoins le laissent en place : il faisait
// voyager `artist_id` dans quatre fabriques d'album de service. Ce sont des
// chemins qu'il ne couvrait pas.
//
// ── CE QUI A ÉTÉ MESURÉ, ET QUI TRANCHE ───────────────────────────────────
//
// Sur le .18 le 23/09/2026, et par exécution du code de `main` (une sonde
// montée puis jetée, qui montait la fiche et cliquait le lien) :
//
//   • **Bandcamp est CASSÉ, et la cause est nommée.** Le clic émet
//     `{service:'__bandcamp__', nom:'Agnes Obel'}` — sans identifiant, parce
//     que la fabrique de pistes Bandcamp d'`AlbumDetailV2` ne pose pas
//     d'`artist_id`, donc le filet `artisteReplie` renonce. Le nom part alors
//     en recherche fédérée SOUS LA CLÉ D'ONGLET, et le serveur ne la connaît
//     pas :
//
//       GET /search?q=Agnes Obel&limit=3&sources=bandcamp
//         → services.bandcamp.artists[0] = {"id":"https://agnesobel.bandcamp.com",
//                                           "name":"Agnes Obel"}
//       GET /search?q=Agnes Obel&limit=3&sources=__bandcamp__
//         → services: {}                                        ← RIEN
//
//     Zéro candidat ⇒ repli, et l'écran part sur la Recherche. La fiche, elle,
//     existe bel et bien une fois la clé traduite :
//
//       GET /streaming/bandcamp/artists/https%3A%2F%2Fagnesobel.bandcamp.com
//         → {"id":"https://agnesobel.bandcamp.com","name":""}         (200)
//
//     `cleServeur` porte cette traduction depuis #1138 ; elle manquait au seul
//     endroit où la clé quitte le client.
//
//   • **L'éditorial Qobuz ne tient QUE par son filet.** La bande
//     « Nouveautés » n'est pas rendue par le gabarit `tile` de `StreamingV2` —
//     donc jamais par `ouvrirFiche`, la fabrique corrigée par #1359 — mais par
//     `PageWidgets`, dont la fabrique est `albumDistant` (`widgetsService`).
//     Elle jetait `artist_id`, alors que la route le sert :
//
//       GET /api/v1/streaming/qobuz/new-releases?limit=2
//       [{"artist_id":"551325","artist_name":"Agnes Obel",
//         "source_id":"e3j7lzexax05q","title":"The Meaning of Flowers",
//         "track_count":12,"year":2026, …}, …]
//
//     C'était le point resté « non établi » au dépôt du 21/09 : il l'est. La
//     fiche s'en sortait en repliant sur l'unanimité de ses PISTES — un filet
//     qui exige que la liste soit arrivée, et qui renonce sur une compilation
//     ou un coffret. Tant qu'elle charge, le clic n'a pas d'identifiant et
//     repart en recherche fédérée, qui peut échouer.
//
// ── CE QUI N'EST PAS ÉTABLI, ET QU'IL FAUT DIRE ───────────────────────────
//
// L'écran d'arrivée que FabienM décrit — « je retourne à la page accueil
// editorial » — n'est PAS celui du repli de #956, qui mène à la Recherche et
// pose un bandeau. Une explication tient debout et n'est pas démontrée ici :
// `allerArtiste` refermait la fiche par `onClose()`, qui vaut
// `fermerDetailEnReculant` pour les dix calques, donc `history.back()`. Le
// `popstate` de ce recul n'arrive jamais dans le tour courant ; s'il aboutit
// APRÈS le changement de vue, `surRetour` repose la vue de l'entrée précédente
// par-dessus la fiche artiste.
//
// 🔴 JSDOM NE SAIT PAS TRANCHER CE POINT — mesuré, pas supposé : un
// `pushState` posé après un `history.back()` y AVALE la traversée (aucun
// `popstate`, `history.length` qui monte). Le navigateur, lui, ne la jette
// pas. Et aucune vue navigateur n'est possible sur ce poste.
//
// On ne garde donc pas une assertion qu'on ne peut pas honorer. On garde
// l'INVARIANT, lui parfaitement mesurable : **un clic qui NAVIGUE ne dépile
// pas l'historique**. Il n'y a plus de traversée en vol, donc plus de course à
// arbitrer, quelle que soit la façon dont le navigateur l'arbitrerait.
//
// 🔴 CES TÉMOINS EXÉCUTENT. Ils MONTENT la fiche, CLIQUENT le lien, et lisent
// ce que le geste de navigation a reçu et ce que l'historique a subi. Une
// garde de texte serait restée verte sur les trois : rien ne manquait au
// vocabulaire du code — c'était la CLÉ, le CHAMP et le GESTE d'historique qui
// étaient faux.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import * as api from '../api';
import { catalogueService } from '../widgetsService';
import { cleDetailAlbum } from '../cleDetailAlbum';
import {
  brancherHistoriqueCoquille,
  detailOuvert,
  fermerDetailEnReculant,
  ouvrirDetail,
} from '../historiqueCoquille';
import { activeView, gestesNavigationService, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';
import { ouvrirArtisteDeServiceParNom } from '../ouvrirArtisteDepuis';
import { BANDCAMP_EXT } from '../ongletsStreaming';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';

/** Monter cette fiche compile un composant de plusieurs milliers de lignes. */
vi.setConfig({ testTimeout: 30_000 });

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverInerte);

/** La charge utile EXACTE de la bande « Nouveautés », mesurée sur le .18. */
const NOUVEAUTE_QOBUZ = {
  artist_id: '551325',
  artist_name: 'Agnes Obel',
  cover_path: 'https://static.qobuz.com/images/covers/5q/x0/e3j7lzexax05q_600.jpg',
  quality: { bit_depth: 24, bitrate: null, channels: 2, codec: 'FLAC', sample_rate: 44100 },
  released_at: 1789682400,
  source_id: 'e3j7lzexax05q',
  title: 'The Meaning of Flowers',
  track_count: 12,
  year: 2026,
};

/** Le catalogue éditorial, construit par le VRAI code sur cette charge. */
async function ficheEditoriale(): Promise<any> {
  vi.spyOn(api, 'getStreamingFeaturedSections').mockResolvedValue([] as any);
  vi.spyOn(api, 'getStreamingGenres').mockResolvedValue([] as any);
  vi.spyOn(api, 'getStreamingFeaturedPlaylistsByTag').mockResolvedValue([] as any);
  vi.spyOn(api, 'getStreamingNewReleases').mockResolvedValue([NOUVEAUTE_QOBUZ] as any);
  const catalogue = await catalogueService('qobuz');
  const bande = catalogue.find((w) => w.id === 'qobuz-nouveautes');
  expect(bande, 'la bande « Nouveautés » doit exister').toBeTruthy();
  const [element] = await bande!.charger({ profileId: 1, albums: [], zones: [] });
  return element.fiche;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let debrancher: (() => void) | null = null;

/** Laisse jouer les promesses ET les effets. */
async function reposer(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
  flushSync();
}

beforeEach(() => {
  activeView.set('home');
  vueDeRetour.set(null);
  detailOuvert.set(null);
  ficheArtisteService.set(null);
  gestesNavigationService.set(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  if (debrancher) debrancher();
  debrancher = null;
  gestesNavigationService.set(null);
  vi.restoreAllMocks();
});

describe('#1486 — la fabrique de l’éditorial', () => {
  it('la bande « Nouveautés » porte l’`artist_id` que la route sert', async () => {
    const fiche = await ficheEditoriale();
    expect(fiche.source_id).toBe('e3j7lzexax05q');
    expect(fiche.artist_name).toBe('Agnes Obel');
    // 🔴 LE champ manquant : sans lui, `destinationArtiste` ne peut rendre
    // `artiste-service` qu'en repliant sur les pistes — quand elles sont là.
    expect(fiche.artist_id, 'l’identifiant de l’artiste CHEZ Qobuz').toBe('551325');
  });
});

describe('#1486 — le clic sur l’artiste, fiche ouverte depuis l’éditorial Qobuz', () => {
  /**
   * Monte la fiche EN CALQUE, comme `PageWidgets.ouvrirElement` le fait :
   * une entrée d'historique empilée, et un `onClose` qui RECULE.
   */
  async function poserLeCalque(fiche: any) {
    debrancher = brancherHistoriqueCoquille();
    activeView.set('streaming');
    const cle = cleDetailAlbum(fiche);
    expect(cle).toBe('album:qobuz:e3j7lzexax05q');
    ouvrirDetail(cle!);
    await reposer(2);

    const recu: any[] = [];
    gestesNavigationService.set({
      ouvrirAlbum: () => {},
      ouvrirArtiste: (c: any) => {
        recu.push(c);
        vueDeRetour.set(c.depuis ?? 'nowplaying');
        ficheArtisteService.set({ service: c.service as any, id: String(c.id ?? ''), nom: c.nom });
        activeView.set('streamingartist');
      },
    });

    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(AlbumDetailV2, {
      target: hote,
      props: { album: fiche, service: 'qobuz', onClose: () => fermerDetailEnReculant() },
    });
    await reposer();
    return recu;
  }

  function lienArtiste(): HTMLButtonElement {
    const lien = hote!.querySelector('.artist.lien') as HTMLButtonElement | null;
    expect(lien, 'le nom de l’artiste doit être un LIEN, pas un texte inerte').toBeTruthy();
    return lien!;
  }

  it('ouvre la fiche artiste par IDENTIFIANT, sans attendre la liste des pistes', async () => {
    const fiche = await ficheEditoriale();
    // 🔴 Les pistes ne répondent PAS. C'est le cas que le filet `artisteReplie`
    // ne peut pas rattraper — et celui d'une compilation, où il renonce même
    // une fois la liste arrivée.
    vi.spyOn(api, 'getStreamingAlbumTracks').mockImplementation(() => new Promise(() => {}));
    vi.spyOn(api, 'getStreamingAlbum').mockResolvedValue(NOUVEAUTE_QOBUZ as any);

    const recu = await poserLeCalque(fiche);
    lienArtiste().click();
    await reposer();

    expect(recu.length, 'le geste d’ouverture doit avoir été appelé').toBe(1);
    expect(recu[0].service).toBe('qobuz');
    // 🔴 LE défaut : sans identifiant, le clic repart en recherche fédérée,
    // qui peut ne rien rendre et retomber sur l'écran Recherche.
    expect(recu[0].id, 'l’identifiant de service évite la recherche fédérée').toBe('551325');
    expect(get(activeView)).toBe('streamingartist');
  });

  it('le Retour de la fiche artiste ramène à l’écran d’où l’on vient', async () => {
    const fiche = await ficheEditoriale();
    vi.spyOn(api, 'getStreamingAlbumTracks').mockResolvedValue([] as any);
    vi.spyOn(api, 'getStreamingAlbum').mockResolvedValue(NOUVEAUTE_QOBUZ as any);

    const recu = await poserLeCalque(fiche);
    lienArtiste().click();
    await reposer();

    // `depuis` était `'nowplaying'` EN DUR dans la coquille : le Retour
    // quittait le Streaming pour « Lecture en cours ».
    expect(recu[0].depuis).toBe('streaming');
    expect(get(vueDeRetour)).toBe('streaming');
  });

  it('le clic NAVIGUE sans dépiler : aucune traversée d’historique en vol', async () => {
    const fiche = await ficheEditoriale();
    vi.spyOn(api, 'getStreamingAlbumTracks').mockResolvedValue([] as any);
    vi.spyOn(api, 'getStreamingAlbum').mockResolvedValue(NOUVEAUTE_QOBUZ as any);

    const recu = await poserLeCalque(fiche);
    // On observe le VRAI `history.back`, sur le vrai historique de la page.
    const recul = vi.spyOn(window.history, 'back');

    lienArtiste().click();
    await reposer();

    expect(recu.length).toBe(1);
    // 🔴 LE geste fautif : refermer le calque en RECULANT laisse une traversée
    // en vol, dont le `popstate` arrive après le changement de vue. On referme
    // sans dépiler — l'abonnement de `detailOuvert` réécrit l'entrée courante.
    expect(recul, 'un clic qui navigue ne dépile pas l’historique').not.toHaveBeenCalled();
    // Le calque est bien refermé, et l'entrée courante ne dit plus qu'il est
    // ouvert : le Précédent depuis la fiche artiste ramène à l'écran, pas à
    // une entrée morte.
    expect(get(detailOuvert)).toBe(null);
    expect(window.history.state).toMatchObject({ tune: 'v2', vue: 'streamingartist', detail: null });
  });
});

describe('#1486 — Bandcamp : la clé d’onglet ne sort pas du client', () => {
  it('la résolution par le nom interroge `bandcamp`, jamais `__bandcamp__`', async () => {
    const interroges: string[] = [];
    await ouvrirArtisteDeServiceParNom({ service: BANDCAMP_EXT, nom: 'Agnes Obel' }, 'streaming', {
      chercher: async (nom, service) => {
        interroges.push(service);
        // Le serveur ne rend des artistes que pour `bandcamp` — mesuré.
        return service === 'bandcamp'
          ? [{ id: 'https://agnesobel.bandcamp.com', name: nom }]
          : [];
      },
    });

    expect(interroges, 'le service interrogé est celui du SERVEUR').toEqual(['bandcamp']);
    expect(get(activeView)).toBe('streamingartist');
    expect(get(ficheArtisteService)).toEqual({
      service: 'bandcamp',
      id: 'https://agnesobel.bandcamp.com',
      nom: 'Agnes Obel',
    });
    expect(get(vueDeRetour)).toBe('streaming');
  });

  it('avec un identifiant déjà en main, la fiche s’ouvre sans rien interroger', async () => {
    const interroges: string[] = [];
    await ouvrirArtisteDeServiceParNom(
      { service: BANDCAMP_EXT, nom: 'Agnes Obel', id: 'https://agnesobel.bandcamp.com' },
      'favorites',
      { chercher: async (_n, s) => { interroges.push(s); return []; } },
    );
    expect(interroges).toEqual([]);
    expect(get(ficheArtisteService)?.service).toBe('bandcamp');
    expect(get(vueDeRetour)).toBe('favorites');
  });
});
