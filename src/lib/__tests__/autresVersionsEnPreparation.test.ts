// @vitest-environment jsdom
/**
 * Mesure du 31/10/2026 : le premier appel de `/home/other-versions` prenait
 * 20 s. Le serveur répond désormais tout de suite, en 202 +
 * `X-En-Preparation: true`, et finit en tâche de fond. Sans cette relance, la
 * rangée de l'accueil resterait vide : le 202 est un succès pour `fetch`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../stores/notifications', () => ({
  notifications: {
    error: () => {}, success: () => {}, info: () => {}, avecAction: () => {},
  },
}));

import * as api from '../api';

const groupe = { title: 'T', artist_name: 'A', played_album: 'X', versions: [], streaming: [{ service: 'qobuz' }] };

function reponse(corps: unknown, enPreparation: boolean) {
  return new Response(JSON.stringify(corps), {
    status: enPreparation ? 202 : 200,
    headers: enPreparation
      ? { 'content-type': 'application/json', 'x-en-preparation': 'true' }
      : { 'content-type': 'application/json' },
  });
}

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('« Autres versions » : le serveur prépare, la rangée redemande', () => {
  it('202 puis 200 : rend la réponse complète, en deux appels', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(reponse([], true))
      .mockResolvedValueOnce(reponse([groupe], false));
    vi.stubGlobal('fetch', f);
    const r = await api.getOtherVersions(20, [1, 1]);
    expect(f).toHaveBeenCalledTimes(2);
    expect(r).toEqual([groupe]);
  });

  it('toujours en préparation : au plus 1 + 2 appels, puis il rend ce qu il a', async () => {
    const f = vi.fn(async () => reponse([], true));
    vi.stubGlobal('fetch', f);
    const r = await api.getOtherVersions(20, [1, 1]);
    expect(f).toHaveBeenCalledTimes(3);
    expect(r).toEqual([]);
  });

  it('contre-épreuve : une réponse 200 ordinaire ne relance rien', async () => {
    const f = vi.fn(async () => reponse([groupe], false));
    vi.stubGlobal('fetch', f);
    const r = await api.getOtherVersions(20, [1, 1]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(r).toEqual([groupe]);
  });

  it('un 200 vide (rien écouté) ne relance rien non plus', async () => {
    const f = vi.fn(async () => reponse([], false));
    vi.stubGlobal('fetch', f);
    await api.getOtherVersions(20, [1, 1]);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
