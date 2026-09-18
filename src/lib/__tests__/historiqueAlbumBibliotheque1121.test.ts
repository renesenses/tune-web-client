// @vitest-environment jsdom
//
// #1121 — LE PRÉCÉDENT DU NAVIGATEUR DEPUIS UNE FICHE D'ALBUM DE LA BIBLIOTHÈQUE.
//
// FabienM, forum fil 1829, point 10 (v0.9.152, 17/09/2026) :
//
//   « BACK navigateur fonctionne mal sur menu Bibliothèque quand on clique sur
//     un album par exemple, le BACK revient à l'accueil alors qu'il devrait
//     revenir au menu Bibliothèque »
//
// ## CE QUI A ÉTÉ MESURÉ, ET QUI EXPLIQUE TOUT
//
// Bertrand, au navigateur sur la .18 (v0.9.153) : Accueil → Bibliothèque →
// onglet Albums → clic sur un album. L'URL reste `#library` du début à la fin.
// La fiche N'ÉCRIT AUCUNE ENTRÉE. Le Précédent ne se trompe donc pas de
// destination : il dépile la seule entrée qui existait sous `#library`, celle
// de l'Accueil, et fait exactement son travail.
//
// Le code dit la même chose, et le disait déjà : `calquesAlbumEmpilent980.test.ts`
// ÉNUMÈRE les écrans qui montent `AlbumDetailV2` et exige d'eux trois
// branchements — et `LibraryV2` y figure en EXCEPTION NOMMÉE, « dette assumée —
// six écrivains de `opened`, dont un asynchrone ». Ce ticket est cette dette.
//
// ## CE QUE CE TÉMOIN REFUSE DE FAIRE
//
// Il ne lit pas le source à la recherche d'un `ouvrirDetail(`. Une garde de
// texte serait satisfaite par un appel posé n'importe où, y compris dans une
// branche morte. On monte la VRAIE Bibliothèque, on CLIQUE une vignette
// d'album, puis on regarde ce que le navigateur a dans sa pile — et on appuie
// sur son Précédent. Le test n'appelle jamais `pushState` lui-même.
//
// ⚠️ jsdom est ici un vrai navigateur pour ce qui nous occupe : `pushState`,
// `history.back()` et `popstate` s'y comportent comme dans Chrome (déjà mesuré
// pour `historiqueCoquilleV2_828_867.test.ts`). Ce qu'il n'a pas, c'est la mise
// en page — d'où les hauteurs forcées, sans lesquelles la grille virtualisée
// ne rendrait aucune vignette.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView, listResetNonce, pendingLibraryAlbum, pendingLibraryArtist, pendingLibraryYear } from '../stores/navigation';
import { albums as albumsStore } from '../stores/library';
import { brancherHistoriqueCoquille, detailOuvert } from '../historiqueCoquille';
import type { Album } from '../types';

/** Monter cet écran compile un composant de plus de deux mille lignes. */
vi.setConfig({ testTimeout: 30_000 });

const ALBUM: Album = {
  id: 55,
  title: '101 (CD1)',
  artist_id: 994,
  artist_name: 'Depeche Mode',
  year: 1989,
} as Album;

/** La clé que la coquille doit ranger dans l'entrée — `lib/cleDetailAlbum.ts`. */
const CLE = 'album:55';

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function corpsPour(url: string): unknown {
  if (/\/library\/albums\/55\/tracks/.test(url)) return [];
  if (/\/library\/albums\/55(\?|$)/.test(url)) return ALBUM;
  if (/\/library\/artists\/994\/albums/.test(url)) return [ALBUM];
  if (/\/library\/artists/.test(url)) return [];
  if (/\/library\/albums/.test(url)) return [ALBUM];
  if (/\/library\/tracks/.test(url)) return [];
  return {};
}

const respirer = () => new Promise((r) => setTimeout(r, 0));
const attendre = (ms = 60) => new Promise((r) => setTimeout(r, ms));

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let debrancher: (() => void) | null = null;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
  }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const corps = corpsPour(String(url));
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  // Les écrans lisent leurs préférences d'affichage dans `localStorage` : un
  // cas précédent qui aurait basculé en liste ferait chercher une vignette qui
  // n'existe plus.
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  activeView.set('home');
  pendingLibraryAlbum.set(null);
  pendingLibraryArtist.set(null);
  pendingLibraryYear.set(null);
  detailOuvert.set(null);
  // Chaque cas repart d'une pile propre.
  history.replaceState(null, '', '/');
});

