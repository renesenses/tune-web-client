// @vitest-environment jsdom
//
// tune-server-rust#9157 (Rob, 18/11) — le serveur tire désormais la
// sélection d'une ambiance dans un vivier, à chaque appel. L'écran Ambiance
// garde ce comportement par défaut (aucun champ envoyé) ; la recherche par le
// son de l'écran Recherche demande l'ancien classement stable (`vary: false`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { searchAcoustic } from '../api';

let corps: any[] = [];

beforeEach(() => {
  corps = [];
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    corps.push(JSON.parse(String(init?.body ?? '{}')));
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify({ query: 'q', count: 0, tracks: [] }),
    } as unknown as Response;
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('searchAcoustic et la variation serveur (#9157)', () => {
  it('par défaut, aucun champ vary : le serveur varie la sélection', async () => {
    await searchAcoustic('warm jazz', 50);
    expect(corps).toEqual([{ query: 'warm jazz', limit: 50 }]);
  });

  it('vary: false est transmis tel quel', async () => {
    await searchAcoustic('warm jazz', 40, { vary: false });
    expect(corps).toEqual([{ query: 'warm jazz', limit: 40, vary: false }]);
  });

  it('la recherche par le son demande un classement stable, l\'Ambiance non', () => {
    const recherche = readFileSync('src/components/v2/SearchV2.svelte', 'utf8');
    expect(recherche).toMatch(/searchAcoustic\(query, 40, \{ vary: false \}\)/);
    const ambiance = readFileSync('src/components/v2-heritage/AmbianceView.svelte', 'utf8');
    expect(ambiance).toMatch(/searchAcoustic\(query, 50\)/);
    expect(ambiance).not.toMatch(/vary/);
  });
});
