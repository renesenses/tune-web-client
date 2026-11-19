import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Une action refusée hors de la machine de Tune (403 `auth_required` /
 * `not_local`, authentification désactivée) : la phrase traduite qui dit où
 * activer l'authentification s'affiche quel que soit l'écran (greffons,
 * thèmes, pont, restauration…). Redémarrer / Arrêter disent la leur ; une
 * lecture refusée reste silencieuse.
 */
vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:8888' } });
vi.mock('./auth', () => ({ getToken: () => null, clearToken: () => {} }));
const error = vi.fn();
vi.mock('./stores/notifications', () => ({
  notifications: { error: (...a: unknown[]) => error(...a), success: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

const { fetchJSON } = await import('./api');

const CORPS = JSON.stringify({
  error: 'auth_required',
  reason: 'not_local',
  message: 'This action requires authentication to be enabled, or a call from this machine (localhost).',
  caller: '192.168.1.50',
});

function refus() {
  const response = {
    ok: false,
    status: 403,
    statusText: 'Forbidden',
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => CORPS,
    json: async () => JSON.parse(CORPS),
    clone() { return this; },
  };
  return vi.fn().mockResolvedValue(response);
}

beforeEach(() => error.mockReset());

describe('refus hors de la machine de Tune', () => {
  it('une action (installer un greffon) : bandeau traduit, une seule fois', async () => {
    vi.stubGlobal('fetch', refus());
    const e: any = await fetchJSON('/api/v1/plugins/exemple/install', { method: 'POST', body: '{}' }).catch((x: any) => x);
    expect(e.status).toBe(403);
    expect(e.dejaAnnonce).toBe(true);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toBe(e.message);
    expect(e.message).not.toContain('This action requires');
  });

  it('restauration, pont, thèmes : même bandeau', async () => {
    for (const [url, method] of [
      ['/api/v1/system/config-backup/cloud/restore', 'POST'],
      ['/api/v1/cloud/bridge/enable', 'POST'],
      ['/api/v1/skins/x', 'DELETE'],
      ['/api/v1/system/update/channel', 'PUT'],
    ] as const) {
      error.mockReset();
      vi.stubGlobal('fetch', refus());
      await fetchJSON(url, { method }).catch(() => {});
      expect(error, url).toHaveBeenCalledTimes(1);
    }
  });

  it('Redémarrer / Arrêter et les lectures : pas de bandeau ici', async () => {
    for (const [url, method] of [
      ['/api/v1/system/restart', 'POST'],
      ['/api/v1/system/stop', 'POST'],
      ['/api/v1/cloud/bridge/access-link', 'GET'],
    ] as const) {
      error.mockReset();
      vi.stubGlobal('fetch', refus());
      const e: any = await fetchJSON(url, { method }).catch((x: any) => x);
      expect(error, url).not.toHaveBeenCalled();
      // Le message reste traduit pour l'écran qui l'affiche.
      expect(e.message).not.toContain('This action requires');
    }
  });
});
