// @vitest-environment jsdom
//
// #1958 — fils 2156 et 2158 (rc2, Windows) : « La biographie d'un artiste
// apparaît tronquée quand elle dépasse 4 lignes. »
//
// Le texte arrivait entier ; c'est `ClampedText` qui le gardait coupé, faute
// d'afficher son bouton. Il ne l'affichait que si le bloc REPLIÉ débordait
// (`scrollHeight - clientHeight > 1`), et ne remesurait qu'au changement de
// taille ou de `resetKey`. Deux cas où le bouton ne venait jamais :
//
//  1. un moteur qui JETTE les lignes au-delà de la coupe (`line-clamp`
//     standard, `continue: discard`) : le bloc replié ne déborde pas ;
//  2. une biographie qui GRANDIT sans changer la hauteur repliée (quatre
//     lignes, puis quarante, même artiste) : aucun ResizeObserver ne le voit.
//
// jsdom ne met pas en page. Le banc pose donc une mise en page MODÈLE sur
// `scrollHeight` / `clientHeight` du seul bloc `.clamp-text` : 22 px par ligne,
// 80 caractères par ligne, quatre lignes visibles quand il porte `.clamped`.
// Le modèle décide si les lignes cachées comptent dans `scrollHeight` (ancien
// `-webkit-line-clamp`) ou non (`line-clamp` standard).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import BioEtTitresPhares from '../../components/v2/BioEtTitresPhares.svelte';
import { locale } from '../i18n';

const LIGNE = 22;
const LONGUE = 'Une biographie longue. '.repeat(60); // ≈ 17 lignes
const COURTE = 'Quatre lignes tout au plus. '.repeat(8); // ≈ 3 lignes

let jetteLesLignesCachees = true;
const proto = HTMLElement.prototype as any;
const origines = {
  scrollHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight'),
  clientHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight'),
};

function lignes(el: HTMLElement) {
  return Math.max(1, Math.ceil((el.textContent ?? '').trim().length / 80));
}
function visible(el: HTMLElement) {
  const n = lignes(el);
  return (el.classList.contains('clamped') ? Math.min(n, 4) : n) * LIGNE;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
  Object.defineProperty(proto, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList?.contains('clamp-text') ? visible(this) : 0;
    },
  });
  Object.defineProperty(proto, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (!this.classList?.contains('clamp-text')) return 0;
      if (this.classList.contains('clamped') && jetteLesLignesCachees) return visible(this);
      return lignes(this) * LIGNE;
    },
  });
  locale.set('fr');
});

afterEach(() => {
  delete proto.clientHeight;
  delete proto.scrollHeight;
  if (origines.scrollHeight) Object.defineProperty(Element.prototype, 'scrollHeight', origines.scrollHeight);
  if (origines.clientHeight) Object.defineProperty(Element.prototype, 'clientHeight', origines.clientHeight);
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function laisserMesurer() {
  // `queueMicrotask(measure)` et le MutationObserver passent en microtâche.
  for (let i = 0; i < 3; i++) await Promise.resolve();
  flushSync();
}

const bouton = () => document.querySelector<HTMLButtonElement>('.clamp-toggle');
const bloc = () => document.querySelector<HTMLElement>('.clamp-text')!;

describe('#1958 — la biographie se déplie', () => {
  it('cas 1 : un moteur qui jette les lignes cachées montre quand même « Lire la suite »', async () => {
    jetteLesLignesCachees = true;
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const c = mount(BioEtTitresPhares, { target: cible, props: { bio: LONGUE, titres: [], cle: 1 } });
    await laisserMesurer();

    expect(bouton(), 'le bouton doit paraître : la biographie dépasse quatre lignes').not.toBeNull();
    expect(bouton()!.textContent?.trim()).toBe('Lire la suite');
    expect(bloc().classList.contains('clamped')).toBe(true);

    bouton()!.click();
    flushSync();
    expect(bloc().classList.contains('clamped'), 'déplié, le texte entier se lit').toBe(false);
    expect(bouton()!.textContent?.trim()).toBe('Réduire');
    expect(bouton()!.getAttribute('aria-expanded')).toBe('true');

    bouton()!.click();
    flushSync();
    expect(bloc().classList.contains('clamped')).toBe(true);
    expect(bouton()!.textContent?.trim()).toBe('Lire la suite');
    unmount(c);
  });

  it('cas 2 : une biographie qui grandit sans changer de hauteur repliée est remesurée', async () => {
    jetteLesLignesCachees = false; // l'ancien -webkit-line-clamp, le plus clément
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    // 320 caractères : quatre lignes pile, la hauteur repliée maximale.
    const props = $state({ bio: 'Quatre lignes pile. '.repeat(16), titres: [] as any[], cle: 7 });
    const c = mount(BioEtTitresPhares, { target: cible, props });
    await laisserMesurer();
    expect(bouton(), 'quatre lignes : rien à déplier').toBeNull();

    props.bio = LONGUE; // même artiste (`cle` inchangée), même hauteur repliée
    flushSync();
    await laisserMesurer();
    expect(bouton(), 'la biographie a grandi : le bouton doit paraître').not.toBeNull();
    unmount(c);
  });

  it('une biographie courte n’a pas de bouton', async () => {
    jetteLesLignesCachees = true;
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const c = mount(BioEtTitresPhares, { target: cible, props: { bio: COURTE, titres: [], cle: 2 } });
    await laisserMesurer();
    expect(bouton()).toBeNull();
    unmount(c);
  });
});
