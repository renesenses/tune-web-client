// @vitest-environment jsdom
//
// #1372 — « Serveurs multimédia › serveur Tune distant › Ajouts récents ».
// Jean Valjean, fil 1856, réponse 6573, 20/09/2026 13 h 34, 0.9.158, Windows.
//
// ## LE DÉFAUT
//
// `LibraryV2` monte `<AjoutsRecentsV2 …/>` SANS lui passer `depot`, et ce
// composant appelle `/home/recently-added` — une route LOCALE, sans paramètre
// d'hôte. Sous l'en-tête « Tune Server — 192.168.1.10:8888 », l'onglet montre
// donc la bibliothèque de la machine qui sert la page, et l'écrit noir sur
// blanc : « Pistes et albums ajoutés à la bibliothèque LOCALE ».
//
// Le reste du fichier sait pourtant tenir compte du dépôt — `albumsD`,
// `facetteCourante`, les vignettes, `AlbumDetailV2 {depot}`. L'onglet `recent`
// est le seul point du corps qui l'ignore. Un commentaire du fichier le savait
// déjà (« `AjoutsRecentsV2` interroge `/home/recently-added`, qui ne connaît
// pas la provenance ») et n'en avait tiré qu'un masquage de filtres (#1367).
//
// ## POURQUOI MASQUER L'ONGLET, ET NON LUI PASSER `depot`
//
// Il n'y a RIEN à lui passer : le protocole du dépôt distant (`tuneRemote.ts`)
// n'expose que `/library/albums`, `/library/albums/{id}/tracks` et
// `/library/tracks`. Aucune route « ajouts récents » n'existe chez l'hôte
// distant, et les inventer ici serait un contrat qu'aucun serveur ne tient.
// Un onglet qui ne peut pas répondre pour le serveur qu'on regarde ne doit pas
// être offert : c'est la même règle que le bouton « ajouter des dossiers »,
// déjà retiré sur un dépôt (`{#if !depot}`) parce qu'il agirait ailleurs.
//
// ## CE QUE CE TÉMOIN REFUSE DE FAIRE
//
// Il ne lit pas le source : une garde de texte serait satisfaite par une
// condition posée n'importe où — et par la DÉFINITION de la condition
// elle-même. Il MONTE le vrai écran avec un dépôt, et mesure deux choses que
// seule l'exécution donne : les onglets réellement rendus, et les URL
// réellement demandées.
//
// 🔴 La seconde assertion est la décisive. Masquer le bouton sans corriger
// l'onglet RETENU (`lib.tab` est persisté entre deux visites) laisserait le
// corps monter `AjoutsRecentsV2` quand même : on reviendrait d'une visite
// locale sur « Ajouts récents », on ouvrirait un serveur distant, et la route
// locale repartirait — le défaut du ticket, avec un onglet invisible en prime.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { locale } from '../i18n';
import type { DepotDistant } from '../tuneRemote';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 60_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

/** Le serveur de Jean Valjean, tel que `depotDistant()` le construit. */
const DEPOT: DepotDistant = {
  base: 'http://192.168.1.10:8888/api/v1',
  nom: 'Tune Server',
  hote: '192.168.1.10:8888',
};

/** Le catalogue DISTANT — celui qu'on doit voir sous cet en-tête. */
const ALBUMS_DISTANTS = Array.from({ length: 12 }, (_, i) => ({
  id: 700 + i,
  title: `Distant ${String(i + 1).padStart(2, '0')}`,
  artist_name: `Artiste distant ${(i % 3) + 1}`,
  cover_path: null,
  year: 2001 + i,
}));

/** Le catalogue LOCAL — celui qui ne doit PAS apparaître sous cet en-tête. */
const ALBUMS_LOCAUX: Album[] = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  title: `Local ${String(i + 1).padStart(2, '0')}`,
  artist_name: 'Artiste local',
  year: 1980 + i,
})) as unknown as Album[];