afterEach(() => {
  if (debrancher) debrancher();
  debrancher = null;
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  albumsStore.set([]);
  activeView.set('home');
  detailOuvert.set(null);
  vi.unstubAllGlobals();
});

/**
 * Le parcours du signalement, joué pour de vrai : on est dans la Bibliothèque,
 * la coquille est branchée sur l'historique (c'est `ShellV2` qui la branche en
 * production ; son propre témoin le garde, #828/#867), et l'Accueil est
 * l'entrée d'AVANT — exactement la pile que Bertrand a relevée au navigateur.
 */
async function poserBibliotheque(): Promise<HTMLDivElement> {
  activeView.set('home');
  albumsStore.set([ALBUM]);
  debrancher = brancherHistoriqueCoquille();
  // Le clic sur « Bibliothèque » de la barre latérale : c'est CE geste qui
  // empile `#library` par-dessus `#home`.
  activeView.set('library');
  flushSync();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as any });
  for (let i = 0; i < 8; i++) await respirer();
  flushSync();
  return hote;
}

/** La vignette d'un album dans la grille — le geste du signalement. */
function vignette(el: HTMLElement): HTMLButtonElement | null {
  return el.querySelector<HTMLButtonElement>('.grid .card button.meta');
}

const fiche = (el: HTMLElement) => el.querySelector('.v2-detail');

describe('#1121 — ouvrir un album de la Bibliothèque empile une entrée', () => {
  it('le décor est bien celui du signalement : grille visible, Accueil dessous', async () => {
    const el = await poserBibliotheque();
    expect(vignette(el), 'aucune vignette d’album : le témoin ne mesure rien').not.toBeNull();
    expect(fiche(el), 'une fiche est déjà ouverte : le témoin ne prouverait rien').toBeNull();
    expect(history.state, 'la Bibliothèque n’est pas l’entrée courante').toMatchObject({
      tune: 'v2', vue: 'library', detail: null,
    });
  });

  it('🔴 cliquer un album EMPILE une entrée — c’est le défaut du point 10', async () => {
    const el = await poserBibliotheque();
    const hauteur = history.length;

    vignette(el)!.click();
    flushSync();
    await attendre();
    flushSync();

    expect(fiche(el), 'la fiche d’album ne s’est pas ouverte').not.toBeNull();
    expect(
      history.length,
      'ouvrir un album n’empile AUCUNE entrée : le Précédent dépile l’Accueil, ' +
        'la seule entrée qui existait sous #library',
    ).toBe(hauteur + 1);
    expect(history.state, 'l’entrée ne porte pas l’album ouvert').toMatchObject({
      tune: 'v2', vue: 'library', detail: CLE,
    });
    expect(location.hash, 'l’adresse ne bouge pas en ouvrant la fiche').toBe(`#library/${CLE}`);
  });

  it('🔴 le Précédent du navigateur ramène à la BIBLIOTHÈQUE, pas à l’Accueil', async () => {
    const el = await poserBibliotheque();
    vignette(el)!.click();
    flushSync();
    await attendre();
    flushSync();
    expect(fiche(el), 'la fiche ne s’est pas ouverte').not.toBeNull();

    // Le vrai geste : la traversée de session du navigateur.
    history.back();
    await attendre();
    flushSync();
    await attendre();
    flushSync();

    expect(fiche(el), 'le Précédent laisse la fiche d’album ouverte').toBeNull();
    expect(vignette(el), 'la grille d’albums n’est pas revenue').not.toBeNull();
    expect(
      get(activeView),
      'le Précédent quitte la Bibliothèque et retombe sur l’Accueil — c’est le signalement',
    ).toBe('library');
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'library', detail: null });
  });

  it('un SECOND Précédent rend l’Accueil : la pile suit le chemin parcouru', async () => {
    const el = await poserBibliotheque();
    vignette(el)!.click();
    flushSync();
    await attendre();
    flushSync();

    history.back();
    await attendre();
    flushSync();
    history.back();
    await attendre();
    flushSync();

    expect(
      get(activeView),
      'deux retours ne ramènent pas à l’Accueil : la pile a un cran de trop, ou de moins',
    ).toBe('home');
    void el;
  });
});

