// @vitest-environment jsdom
//
// « Un texte coupé se lit en entier », à l'échelle d'une grande liste —
// chantier `tune-web-client#914`.
//
// `use:bulleTexte` est désormais posé sur toutes les vues qui tronquent, dont
// la bibliothèque (des milliers de vignettes, deux textes chacune). Ces
// témoins verrouillent ce que cela coûte, en APPELANT l'action sur de vrais
// éléments du document :
//
//   1. UN observateur de taille et UN observateur de texte pour tout le
//      document, quel que soit le nombre de lignes ;
//   2. aucun écouteur posé sur une ligne ;
//   3. aucune mesure au montage ;
//   4. au rappel de l'observateur, toutes les lectures AVANT toutes les
//      écritures — une seule mise en page par lot ;
//   5. la bulle suit le redimensionnement, dans les deux sens.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bulleTexte, reinitialiserLeGeste } from '../infobulleTexte';

const N = 500;

/** Un `ResizeObserver` de témoin : il compte, et on déclenche son rappel à la main. */
let observateursCrees = 0;
let observes = 0;
let rappel: ResizeObserverCallback | null = null;
const suivis = new Set<Element>();
class ResizeObserverTemoin {
  constructor(cb: ResizeObserverCallback) {
    observateursCrees++;
    rappel = cb;
  }
  observe(el: Element) {
    observes++;
    suivis.add(el);
  }
  unobserve(el: Element) {
    suivis.delete(el);
  }
  disconnect() {
    suivis.clear();
  }
}

/** Le navigateur redimensionne : le rappel reçoit tous les éléments suivis. */
function redimensionner() {
  const entrees = [...suivis].map((target) => ({ target }) as ResizeObserverEntry);
  rappel?.(entrees, {} as ResizeObserver);
}

let mutationsCrees = 0;
const MutationObserverNatif = globalThis.MutationObserver;
class MutationObserverCompte extends MutationObserverNatif {
  constructor(cb: MutationCallback) {
    super(cb);
    mutationsCrees++;
  }
}

/** Le journal des accès à la mise en page : lectures et écritures, dans l'ordre. */
let journal: string[] = [];

function boites(el: HTMLElement, largeur: { client: number; scroll: number }) {
  Object.defineProperty(el, 'clientWidth', {
    configurable: true,
    get: () => {
      journal.push('lire');
      return largeur.client;
    },
  });
  Object.defineProperty(el, 'scrollWidth', {
    configurable: true,
    get: () => {
      journal.push('lire');
      return largeur.scroll;
    },
  });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: 20 });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 20 });
}

let racine: HTMLDivElement;
let actions: { destroy(): void }[] = [];

/** Une liste de N lignes : un bouton par ligne, titre ET artiste coupés. */
function liste(largeur: { client: number; scroll: number }) {
  const lignes: { bouton: HTMLButtonElement; titre: HTMLSpanElement; artiste: HTMLSpanElement }[] = [];
  for (let k = 0; k < N; k++) {
    const bouton = document.createElement('button');
    const titre = document.createElement('span');
    const artiste = document.createElement('span');
    titre.textContent = `Titre très long numéro ${k}`;
    artiste.textContent = `Artiste très long numéro ${k}`;
    bouton.append(titre, artiste);
    racine.appendChild(bouton);
    boites(titre, largeur);
    boites(artiste, largeur);
    lignes.push({ bouton, titre, artiste });
  }
  return lignes;
}

function armerTout(lignes: ReturnType<typeof liste>) {
  for (const l of lignes) actions.push(bulleTexte(l.titre), bulleTexte(l.artiste));
}

beforeEach(() => {
  reinitialiserLeGeste();
  observateursCrees = 0;
  observes = 0;
  mutationsCrees = 0;
  rappel = null;
  suivis.clear();
  journal = [];
  vi.stubGlobal('ResizeObserver', ResizeObserverTemoin);
  vi.stubGlobal('MutationObserver', MutationObserverCompte);
  racine = document.createElement('div');
  document.body.appendChild(racine);
});

