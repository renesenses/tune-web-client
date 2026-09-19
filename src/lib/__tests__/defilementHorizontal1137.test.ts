/**
 * #1137 — « il faut attraper la barre pour se déplacer latéralement » (Pascal
 * / bluevelvet, fil 1765, 11/09/2026, rejoignant Mac Brehlit).
 *
 * ⚠️ Ce correctif ne traite QUE le symptôme, et c'est assumé : Pascal propose
 * mieux — un bouton « Plus » qui ouvre la rubrique en vertical, à la façon de
 * Roon. Sa proposition reste à faire ; celle-ci ne lui ferme aucune porte.
 *
 * Le piège de ce geste n'est pas de le faire marcher, c'est de ne pas
 * CONFISQUER le défilement de la page.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  deplacementMolette,
  peutDefiler,
  PAS_FLECHE,
  defilementHorizontal,
} from '../defilementHorizontal';

/** Une rangée mesurée : 1 000 px de contenu dans 400 px de fenêtre. */
const rangee = (scrollLeft: number) => ({ scrollLeft, scrollWidth: 1000, clientWidth: 400 });

describe('#1137 — la rangée peut-elle avancer ?', () => {
  it('oui au milieu, dans les deux sens', () => {
    expect(peutDefiler(rangee(300), 100)).toBe(true);
    expect(peutDefiler(rangee(300), -100)).toBe(true);
  });

  it('non au-delà de ses bords', () => {
    expect(peutDefiler(rangee(0), -100)).toBe(false);
    expect(peutDefiler(rangee(600), 100)).toBe(false);
    // …mais l'autre sens reste possible.
    expect(peutDefiler(rangee(0), 100)).toBe(true);
    expect(peutDefiler(rangee(600), -100)).toBe(true);
  });

  it('non quand rien ne déborde', () => {
    expect(peutDefiler({ scrollLeft: 0, scrollWidth: 400, clientWidth: 400 }, 100)).toBe(false);
  });

  it('🔴 une position FRACTIONNAIRE ne fabrique pas un pixel de marge', () => {
    // Un défilement en cours rend 599,6 au bord droit et 0,4 au bord gauche.
    // 🔴 Ce témoin a trouvé un vrai défaut : un arrondi UNIQUE se trompe
    // forcément d'un côté — `Math.ceil(0,4)` vaut 1, donc « il reste de la
    // place à gauche », alors qu'il n'en reste pas. L'arrondi va vers le bord
    // qu'on teste.
    expect(peutDefiler(rangee(599.6), 100)).toBe(false);
    expect(peutDefiler(rangee(0.4), -100)).toBe(false);
    // Et les deux bords gardent l'autre sens ouvert.
    expect(peutDefiler(rangee(599.6), -100)).toBe(true);
    expect(peutDefiler(rangee(0.4), 100)).toBe(true);
  });
});

describe('#1137 — ce que la molette doit prendre, et ce qu\'elle doit laisser', () => {
  it('un mouvement vertical devient horizontal', () => {
    expect(deplacementMolette(rangee(300), { deltaX: 0, deltaY: 120 })).toBe(120);
    expect(deplacementMolette(rangee(300), { deltaX: 0, deltaY: -120 })).toBe(-120);
  });

  it('🔴 arrivée au bout, elle LAISSE PASSER — la page doit défiler', () => {
    expect(deplacementMolette(rangee(600), { deltaX: 0, deltaY: 120 })).toBe(0);
    expect(deplacementMolette(rangee(0), { deltaX: 0, deltaY: -120 })).toBe(0);
  });

  it('un geste déjà HORIZONTAL de pavé tactile n\'est pas doublé', () => {
    // Sinon les deux s'additionnent et la rangée saute.
    expect(deplacementMolette(rangee(300), { deltaX: 40, deltaY: 0 })).toBe(0);
    expect(deplacementMolette(rangee(300), { deltaX: 40, deltaY: 10 })).toBe(0);
  });

  it('une rangée qui ne déborde pas ne prend rien', () => {
    expect(deplacementMolette({ scrollLeft: 0, scrollWidth: 400, clientWidth: 400 },
      { deltaX: 0, deltaY: 120 })).toBe(0);
  });

  it('un delta nul ne prend rien', () => {
    expect(deplacementMolette(rangee(300), { deltaX: 0, deltaY: 0 })).toBe(0);
  });
});

describe('#1137 — l\'action', () => {
  it('🔴 elle écoute `wheel` en `passive: false`', () => {
    // Sans cela le navigateur refuse `preventDefault()` et la page défilerait
    // EN PLUS de la rangée.
    const src = readFileSync('src/lib/defilementHorizontal.ts', 'utf8');
    expect(src).toContain("el.addEventListener('wheel', molette, { passive: false })");
  });

  it('elle se débranche au démontage', () => {
    const ecoutes: string[] = [];
    const faux = {
      scrollLeft: 0, scrollWidth: 1000, clientWidth: 400,
      addEventListener: (t: string) => ecoutes.push(t),
      removeEventListener: (t: string) => ecoutes.splice(ecoutes.indexOf(t), 1),
      hasAttribute: () => true,
      setAttribute: () => {},
      scrollBy: () => {},
    } as unknown as HTMLElement;
    const a = defilementHorizontal(faux);
    expect(ecoutes.sort()).toEqual(['keydown', 'wheel']);
    a.destroy();
    expect(ecoutes).toEqual([]);
  });

  it('elle rend la rangée atteignable au clavier, sans écraser un tabindex', () => {
    const src = readFileSync('src/lib/defilementHorizontal.ts', 'utf8');
    expect(src).toContain("if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');");
    expect(src).toContain("e.key === 'ArrowRight'");
    expect(src).toContain("e.key === 'ArrowLeft'");
    expect(PAS_FLECHE).toBeGreaterThan(0);
  });
});

describe('#1137 — le branchement', () => {
  it('les rangées de l\'Accueil l\'utilisent', () => {
    const vue = readFileSync('src/components/v2/PageWidgets.svelte', 'utf8');
    expect(vue).toContain('use:defilementHorizontal');
    expect(vue).toContain("from '../../lib/defilementHorizontal'");
  });
});
