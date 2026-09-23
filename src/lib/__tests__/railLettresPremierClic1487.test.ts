// @vitest-environment jsdom
//
// #1487 — LE RAIL DES LETTRES RATE SA CIBLE AU PREMIER CLIC.
//
// FabienM, fil « v0.9.162 : divers bugs », 23/09/2026, Windows, point 2 :
//
// > « Menu bibliothèque : signet des lettres fonctionne mal la première fois.
// >   J'ouvre le menu Bibliothèque, je clique sur la lettre N et j'accède aux
// >   albums commençant par P. En revanche, si je clique une 2ᵉ fois sur N, ça
// >   me renvoie bien aux albums commençant par N. »
//
// ## Ce que jsdom ne sait PAS faire, et ce qu'on met à la place
//
// 🔴 jsdom ne met rien en page : aucune hauteur, aucune position, pas de
// conteneur défilant, et `scrollIntoView` y est une fonction vide. Le défaut ne
// s'y reproduit donc PAS tout seul — il faut le dire franchement.
//
// Ce témoin installe à la place un MODÈLE DE MISE EN PAGE qui reproduit la
// seule chose dont le défaut dépend : `content-visibility:auto` avec
// `contain-intrinsic-size:auto 210px`, la règle `.card` de `LibraryV2`. Trois
// faits, tous lisibles dans la feuille de style ou la spécification :
//
//  1. une vignette JAMAIS RENDUE compte pour son estimation (210 px) ;
//  2. une vignette déjà rendue une fois garde sa taille RÉELLE (mot-clé
//     `auto`) — ici 193 px, la hauteur d'une carte sur une colonne étroite ;
//  3. le navigateur rend ce qui approche du cadre, au-dessus comme en dessous.
//
// Et le modèle fait ce que fait un défilement ANIMÉ : il calcule sa cible au
// départ, traverse — donc fait rendre — tout ce qui sépare, puis s'arrête au
// chiffre calculé au départ. Les rangées traversées ayant rétréci de 210 à
// 193 entre-temps, ce chiffre ne désigne plus la même rangée.
//
// Le premier témoin VALIDE le modèle : conduit avec l'ancien saut, il rend les
// DEUX moitiés du signalement — faux au premier clic, juste au second. C'est ce
// qui autorise à se fier au second témoin, qui monte l'écran pour de vrai.
//
// 🔴 Ce que ce fichier ne prouve pas : la lettre exacte atteinte (elle dépend
// de la hauteur réelle d'une vignette sur l'écran de Fabien et de la
// répartition de ses 6 338 albums), ni l'allure du déplacement. Cela se mesure
// dans un navigateur, et aucun n'est disponible sur le poste.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { albums, libraryLoading, libraryFolderScope } from '../stores/library';
import { activeView } from '../stores/navigation';
import { sauterVersAncre, TOLERANCE_SAUT } from '../sautAlphabetique';

/** L'estimation que porte la règle `.card` tant qu'une vignette n'a rien rendu. */
const ESTIMEE = 210;
/** Sa hauteur réelle sur une colonne étroite : pochette 148 + les trois lignes. */
const REELLE = 193;
/** La hauteur du cadre de la grille. */
const CADRE = 800;
/** Le navigateur rend aussi ce qui approche du cadre, d'un côté comme de l'autre. */
const MARGE = 800;

const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PAR_LETTRE = 10;

/** Une bibliothèque rangée par titre, dix albums par lettre. */
const ALBUMS = LETTRES.flatMap((L, iL) =>
  Array.from({ length: PAR_LETTRE }, (_, i) => ({
    id: iL * PAR_LETTRE + i + 1,
    title: `${L}${String(i).padStart(2, '0')}`,
    artist_name: `Artiste ${L}${i}`,
    year: 2000,
    cover_path: null,
    source: 'local',
  })),
);

