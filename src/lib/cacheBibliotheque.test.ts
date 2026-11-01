/**
 * tune-server-rust#7619 (L5) — le cache IndexedDB des pages de la
 * Bibliothèque : rangé sous une révision, jeté quand le serveur en annonce une
 * autre, éteint face à un serveur sans révision, lu (sans écriture) hors ligne.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reponses: { revision: unknown } = { revision: 'r1' };
vi.mock('./api', () => ({
  BASE: 'http://tune.local/api/v1',
  fetchJSON: vi.fn(async () => {
    if (reponses.revision instanceof Error) throw reponses.revision;
    return reponses.revision === undefined ? { error: 'not found' } : { revision: reponses.revision };
  }),
}));
vi.mock('./profileHeader', () => ({ profileHeader: () => ({ 'X-Profile-Id': '1' }) }));

import * as cache from './cacheBibliotheque';

beforeEach(() => {
  (globalThis as any).indexedDB = new IDBFactory();
  cache._remiseAZeroPourTests();
  reponses.revision = 'r1';
});

describe('cache des pages de la Bibliothèque', () => {
  it('relit une page rangée sous la même révision', async () => {
    await cache.rangerPage('albums|t|0', { items: [1, 2] });
    cache._remiseAZeroPourTests(); // nouvelle session, même base
    expect(await cache.lirePage('albums|t|0')).toEqual({ items: [1, 2] });
  });

  it('jette tout quand la révision du serveur change', async () => {
    await cache.rangerPage('albums|t|0', { items: [1] });
    reponses.revision = 'r2';
    cache.signalerInvalidation();
    expect(
      await cache.lirePage('albums|t|0'),
      'une page rangée sous r1 ne doit plus sortir sous r2',
    ).toBeNull();
  });

  it('reste éteint face à un serveur sans révision', async () => {
    reponses.revision = undefined;
    await cache.rangerPage('albums|t|0', { items: [1] });
    expect(await cache.lirePage('albums|t|0')).toBeNull();
  });

  it('hors ligne : lit la dernière révision connue, n’écrit rien', async () => {
    await cache.rangerPage('albums|t|0', { items: [1] });
    cache._remiseAZeroPourTests();
    reponses.revision = new Error('Failed to fetch');
    expect(await cache.lirePage('albums|t|0')).toEqual({ items: [1] });
    await cache.rangerPage('albums|t|1', { items: [9] });
    reponses.revision = 'r1';
    cache._remiseAZeroPourTests();
    expect(await cache.lirePage('albums|t|1')).toBeNull();
  });
});
