// @vitest-environment jsdom
//
// « Un texte coupé se lit en entier » — renesenses/tune-server-rust#2411.
//
// 🔴 CES TÉMOINS APPELLENT, ILS NE LISENT PAS. Ils posent l'action sur de VRAIS
// éléments du document, mesurent, focalisent, et regardent le DOM réellement
// produit. Aucune assertion ne porte sur une chaîne d'un fichier source — ce
// que faisaient, par construction, les gardes des lots 0 à 2
// (`src/lib/__tests__/infobullesTronquees.ts` lit le `.svelte` au disque).
//
// Ce fichier verrouille les DEUX choses qu'un `title=` écrit à la main ne sait
// pas faire, et qui sont exactement les deux prudences du chantier :
//
//   1. ne PAS poser de bulle sur un texte qui n'est pas tronqué ;
//   2. rendre le texte lisible au CLAVIER, pas seulement au survol.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bulleTexte, texteDeborde, reinitialiserLeGeste } from '../infobulleTexte';

/**
 * jsdom ne met rien en page : `clientWidth` et `scrollWidth` valent 0 pour
 * tout le monde. On les impose donc élément par élément, ce qui est justement
 * ce qu'il faut pour éprouver la mesure dans les deux sens.
 */
function poserLesBoites(el: HTMLElement, client: number, scroll: number) {
  Object.defineProperty(el, 'clientWidth', { value: client, configurable: true });
  Object.defineProperty(el, 'scrollWidth', { value: scroll, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 20, configurable: true });
  Object.defineProperty(el, 'scrollHeight', { value: 20, configurable: true });
}

let racine: HTMLDivElement;
const aDetruire: { destroy(): void }[] = [];

/** Un `<span>` de texte dans un `<button>` — le cas dominant du dépôt. */
function spanDansUnBouton(texte: string) {
  const bouton = document.createElement('button');
  const span = document.createElement('span');
  span.className = 'truncate';
  span.textContent = texte;
  bouton.appendChild(span);
  racine.appendChild(bouton);
  return { bouton, span };
}

function armer(node: HTMLElement, texte?: string) {
  const a = bulleTexte(node, texte);
  aDetruire.push(a);
  return a;
}

const bulles = () => Array.from(document.querySelectorAll('.bulle-texte-coupe'));

beforeEach(() => {
  reinitialiserLeGeste();
  racine = document.createElement('div');
  document.body.appendChild(racine);
});

afterEach(() => {
  while (aDetruire.length) aDetruire.pop()!.destroy();
  racine.remove();
  document.querySelectorAll('.bulle-texte-coupe').forEach((b) => b.remove());
});

describe('#2411 — la mesure : une bulle seulement là où le texte est vraiment coupé', () => {
  it('un texte qui DÉBORDE reçoit son infobulle, avec le texte entier', () => {
    const { span } = spanDansUnBouton('Concerto pour piano n° 21 en ut majeur, K. 467');
    poserLesBoites(span, 120, 480);
    armer(span);

    // Le DOM, pas la source.
    expect(span.getAttribute('title')).toBe(
      'Concerto pour piano n° 21 en ut majeur, K. 467',
    );
  });

  it("🔴 un texte qui TIENT dans sa boîte ne reçoit AUCUNE infobulle", () => {
    // La prudence n°1 du chantier. Un `title=` écrit à la main dans le
    // balisage s'afficherait ici aussi, et répéterait au survol le mot qu'on
    // est déjà en train de lire.
    const { span } = spanDansUnBouton('Jazz');
    poserLesBoites(span, 300, 300);
    armer(span);

    expect(span.hasAttribute('title')).toBe(false);
  });

  it('un débordement d’UN SEUL pixel ne compte pas — le sous-pixel du navigateur', () => {
    const { span } = spanDansUnBouton('Blues');
    poserLesBoites(span, 300, 301);
    armer(span);

    expect(span.hasAttribute('title')).toBe(false);
  });

  it('un texte tronqué en HAUTEUR (line-clamp) est vu lui aussi', () => {
    const span = document.createElement('span');
    span.textContent = 'Une biographie sur trois lignes, dont la quatrième est coupée.';
    racine.appendChild(span);
    Object.defineProperty(span, 'clientWidth', { value: 300, configurable: true });
    Object.defineProperty(span, 'scrollWidth', { value: 300, configurable: true });
    Object.defineProperty(span, 'clientHeight', { value: 60, configurable: true });
    Object.defineProperty(span, 'scrollHeight', { value: 140, configurable: true });

    expect(texteDeborde(span)).toBe(true);
  });

  it('élément pas encore mis en page : on garde la bulle plutôt que de parier', () => {
    // Onglet caché, composant monté mais pas peint : on ne PEUT pas mesurer.
    // Une bulle en trop se referme, un texte illisible ne se répare pas.
    const { span } = spanDansUnBouton('Titre inconnu de la mise en page');
    armer(span);

    expect(span.getAttribute('title')).toBe('Titre inconnu de la mise en page');
  });

  it('la bulle suit le texte quand la ligne change de piste sans être recréée', async () => {
    const { span } = spanDansUnBouton('Première piste, un titre très long');
    poserLesBoites(span, 100, 400);
    armer(span);
    expect(span.getAttribute('title')).toBe('Première piste, un titre très long');

    span.textContent = 'Deuxième piste, un titre tout aussi long';
    // Le `MutationObserver` livre au micro-tâche suivant.
    await new Promise((r) => setTimeout(r, 0));

    expect(span.getAttribute('title')).toBe('Deuxième piste, un titre tout aussi long');
  });

  it('un texte explicite l’emporte sur le contenu affiché', () => {
    const { span } = spanDansUnBouton('Mozart');
    poserLesBoites(span, 40, 200);
    armer(span, 'Wolfgang Amadeus Mozart — 1756-1791');

    expect(span.getAttribute('title')).toBe('Wolfgang Amadeus Mozart — 1756-1791');
  });
});

