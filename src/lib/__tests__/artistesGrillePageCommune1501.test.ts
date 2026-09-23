// @vitest-environment jsdom
//
// renesenses/tune-web-client#1501 — BIBLIOTHÈQUE › ARTISTES : LA GRILLE RESTE,
// LE CLIC OUVRE LA PAGE COMMUNE, LA FICHE PROPRE EST RETIRÉE.
//
// Bertrand, 23/09/2026, suite à #1494 : « l'onglet Artistes de la Bibliothèque
// garde sa grille, le clic ouvre la page artiste commune, et sa fiche propre
// est retirée ».
//
// ## Ce qui est retiré, et ce qui ne l'est pas
//
// `ArtistesV2` portait un CALQUE (`#library/artiste:<id>`) avec cinq blocs que
// la page commune porte déjà depuis #1485, conditionnés à `estLocal` —
// `ficheElueBlocsLocaux1232.test.ts` les garde. Ce fichier-ci ne les remesure
// pas : il garde le CHEMIN. La grille, ses vignettes et leurs cinq actions
// restent (`pochetteActions.test.ts`, `porteeRepertoireV2_3101.test.ts`).
//
// ## Ce que ces témoins font
//
// 🔴 ILS MONTENT LA VRAIE GRILLE ET CLIQUENT. Une carte, puis la pochette, et
// ils lisent la vue atteinte, la cible posée (`service: null`, l'identifiant de
// bibliothèque en texte — la forme de #1485), le retour promis
// (`vueDeRetour = 'library'`) et l'entrée d'historique écrite. Puis ils montent
// la page d'arrivée comme `ShellV2` le fait et appuient sur son Retour.
//
// Contre-épreuve : `ArtistesV2.svelte` remis à sa base (le calque encore là)
// fait rougir les témoins du clic — la vue reste `library`, aucune cible n'est
// posée, et l'entrée d'historique porte `artiste:7`.
//
// ⚠️ Aucun délai calibré : attentes BORNÉES sur condition. Aucune vue
// navigateur n'était possible sur le poste (Chrome géré par la DSI).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ArtistesV2 from '../../components/v2/ArtistesV2.svelte';
import ArtisteServiceV2 from '../../components/v2/ArtisteServiceV2.svelte';
import { activeView, pendingLibraryArtist, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService, streamingServices } from '../stores/streaming';
import { libraryTab } from '../stores/library';
import { captureCurrentView, clearShortcutTarget, navigateToShortcut, type Shortcut } from '../stores/shortcuts';
import { cibleRaccourciArtiste } from '../raccourciArtiste';
import { brancherHistoriqueCoquille, detailOuvert } from '../historiqueCoquille';

vi.setConfig({ testTimeout: 30_000 });

const ARTISTES = [
  { id: 7, name: 'Leprous', image_path: null, bio: null, musicbrainz_id: null },
  { id: 8, name: 'Magma', image_path: null, bio: null, musicbrainz_id: null },
];
const ALBUM = { id: 60, title: 'Aphelion', artist_name: 'Leprous', artist_id: 7, year: 2021, cover_path: null };

const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

function corpsPour(url: string): unknown {
  // Du plus précis au plus large : `/library/artists/7/albums` contient
  // `/library/artists/7`, qui contient `/library/artists`.
  if (/\/library\/artists\/7\/albums/.test(url)) return [ALBUM];
  if (/\/library\/artists\/7\/bio/.test(url)) return { bio: null };
  if (/\/library\/artists\/7\/(metadata|credits|tracks)/.test(url)) return /metadata/.test(url) ? {} : [];
  if (/\/library\/artists\/7(\?|$)/.test(url)) return ARTISTES[0];
  if (/\/library\/artists(\?|$)/.test(url)) return ARTISTES;
  if (/\/streaming\/services/.test(url)) return {};
  return COLLECTIONS.test(url) ? [] : {};
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

/**
 * jsdom ne met pas en page : `scrollHeight` et `clientHeight` y valent zéro, et
 * `restoreDetailScroll` — qui refuse de reposer une position que le contenu ne
 * peut pas tenir — épuiserait ses trente trames avant de la poser quand même.
 * Sur `Element.prototype` : la grille est DÉTRUITE au changement de vue et
 * reconstruite au retour, un nœud instrumenté ne serait plus là.
 */
function donnerUneMiseEnPage(): () => void {
  const avant = {
    scrollHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight'),
    clientHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight'),
  };
  Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get: () => 12000 });
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  return () => {
    if (avant.scrollHeight) Object.defineProperty(Element.prototype, 'scrollHeight', avant.scrollHeight);
    if (avant.clientHeight) Object.defineProperty(Element.prototype, 'clientHeight', avant.clientHeight);
  };
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let debrancher: (() => void) | null = null;
let rendreLaMiseEnPage: (() => void) | null = null;
let urls: string[] = [];

