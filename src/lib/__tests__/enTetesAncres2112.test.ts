// @vitest-environment jsdom
//
// #2112 — « les en-têtes ne restent pas figés au défilement ».
//
// CE QUE CETTE GARDE TIENT, ET RIEN DE PLUS
// -----------------------------------------
// jsdom n'a pas de mise en page : `position: sticky` ne s'y observe pas, et
// les feuilles de style de composant ne sont même pas injectées (mesuré :
// `document.querySelectorAll('style').length === 0` après montage). Une garde
// qui prétendrait « l'en-tête reste visible » mentirait donc.
//
// Ce qui SE mesure, en montant les vraies vues, c'est la structure dont
// dépend l'ancrage — celle que le dépôt a déjà choisie deux fois, pour
// Diagnostics (#463) et Paramètres (#1282) :
//
//   « L'en-tête est un FRÈRE du conteneur de défilement, hors de sa portée —
//     plutôt qu'un `position: sticky` imbriqué dans un scroller flex-colonne,
//     que Firefox n'honore pas. »
//
// Un en-tête qui n'est PAS dans l'élément qui défile ne peut pas défiler.
// C'est vrai sans mesurer un pixel et dans tous les moteurs — et c'est
// exactement ce que le test d'Edge du 15/08 exigeait : Jean Valjean voyait le
// même défaut sous Firefox ET sous Edge (Chromium) sur Serveurs multimédia,
// Playlists et Radio Live, donc l'explication « Firefox n'honore pas ce
// sticky » ne pouvait pas porter ces écrans-là.
//
// Contre-épreuve exigée : ce fichier est ROUGE sur `main` avant le correctif
// (les trois vues n'ont ni `.ms-body`, ni `.playlists-body`, ni
// `.radios-barre` ; l'en-tête est dans le scroller).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import MediaServersView from '../../components/MediaServersView.svelte';
import PlaylistsView from '../../components/PlaylistsView.svelte';
import RadiosView from '../../components/RadiosView.svelte';
import { restoreDetailScroll, saveDetailScroll } from '../stores/navigation';

// Les vues appellent l'API au montage ; jsdom n'a pas de serveur. L'échec est
// déjà absorbé par les `catch` des vues, on coupe juste le bruit.
vi.spyOn(console, 'error').mockImplementation(() => {});

let monte: Record<string, unknown> | null = null;
let hote: HTMLDivElement | null = null;

function poser(composant: unknown): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant as never, { target: hote, props: {} as never });
  return hote;
}

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
});

