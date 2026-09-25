// @vitest-environment jsdom
//
// #1555 — sous Node ≥ 25, le `localStorage` natif de Node masque celui de
// jsdom et vaut `undefined` : tout banc jsdom qui passe par `getToken()`
// tombait (pontRoonImport4349 : 10 rouges sur 10 sous Node 26).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reparerStockageWeb } from './stockageWeb';
import { getToken, setToken, clearToken } from '../auth';

function faux(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

/** Une cible qui imite Node 26 : l'accesseur existe et rend `undefined`. */
function cibleNode26(): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  Object.defineProperty(c, 'localStorage', { get: () => undefined, configurable: true, enumerable: true });
  return c;
}

describe('#1555 — reparerStockageWeb', () => {
  it('rend le stockage de jsdom quand l’accesseur de Node rend undefined (Node 26)', () => {
    const cible = cibleNode26();
    const ls = faux();
    const ss = faux();
    cible.sessionStorage = ss;
    expect(reparerStockageWeb(cible, { localStorage: ls, sessionStorage: faux() })).toEqual(['localStorage']);
    expect(cible.localStorage).toBe(ls);
    // Un stockage qui marchait n'est pas remplacé.
    expect(cible.sessionStorage).toBe(ss);
  });

  it('répare aussi un accesseur qui LÈVE', () => {
    const cible: Record<string, unknown> = {};
    Object.defineProperty(cible, 'localStorage', {
      get: () => { throw new Error('SecurityError'); },
      configurable: true,
    });
    const ls = faux();
    expect(reparerStockageWeb(cible, { localStorage: ls })).toEqual(['localStorage']);
    expect(cible.localStorage).toBe(ls);
  });

  it('ne touche à rien sous Node 22 (stockage déjà utilisable) ni sans fenêtre jsdom', () => {
    const ls = faux();
    const cible: Record<string, unknown> = { localStorage: ls, sessionStorage: faux() };
    expect(reparerStockageWeb(cible, { localStorage: faux(), sessionStorage: faux() })).toEqual([]);
    expect(cible.localStorage).toBe(ls);
    const c26 = cibleNode26();
    expect(reparerStockageWeb(c26, null)).toEqual([]);
    expect(c26.localStorage).toBeUndefined();
  });
});

describe('#1555 — dans un banc jsdom, quel que soit Node', () => {
  it('localStorage est utilisable et le jeton fait l’aller-retour', () => {
    expect(typeof localStorage?.getItem).toBe('function');
    clearToken();
    expect(getToken()).toBeNull();
    setToken('jeton-1555');
    expect(getToken()).toBe('jeton-1555');
    clearToken();
    expect(getToken()).toBeNull();
  });

  it('la réparation est BRANCHÉE dans vitest.config.ts (setupFiles)', () => {
    const conf = readFileSync(resolve(__dirname, '../../../vitest.config.ts'), 'utf8');
    const setup = conf.slice(conf.indexOf('setupFiles'));
    expect(conf.indexOf('setupFiles')).toBeGreaterThan(-1);
    expect(setup.slice(0, setup.indexOf(']'))).toContain('src/lib/__tests__/setupStockageWeb.ts');
  });
});
