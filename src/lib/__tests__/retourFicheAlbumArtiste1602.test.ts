// @vitest-environment jsdom
//
// renesenses/tune-web-client#1602 — Reivax66 (Xavier), fil 1941, 25/09/2026,
// 0.9.164, Edge sous Windows :
//
//   « Sur qobuz je sélectionne l'artiste : […] J'obtiens bien sa page : […]
//     Quand je clique sur < back : [l'accueil Streaming] C'est pénible !!! »
//
// La fiche album est refermée AVANT de router vers la page artiste (#1486), et
// `vueDeRetour` ne porte qu'une VUE — l'écran SOUS la fiche. Le « < » de la
// page artiste ramenait donc à `streaming`, la fiche sautée.
//
// 🔴 CES TÉMOINS EXÉCUTENT : la VRAIE coquille est montée (ses gestes, sa vue
// `streamingartist`, sa vue `streamingalbum`), on CLIQUE le lien de l'artiste
// sur la fiche, puis le « < » de la page artiste, puis le Retour de la fiche.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { ficheAlbumDeRetour, ficheAlbumService, ficheArtisteService } from '../stores/streaming';
import { detailOuvert, fermerDetailEnReculant, ouvrirDetail } from '../historiqueCoquille';
import { cleDetailAlbum } from '../cleDetailAlbum';
import { ouvrirArtisteDepuis } from '../ouvrirArtisteDepuis';

vi.setConfig({ testTimeout: 30_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

/** L'album de la capture 1 : `#streaming/album/qobuz:szk1ljivrp3j8`. */
const ALBUM = {
  id: null,
  title: 'La Trilogie des Chiens Saucisses',
  source: 'qobuz',
  source_id: 'szk1ljivrp3j8',
  artist_name: 'Olivier Madore-Millette',
  artist_id: '7734',
  cover_path: 'https://static.qobuz.com/c.jpg',
};

const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres|featured|new-releases)(\?|\/|$)/;

function reponsePour(url: string) {
  const corps: unknown = COLLECTIONS.test(url) ? [] : {};
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hotes: HTMLDivElement[] = [];
let montes: Record<string, any>[] = [];

function monter(composant: any, props: Record<string, any> = {}): HTMLDivElement {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  hotes.push(hote);
  const m = mount(composant, { target: hote, props });
  montes.push(m);
  flushSync();
  return hote;
}

async function reposer(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 10));
  }
  flushSync();
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => reponsePour(String(url))));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  activeView.set('home');
  vueDeRetour.set(null);
  detailOuvert.set(null);
  ficheArtisteService.set(null);
  ficheAlbumService.set(null);
  ficheAlbumDeRetour.set(null);
});

afterEach(() => {
  for (const m of montes.reverse()) unmount(m);
  montes = [];
  for (const h of hotes) h.remove();
  hotes = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function lienArtiste(hote: HTMLElement): HTMLButtonElement {
  const lien = hote.querySelector('.artist.lien') as HTMLButtonElement | null;
  expect(lien, 'le nom de l’artiste est un lien').toBeTruthy();
  return lien!;
}

function retourArtiste(hote: HTMLElement): HTMLButtonElement {
  const b = hote.querySelector<HTMLButtonElement>('.v2-fas .retour');
  expect(b, 'la page artiste porte un bouton Retour').toBeTruthy();
  return b!;
}

describe('#1602 — le « < » de la page artiste rouvre la fiche album d’où l’on vient', () => {
  it('fiche en CALQUE sur le Streaming (le parcours du fil 1941)', async () => {
    const coquille = monter(ShellV2);
    activeView.set('streaming');
    flushSync();
    // Le calque, tel que `StreamingV2` le pose : une clé de détail, et un
    // `onClose` qui recule.
    ouvrirDetail(cleDetailAlbum(ALBUM)!);
    const calque = monter(AlbumDetailV2, {
      album: ALBUM, service: 'qobuz', onClose: () => fermerDetailEnReculant(),
    });
    await reposer();

    lienArtiste(calque).click();
    await reposer();
    expect(get(activeView)).toBe('streamingartist');
    expect(get(ficheArtisteService)).toMatchObject({ service: 'qobuz', id: '7734' });

    retourArtiste(coquille).click();
    await reposer();

    // 🔴 LE défaut : `streaming`, la fiche sautée.
    expect(get(activeView), 'le Retour rouvre la FICHE, pas l’écran sous elle').toBe('streamingalbum');
    expect(get(ficheAlbumService)).toMatchObject({
      service: 'qobuz', id: 'szk1ljivrp3j8', titre: ALBUM.title, artisteId: '7734',
    });
    expect(coquille.textContent).toContain(ALBUM.title);
    // Le dépôt est consommé une fois.
    expect(get(ficheAlbumDeRetour)).toBeNull();

    // Et le Retour de la fiche ramène là où elle était ouverte.
    const fermer = coquille.querySelector<HTMLButtonElement>('.v2-detail .close');
    expect(fermer).toBeTruthy();
    fermer!.click();
    await reposer();
    expect(get(activeView)).toBe('streaming');
  });

  it('fiche de la vue `streamingalbum` (ouverte depuis Lecture en cours)', async () => {
    const coquille = monter(ShellV2);
    vueDeRetour.set('nowplaying');
    ficheAlbumService.set({
      service: 'qobuz', id: ALBUM.source_id, titre: ALBUM.title,
      pochette: ALBUM.cover_path, artiste: ALBUM.artist_name, artisteId: ALBUM.artist_id,
    });
    activeView.set('streamingalbum');
    await reposer();

    lienArtiste(coquille).click();
    await reposer();
    expect(get(activeView)).toBe('streamingartist');

    retourArtiste(coquille).click();
    await reposer();
    expect(get(activeView)).toBe('streamingalbum');
    expect(get(ficheAlbumService)?.id).toBe(ALBUM.source_id);
    expect(get(vueDeRetour)).toBe('nowplaying');
  });

  it('une page artiste ouverte AUTREMENT ne rouvre pas un album quitté entre-temps', async () => {
    const coquille = monter(ShellV2);
    // Un dépôt resté d'un parcours abandonné (barre latérale)…
    ficheAlbumDeRetour.set({
      fiche: { service: 'qobuz', id: 'vieux', titre: 'Vieil album' },
      depuis: 'streaming',
    });
    // … puis la Recherche ouvre un artiste par le chemin de référence.
    await ouvrirArtisteDepuis({ name: 'Leprous', source: 'qobuz', source_id: 'q-42' }, 'search');
    await reposer();
    expect(get(ficheAlbumDeRetour)).toBeNull();

    retourArtiste(coquille).click();
    await reposer();
    expect(get(activeView)).toBe('search');
  });
});