afterEach(() => {
  for (const a of actions) a.destroy();
  actions = [];
  racine.remove();
  document.querySelectorAll('.bulle-texte-coupe').forEach((b) => b.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('#914 — une grande liste ne multiplie pas les observateurs', () => {
  it(`🔴 ${2 * N} textes coupés : UN observateur de taille, UN observateur de texte`, () => {
    armerTout(liste({ client: 100, scroll: 400 }));

    expect(observateursCrees, 'un ResizeObserver par texte').toBe(1);
    expect(observes).toBe(2 * N);
    expect(mutationsCrees, 'un MutationObserver par texte').toBe(1);
  });

  it('🔴 aucun écouteur n’est posé sur une ligne', () => {
    const lignes = liste({ client: 100, scroll: 400 });
    const surLesLignes = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    armerTout(lignes);

    expect(surLesLignes, 'des écouteurs posés ligne par ligne').not.toHaveBeenCalled();
  });

  it('🔴 le montage ne lit pas la mise en page', () => {
    const lignes = liste({ client: 100, scroll: 400 });
    armerTout(lignes);

    expect(journal.filter((j) => j === 'lire').length, 'mesure au montage').toBe(0);
    // La bulle est posée d'office : le survol marche avant même la mesure.
    expect(lignes[0].titre.getAttribute('title')).toBe('Titre très long numéro 0');
  });

  it('🔴 au rappel, toutes les lectures précèdent toutes les écritures', () => {
    const largeur = { client: 300, scroll: 300 };
    const lignes = liste(largeur);
    armerTout(lignes);
    journal = [];
    // Chaque écriture d'attribut sur un texte inscrit est consignée.
    for (const l of lignes) {
      for (const el of [l.titre, l.artiste]) {
        el.setAttribute = (n: string, v: string) => {
          journal.push('ecrire');
          Element.prototype.setAttribute.call(el, n, v);
        };
        el.removeAttribute = (n: string) => {
          journal.push('ecrire');
          Element.prototype.removeAttribute.call(el, n);
        };
      }
    }

    redimensionner();

    const premiereEcriture = journal.indexOf('ecrire');
    const derniereLecture = journal.lastIndexOf('lire');
    expect(premiereEcriture, 'aucune écriture : le texte qui tient a gardé sa bulle').toBeGreaterThan(-1);
    expect(derniereLecture, 'une lecture après une écriture : mise en page forcée').toBeLessThan(
      premiereEcriture,
    );
  });
});

describe('#914 — la bulle suit le redimensionnement', () => {
  it('🔴 un texte qui tient perd sa bulle, et la retrouve quand le panneau rétrécit', () => {
    const largeur = { client: 300, scroll: 300 };
    const lignes = liste(largeur);
    armerTout(lignes);

    redimensionner();
    expect(lignes[7].titre.hasAttribute('title'), 'bulle sur un texte qui tient').toBe(false);

    largeur.client = 80;
    redimensionner();
    expect(lignes[7].titre.getAttribute('title')).toBe('Titre très long numéro 7');

    largeur.client = 300;
    redimensionner();
    expect(lignes[7].titre.hasAttribute('title')).toBe(false);
  });

  it('un texte qui change sous l’élément est remesuré par le même observateur', async () => {
    const largeur = { client: 80, scroll: 400 };
    const lignes = liste(largeur);
    armerTout(lignes);
    redimensionner();

    lignes[3].titre.textContent = 'Un autre titre, tout aussi long';
    await new Promise((r) => setTimeout(r, 0));

    expect(lignes[3].titre.getAttribute('title')).toBe('Un autre titre, tout aussi long');
    expect(mutationsCrees).toBe(1);
  });
});

describe('#914 — le clavier, délégué au document', () => {
  it('🔴 le focus clavier d’une ligne parmi mille ouvre UNE bulle, titre et artiste', () => {
    const lignes = liste({ client: 80, scroll: 400 });
    armerTout(lignes);
    redimensionner();

    lignes[42].bouton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    const ouvertes = document.querySelectorAll('.bulle-texte-coupe');
    expect(ouvertes.length).toBe(1);
    expect(ouvertes[0].textContent).toBe('Titre très long numéro 42\nArtiste très long numéro 42');

    lignes[42].bouton.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(document.querySelectorAll('.bulle-texte-coupe').length).toBe(0);
  });

  it('une ligne démontée n’ouvre plus rien', () => {
    const lignes = liste({ client: 80, scroll: 400 });
    armerTout(lignes);
    for (const a of actions) a.destroy();
    actions = [];

    lignes[0].bouton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(document.querySelectorAll('.bulle-texte-coupe').length).toBe(0);
  });
});
