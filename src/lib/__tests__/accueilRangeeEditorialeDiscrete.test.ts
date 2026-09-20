// @vitest-environment jsdom
/**
 * Une rangée éditoriale qui ne charge pas ne crie pas — signalement de
 * Levente, relayé par Bertrand le 20/09/2026.
 *
 * ## Ce que le testeur a lu
 *
 * En cliquant simplement sur l’ACCUEIL, un bandeau rouge en travers de
 * l’écran :
 *
 * ```text
 * Server error: qobuz /playlist/getTags: 500
 * {"message":"An unexpected error occurred (Root=1-6ab00353-78b03a4041ebe03408857ce0)",
 *  "status":"error","code":500}
 * ```
 *
 * `Root=1-…` est un identifiant de trace AWS : ce 500 vient de chez Qobuz, et
 * notre serveur l’a recopié tel quel. Mesuré sur le .18 le 20/09, la même
 * route rend 200 en 4 ms — la panne est intermittente.
 *
 * ## La cause, et où elle est
 *
 * Elle n’est PAS dans le composant. `HomeV2` appelle
 * `categoriesPlaylistsPourAccueil('qobuz')`, qui rattrape déjà proprement
 * l’échec (`.catch(() => [])`, `widgetsService.ts`). Mais le socle criait
 * AVANT lui : `fetchJSON` lève un bandeau global pour tout 5xx ≠ 501, avec
 * pour texte `err.message` — c’est-à-dire, pour une réponse en texte brut, la
 * CHARGE du service recopiée mot pour mot (`apiError`).
 *
 * Deux défauts en un : une rangée absente devient une panne de toute
 * l’application, et un identifiant de trace AWS arrive sous les yeux d’un
 * testeur.
 *
 * ## Ce que cette garde tient
 *
 * Que les rangées éditoriales de l’accueil échouent SILENCIEUSEMENT — détail
 * dans la console, rien à l’écran — et, tout aussi important, qu’un 5xx sur
 * une route NON éditoriale lève toujours son bandeau. Élargir l’exception
 * ferait taire les vraies pannes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const toasts: string[] = [];
vi.mock('../stores/notifications', () => ({
  notifications: {
    error: (m: string) => { toasts.push(m); },
    success: () => {}, info: () => {}, avecAction: () => {},
  },
}));

import * as api from '../api';
import { categoriesPlaylistsPourAccueil } from '../widgetsService';

/** La charge que Qobuz a réellement rendue, telle que le serveur la relaie. */
const CHARGE_BRUTE =
  'qobuz /playlist/getTags: 500 {"message":"An unexpected error occurred ' +
  '(Root=1-6ab00353-78b03a4041ebe03408857ce0)","status":"error","code":500}';

/** Fait répondre le prochain `fetch` par ce corps — une VRAIE `Response`. */
function repond(status: number, corps: string, type = 'text/plain') {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(corps, { status, headers: { 'content-type': type } }),
  );
}

beforeEach(() => { toasts.length = 0; });
afterEach(() => vi.restoreAllMocks());

describe('accueil : une rangée éditoriale en échec reste discrète', () => {
  /** 🔴 LE CAS DE LEVENTE. */
  it('le 500 de Qobuz sur les catégories ne lève AUCUN bandeau', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    repond(500, CHARGE_BRUTE);
    await expect(api.getStreamingFeaturedPlaylistsByTag('qobuz')).rejects.toBeTruthy();
    expect(toasts, `bandeau levé : ${toasts.join(' | ')}`).toEqual([]);
  });

  /** Et surtout : l’identifiant de trace AWS n’atteint jamais l’écran. */
  it('la charge brute du service ne s’affiche nulle part', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    repond(500, CHARGE_BRUTE);
    await expect(api.getStreamingFeaturedPlaylistsByTag('qobuz')).rejects.toBeTruthy();
    expect(toasts.join(' | ')).not.toContain('Root=1-');
  });

  /** Le détail n’est pas perdu pour autant : il part dans la console. */
  it('le détail est journalisé en console', async () => {
    const journal = vi.spyOn(console, 'warn').mockImplementation(() => {});
    repond(500, CHARGE_BRUTE);
    await expect(api.getStreamingFeaturedPlaylistsByTag('qobuz')).rejects.toBeTruthy();
    const lignes = journal.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(lignes).toContain('/playlist/getTags');
  });

  /** L’appel REJETTE toujours : l’appelant garde la main sur sa rangée. */
  it('l’appel rejette encore — la rangée décide de son propre état', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    repond(500, CHARGE_BRUTE);
    let attrape: unknown = null;
    try { await api.getStreamingFeaturedPlaylistsByTag('qobuz'); } catch (e) { attrape = e; }
    expect(attrape).toBeTruthy();
    expect((attrape as { status?: number })?.status).toBe(500);
  });

  /** Les sept sections éditoriales de l’accueil passent par la même règle. */
  it('une section éditoriale en échec ne crie pas non plus', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    repond(502, 'qobuz /album/getFeatured: 502 upstream');
    await expect(api.getStreamingFeatured('qobuz', 'press-awards')).rejects.toBeTruthy();
    expect(toasts, `bandeau levé : ${toasts.join(' | ')}`).toEqual([]);
  });

  /** Bout en bout : l’accueil n’apprend aucune catégorie, et reste muet. */
  it('l’accueil rend zéro catégorie sans un mot à l’écran', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    repond(500, CHARGE_BRUTE);
    const widgets = await categoriesPlaylistsPourAccueil('qobuz');
    expect(widgets).toEqual([]);
    expect(toasts, `bandeau levé : ${toasts.join(' | ')}`).toEqual([]);
  });

  /**
   * 🔴 L’AUTRE MOITIÉ. Faire taire l’éditorial ne doit pas faire taire les
   * pannes : une route qui n’a pas de rangée pour porter son échec crie
   * toujours.
   */
  it('un 500 sur une route non éditoriale lève toujours son bandeau', async () => {
    repond(500, 'boom');
    await expect(api.getStreamingPlaylists('qobuz')).rejects.toBeTruthy();
    expect(toasts.length).toBe(1);
    expect(toasts[0]).toContain('Server error');
  });
});
