// @vitest-environment jsdom
//
// #1142 — LE PRÉCÉDENT DU NAVIGATEUR DEPUIS UN ARTISTE DES RÉSULTATS.
//
// FabienM, fil 1774, point 1 (v0.9.147) : « le bouton "BACK" du navigateur
// retourne à la page d'accueil et non à la page de résultats » ; fil 1778 (.148) :
// « le bouton "BACK" du navigateur retourne à l'avant dernière page consulté ».
//
// ## Ce que la mesure a donné, et pourquoi ce fichier existe
//
// `historiqueRechercheResultats1142.test.ts` — écrit d'abord — joue le parcours
// LITTÉRAL du signalement (résultats → ALBUM → Précédent) sur la tête de `main`
// et il est VERT : #980 (la fiche album de la Recherche empile), #1133 (les
// quatre portes de la Bibliothèque) et #1158 (la route survit au rechargement)
// ont réglé ce chemin-là. **Le rouge attendu n'est pas venu, et c'est un
// résultat.**
//
// Le chemin VOISIN, lui, est rouge — celui de la vignette d'ARTISTE, la rangée
// juste au-dessus des albums dans les mêmes résultats :
//
//     clic sur l'artiste : push #search → push #library   ← la GRILLE, JAMAIS VUE
//     la fiche s'ouvre   : push #library/artiste:42
//     Précédent          : #library                       ← la Bibliothèque, pas les résultats
//
// UN geste, DEUX crans. La grille de la Bibliothèque n'a jamais été à l'écran
// et occupe pourtant une entrée : le premier Précédent y ramène, et il en faut
// un SECOND pour retrouver les résultats. C'est le symptôme du fil 1778 vu de
// l'autre côté — pas une entrée qui manque, une entrée de trop.
//
// ## Ce que ce témoin refuse de faire
//
// Il ne lit pas le source. Il monte la VRAIE Recherche, CLIQUE la vignette
// d'artiste, remonte l'écran d'arrivée comme `ShellV2` le fait
// (`{#if $activeView === 'library'}`), et appuie sur le Précédent du navigateur.
// Il n'appelle jamais `pushState` lui-même.
//
// ⚠️ On lit la POSITION du curseur (`history.state`), jamais `history.length` :
// ni jsdom ni Chrome ne décrémentent la hauteur sur un `back()`.
//
// ⚠️ Aucun délai calibré : attentes BORNÉES sur condition.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import {
  activeView, pendingLibraryAlbum, pendingLibraryArtist, pendingLibraryYear, vueDeRetour,
} from '../stores/navigation';
import { albums as albumsStore, artists as artistsStore } from '../stores/library';
import { setSearchCriteria } from '../stores/shortcuts';
import { preferences } from '../stores/preferences';
import { brancherHistoriqueCoquille, detailOuvert } from '../historiqueCoquille';
import { cleDetailArtiste } from '../cleDetailArtiste';

/** Deux écrans de plus de mille lignes chacun se compilent ici. */
vi.setConfig({ testTimeout: 60_000 });

const REQUETE = 'Pink Floyd';
const vide = { artists: [], albums: [], tracks: [], playlists: [], labels: [] };
const ARTISTE = { id: 42, name: 'Pink Floyd', image_path: null };
const ALBUM = { id: 60, title: 'Wish You Were Here', artist_name: 'Pink Floyd', artist_id: 42, year: 1975 };
const LOCAL = { ...vide, artists: [ARTISTE], albums: [ALBUM] };

/** La clé de l'entrée composée — la MÊME des deux côtés, par construction. */
const CLE = cleDetailArtiste(ARTISTE.id)!;

class ResizeObserverInerte {
  observe() {} unobserve() {} disconnect() {}
}

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);

const respirer = () => new Promise((r) => setTimeout(r, 0));