describe('#2411 — le clavier : la moitié qu’un `title=` natif ne livre jamais', () => {
  it('🔴 le focus AU CLAVIER ouvre une bulle qui porte le texte entier', () => {
    // Aucun navigateur n'affiche l'infobulle native au focus clavier. Sans
    // cette bulle, l'utilisateur voyant qui navigue au clavier voit
    // « Concerto pour… » et n'a AUCUN geste pour lire la suite : c'est
    // l'accessibilité en trompe-l'œil que les lots 0 à 2 livrent.
    const { bouton, span } = spanDansUnBouton('Concerto pour piano n° 21, K. 467');
    poserLesBoites(span, 120, 480);
    armer(span);

    bouton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    const ouvertes = bulles();
    expect(ouvertes.length, 'aucune bulle ouverte au focus clavier').toBe(1);
    expect(ouvertes[0].textContent).toBe('Concerto pour piano n° 21, K. 467');
    expect(ouvertes[0].getAttribute('role')).toBe('tooltip');
  });

  it('elle est `aria-hidden` : le lecteur d’écran lit déjà le texte entier', () => {
    // La troncature CSS est purement visuelle — le texte complet est dans le
    // DOM. Annoncer la bulle en plus ferait dire deux fois la même chose.
    const { bouton, span } = spanDansUnBouton('Symphonie n° 9 en ré mineur');
    poserLesBoites(span, 100, 400);
    armer(span);
    bouton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(bulles()[0].getAttribute('aria-hidden')).toBe('true');
  });

  it('la perte du focus referme la bulle', () => {
    const { bouton, span } = spanDansUnBouton('Un titre coupé');
    poserLesBoites(span, 60, 300);
    armer(span);
    bouton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(bulles().length).toBe(1);

    bouton.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(bulles().length).toBe(0);
  });

  it('Échap referme la bulle sans quitter l’élément', () => {
    const { bouton, span } = spanDansUnBouton('Un titre coupé');
    poserLesBoites(span, 60, 300);
    armer(span);
    bouton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(bulles().length).toBe(1);

    bouton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(bulles().length).toBe(0);
  });

  it('🔴 le focus pris à la SOURIS n’ouvre rien — pas de doublon avec la bulle native', () => {
    const { bouton, span } = spanDansUnBouton('Un titre coupé');
    poserLesBoites(span, 60, 300);
    armer(span);

    // Le clic donne le focus au bouton. Sans ce filtre, la bulle s'ouvrirait
    // à chaque clic, par-dessus l'infobulle native que le survol affiche déjà.
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    bouton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(bulles().length).toBe(0);
  });

  it("un texte qui TIENT n’ouvre rien au clavier non plus", () => {
    const { bouton, span } = spanDansUnBouton('Rock');
    poserLesBoites(span, 300, 300);
    armer(span);
    bouton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(bulles().length).toBe(0);
  });

  it('🔴 sans ancêtre focalisable : aucune bulle, et surtout AUCUN `tabindex` ajouté', () => {
    // Ajouter deux cents arrêts de tabulation sur des `<span>` décoratifs
    // rendrait la navigation au clavier pire qu'avant. Un texte qu'aucun geste
    // clavier n'atteint n'a pas besoin d'une bulle au clavier.
    const boite = document.createElement('div');
    const span = document.createElement('span');
    span.className = 'truncate';
    span.textContent = 'Texte dans un div non focalisable';
    boite.appendChild(span);
    racine.appendChild(boite);
    poserLesBoites(span, 60, 300);
    armer(span);

    // La bulle native, elle, reste : le survol fonctionne.
    expect(span.getAttribute('title')).toBe('Texte dans un div non focalisable');
    expect(span.hasAttribute('tabindex')).toBe(false);
    expect(boite.hasAttribute('tabindex')).toBe(false);

    boite.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(bulles().length).toBe(0);
  });

  it('une seule bulle à la fois dans tout le document', () => {
    const a = spanDansUnBouton('Premier titre, très long');
    const b = spanDansUnBouton('Second titre, très long lui aussi');
    poserLesBoites(a.span, 60, 300);
    poserLesBoites(b.span, 60, 300);
    armer(a.span);
    armer(b.span);

    a.bouton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    b.bouton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(bulles().length).toBe(1);
    expect(bulles()[0].textContent).toBe('Second titre, très long lui aussi');
  });

  it('démonter une ligne ne referme pas la bulle qu’une autre vient d’ouvrir', () => {
    const a = spanDansUnBouton('Premier titre, très long');
    const b = spanDansUnBouton('Second titre, très long lui aussi');
    poserLesBoites(a.span, 60, 300);
    poserLesBoites(b.span, 60, 300);
    const actionA = bulleTexte(a.span);
    armer(b.span);

    b.bouton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(bulles().length).toBe(1);

    actionA.destroy();
    expect(bulles().length, 'la bulle de B a été emportée par le démontage de A').toBe(1);
  });
});
