// @vitest-environment jsdom
//
// renesenses/tune-server-rust#3708 — FabienM, fil forum 1726 (08/09/2026),
// v0.9.143 :
//
//   « Dans menu bibliothèque, l'hyperlien sur l'artiste est absent, ex ici:
//     Artiste Depeche Mode n'a pas de lien actif pour rediriger vers la page
//     de l'artiste. »
//
// `AlbumDetailV2.svelte:360` était `<div class="artist">{album.artist_name}</div>` —
// du texte. Et la plomberie existait déjà, branchée ailleurs :
// `PisteActions:229` et `NowPlaying:515` POSENT `pendingLibraryArtist` puis
// `activeView`, `LibraryV2:867` le consomme. « Écrit mais pas branché », du
// côté de l'ÉMETTEUR.
//
// 🔴 CES TÉMOINS CLIQUENT, ILS NE LISENT PAS. Un test qui chercherait
// « pendingLibraryArtist » dans le source de la fiche resterait vert si le
// nom redevenait un `<div>` — et vert aussi si le magasin était posé sans que
// personne le consomme, ce qui est exactement le défaut d'à côté.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView, pendingLibraryArtist } from '../stores/navigation';
import { albums as albumsStore } from '../stores/library';
import type { Album } from '../types';

/** Monter ces deux écrans compile des composants de plusieurs milliers de lignes. */
vi.setConfig({ testTimeout: 30_000 });

/** L'album de sa capture : `101 (CD1)`, Depeche Mode, 1989. */
const ALBUM: Album = {
  id: 55,
  title: '101 (CD1)',
  artist_id: 994,
  artist_name: 'Depeche Mode',
  year: 1989,
} as Album;

/** Le même album SANS identifiant d'artiste — un album de service, ou une base
 *  ancienne. Le point 3 du ticket : « on ne sait pas si `albums.artist_id` est
 *  non nul pour SON album ». */
const ALBUM_SANS_ID: Album = { ...ALBUM, artist_id: null } as Album;

const ARTISTE = { id: 994, name: 'Depeche Mode' };
const PISTES = [{ id: 1, title: 'Pimpf', source: 'local', artist_id: 994 }];

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverInerte);

// La grille de la Bibliothèque est virtualisée sur une hauteur mesurée ; jsdom
// n'a pas de mise en page et rendrait zéro vignette.
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

function corpsPour(url: string): unknown {
  if (/\/library\/albums\/55\/tracks/.test(url)) return PISTES;
  if (/\/library\/albums\/55(\?|$)/.test(url)) return ALBUM;
  if (/\/library\/artists\/994\/albums/.test(url)) return [ALBUM];
  if (/\/library\/artists/.test(url)) return [ARTISTE];
  if (/\/library\/albums/.test(url)) return [ALBUM];
  if (/\/library\/tracks/.test(url)) return [];
  if (/\/zones/.test(url)) return [];
  return {};
}

const respirer = () => new Promise((r) => setTimeout(r, 0));

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  activeView.set('home');
  pendingLibraryArtist.set(null);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
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
  activeView.set('home');
  pendingLibraryArtist.set(null);
  albumsStore.set([]);
  vi.unstubAllGlobals();
});

async function poserFiche(album: Album, onClose: () => void = () => {}): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumDetailV2, { target: hote, props: { album, onClose } });
  for (let i = 0; i < 6; i++) await respirer();
  flushSync();
  return hote;
}

const nomArtiste = (el: HTMLElement) => el.querySelector('.head .meta .artist') as HTMLElement | null;

