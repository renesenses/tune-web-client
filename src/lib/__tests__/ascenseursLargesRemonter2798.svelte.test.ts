// @vitest-environment jsdom
// web#2798 — Michel (fil 2748, 11/11/2026), qui souffre de tremblements :
// « agrandir la largeur des barres de défilement ou mettre un bouton en haut ».
//
// Cause : depuis Chrome 121, dès qu'un élément porte `scrollbar-color` (la
// règle `* { … }` de tune-theme.css, web#2773), Chrome ignore TOUS les
// `::-webkit-scrollbar` : les 14 px globaux et les 9 px des vues ne
// s'appliquaient plus, l'ascenseur était celui du système, étroit.
//
// Ce banc garde :
//   1. le réglage « Barres de défilement larges » (préférence, défaut décoché,
//      attribut `<html data-ascenseurs-larges>`, interrupteur dans Réglages) ;
//   2. la feuille : en mode large, `scrollbar-color` est RETIRÉ là où les
//      `::-webkit-scrollbar` existent (sinon Chrome les ignore), largeur ≥ 16 px,
//      `!important` contre les 9 px des vues ;
//   3. le bouton « Remonter en haut » : absent tant qu'on n'a pas défilé une
//      longue liste, présent ensuite, et il ramène la liste en haut ;
//   4. les trois chaînes dans les quinze locales.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import RemonterEnHaut from '../../components/v2/RemonterEnHaut.svelte';
import { appliquerAscenseursLarges, preferences } from '../stores/preferences';
import { get } from 'svelte/store';
import {
  doitAfficher, estLongueListe, positionBouton, SEUIL_AFFICHAGE_PX, TAILLE_BOUTON_PX,
} from '../remonterEnHaut';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Une « liste » jsdom : jsdom ne calcule aucune mise en page, on la pose. */
function liste(hauteurVisible: number, hauteurTotale: number): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: hauteurVisible });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: hauteurTotale });
  el.getBoundingClientRect = () => ({ top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON() {} }) as DOMRect;
  el.scrollTo = vi.fn((o: ScrollToOptions | number) => { el.scrollTop = typeof o === 'number' ? o : (o.top ?? 0); }) as any;
  document.body.appendChild(el);
  return el;
}
function defiler(el: Element, haut: number) {
  el.scrollTop = haut;
  el.dispatchEvent(new Event('scroll')); // ne remonte pas : seule la capture le voit
  flushSync();
}

describe('web#2798 — réglage « Barres de défilement larges »', () => {
  afterEach(() => document.documentElement.removeAttribute('data-ascenseurs-larges'));

  it('décoché par défaut : personne ne voit son affichage changer sans l’avoir demandé', () => {
    expect(get(preferences).ascenseursLarges).toBe(false);
  });

  it('pose et retire `data-ascenseurs-larges` sur <html>', () => {
    appliquerAscenseursLarges(true);
    expect(document.documentElement.hasAttribute('data-ascenseurs-larges')).toBe(true);
    appliquerAscenseursLarges(false);
    expect(document.documentElement.hasAttribute('data-ascenseurs-larges')).toBe(false);
  });

  it('la coquille applique le réglage, et Réglages > Interface le propose', () => {
    const shell = lire('src/components/v2/ShellV2.svelte');
    expect(shell).toMatch(/appliquerAscenseursLarges\(\$preferences\.ascenseursLarges === true\)/);
    expect(shell).toContain('<RemonterEnHaut />');
    const reglages = lire('src/components/v2/SettingsV2.svelte');
    const i = reglages.indexOf("s.id === 'interface'");
    const j = reglages.indexOf('data-reglage-ascenseurs-larges');
    expect(i).toBeGreaterThan(0);
    expect(j, 'interrupteur absent de la section Interface').toBeGreaterThan(i);
    expect(reglages.slice(j, j + 800)).toContain('ascenseursLarges:');
  });
});