/** Ce que rendrait `/home/recently-added` — la route locale du défaut. */
const RECENTS_LOCAUX = Array.from({ length: 30 }, (_, i) => ({
  id: 500 + i, title: `Récent local ${i + 1}`, artist_name: 'Artiste local', cover_path: null,
}));
const RESUME = { days: 15, album_count: 30, track_count: 312, duration_ms: 90_420_000, duration_seconds: 90_420 };

/** Toutes les URL demandées pendant la vie de l'écran. */
let urls: string[] = [];

function corpsPour(url: string): unknown {
  if (url.includes('/home/recently-added/summary')) return RESUME;
  if (url.includes('/home/recently-added')) return RECENTS_LOCAUX;
  // Le dépôt distant : son catalogue, par lots.
  if (url.startsWith(DEPOT.base) && url.includes('/library/albums')) return ALBUMS_DISTANTS;
  if (/\/library\/artists(\?|$)/.test(url)) return [];
  if (/\/library\/tracks(\?|$)/.test(url)) return [];
  if (url.includes('/stats')) return { track_count: 0, album_count: ALBUMS_LOCAUX.length };
  return [];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

/** Monte la Bibliothèque SUR UN DÉPÔT, comme `MediaServersV2` le fait. */
async function poserEcranDistant(): Promise<HTMLElement> {
  activeView.set('library');
  albumsStore.set([...ALBUMS_LOCAUX]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: { depot: DEPOT } as never });
  for (let i = 0; i < 16; i++) await respirer();
  flushSync();
  return hote;
}

const onglets = (el: HTMLElement) =>
  [...el.querySelectorAll('nav.tabs button.tab')].map((b) => (b.textContent ?? '').trim());

beforeEach(() => {
  urls = [];
  locale.set('fr');
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    urls.push(url);
    const corps = corpsPour(url);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  albumsStore.set([]);
  activeView.set('home');
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('#1372 — « Ajouts récents » n’a pas de sens sur un serveur Tune distant', () => {
  it('🔴 l’onglet n’est pas OFFERT sous l’en-tête d’un dépôt distant', async () => {
    const el = await poserEcranDistant();

    // Contre-épreuve du montage : on est bien sur l'écran du dépôt, pas sur la
    // bibliothèque locale. Sans elle, un écran qui n'aurait rien rendu du tout
    // ferait passer l'assertion suivante pour un succès.
    expect(el.querySelector('.v2-titres h1')?.textContent?.trim()).toBe(DEPOT.nom);
    expect(el.querySelector('.v2-titres .dist')?.textContent?.trim()).toBe(DEPOT.hote);
    expect(onglets(el).length, 'aucun onglet rendu : le montage a échoué').toBeGreaterThan(1);

    expect(
      onglets(el),
      'l’onglet « Ajouts récents » est offert sur un dépôt distant, alors qu’il ne sait ' +
      'interroger que la bibliothèque locale — c’est #1372',
    ).not.toContain('Ajouts récents');
  });

  it('🔴 et la route LOCALE n’est jamais appelée, même si l’onglet retenu était « Ajouts récents »', async () => {
    // L'écran persiste l'onglet (`lib.tab`) d'une visite à l'autre : on revient
    // de la bibliothèque locale où l'on regardait les ajouts récents.
    localStorage.setItem('tune_v2_ecran_lib.tab', 'recent');

    const el = await poserEcranDistant();

    expect(
      urls.filter((u) => u.includes('/home/recently-added')),
      'la bibliothèque LOCALE a été interrogée sous l’en-tête d’un serveur distant',
    ).toEqual([]);

    expect(
      el.querySelector('.body .recents'),
      'la vue des ajouts récents locaux est montée sous l’en-tête d’un serveur distant',
    ).toBeNull();

    // Et l'écran retombe sur une vue qui, elle, SAIT parler au dépôt : son
    // catalogue distant est demandé, et rendu.
    expect(
      urls.some((u) => u.startsWith(DEPOT.base) && u.includes('/library/albums')),
      'le catalogue du serveur distant n’a jamais été demandé',
    ).toBe(true);
  });
});
