// @vitest-environment jsdom
//
// web#3275 — RELECTURE DE #3278. Ce que les flèches ne doivent PAS faire :
//
//   1. voler Alt+← / Alt+→ aux écrans qui s'en servent déjà — l'ordre des
//      étiquettes (`EtiquettesV2`, ordre ENREGISTRÉ sur le serveur) et l'ordre
//      des colonnes (`ListePistesV2`) ;
//   2. parcourir tout l'écran à chaque navigation pour trouver ce qui a défilé ;
//   3. contredire un écran qui remet lui-même sa liste en tête ;
//   4. naviguer sous un dialogue ou un menu qui n'a pas `aria-modal` ;
//   et laisser Suivant allumé quand l'entrée suivante n'est plus à Tune.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { flecheDeLecture } from '../keyboard';
import {
  _poserRacine,
  _reinitialiserMemoire,
  _reinitialiserRangs,
  annulerRestaurationDefilement,
  atteindreEntreeEtrangere,
  brancherRaccourcisNavigation,
  empilerAuRang,
  atteindreLeRang,
  memoireDe,
  mesurerDefilements,
  peutAvancer,
  peutReculer,
  quitterLaPage,
  restaurerDefilements,
  retenirEntree,
  suivreLesDefilements,
} from '../memoireNavigation';

const lire = (f: string) => readFileSync(resolve(__dirname, '..', '..', f), 'utf-8');

let arretRaccourcis: (() => void) | null = null;
let back: ReturnType<typeof vi.spyOn>;
let forward: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  _reinitialiserMemoire();
  _reinitialiserRangs();
  empilerAuRang(1);
  empilerAuRang(2);
  atteindreLeRang(1);
  back = vi.spyOn(history, 'back').mockImplementation(() => {});
  forward = vi.spyOn(history, 'forward').mockImplementation(() => {});
  arretRaccourcis = brancherRaccourcisNavigation();
});

afterEach(() => {
  arretRaccourcis?.();
  arretRaccourcis = null;
  back.mockRestore();
  forward.mockRestore();
  document.body.innerHTML = '';
});

function altFleche(cible: HTMLElement, key: 'ArrowLeft' | 'ArrowRight'): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, code: key, altKey: true, bubbles: true, cancelable: true });
  cible.dispatchEvent(e);
  return e;
}