/** Attendre une CONDITION, bornée — jamais une constante calibrée à la main. */
async function jusqua(condition: () => boolean, borne = 8000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await respirer();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let debrancher: (() => void) | null = null;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
  }
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/library\/search/.test(u)) return reponse(LOCAL);
    if (/\/search\?/.test(u)) return reponse({ local: LOCAL, services: {}, radios: [] });
    if (/\/library\/artists\/42\/albums/.test(u)) return reponse([ALBUM]);
    if (/\/library\/artists/.test(u)) return reponse([ARTISTE]);
    if (/\/library\/albums/.test(u)) return reponse([ALBUM]);
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  activeView.set('home');
  detailOuvert.set(null);
  vueDeRetour.set(null);
  pendingLibraryArtist.set(null);
  pendingLibraryAlbum.set(null);
  pendingLibraryYear.set(null);
  setSearchCriteria(null);
  history.replaceState(null, '', '/');
});

afterEach(() => {
  if (debrancher) debrancher();
  debrancher = null;
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  activeView.set('home');
  detailOuvert.set(null);
  vueDeRetour.set(null);
  setSearchCriteria(null);
  albumsStore.set([]);
  artistsStore.set([]);
  vi.unstubAllGlobals();
});

/** Accueil → Recherche → résultats, coquille branchée : le décor du signalement. */
async function poserResultats(): Promise<HTMLDivElement> {
  activeView.set('home');
  debrancher = brancherHistoriqueCoquille();
  setSearchCriteria({ q: REQUETE });
  activeView.set('search');
  flushSync();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SearchV2, { target: hote, props: {} as any });
  await jusqua(() => !!hote!.querySelector('.basartistes .artile button.meta'));
  return hote;
}

/** La vignette d'artiste des résultats — le geste du signalement. */
const vignetteArtiste = (el: HTMLElement) =>
  el.querySelector<HTMLButtonElement>('.basartistes .artile button.meta');

/**
 * Ce que fait `ShellV2` quand la vue change : il DÉMONTE l'écran quitté et
 * MONTE celui d'arrivée (`{#if $activeView === 'library'}`). C'est ce remontage
 * qui vide et regarnit `detailOuvert`, et c'est là que l'entrée composée se
 * faisait écraser.
 */
async function monterLaBibliotheque(el: HTMLDivElement): Promise<void> {
  unmount(monte!);
  monte = null;
  albumsStore.set([ALBUM] as any);
  artistsStore.set([ARTISTE] as any);
  monte = mount(LibraryV2, { target: el, props: {} as any });
  await jusqua(() => get(detailOuvert) === CLE);
}

describe('#1142 — le décor', () => {
  it('les résultats portent bien une vignette d’artiste, et l’Accueil est dessous', async () => {
    const el = await poserResultats();
    expect(vignetteArtiste(el), 'aucune vignette d’artiste : le témoin ne mesure rien').not.toBeNull();
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'search', detail: null });
  });
});