/** La lettre attendue d'une vignette, à l'indice `i` de la liste affichée. */
const lettreDe = (i: number) => LETTRES[Math.floor(i / PAR_LETTRE)];

/**
 * Le modèle de mise en page posé sur une grille réelle.
 *
 * Il tient l'état que le navigateur tiendrait : quelles vignettes ont déjà été
 * rendues (et gardent donc leur taille réelle), et où en est le défilement.
 */
function poserMiseEnPage(grille: HTMLElement, cartes: HTMLElement[]) {
  const rendu = cartes.map(() => false);
  let defilement = 0;

  const hauteur = (i: number) => (rendu[i] ? REELLE : ESTIMEE);
  const sommet = (i: number) => {
    let y = 0;
    for (let k = 0; k < i; k++) y += hauteur(k);
    return y;
  };
  const total = () => cartes.reduce((y, _, i) => y + hauteur(i), 0);
  const plafond = () => Math.max(0, total() - CADRE);

  /** Tout ce qui touche la bande « cadre + marge » est rendu, et rétrécit. */
  const rendreEntre = (haut: number, bas: number) => {
    let y = 0;
    for (let i = 0; i < cartes.length; i++) {
      const h = hauteur(i);
      if (y + h > haut - MARGE && y < bas + MARGE) rendu[i] = true;
      y += hauteur(i);
      if (y > bas + MARGE) break;
    }
  };

  /** L'indice de la vignette qui occupe le haut du cadre. */
  const enHaut = () => {
    let y = 0;
    for (let i = 0; i < cartes.length; i++) {
      y += hauteur(i);
      if (y > defilement + TOLERANCE_SAUT) return i;
    }
    return cartes.length - 1;
  };

  const rect = (top: number, height: number) =>
    ({ top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top,
      toJSON: () => ({}) }) as DOMRect;

  Object.defineProperty(grille, 'getBoundingClientRect', { value: () => rect(0, CADRE), configurable: true });
  Object.defineProperty(grille, 'clientHeight', { value: CADRE, configurable: true });
  Object.defineProperty(grille, 'scrollHeight', { get: total, configurable: true });
  Object.defineProperty(grille, 'scrollTop', {
    get: () => defilement,
    set: (v: number) => {
      defilement = Math.max(0, Math.min(plafond(), v));
      rendreEntre(defilement, defilement + CADRE);
    },
    configurable: true,
  });
  // La grille ne déborde pas en largeur : le navigateur ramène toute valeur à
  // zéro, et une ancre hors première colonne ne déplace donc rien.
  Object.defineProperty(grille, 'scrollLeft', { get: () => 0, set: () => {}, configurable: true });

  /**
   * `scrollIntoView` tel qu'un navigateur le fait, ANIMÉ : la cible est
   * calculée AVANT le trajet, le trajet fait rendre tout ce qu'il traverse, et
   * l'on s'arrête au chiffre du départ. jsdom, lui, n'en fournit qu'une
   * fonction vide — sans ce modèle, l'ancien saut « ne bougerait pas », ce qui
   * ne dirait rien du défaut.
   */
  const defilerVers = (i: number) => {
    const vise = sommet(i);
    rendreEntre(Math.min(defilement, vise), Math.max(defilement, vise) + CADRE);
    defilement = Math.max(0, Math.min(plafond(), vise));
    rendreEntre(defilement, defilement + CADRE);
  };

  cartes.forEach((c, i) => {
    Object.defineProperty(c, 'getBoundingClientRect', {
      value: () => rect(sommet(i) - defilement, hauteur(i)),
      configurable: true,
    });
    Object.defineProperty(c, 'scrollIntoView', { value: () => defilerVers(i), configurable: true });
  });

  // Écran frais : seul le haut a été rendu.
  rendreEntre(0, CADRE);

  return {
    lettreEnHaut: () => lettreDe(enHaut()),
    defilement: () => defilement,
    sommetDe: (i: number) => sommet(i),
    /** L'ANCIEN saut, celui de `origin/main` : un `scrollIntoView` animé, rien d'autre. */
    ancienSaut: (L: string) => {
      const i = cartes.findIndex((c) => c.dataset.letter === L);
      if (i < 0) throw new Error(`aucune ancre pour « ${L} »`);
      defilerVers(i);
    },
  };
}

