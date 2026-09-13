// @vitest-environment jsdom
/**
 * 501 n’est pas une panne — Fabien, fil « v0.9.148 : v1 divers bugs », point 4 :
 *
 *   « Menu playlists : quand on rentre dans le menu : erreur bandcamp »
 *
 * ## Mesuré sur la .18 le 13/09/2026
 *
 * ```text
 * GET /api/v1/streaming/bandcamp/playlists
 *   → 501  « Bandcamp ne fournit pas de playlists »
 * ```
 *
 * ## La cause
 *
 * `PlaylistsV2` interroge tous les services authentifiés et attrape proprement
 * ceux qui ne répondent pas (`catch { par[n] = [] }`). Mais le socle criait
 * AVANT lui : le bandeau rouge était levé par `fetchJSON` parce que 501 tombe
 * dans `response.status >= 500`. Un « Server error » à chaque ouverture de
 * l’écran, pour une fonctionnalité que le service n’offre simplement pas.
 *
 * `501 Not Implemented` dit « je ne sais pas faire ça », pas « je suis en
 * panne ». C’est la distinction que #859 a établie côté MESSAGE ; elle vaut
 * aussi pour le bandeau.
 *
 * ## Ce que cette garde tient
 *
 * Qu’un 501 ne lève aucun bandeau, et qu’un VRAI 5xx en lève toujours un. La
 * seconde moitié compte autant : élargir l’exception ferait taire les pannes.
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

/** Fait répondre le prochain `fetch` par ce corps — une VRAIE `Response`. */
function repond(status: number, corps: string, type = 'text/plain') {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(corps, { status, headers: { 'content-type': type } }),
  );
}

beforeEach(() => { toasts.length = 0; });
afterEach(() => vi.restoreAllMocks());

describe('501 n’est pas une panne', () => {
  /** 🔴 LE CAS DE FABIEN. */
  it('un 501 ne lève AUCUN bandeau', async () => {
    repond(501, 'Bandcamp ne fournit pas de playlists');
    await expect(api.getStreamingPlaylists('bandcamp')).rejects.toBeTruthy();
    expect(toasts, `bandeau levé : ${toasts.join(' | ')}`).toEqual([]);
  });

  it('mais il REJETTE toujours — l’appelant garde la main', async () => {
    repond(501, 'Bandcamp ne fournit pas de playlists');
    let attrape: any = null;
    try { await api.getStreamingPlaylists('bandcamp'); } catch (e) { attrape = e; }
    expect(attrape).toBeTruthy();
    // Et il porte la phrase du serveur, pas un code nu (acquis de #859).
    expect(String(attrape?.message ?? attrape)).toContain('Bandcamp');
  });

  /**
   * 🔴 L’AUTRE MOITIÉ. Élargir l’exception ferait taire les vraies pannes —
   * c’est précisément ce qu’il ne faut pas.
   */
  it('un 500 lève toujours son bandeau', async () => {
    repond(500, 'boom');
    await expect(api.getStreamingPlaylists('qobuz')).rejects.toBeTruthy();
    expect(toasts.length).toBe(1);
    expect(toasts[0]).toContain('Server error');
  });

  it('un 502 et un 503 aussi', async () => {
    for (const st of [502, 503]) {
      toasts.length = 0;
      repond(st, 'panne');
      await expect(api.getStreamingPlaylists('qobuz')).rejects.toBeTruthy();
      expect(toasts.length, `status ${st}`).toBe(1);
    }
  });

  it('un 404 n’en lève pas non plus — inchangé', async () => {
    repond(404, '{"error":"not found"}', 'application/json');
    await expect(api.getStreamingPlaylists('inconnu')).rejects.toBeTruthy();
    expect(toasts).toEqual([]);
  });
});