describe('#1121 — les deux écueils du correctif', () => {
  // 🔴 CE TÉMOIN EST VERT AVANT COMME APRÈS LE CORRECTIF, et c'est voulu : le
  // Retour interne marche aujourd'hui, la consigne est de ne pas le casser.
  //
  // ⚠️ `history.length` NE MESURE RIEN ICI : ni jsdom ni Chrome ne le
  // décrémentent sur un `back()` — l'entrée reste atteignable par « suivant ».
  // On mesure donc la POSITION du curseur : l'entrée courante après le Retour,
  // puis ce qu'un Précédent de plus donne. Un Retour qui n'aurait pas dépilé
  // laisserait le curseur sur la fiche, et ce Précédent rendrait la
  // Bibliothèque au lieu de l'Accueil.
  it('le bouton Retour INTERNE de la fiche referme et DÉPILE — il reste intact', async () => {
    const el = await poserBibliotheque();

    vignette(el)!.click();
    flushSync();
    await attendre();
    flushSync();
    const retour = el.querySelector<HTMLButtonElement>('.v2-detail button.close');
    expect(retour, 'le bouton Retour de la fiche a disparu').not.toBeNull();

    retour!.click();
    flushSync();
    await attendre();
    flushSync();
    await attendre();
    flushSync();

    expect(fiche(el), 'le Retour interne ne referme plus la fiche').toBeNull();
    expect(vignette(el), 'le Retour interne ne rend pas la grille').not.toBeNull();
    expect(
      get(activeView),
      'le Retour interne quitte la Bibliothèque',
    ).toBe('library');
    expect(
      history.state,
      'le Retour interne n’a pas dépilé : le curseur est resté sur la fiche',
    ).toMatchObject({ tune: 'v2', vue: 'library', detail: null });

    history.back();
    await attendre();
    flushSync();
    expect(
      get(activeView),
      'le Retour interne referme sans dépiler : la pile a un cran de trop et le ' +
        'Précédent suivant ne fait « rien » une fois de trop',
    ).toBe('home');
  });

  it('AUCUNE boucle : la fiche ouverte n’empile qu’une entrée, même après plusieurs rendus', async () => {
    const el = await poserBibliotheque();
    const hauteur = history.length;

    vignette(el)!.click();
    flushSync();
    await attendre();
    flushSync();
    const apresOuverture = history.length;
    expect(apresOuverture).toBe(hauteur + 1);

    // On force une dizaine de passes réactives supplémentaires : un `pushState`
    // posé dans un effet qui se redéclenche remplirait la pile et rendrait le
    // Précédent inutilisable. C'est le mode de panne classique de ce correctif.
    for (let i = 0; i < 10; i++) {
      flushSync();
      await respirer();
    }
    await attendre(120);
    flushSync();

    expect(
      history.length,
      'la fiche empile une entrée à chaque rendu : le Précédent est noyé',
    ).toBe(apresOuverture);
  });

  it('refermer par la barre latérale ne laisse pas d’entrée fantôme', async () => {
    // « Bibliothèque » cliqué alors qu'une fiche est ouverte referme le calque
    // (#3843) : c'est une fermeture À LA MAIN, elle RÉÉCRIT l'entrée courante
    // au lieu d'en empiler ou d'en dépiler une.
    const el = await poserBibliotheque();
    vignette(el)!.click();
    flushSync();
    await attendre();
    flushSync();
    const hauteur = history.length;

    listResetNonce.update((n) => n + 1);
    flushSync();
    await attendre();
    flushSync();

    expect(fiche(el), 'la barre latérale ne referme plus la fiche — #3843').toBeNull();
    expect(history.length, 'refermer à la main a bougé la hauteur de pile').toBe(hauteur);
    expect(
      history.state,
      'l’entrée courante porte encore un album que l’écran n’affiche plus',
    ).toMatchObject({ tune: 'v2', vue: 'library', detail: null });
  });
});