function reponse() {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => [], text: async () => '[]',
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
/** Les trames en attente : le correctif repasse à la trame suivante. */
let trames: FrameRequestCallback[] = [];

/** Déroule les trames, comme le navigateur entre deux rendus. */
function derouler(max = 20) {
  for (let n = 0; n < max && trames.length; n++) {
    const file = trames;
    trames = [];
    for (const f of file) f(0);
  }
}

const attendre = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function ecranMonte(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  flushSync();
  return hote;
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  trames = [];
  vi.stubGlobal('fetch', vi.fn(async () => reponse()));
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { trames.push(f); return trames.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
  activeView.set('library');
  libraryFolderScope.set(null as any);
  libraryLoading.set(false);
  albums.set(ALBUMS as any);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  albums.set([] as any);
  vi.unstubAllGlobals();
});

/** La grille montée, ses vignettes, et le modèle posé dessus. */
function grilleEtModele(el: HTMLElement) {
  const grille = el.querySelector<HTMLElement>('.grid');
  expect(grille, 'la grille des albums n’est pas rendue').not.toBeNull();
  const cartes = Array.from(grille!.querySelectorAll<HTMLElement>('.card[data-letter]'));
  expect(cartes.length, 'les vignettes ne portent pas d’ancre de lettre').toBe(ALBUMS.length);
  return { grille: grille!, cartes, modele: poserMiseEnPage(grille!, cartes) };
}

function boutonRail(el: HTMLElement, L: string): HTMLButtonElement {
  const b = Array.from(el.querySelectorAll<HTMLButtonElement>('.rail button.rl'))
    .find((x) => x.textContent?.trim() === L);
  expect(b, `la lettre « ${L} » n’est pas au rail`).toBeTruthy();
  expect(b!.disabled, `la lettre « ${L} » est inerte alors que des albums en portent l’initiale`).toBe(false);
  return b!;
}

describe('#1487 — le modèle de mise en page rend bien le signalement', () => {
  it('🔴 CONTRE-ÉPREUVE : avec l’ANCIEN saut, le premier clic sur « N » dépasse, le second tombe juste', async () => {
    const el = await ecranMonte();
    const { modele } = grilleEtModele(el);

    modele.ancienSaut('N');
    const premier = modele.lettreEnHaut();
    expect(
      premier,
      'le modèle ne reproduit pas le défaut : le premier clic tombe déjà juste',
    ).not.toBe('N');
    // On DÉPASSE — on ne reste pas court. C'est le sens du signalement : « N »
    // ouvre une lettre PLUS LOIN dans l'alphabet.
    expect(LETTRES.indexOf(premier)).toBeGreaterThan(LETTRES.indexOf('N'));

    // Second clic : tout ce qui précède a déjà été rendu, plus rien ne rétrécit.
    modele.ancienSaut('N');
    expect(
      modele.lettreEnHaut(),
      'le modèle ne reproduit pas la seconde moitié du signalement',
    ).toBe('N');
  });
});

describe('#1487 — l’écran monté : le PREMIER clic sur une lettre atteint cette lettre', () => {
  it('🔴 un clic sur « N », sur une grille jamais encore mesurée, montre les albums en N', async () => {
    const el = await ecranMonte();
    const { cartes, modele } = grilleEtModele(el);

    boutonRail(el, 'N').click();
    flushSync();
    derouler();

    expect(
      modele.lettreEnHaut(),
      'le rail rate sa cible au premier clic — #1487',
    ).toBe('N');
    const premiereN = cartes.findIndex((c) => c.dataset.letter === 'N');
    expect(Math.abs(modele.defilement() - modele.sommetDe(premiereN))).toBeLessThanOrEqual(TOLERANCE_SAUT);
  });

  it('🔴 et le SECOND clic ne bouge plus : la cible est déjà tenue', async () => {
    const el = await ecranMonte();
    const { modele } = grilleEtModele(el);

    boutonRail(el, 'N').click();
    flushSync();
    derouler();
    const apresPremier = modele.defilement();

    boutonRail(el, 'N').click();
    flushSync();
    derouler();
    expect(modele.defilement()).toBe(apresPremier);
    expect(modele.lettreEnHaut()).toBe('N');
  });

  it('🔴 la même chose sur une lettre TARDIVE, et sur la dernière — « Z » se rejoint aussi', async () => {
    const el = await ecranMonte();
    const { modele } = grilleEtModele(el);

    // Une lettre tardive : l'erreur de l'ancien saut croît avec la distance —
    // sur « E », deuxième dizième de liste, elle ne suffit pas encore à changer
    // de lettre. C'est « S » qui la rend visible.
    boutonRail(el, 'S').click();
    flushSync();
    derouler();
    expect(modele.lettreEnHaut(), 'le saut vers « S » rate sa cible').toBe('S');

    // « Z » est en fin de liste : le conteneur bute avant d'aligner l'ancre.
    // Le saut doit s'arrêter là sans boucler, et montrer la fin.
    boutonRail(el, 'Z').click();
    flushSync();
    derouler();
    expect(modele.lettreEnHaut(), 'le saut vers « Z » ne descend pas jusqu’à la fin').toBe('Z');
  });
});

describe('#1487 — le saut lui-même, hors de tout écran', () => {
  it('🔴 il RELIT la position après chaque déplacement, au lieu de s’en tenir au premier calcul', () => {
    // Un conteneur nu, dont l'ancre se dérobe : chaque déplacement la fait
    // remonter de 40 px, deux fois de suite. Un saut qui ne relirait pas la
    // géométrie s'arrêterait 80 px trop bas.
    const conteneur = document.createElement('div');
    const ancre = document.createElement('div');
    ancre.setAttribute('data-letter', 'N');
    conteneur.appendChild(ancre);
    document.body.appendChild(conteneur);

    let defilement = 0;
    let sommet = 1000;
    let derobades = 2;
    Object.defineProperty(conteneur, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0 }) as DOMRect, configurable: true,
    });
    Object.defineProperty(conteneur, 'scrollTop', {
      get: () => defilement,
      set: (v: number) => {
        defilement = v;
        if (derobades-- > 0) sommet -= 40; // la mise en page se resserre
      },
      configurable: true,
    });
    Object.defineProperty(conteneur, 'scrollLeft', { get: () => 0, set: () => {}, configurable: true });
    Object.defineProperty(ancre, 'getBoundingClientRect', {
      value: () => ({ top: sommet - defilement, left: 0 }) as DOMRect, configurable: true,
    });

    const file: (() => void)[] = [];
    sauterVersAncre(conteneur, '[data-letter="N"]', (f) => file.push(f));
    while (file.length) file.shift()!();

    expect(defilement, 'le saut s’en est tenu à sa première mesure').toBe(sommet);
    conteneur.remove();
  });

  it('🔴 il ne fait rien quand la lettre n’a aucune ancre, et rien sans conteneur', () => {
    const conteneur = document.createElement('div');
    document.body.appendChild(conteneur);
    let ecrit = 0;
    Object.defineProperty(conteneur, 'scrollTop', {
      get: () => 0, set: () => { ecrit++; }, configurable: true,
    });
    expect(() => sauterVersAncre(conteneur, '[data-letter="Q"]', (f) => f())).not.toThrow();
    expect(ecrit).toBe(0);
    expect(() => sauterVersAncre(null, '[data-letter="Q"]', (f) => f())).not.toThrow();
    conteneur.remove();
  });
});
