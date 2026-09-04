// @vitest-environment jsdom
/**
 * Le choix d'interface : ce que l'URL impose, ce que l'appareil retient.
 *
 * Deux règles qui ne se voient qu'à l'usage, et qu'on ne peut pas éprouver à
 * l'écran :
 *
 *  1. `?v2=0` est une ISSUE DE SECOURS. Si un écran de la future v1 se bloquait
 *     au point de rendre le menu de retour inatteignable, c'est la seule façon
 *     de revenir — elle doit donc l'emporter sur le choix mémorisé.
 *  2. Sans rien de tout cela, l'interface ACTUELLE. La future ne s'impose à
 *     personne, y compris quand le stockage est refusé.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { futureInterface, choixMemorise } from '../interfaceChoisie';

const CLE = 'tune-interface';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('ce que l’URL impose', () => {
  it('`?v2` monte la future, même sans rien de mémorisé', () => {
    expect(futureInterface('?v2')).toBe(true);
    expect(futureInterface('?v2=1')).toBe(true);
    expect(futureInterface('?v2=true')).toBe(true);
  });

  it('`?v2=0` ramène à l’actuelle MÊME si la future est mémorisée', () => {
    localStorage.setItem(CLE, 'future');
    expect(futureInterface('?v2=0'), 'l’issue de secours ne fonctionne plus').toBe(false);
    expect(futureInterface('?v2=false')).toBe(false);
  });

  it('elle l’emporte dans les deux sens', () => {
    localStorage.setItem(CLE, 'actuelle');
    expect(futureInterface('?v2')).toBe(true);
  });
});

describe('ce que l’appareil retient', () => {
  it('sans paramètre, le choix mémorisé décide', () => {
    localStorage.setItem(CLE, 'future');
    expect(futureInterface('')).toBe(true);
    localStorage.setItem(CLE, 'actuelle');
    expect(futureInterface('')).toBe(false);
  });

  it('sans choix ni paramètre, l’interface ACTUELLE', () => {
    // La future ne s'impose à personne : c'est une prévisualisation.
    expect(futureInterface('')).toBe(false);
    expect(choixMemorise()).toBeNull();
  });

  it('un stockage refusé ne fait pas d’exception et retombe sur l’actuelle', () => {
    // Navigation privée. Cette fonction est appelée AVANT tout montage : une
    // exception ici laisserait une page blanche.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('refusé'); });
    expect(() => futureInterface('')).not.toThrow();
    expect(futureInterface('')).toBe(false);
  });
});