function toutRemettre() {
  activeView.set('home');
  detailOuvert.set(null);
  vueDeRetour.set(null);
  pendingLibraryArtist.set(null);
  ficheArtisteService.set(null);
  streamingServices.set({} as any);
  libraryTab.set('albums');
  clearShortcutTarget();
}

beforeEach(() => {
  urls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    urls.push(u);
    return reponse(corpsPour(u));
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
  toutRemettre();
  history.replaceState(null, '', '/');
});

afterEach(() => {
  if (debrancher) debrancher();
  debrancher = null;
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  if (rendreLaMiseEnPage) rendreLaMiseEnPage();
  rendreLaMiseEnPage = null;
  toutRemettre();
  vi.unstubAllGlobals();
});

const cartes = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.grille.artistes .carte')];
const carteDe = (el: HTMLElement, nom: string) =>
  cartes(el).find((c) => c.querySelector('.ct')?.textContent?.trim() === nom) ?? null;

/** Accueil → Bibliothèque › Artistes, coquille branchée : le décor du signalement. */
async function poserLaGrille(): Promise<HTMLDivElement> {
  activeView.set('home');
  debrancher = brancherHistoriqueCoquille();
  libraryTab.set('artists');
  activeView.set('library');
  flushSync();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ArtistesV2, { target: hote, props: { q: '' } });
  await jusqua(() => cartes(hote!).length >= ARTISTES.length);
  return hote;
}

/**
 * Ce que fait `ShellV2` quand la vue change : il DÉMONTE l'écran quitté et
 * MONTE celui d'arrivée (`{#if $activeView === 'streamingartist'}`).
 */
async function monterLaPageCommune(el: HTMLDivElement): Promise<void> {
  if (monte) unmount(monte);
  monte = mount(ArtisteServiceV2, { target: el, props: {} as any });
  await jusqua(() => urls.some((u) => /\/library\/artists\/7(\?|$)/.test(u)));
  await jusqua(() => (el.textContent ?? '').includes(ALBUM.title));
}

describe('#1501 — le décor', () => {
  it('la grille d’artistes s’affiche — sans quoi le reste ne mesure rien', async () => {
    const el = await poserLaGrille();
    expect(carteDe(el, 'Leprous'), 'aucune carte pour Leprous').not.toBeNull();
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'library', detail: null });
  });
});

