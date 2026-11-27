// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { marquerCoupe } from './marquerCoupe';

function boite(scroll: number, client: number): HTMLElement {
  const n = document.createElement('span');
  Object.defineProperty(n, 'scrollWidth', { configurable: true, get: () => scroll });
  Object.defineProperty(n, 'clientWidth', { configurable: true, get: () => client });
  return n;
}

describe('marquerCoupe — le fondu ne touche que les noms qui dépassent', () => {
  it('pose data-coupe quand le texte dépasse', () => {
    const n = boite(180, 120);
    marquerCoupe(n);
    expect(n.hasAttribute('data-coupe')).toBe(true);
  });
  it('ne pose rien quand le texte tient', () => {
    const n = boite(80, 120);
    marquerCoupe(n);
    expect(n.hasAttribute('data-coupe')).toBe(false);
  });
  it('remesure au changement de texte et retire la marque', () => {
    let scroll = 180;
    const n = document.createElement('span');
    Object.defineProperty(n, 'scrollWidth', { get: () => scroll });
    Object.defineProperty(n, 'clientWidth', { get: () => 120 });
    const a = marquerCoupe(n, 'long');
    expect(n.hasAttribute('data-coupe')).toBe(true);
    scroll = 60;
    a.update();
    expect(n.hasAttribute('data-coupe')).toBe(false);
    a.destroy();
  });
});
