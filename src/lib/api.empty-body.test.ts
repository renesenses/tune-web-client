import { describe, it, expect, vi } from 'vitest';

/**
 * `fetchJSON` and empty responses.
 *
 * Several mutating endpoints answer `204 No Content`. Parsing that as JSON
 * threw "Invalid JSON response", so a write that had succeeded surfaced in the
 * UI as a failure — rating an album saved the rating and showed an error toast.
 */

// The suite runs in the `node` environment: api.ts reads window.location at
// import time, reads a token from localStorage on every call, and pushes
// toasts on failures. Mocking the two modules is steadier than faking
// localStorage, which each test would otherwise have to keep alive.
vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:8888' } });
vi.mock('./auth', () => ({ getToken: () => null, clearToken: () => {} }));
vi.mock('./stores/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const { fetchJSON } = await import('./api');

function respond(body: string, init: ResponseInit = {}) {
  const response = {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers: new Headers(init.headers),
    text: async () => body,
    json: async () => JSON.parse(body),
  };
  return vi.fn().mockResolvedValue(response);
}

describe('fetchJSON with an empty body', () => {
  it('resolves on 204 instead of throwing', async () => {
    vi.stubGlobal('fetch', respond('', { status: 204 }));
    await expect(fetchJSON('/api/v1/library/albums/1/rate', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('resolves on a 200 with an empty body', async () => {
    vi.stubGlobal('fetch', respond('', { status: 200 }));
    await expect(fetchJSON('/api/v1/anything')).resolves.toBeUndefined();
  });

  it('resolves on a body that is only whitespace', async () => {
    vi.stubGlobal('fetch', respond('  \n', { status: 200 }));
    await expect(fetchJSON('/api/v1/anything')).resolves.toBeUndefined();
  });

  it('still parses a real JSON body', async () => {
    vi.stubGlobal('fetch', respond('{"rating":4}', { status: 200 }));
    await expect(fetchJSON('/api/v1/library/albums/1/rating')).resolves.toEqual({ rating: 4 });
  });

  it('still rejects a malformed body', async () => {
    vi.stubGlobal('fetch', respond('{oops', { status: 200 }));
    await expect(fetchJSON('/api/v1/anything')).rejects.toThrow('Invalid JSON response');
  });

  it('still rejects an HTML page served in place of the API', async () => {
    vi.stubGlobal('fetch', respond('<!doctype html><html></html>', { status: 200 }));
    await expect(fetchJSON('/api/v1/anything')).rejects.toThrow(/Expected JSON/);
  });

  it('still rejects an error status, empty body or not', async () => {
    vi.stubGlobal('fetch', respond('', { status: 400 }));
    await expect(fetchJSON('/api/v1/anything')).rejects.toThrow();
  });

  it('surfaces AppError.error instead of a naked 400 Bad Request', async () => {
    vi.stubGlobal(
      'fetch',
      respond('{"error":"no audio files found in sources"}', { status: 400 }),
    );
    await expect(fetchJSON('/api/v1/converter/start', { method: 'POST' })).rejects.toThrow(
      'no audio files found in sources',
    );
  });
});