describe('#1501 — le clic sur une carte ouvre la PAGE COMMUNE', () => {
  it('🔴 le nom mène à `streamingartist`, sur l’artiste LOCAL, avec le retour vers la grille', async () => {
    const el = await poserLaGrille();
    carteDe(el, 'Leprous')!.querySelector<HTMLButtonElement>('button.meta')!.click();
    await jusqua(() => get(activeView) !== 'library');

    expect(get(activeView), 'le clic ouvre encore une fiche DANS la Bibliothèque').toBe('streamingartist');
    // La forme posée par #1485 : `service: null`, l'identifiant de bibliothèque en texte.
    expect(get(ficheArtisteService)).toEqual({ service: null, id: '7', nom: 'Leprous' });
    // Le Retour de la page ramène à la grille (#3824), pas à un écran quitté plus tôt.
    expect(get(vueDeRetour)).toBe('library');
    expect(get(pendingLibraryArtist), 'la cible de l’ANCIENNE fiche est encore posée').toBeNull();
    // UNE entrée d'historique pour UN geste : celle de la page, sans détail —
    // plus de clé composée `#library/artiste:7`.
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'streamingartist', detail: null });
    expect(location.hash).toBe('#streamingartist');
  });

  it('la POCHETTE mène au même endroit', async () => {
    const el = await poserLaGrille();
    const pochette = carteDe(el, 'Magma')!.querySelector<HTMLButtonElement>('button.ouvrir');
    expect(pochette, 'la pochette n’ouvre plus rien').not.toBeNull();
    pochette!.click();
    await jusqua(() => get(activeView) !== 'library');
    expect(get(activeView)).toBe('streamingartist');
    expect(get(ficheArtisteService)).toEqual({ service: null, id: '8', nom: 'Magma' });
    expect(get(vueDeRetour)).toBe('library');
  });

  it('🔴 la page d’arrivée montre l’artiste par les routes de la BIBLIOTHÈQUE, et n’empile rien', async () => {
    const el = await poserLaGrille();
    carteDe(el, 'Leprous')!.querySelector<HTMLButtonElement>('button.meta')!.click();
    await jusqua(() => get(activeView) === 'streamingartist');
    const curseur = history.state;

    await monterLaPageCommune(el);

    expect(el.textContent).toContain('Leprous');
    expect(el.textContent, 'la discographie locale n’est pas rendue').toContain(ALBUM.title);
    // Jamais une route de service fabriquée sur `null` (#1232, étape 1).
    expect(urls.filter((u) => u.includes('/streaming/') && u.includes('/artists/7'))).toEqual([]);
    expect(history.state, 'la page d’arrivée a empilé une seconde entrée').toEqual(curseur);
  });

  it('🔴 le Retour de la page rend la GRILLE de la Bibliothèque', async () => {
    const el = await poserLaGrille();
    carteDe(el, 'Leprous')!.querySelector<HTMLButtonElement>('button.meta')!.click();
    await jusqua(() => get(activeView) === 'streamingartist');
    await monterLaPageCommune(el);

    const retour = el.querySelector<HTMLButtonElement>('header.tete button.retour');
    expect(retour, 'la page commune n’a pas de bouton Retour').not.toBeNull();
    retour!.click();
    await jusqua(() => get(activeView) !== 'streamingartist');

    expect(get(activeView), 'le Retour ne ramène pas à la Bibliothèque').toBe('library');
    expect(get(vueDeRetour), 'le dépôt de retour n’est pas consommé').toBeNull();
    expect(get(ficheArtisteService)).toBeNull();
    // L'onglet retenu est toujours celui des artistes : la grille revient telle quelle.
    expect(get(libraryTab)).toBe('artists');
  });

  it('🔴 le Précédent du navigateur rend la grille aussi', async () => {
    const el = await poserLaGrille();
    carteDe(el, 'Leprous')!.querySelector<HTMLButtonElement>('button.meta')!.click();
    await jusqua(() => get(activeView) === 'streamingartist');
    await monterLaPageCommune(el);

    history.back();
    await jusqua(() => get(activeView) === 'library');

    expect(get(activeView), 'le Précédent ne ramène pas à la Bibliothèque').toBe('library');
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'library', detail: null });
  });

  it('#864 — la grille REMONTÉE repose où l’on était', async () => {
    rendreLaMiseEnPage = donnerUneMiseEnPage();
    const POSITION = 4000;
    const el = await poserLaGrille();
    const grille = () => el.querySelector<HTMLElement>('.grille.artistes');
    grille()!.scrollTop = POSITION;
    expect(grille()!.scrollTop).toBe(POSITION);

    carteDe(el, 'Leprous')!.querySelector<HTMLButtonElement>('button.meta')!.click();
    await jusqua(() => get(activeView) === 'streamingartist');
    // `ShellV2` démonte la Bibliothèque, puis la remonte au Retour.
    unmount(monte!);
    monte = null;
    expect(grille(), 'la grille est encore là : la vue n’a pas changé').toBeNull();
    activeView.set('library');
    monte = mount(ArtistesV2, { target: el, props: { q: '' } });
    await jusqua(() => cartes(el).length >= ARTISTES.length);
    await jusqua(() => (grille()?.scrollTop ?? 0) === POSITION, 2000);

    expect(grille()!.scrollTop, 'le retour repose EN HAUT de la liste des artistes — c’est le défaut #864').toBe(POSITION);
  });
});

