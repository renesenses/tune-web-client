// @vitest-environment jsdom
//
// #899 — eric, forum 1668, 04/09/2026 :
//
//   « la question est dans le titre, je n'ai pas vu de possibilité de tri des
//     albums par date d'ajout dans la nouvelle interface... ça manque
//     cruellement :) »
//
// ## L'option existait déjà, et la donnée aussi
//
// `LibraryV2` porte `case 'added'` depuis longtemps, et le serveur sert bien
// `added_at`. Mesure du 12/09/2026 sur le .18 (v0.9.146) : **4 255 albums sur
// 4 255** en portent un — `GET /library/albums?limit=5000`. Le serveur sait
// même trier dessus (`sort=added_at`), mais l'écran trie en mémoire et n'en a
// pas besoin. Il n'y avait donc RIEN à construire.
//
// ## Ce qui l'effaçait : une décision prise sur une liste vide
//
// `hasAddedAt` interroge `src`, et `src` est VIDE le temps que la bibliothèque
// arrive. L'effet qui retire un tri « devenu indisponible » se déclenchait donc
// AVANT les données :
//
//   1. l'écran s'ouvre, `src` est vide, « Ajout récent » quitte le menu ;
//   2. l'effet rabat `sortKey` sur `'title'` ;
//   3. l'effet voisin ÉCRIT ce `'title'` dans le stockage — le choix de
//      l'utilisateur est perdu, définitivement ;
//   4. les albums arrivent, l'entrée revient au menu, mais l'écran est sur
//      « Titre » et le restera à chaque visite.
//
// C'est la plainte de Lulu (forum, 05/09/2026, « figer le choix de
// l'organisation de la bibliothèque ») que `preferencesEcran` devait régler, et
// que cet effet défaisait en silence.
//
// 🔴 CES TÉMOINS MONTENT `LibraryV2` et lisent le DOM RENDU plus le stockage.
// Le troisième est la CONTRE-ÉPREUVE de la garde : sur une bibliothèque
// réellement chargée où rien ne porte `added_at`, le tri doit TOUJOURS se
// retirer — sinon la garde aurait simplement désarmé la règle.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

/** La clé réelle de `preferencesEcran` — préfixe compris. */
const CLE_TRI = 'tune_v2_ecran_lib.sort';

// L'alphabet dit « Alpha, Beta » ; la date d'ajout dit « Beta, Alpha ». Les
// deux ordres diffèrent : sans cela, un écran resté sur « Titre » rendrait la
// même liste et le témoin ne pourrait pas rougir.
const AVEC_DATE: Album[] = [
  { id: 1, title: 'Alpha', artist_name: 'X', year: 1975, added_at: 1000 },
  { id: 2, title: 'Beta', artist_name: 'X', year: 1975, added_at: 2000 },
] as Album[];

/** Une bibliothèque réellement chargée, mais qu'aucun scan n'a datée. */
const SANS_DATE: Album[] = [
  { id: 1, title: 'Alpha', artist_name: 'X', year: 1975 },
  { id: 2, title: 'Beta', artist_name: 'X', year: 1975 },
] as Album[];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

/** Monte l'écran sur une bibliothèque VIDE — l'état réel d'une ouverture. */
async function poserVide(): Promise<HTMLDivElement> {
  activeView.set('library');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as never });
  for (let i = 0; i < 12; i++) await respirer();
  flushSync();
  return hote;
}

/** Les albums arrivent, comme le ferait la réponse du serveur. */
async function livrer(albums: Album[]) {
  albumsStore.set([...albums]);
  for (let i = 0; i < 14; i++) await respirer();
  flushSync();
}

const libelleTri = (el: HTMLElement) =>
  (el.querySelector('.drop.right .chip')?.textContent ?? '').replace(/\s+/g, ' ').trim();
const menuTri = (el: HTMLElement) =>
  [...el.querySelectorAll('.drop.right .menu button')].map((b) => (b.textContent ?? '').trim());
const ordreRendu = (el: HTMLElement) =>
  [...el.querySelectorAll('.grid .card .ct, .rows .lrow .ltt')]
    .map((n) => (n.textContent ?? '').trim())
    .filter((t) => t === 'Alpha' || t === 'Beta');

beforeEach(() => {
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}),
    text: async () => '{}',
  } as unknown as Response)));
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as never);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  albumsStore.set([]);
  libraryFolderScope.set(null);
  activeView.set('home');
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('#899 — « Ajout récent » : l’option existe, elle ne doit plus s’effacer', () => {
  it('le choix retenu SURVIT à une ouverture sur bibliothèque vide', async () => {
    // L'utilisateur avait choisi « Ajout récent » à sa visite précédente.
    localStorage.setItem(CLE_TRI, 'added');

    const el = await poserVide();
    // 🔴 Le moment décisif : l'écran est monté, la bibliothèque n'est pas
    // encore arrivée. Le choix ne doit pas avoir été réécrit.
    expect(localStorage.getItem(CLE_TRI),
      'le choix a été écrasé AVANT même que les albums arrivent').toBe('added');

    await livrer(AVEC_DATE);
    expect(localStorage.getItem(CLE_TRI)).toBe('added');

    // Et l'écran est RÉELLEMENT sur ce tri, pas seulement le stockage.
    expect(libelleTri(el), 'l’écran est retombé sur « Titre »').toBe('Ajout récent');
    expect(menuTri(el)).toContain('Ajout récent');
    // L'ordre rendu est celui des dates d'ajout, pas l'alphabet.
    expect(ordreRendu(el), 'la grille est restée en ordre alphabétique')
      .toEqual(['Beta', 'Alpha']);
  });

  it('l’entrée est proposée dès que la bibliothèque porte des dates d’ajout', async () => {
    const el = await poserVide();
    await livrer(AVEC_DATE);
    expect(menuTri(el), 'le menu de tri n’offre pas « Ajout récent »')
      .toEqual(['Titre', 'Artiste', 'Année', 'Ajout récent']);
  });

  it('CONTRE-ÉPREUVE : une bibliothèque CHARGÉE sans date d’ajout retire bien le tri', async () => {
    // La garde ne doit pas avoir désarmé la règle : un tri qui ne trierait
    // rien reste retiré, et le choix retombe sur « Titre ».
    localStorage.setItem(CLE_TRI, 'added');
    const el = await poserVide();
    await livrer(SANS_DATE);

    expect(menuTri(el), '« Ajout récent » est proposé sur une bibliothèque sans aucune date')
      .toEqual(['Titre', 'Artiste', 'Année']);
    expect(libelleTri(el), 'l’écran est resté sur un tri absent du menu').toBe('Titre');
    expect(localStorage.getItem(CLE_TRI)).toBe('title');
  });
});