/** L'invariant, écrit une fois : l'en-tête est un frère du scroller. */
function enTeteHorsDuScroller(racine: HTMLElement, selEnTete: string, selScroller: string) {
  const entete = racine.querySelector(selEnTete);
  const scroller = racine.querySelector(selScroller);
  expect(entete, `en-tête ${selEnTete} absent`).not.toBeNull();
  expect(scroller, `conteneur de défilement ${selScroller} absent`).not.toBeNull();
  // 1. l'en-tête n'est pas DANS ce qui défile — il ne peut donc pas défiler ;
  expect(scroller!.contains(entete!)).toBe(false);
  // 2. et ce n'est pas parce qu'ils seraient dans deux mondes séparés : ils
  //    partagent bien le même parent, dans cet ordre.
  expect(entete!.parentElement).toBe(scroller!.parentElement);
  expect(entete!.compareDocumentPosition(scroller!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

describe('Serveurs multimédia : l’en-tête ne peut plus partir au défilement', () => {
  it('l’en-tête et la recherche sont hors de `.ms-body`, qui porte la liste', () => {
    const el = poser(MediaServersView);
    enTeteHorsDuScroller(el, '.ms-header', '.ms-body');
    // Le contenu, lui, est bien DANS le conteneur qui défile — sans quoi
    // l'invariant serait tenu par une coquille vide.
    const corps = el.querySelector('.ms-body')!;
    expect(corps.children.length).toBeGreaterThan(0);
  });
});

describe('Playlists : l’en-tête ne peut plus partir au défilement', () => {
  it('l’en-tête est hors de `.playlists-body`, qui porte la liste', () => {
    const el = poser(PlaylistsView);
    enTeteHorsDuScroller(el, '.playlists-header', '.playlists-body');
    expect(el.querySelector('.playlists-body')!.children.length).toBeGreaterThan(0);
  });
});

describe('Radio Live : un seul ancrage, plus aucun décalage en dur', () => {
  it('les trois lignes du haut vivent dans la MÊME barre ancrée', () => {
    const el = poser(RadiosView);
    const barre = el.querySelector('.radios-barre');
    expect(barre, '`.radios-barre` absente').not.toBeNull();
    for (const sel of ['.radios-header', '.stations-actions', '.filters']) {
      const ligne = el.querySelector(sel);
      expect(ligne, `${sel} absente`).not.toBeNull();
      // C'est le cœur du correctif : la barre « Ajouter / Importer /
      // Exporter » que Jean Valjean ne voyait plus est ANCRÉE AVEC l'en-tête,
      // et non calée dessous par un `top: 66px` mesuré à l'œil.
      expect(barre!.contains(ligne!)).toBe(true);
    }
  });

  it('ce qui défile reste EN DEHORS de la barre ancrée', () => {
    const el = poser(RadiosView);
    const barre = el.querySelector('.radios-barre');
    expect(barre, '`.radios-barre` absente').not.toBeNull();
    // Sinon « tout est ancré » et plus rien ne défile : l'ancrage n'aurait
    // aucun sens. Sans station chargée la vue rend `.empty-state` ; c'est lui
    // qui occupe la place de la liste, et il doit être hors de la barre.
    const corps = el.querySelector('.radios-grid, .empty-state');
    expect(corps, 'ni liste ni état vide rendus').not.toBeNull();
    expect(barre!.contains(corps!)).toBe(false);
  });
});

describe('la position de la liste survit au déplacement du conteneur', () => {
  // Le conteneur de défilement n'est plus la racine de la vue : il NAÎT avec
  // la branche « liste ». `goBack()` restaure la position dans la foulée,
  // avant que Svelte n'ait repeint — l'élément vaut donc `null` à cet instant.
  // L'ancienne signature rendait la main sans rien faire ni le dire.
  it('une cible passée en FONCTION est résolue au moment où elle existe', async () => {
    const trames: Array<() => void> = [];
    const rafOrigine = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      trames.push(() => cb(0));
      return trames.length;
    }) as typeof globalThis.requestAnimationFrame;
    try {
      const scroller = document.createElement('div');
      Object.defineProperty(scroller, 'scrollHeight', { value: 4000, configurable: true });
      Object.defineProperty(scroller, 'clientHeight', { value: 500, configurable: true });
      Object.defineProperty(scroller, 'scrollTop', { value: 600, writable: true, configurable: true });
      saveDetailScroll('essai-2112', () => scroller);
      scroller.scrollTop = 0;

      // Au moment de l'appel, la branche « liste » n'est pas encore rendue.
      let rendu: HTMLElement | null = null;
      restoreDetailScroll('essai-2112', () => rendu);
      expect(scroller.scrollTop).toBe(0);

      // Elle apparaît deux trames plus tard.
      trames.shift()!();
      rendu = scroller;
      trames.shift()!();
      expect(scroller.scrollTop).toBe(600);
    } finally {
      globalThis.requestAnimationFrame = rafOrigine;
    }
  });

  it('un élément déjà présent est servi tout de suite, comme avant', () => {
    const scroller = document.createElement('div');
    Object.defineProperty(scroller, 'scrollHeight', { value: 4000, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 500, configurable: true });
    Object.defineProperty(scroller, 'scrollTop', { value: 300, writable: true, configurable: true });
    saveDetailScroll('essai-2112-b', scroller);
    scroller.scrollTop = 0;
    restoreDetailScroll('essai-2112-b', scroller);
    expect(scroller.scrollTop).toBe(300);
  });
});