describe('#3708 — le nom de l’artiste MÈNE à sa fiche', () => {
  it('c’est un élément INTERACTIF, atteignable au clavier', async () => {
    const el = await poserFiche(ALBUM);
    const nom = nomArtiste(el);
    expect(nom, 'le nom de l’artiste a disparu de la fiche').not.toBeNull();
    expect(nom!.textContent).toBe('Depeche Mode');

    // 🔴 Le défaut d'origine ET le défaut qu'on ne veut pas mettre à la place :
    // un `<div onclick>` n'est atteint par aucune tabulation.
    expect(
      nom!.tagName,
      `le nom d’artiste est un <${nom!.tagName.toLowerCase()}> : ` +
        'un élément non interactif que la tabulation ne visite pas',
    ).toBe('BUTTON');
    expect(nom!.tabIndex, 'le nom d’artiste est hors du parcours de tabulation').toBeGreaterThanOrEqual(0);
  });

  it('le clic POSE la cible et change de vue — le contrat de PisteActions', async () => {
    const el = await poserFiche(ALBUM);
    (nomArtiste(el) as HTMLElement).click();
    flushSync();

    expect(
      get(pendingLibraryArtist),
      'la cible n’a pas été posée : la Bibliothèque n’a rien à ouvrir',
    ).toBe(994);
    expect(get(activeView), 'on ne va pas à la Bibliothèque').toBe('library');
  });

  it('il REFERME la fiche — sinon l’onglet Artistes s’ouvre derrière un calque', async () => {
    let ferme = 0;
    const el = await poserFiche(ALBUM, () => (ferme += 1));
    (nomArtiste(el) as HTMLElement).click();
    flushSync();
    expect(ferme, 'la fiche d’album reste au premier plan : le clic paraît sans effet').toBe(1);
  });

  it('sans identifiant d’artiste, le nom reste du TEXTE — pas un lien mort', async () => {
    const el = await poserFiche(ALBUM_SANS_ID);
    const nom = nomArtiste(el);
    expect(nom, 'le nom de l’artiste a disparu').not.toBeNull();
    expect(nom!.textContent).toBe('Depeche Mode');
    expect(nom!.tagName, 'un bouton sans cible : le clic ne mènerait nulle part').toBe('DIV');

    (nom as HTMLElement).click();
    flushSync();
    expect(get(pendingLibraryArtist), 'une cible a été posée sans identifiant').toBeNull();
    expect(get(activeView), 'on a changé de vue pour rien').toBe('home');
  });
});

// ── L'autre moitié : le CONSOMMATEUR ───────────────────────────────────────
//
// 🔴 Poser le magasin ne suffit pas. `LibraryV2` le consommait dans un
// `$effect` qui lit `get(pendingLibraryArtist)` : `get()` se désabonne
// aussitôt et n'inscrit aucune dépendance sous les runes — l'effet ne tournait
// qu'AU MONTAGE. Cela marchait depuis `NowPlaying` (on changeait de vue, donc
// `ShellV2` remontait l'écran) et PAS depuis la fiche d'album, où l'on est
// déjà dans la Bibliothèque. Ce témoin monte la Bibliothèque, PUIS pose la
// cible : aucun remontage.
describe('#3708 — la Bibliothèque DÉJÀ montée honore la cible', () => {
  async function poserBibliotheque(): Promise<HTMLDivElement> {
    activeView.set('library');
    albumsStore.set([ALBUM]);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(LibraryV2, { target: hote, props: {} as any });
    for (let i = 0; i < 8; i++) await respirer();
    flushSync();
    return hote;
  }

  it('la cible posée APRÈS le montage est consommée', async () => {
    await poserBibliotheque();
    // Rien en attente au montage : c'est bien le geste d'après qui compte.
    expect(get(pendingLibraryArtist)).toBeNull();

    pendingLibraryArtist.set(994);
    for (let i = 0; i < 8; i++) await respirer();
    flushSync();

    expect(
      get(pendingLibraryArtist),
      'la cible dort encore dans le magasin : l’écran ne l’a pas vue, ' +
        'le clic sur l’artiste n’aurait rien fait',
    ).toBeNull();
  });

  it('et l’onglet Artistes est celui qui s’affiche', async () => {
    const el = await poserBibliotheque();
    pendingLibraryArtist.set(994);
    for (let i = 0; i < 10; i++) await respirer();
    flushSync();

    const actif = el.querySelector(".tabs .tab.active") as HTMLElement | null;
    expect(actif, 'aucun onglet actif dans la Bibliothèque').not.toBeNull();
    expect(
      actif!.textContent?.toLowerCase(),
      'l’onglet n’a pas basculé sur les Artistes',
    ).toContain('artiste');
  });
});
