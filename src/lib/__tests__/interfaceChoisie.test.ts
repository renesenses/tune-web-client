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
import { futureInterface, choixMemorise, cibleApresChoix } from '../interfaceChoisie';

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

describe('la bascule recharge DANS LES DEUX SENS', () => {
  /*
   * Bogue livré puis corrigé le 04/09/2026. On retire `?v2` de l'adresse pour
   * qu'un forçage d'hier ne l'emporte pas sur le choix d'aujourd'hui — mais
   * depuis l'interface actuelle il n'y a rien à retirer, l'adresse ne change
   * pas, et affecter `location.href` à la même adresse ne recharge rien.
   *
   * Le sens v1 → v0 marchait, le sens v0 → v1 ne faisait rien. Bertrand :
   * « ok pour V1 -> V0 mais v0 -> v1 ne marche pas ! »
   */
  it('depuis l’interface actuelle, l’adresse ne change pas : il FAUT recharger', () => {
    const r = cibleApresChoix('http://tune.local:8888/');
    expect(r.memeAdresse, 'sans ?v2 à retirer, l’adresse est identique').toBe(true);
  });

  it('depuis la future v1, le `?v2` disparaît et l’adresse change', () => {
    const r = cibleApresChoix('http://tune.local:8888/?v2');
    expect(r.memeAdresse).toBe(false);
    expect(r.url).not.toContain('v2');
  });

  it('les autres paramètres survivent', () => {
    // `?kiosk` et `?mini` sont des modes d'affichage : changer d'interface ne
    // doit pas sortir d'un écran de cuisine ou du mini-lecteur.
    const r = cibleApresChoix('http://tune.local:8888/?kiosk&v2&mini');
    expect(r.url).toContain('kiosk');
    expect(r.url).toContain('mini');
    expect(r.url).not.toContain('v2');
  });
});