describe('#1142 — un geste, UNE entrée d’historique', () => {
  it('🔴 le clic sur un artiste écrit l’entrée de la FICHE, pas celle de la grille', async () => {
    const el = await poserResultats();

    vignetteArtiste(el)!.click();
    await jusqua(() => get(activeView) === 'library');

    expect(get(activeView), 'le clic ne mène plus à la Bibliothèque').toBe('library');
    expect(get(pendingLibraryArtist), 'la cible n’est plus posée').toBe(ARTISTE.id);
    expect(
      history.state,
      'l’entrée empilée est celle de la GRILLE, un écran que ce parcours ne montre jamais',
    ).toMatchObject({ tune: 'v2', vue: 'library', detail: CLE });
    expect(location.hash, 'l’adresse ne dit pas la fiche ouverte').toBe(`#library/${CLE}`);
  });

  it('🔴 l’écran d’arrivée n’empile PAS une seconde entrée en reposant la même clé', async () => {
    const el = await poserResultats();
    vignetteArtiste(el)!.click();
    await jusqua(() => get(activeView) === 'library');
    const curseur = history.state;

    await monterLaBibliotheque(el);

    expect(get(detailOuvert), 'la Bibliothèque n’a pas ouvert la fiche demandée').toBe(CLE);
    expect(
      history.state,
      'le remontage a réécrit l’entrée composée, puis en a empilé une seconde',
    ).toEqual(curseur);
  });

  it('🔴 LE SIGNALEMENT : le Précédent rend la PAGE DE RÉSULTATS, pas la Bibliothèque', async () => {
    const el = await poserResultats();
    vignetteArtiste(el)!.click();
    await jusqua(() => get(activeView) === 'library');
    await monterLaBibliotheque(el);

    history.back();
    await jusqua(() => get(activeView) === 'search');

    expect(
      get(activeView),
      'le Précédent ramène sur la Bibliothèque — un écran que l’utilisateur n’a jamais vu — ' +
        'au lieu de la page de résultats',
    ).toBe('search');
    expect(history.state, 'l’entrée atteinte n’est pas celle des résultats')
      .toMatchObject({ tune: 'v2', vue: 'search', detail: null });
  });

  it('un SECOND Précédent rend l’Accueil : la pile suit le chemin RÉELLEMENT parcouru', async () => {
    const el = await poserResultats();
    vignetteArtiste(el)!.click();
    await jusqua(() => get(activeView) === 'library');
    await monterLaBibliotheque(el);

    history.back();
    await jusqua(() => get(activeView) === 'search');
    history.back();
    await jusqua(() => get(activeView) === 'home');

    expect(
      get(activeView),
      'deux retours ne ramènent pas à l’Accueil : la pile a un cran de trop, ou de moins',
    ).toBe('home');
  });

  it('AUCUNE boucle : l’entrée composée ne se réécrit pas toute seule', async () => {
    const el = await poserResultats();
    vignetteArtiste(el)!.click();
    await jusqua(() => get(activeView) === 'library');
    await monterLaBibliotheque(el);
    const hauteur = history.length;
    const curseur = history.state;

    // Le mode de panne de ce correctif : une écriture posée dans un effet qui
    // se redéclenche. On force des dizaines de passes réactives, et le filet de
    // l'intention (une seconde) a largement le temps de retomber.
    for (let i = 0; i < 60; i++) {
      flushSync();
      await respirer();
    }
    await jusqua(() => false, 1200);

    expect(history.length, 'la pile grandit toute seule : le Précédent est noyé').toBe(hauteur);
    expect(history.state, 'l’entrée courante bouge toute seule').toEqual(curseur);
    expect(get(detailOuvert), 'la clé ouverte bouge toute seule').toBe(CLE);
  });
});

describe('#1142 — ce que le correctif ne doit PAS emporter', () => {
  it('l’intention ne survit pas au geste : un changement de vue ordinaire reste une racine', async () => {
    const el = await poserResultats();
    vignetteArtiste(el)!.click();
    await jusqua(() => get(activeView) === 'library');

    // Une autre vue, tout de suite après : son entrée ne doit porter AUCUN
    // détail — sans quoi l'adresse dirait « #radios/artiste:42 ».
    activeView.set('radios');
    await jusqua(() => get(activeView) === 'radios');

    expect(history.state, 'la clé visée a débordé sur l’entrée suivante')
      .toMatchObject({ tune: 'v2', vue: 'radios', detail: null });
    void el;
  });

  it('la PASTILLE DE PROVENANCE mène au même endroit que la vignette — #1129/#1135', async () => {
    // Depuis #1135 la vignette fusionnée porte une pastille par provenance, et
    // « chaque pastille MÈNE à la fiche de sa source ». Deux chemins vers la
    // même fiche : ils doivent écrire la même entrée, sinon l'un des deux
    // retrouve le défaut que l'autre vient de perdre.
    const el = await poserResultats();
    const badge = el.querySelector<HTMLButtonElement>('.asrc .asrcb');
    expect(badge, 'la pastille de provenance a disparu de la vignette').not.toBeNull();

    badge!.click();
    await jusqua(() => get(activeView) === 'library');

    expect(history.state, 'la pastille de provenance empile encore l’entrée de la grille')
      .toMatchObject({ tune: 'v2', vue: 'library', detail: CLE });
  });
});