// ── LES RACCOURCIS — point 3 de #1501 ──────────────────────────────────────
//
// Mesuré avant d'écrire : AUCUN raccourci ne visait la fiche retirée. Pour la
// Bibliothèque, `captureCurrentView` ne fige que l'onglet et la portée ; la
// fiche d'`ArtistesV2` n'a jamais publié de cible. Un raccourci sur l'onglet
// Artistes rouvre donc la grille, comme avant. Ce qui manquait, c'est l'autre
// sens : un raccourci posé SUR la page commune ne retenait que sa vue, et la
// rouvrait vide.
describe('#1501 — les raccourcis rouvrent la grille, ou la page commune', () => {
  const raccourci = (view: Shortcut['view'], state: Record<string, any>): Shortcut =>
    ({ id: 'rc', name: 'r', icon: '⭐', view, state });

  it('un raccourci sur l’onglet Artistes rouvre la GRILLE', () => {
    activeView.set('home');
    navigateToShortcut(raccourci('library', { tab: 'artists' }));
    expect(get(activeView)).toBe('library');
    expect(get(libraryTab)).toBe('artists');
    // Rien ne vise une fiche : ni l'ancienne, ni la page commune.
    expect(get(pendingLibraryArtist)).toBeNull();
    expect(get(ficheArtisteService)).toBeNull();
  });

  it('🔴 la page commune PUBLIE l’artiste affiché comme cible de raccourci', async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    ficheArtisteService.set({ service: null, id: '7', nom: 'Leprous' });
    activeView.set('streamingartist');
    monte = mount(ArtisteServiceV2, { target: hote, props: {} as any });
    await jusqua(() => (hote!.textContent ?? '').includes(ALBUM.title));

    const fige = captureCurrentView();
    expect(fige.view).toBe('streamingartist');
    expect(fige.state?.target, 'le raccourci ne retient que la vue : il rouvrirait une page vide').toEqual({
      key: 'artiste:local:7',
      restore: { id: 7, name: 'Leprous', source: 'local' },
    });
  });

  it('🔴 rouvrir ce raccourci mène à la page commune, sur le MÊME artiste local', () => {
    activeView.set('library');
    navigateToShortcut(raccourci('streamingartist', {
      target: cibleRaccourciArtiste({ service: null, id: '7', nom: 'Leprous' }),
    }));
    expect(get(activeView)).toBe('streamingartist');
    expect(get(ficheArtisteService)).toEqual({ service: null, id: '7', nom: 'Leprous' });
    // Le Retour ramène d'où l'on a cliqué le raccourci.
    expect(get(vueDeRetour)).toBe('library');
    expect(get(pendingLibraryArtist)).toBeNull();
  });

  it('… et sur un artiste de SERVICE, la même page, chez son service', () => {
    activeView.set('home');
    navigateToShortcut(raccourci('streamingartist', {
      target: cibleRaccourciArtiste({ service: 'qobuz', id: 'q-7', nom: 'Leprous' }),
    }));
    expect(get(activeView)).toBe('streamingartist');
    expect(get(ficheArtisteService)).toEqual({ service: 'qobuz', id: 'q-7', nom: 'Leprous' });
    expect(get(vueDeRetour)).toBe('home');
  });

  it('un raccourci ANCIEN sur la page, sans cible, pose encore la vue — sans lever', () => {
    activeView.set('home');
    navigateToShortcut(raccourci('streamingartist', {}));
    expect(get(activeView)).toBe('streamingartist');
  });

  it('les clés sont STABLES et ne confondent pas la bibliothèque et un service', () => {
    expect(cibleRaccourciArtiste({ service: null, id: '42' })!.key).toBe('artiste:local:42');
    expect(cibleRaccourciArtiste({ service: 'qobuz', id: '42' })!.key).toBe('artiste:qobuz:42');
    // Un identifiant local qui n'est pas un nombre n'est pas une route.
    expect(cibleRaccourciArtiste({ service: null, id: 'q-42' })).toBeNull();
    expect(cibleRaccourciArtiste({ service: 'qobuz', id: '  ' })).toBeNull();
  });
});

// ── LA RÈGLE : la fiche ne revient pas ─────────────────────────────────────
//
// 🔴 Ces témoins lisent du SOURCE, et sont les seuls à le faire ici. Ils
// existent parce que le défaut de #1494 n'était pas une ligne fausse mais une
// ligne RECOPIÉE : une seconde page d'artiste, que le premier correctif aurait
// fait diverger de la première.
describe('#1501 — la Bibliothèque n’a plus de fiche d’artiste', () => {
  const lire = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf-8');
  const sansCommentaires = (s: string) =>
    s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('`ArtistesV2` passe par le chemin de référence, et ne tient plus de calque', () => {
    const src = sansCommentaires(lire('src/components/v2/ArtistesV2.svelte'));
    expect(src, 'le clic ne passe plus par `ouvrirArtisteDepuis`').toMatch(/ouvrirArtisteDepuis\(\{ id: a\.id, name: a\.name, source: 'local' \}, 'library'\)/);
    for (const trace of ['ouvrirDetail(', 'cleDetailArtiste', 'detailOuvert', '<EnTeteArtiste', '<DiscographieCommune', '<AlbumDetailV2', 'ouvrirId', 'onComptesFiche']) {
      expect(src, `la fiche est de retour dans ArtistesV2 : « ${trace} »`).not.toContain(trace);
    }
  });

  it('la clé composée `#library/artiste:<id>` a quitté le client', () => {
    expect(existsSync(join(process.cwd(), 'src/lib/cleDetailArtiste.ts')), '`cleDetailArtiste` existe encore').toBe(false);
    const bib = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));
    expect(bib, 'la Bibliothèque lit encore la cible de l’ancienne fiche').not.toContain('pendingLibraryArtist');
    expect(bib, 'la Bibliothèque transmet encore un artiste à ouvrir').not.toContain('ouvrirId');
  });
});