describe('web#2798 — la feuille dessine un ascenseur large dans Chrome, Edge et Safari', () => {
  const css = sansCommentaires(lire('src/styles/tune-theme.css'));
  const supports = /@supports\s+selector\(::-webkit-scrollbar\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';

  it('retire `scrollbar-color` en mode large (sinon Chrome 121+ ignore les ::-webkit-scrollbar)', () => {
    expect(supports, 'bloc @supports selector(::-webkit-scrollbar) introuvable').not.toBe('');
    // `<html>` lui-même ET ses descendants : `<html>` porte le scrollbar-color
    // de `*` et de `[data-theme=…]`, et son ascenseur est celui du document.
    expect(supports).toMatch(/html\[data-ascenseurs-larges\],\s*html\[data-ascenseurs-larges\]\s*\*\s*\{\s*scrollbar-color\s*:\s*auto\s*;/);
  });

  it('largeur ≥ 16 px, en !important contre les 9 px posés par les vues', () => {
    const m = /html\[data-ascenseurs-larges\]\s*::-webkit-scrollbar\s*\{([^}]*)\}/.exec(supports);
    expect(m).not.toBeNull();
    const largeur = /width\s*:\s*(\d+)px\s*!important/.exec(m![1]);
    expect(Number(largeur?.[1])).toBeGreaterThanOrEqual(16);
  });

  it('pouce contrasté (jeton --v2-scrollthumb, sinon --v2-txt2) et assez haut pour être saisi', () => {
    const m = /html\[data-ascenseurs-larges\]\s*::-webkit-scrollbar-thumb\s*\{([^}]*)\}/.exec(supports);
    expect(m![1]).toMatch(/background\s*:\s*var\(--v2-scrollthumb,\s*var\(--v2-txt2/);
    expect(Number(/min-height\s*:\s*(\d+)px/.exec(m![1])?.[1])).toBeGreaterThanOrEqual(44);
  });

  it('Firefox (hors @supports) garde un `scrollbar-color` contrasté, sans toucher à scrollbar-width', () => {
    const horsSupports = css.replace(/@supports[\s\S]*?\n\}/g, '');
    const m = /html\[data-ascenseurs-larges\],\s*html\[data-ascenseurs-larges\]\s*\*\s*\{([^}]*)\}/.exec(horsSupports);
    expect(m?.[1]).toMatch(/scrollbar-color\s*:\s*var\(--v2-scrollthumb/);
    expect(css).not.toMatch(/data-ascenseurs-larges\][^{]*\{[^}]*scrollbar-width/);
  });
});

describe('web#2798 — bouton « Remonter en haut »', () => {
  let hote: HTMLDivElement;
  let composant: ReturnType<typeof mount> | undefined;
  beforeEach(() => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    composant = mount(RemonterEnHaut, { target: hote });
    flushSync();
  });
  afterEach(() => {
    if (composant) unmount(composant);
    document.body.innerHTML = '';
  });
  const bouton = () => document.querySelector<HTMLButtonElement>('[data-remonter-en-haut]');

  it('absent au repos, présent dès qu’on a défilé une longue liste', () => {
    const el = liste(600, 6000);
    expect(bouton()).toBeNull();
    defiler(el, SEUIL_AFFICHAGE_PX + 1);
    expect(bouton()).not.toBeNull();
    expect(bouton()!.getAttribute('aria-label')).toBeTruthy();
    expect(bouton()!.getAttribute('style')).toMatch(new RegExp(`--taille:\\s*${TAILLE_BOUTON_PX}px`));
  });

  it('un clic ramène la liste en haut et le bouton s’efface', () => {
    const el = liste(600, 6000);
    defiler(el, 3000);
    bouton()!.click();
    flushSync();
    expect(el.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    expect(el.scrollTop).toBe(0);
    expect(bouton()).toBeNull();
  });

  it('défilement doux : le bouton reste pendant l’animation, sans clignoter, puis s’efface', () => {
    const el = liste(600, 6000);
    el.scrollTo = vi.fn() as any; // l'animation n'a pas encore bougé la liste
    defiler(el, 3000);
    bouton()!.click();
    flushSync();
    expect(bouton(), 'retiré puis réaffiché au scroll suivant = clignotement').not.toBeNull();
    defiler(el, 1500);
    expect(bouton()).not.toBeNull();
    defiler(el, 0);
    expect(bouton()).toBeNull();
  });

  it('au clavier, le focus revient à la liste (pas sur <body>)', () => {
    const el = liste(600, 6000);
    defiler(el, 3000);
    bouton()!.focus();
    bouton()!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    flushSync();
    expect(document.activeElement).toBe(el);
  });

  it('revenir en haut à la main l’efface aussi', () => {
    const el = liste(600, 6000);
    defiler(el, 3000);
    defiler(el, 10);
    expect(bouton()).toBeNull();
  });

  it('une petite boîte (menu, liste courte) ne le fait jamais apparaître', () => {
    const menu = liste(150, 4000);
    defiler(menu, 2000);
    expect(bouton()).toBeNull();
    const courte = liste(600, 900);
    defiler(courte, 300);
    expect(bouton()).toBeNull();
  });
});

describe('web#2798 — décision et placement', () => {
  it('estLongueListe / doitAfficher', () => {
    const el = liste(600, 6000);
    expect(estLongueListe(el)).toBe(true);
    el.scrollTop = 0;
    expect(doitAfficher(el)).toBe(false);
    el.scrollTop = 1200;
    expect(doitAfficher(el)).toBe(true);
    el.remove();
    expect(doitAfficher(el), 'liste démontée').toBe(false);
  });

  it('placé en bas à droite du conteneur, pas sur la barre de transport', () => {
    const p = positionBouton({ top: 0, left: 200, right: 1000, bottom: 700 }, { largeur: 1200, hauteur: 800 });
    expect(p.droite).toBeGreaterThanOrEqual(200 + 20); // l'ascenseur large reste libre
    expect(p.bas).toBeGreaterThanOrEqual(100);          // au-dessus de ce qui suit le conteneur
  });
});

describe('web#2798 — chaînes dans les quinze locales', () => {
  const dir = resolve(process.cwd(), 'src/lib/locales');
  const locales = readdirSync(dir).filter((f) => /^[a-z]{2}\.ts$/.test(f));
  it('quinze locales', () => expect(locales.length).toBe(15));
  for (const f of locales) {
    it(f, () => {
      const s = readFileSync(resolve(dir, f), 'utf-8');
      for (const k of ['settings.wideScrollbars', 'settings.wideScrollbarsHint', 'v2.backToTop']) {
        expect(s, `${k} absent de ${f}`).toMatch(new RegExp(`"${k.replace(/\./g, '\\.')}"\\s*:\\s*"[^"]+"`));
      }
    });
  }
});
