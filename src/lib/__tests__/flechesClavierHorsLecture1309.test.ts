import { describe, it, expect } from 'vitest';
import { flecheDeLecture } from '../keyboard';

// #1309 — la règle pure : quand une flèche est-elle un raccourci de lecture ?

const touche = (code: string, extra: Partial<KeyboardEvent> = {}) =>
  ({ code, shiftKey: false, defaultPrevented: false, ...extra }) as KeyboardEvent;

describe('flecheDeLecture (#1309)', () => {
  it("hors de l'écran de lecture, une flèche seule redevient une flèche", () => {
    for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      expect(flecheDeLecture(touche(code), false), code).toBe(false);
    }
  });
  it("sur l'écran de lecture, les flèches pilotent la lecture comme avant", () => {
    for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      expect(flecheDeLecture(touche(code), true), code).toBe(true);
    }
  });
  it('Maj+← / Maj+→ restent actifs partout', () => {
    expect(flecheDeLecture(touche('ArrowLeft', { shiftKey: true }), false)).toBe(true);
    expect(flecheDeLecture(touche('ArrowRight', { shiftKey: true }), false)).toBe(true);
    expect(flecheDeLecture(touche('ArrowUp', { shiftKey: true }), false)).toBe(false);
  });
  it('une touche déjà consommée par un composant n’est jamais rejouée', () => {
    expect(flecheDeLecture(touche('ArrowRight', { defaultPrevented: true }), true)).toBe(false);
    expect(flecheDeLecture(touche('ArrowRight', { shiftKey: true, defaultPrevented: true }), false)).toBe(false);
  });
});