describe('1. Alt+flèche reste aux écrans qui s’en servent', () => {
  it('focus sur une étiquette (`.tag`, aria-keyshortcuts) : Alt+→ ne recule ni n’avance', () => {
    const tag = document.createElement('button');
    tag.className = 'tag';
    tag.setAttribute('aria-keyshortcuts', 'Alt+ArrowLeft Alt+ArrowRight Alt+Home Alt+End');
    document.body.appendChild(tag);
    tag.focus();
    altFleche(tag, 'ArrowRight');
    altFleche(tag, 'ArrowLeft');
    expect(back).not.toHaveBeenCalled();
    expect(forward).not.toHaveBeenCalled();
  });

  it('focus sur un en-tête de colonne (`[data-th]`) : idem', () => {
    const th = document.createElement('div');
    th.setAttribute('data-th', 'titre');
    th.tabIndex = 0;
    th.setAttribute('aria-keyshortcuts', 'Alt+ArrowLeft Alt+ArrowRight Alt+Home');
    const dedans = document.createElement('span');
    th.appendChild(dedans);
    document.body.appendChild(th);
    altFleche(dedans, 'ArrowLeft');
    expect(back, 'un descendant du porteur compte aussi').not.toHaveBeenCalled();
  });

  it('un écran qui CONSOMME la touche (`preventDefault`) passe avant, même sans attribut', () => {
    const el = document.createElement('div');
    el.tabIndex = 0;
    el.addEventListener('keydown', (e) => e.preventDefault());
    document.body.appendChild(el);
    altFleche(el, 'ArrowLeft');
    expect(back).not.toHaveBeenCalled();
  });

  it('ailleurs, Alt+← recule — et nos propres flèches (qui déclarent la touche) aussi', () => {
    altFleche(document.body, 'ArrowLeft');
    expect(back).toHaveBeenCalledTimes(1);
    const fleche = document.createElement('button');
    fleche.setAttribute('data-fleche-nav', 'reculer');
    fleche.setAttribute('aria-keyshortcuts', 'Alt+ArrowLeft');
    document.body.appendChild(fleche);
    altFleche(fleche, 'ArrowLeft');
    expect(back).toHaveBeenCalledTimes(2);
  });

  it('les deux écrans déclarent bien leur Alt+flèche', () => {
    expect(lire('components/v2/EtiquettesV2.svelte')).toMatch(/aria-keyshortcuts="Alt\+ArrowLeft Alt\+ArrowRight/);
    expect(lire('components/v2/ListePistesV2.svelte')).toMatch(/'aria-keyshortcuts': 'Alt\+ArrowLeft Alt\+ArrowRight/);
  });

  it('la lecture laisse Alt+←/→ à la navigation, quel que soit l’ordre des écouteurs', () => {
    const t = (code: string, altKey: boolean) => ({ code, altKey, shiftKey: false, defaultPrevented: false });
    expect(flecheDeLecture(t('ArrowLeft', true), true)).toBe(false);
    expect(flecheDeLecture(t('ArrowRight', true), true)).toBe(false);
    expect(flecheDeLecture(t('ArrowLeft', false), true), '← seule déplace toujours la lecture').toBe(true);
    expect(flecheDeLecture(t('ArrowUp', true), true), 'Alt+↑ (volume) inchangé').toBe(true);
  });
});

describe('2. le défilement est SUIVI, plus cherché dans tout l’écran', () => {
  it('seuls les conteneurs qui ont défilé sont lus', () => {
    const arret = suivreLesDefilements();
    const racine = document.createElement('main');
    document.body.appendChild(racine);
    for (let i = 0; i < 3000; i++) racine.appendChild(document.createElement('div'));
    const liste = document.createElement('div');
    liste.className = 'grille';
    racine.appendChild(liste);
    liste.scrollTop = 700;
    liste.dispatchEvent(new Event('scroll'));
    const lu = vi.fn();
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
    Object.defineProperty(Element.prototype, 'scrollTop', {
      configurable: true,
      get(this: Element) { lu(); return desc.get!.call(this); },
      set(this: Element, v: number) { desc.set!.call(this, v); },
    });
    try {
      expect(mesurerDefilements(racine)).toEqual([{ sel: 'div.grille', i: 0, top: 700 }]);
      expect(lu, '3 001 nœuds, une seule lecture de scrollTop').toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(Element.prototype, 'scrollTop', desc);
      arret();
    }
  });

  it('un conteneur démonté est oublié', () => {
    const arret = suivreLesDefilements();
    const racine = document.createElement('main');
    document.body.appendChild(racine);
    const liste = document.createElement('div');
    racine.appendChild(liste);
    liste.scrollTop = 50;
    liste.dispatchEvent(new Event('scroll'));
    liste.remove();
    expect(mesurerDefilements(racine)).toEqual([]);
    arret();
  });
});

describe('3. un écran qui remet sa liste en tête a le dernier mot', () => {
  it('`annulerRestaurationDefilement` arrête la reprise en cours', async () => {
    const arret = suivreLesDefilements();
    const racine = document.createElement('main');
    document.body.appendChild(racine);
    _poserRacine(() => racine);
    const sh = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
    Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get: () => 9000 });
    try {
      const liste = document.createElement('div');
      liste.className = 'pistes';
      racine.appendChild(liste);
      liste.scrollTop = 900;
      liste.dispatchEvent(new Event('scroll'));
      retenirEntree('e1', 'library');
      expect(memoireDe('e1')?.defilements).toHaveLength(1);
      liste.scrollTop = 0;
      const taches: Array<() => void> = [];
      restaurerDefilements('e1', { programmer: (cb) => { taches.push(cb); } });
      annulerRestaurationDefilement();
      while (taches.length) taches.shift()!();
      expect(liste.scrollTop, 'la liste remise en tête par l’écran y reste').toBe(0);
    } finally {
      if (sh) Object.defineProperty(Element.prototype, 'scrollHeight', sh);
      arret();
    }
  });

  it('les écrans qui tiennent leur propre défilement sont exclus', () => {
    const src = lire('lib/memoireNavigation.ts');
    for (const vue of ['radios', 'circle', 'streaming', 'home', 'queue']) {
      expect(src, vue).toMatch(new RegExp(`VUES_SANS_DEFILEMENT[\\s\\S]*'${vue}'`));
    }
    expect(lire('components/v2/LibraryV2.svelte'), 'la remise en tête des pistes annule la reprise')
      .toMatch(/function remonterEnTeteDesPistes\(\) \{[\s\S]{0,300}annulerRestaurationDefilement\(\)/);
  });
});

describe('4. sous un dialogue ou un menu, le raccourci ne navigue pas', () => {
  for (const role of ['dialog', 'alertdialog', 'menu']) {
    it(`role="${role}" sans aria-modal`, () => {
      const d = document.createElement('div');
      d.setAttribute('role', role);
      document.body.appendChild(d);
      altFleche(document.body, 'ArrowLeft');
      expect(back).not.toHaveBeenCalled();
    });
  }

  it('un dialogue masqué ne bloque rien', () => {
    const d = document.createElement('div');
    d.setAttribute('role', 'dialog');
    d.hidden = true;
    document.body.appendChild(d);
    altFleche(document.body, 'ArrowLeft');
    expect(back).toHaveBeenCalledTimes(1);
  });
});

describe('Suivant ne promet jamais une entrée qui n’est plus à Tune', () => {
  it('quitter la page (lien externe) éteint Suivant au retour', () => {
    expect(get(peutAvancer)).toBe(true);
    window.dispatchEvent(new Event('pagehide'));
    expect(get(peutAvancer)).toBe(false);
    expect(get(peutReculer)).toBe(true);
    expect(sessionStorage.getItem('tune.nav.rangMax')).toBe('1');
  });

  it('un `popstate` sans état (entrée étrangère) éteint les deux flèches', () => {
    atteindreEntreeEtrangere();
    expect(get(peutAvancer)).toBe(false);
    expect(get(peutReculer)).toBe(false);
  });

  it('`quitterLaPage` seule : le rang maximal redescend au rang courant', () => {
    quitterLaPage();
    expect(get(peutAvancer)).toBe(false);
  });
});
