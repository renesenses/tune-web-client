import { afterEach, describe, expect, it, vi } from 'vitest';
import { writable } from 'svelte/store';
import { avecLangue, avecLangueSignal } from './langueRequete';

const { langue } = vi.hoisted(() => ({ langue: { store: null as any } }));
langue.store = writable('vi');
vi.mock('./i18n', () => ({ locale: langue.store, t: (_: string) => _ }));
vi.mock('./auth', () => ({ getToken: () => null, clearToken: vi.fn() }));
vi.mock('./stores/notifications', () => ({ notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('./bridge', () => ({
  urlWebSocket: () => 'wss://relay.test/ws/client/server?token=a%2Bb',
  isRemote: () => false,
  baseApi: () => "/api/v1",
  entetesRelais: () => ({}),
}));
vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:8888' } });
const { fetchJSON, apiFetch } = await import('./api');
const { tuneWS: ws } = await import('./websocket');

afterEach(() => { ws.disconnect(); vi.useRealTimers(); });

describe('langue choisie Tune (#2228)', () => {
  it('garde jeton, filtres et fragment avec une seule langue', () => {
    const u = new URL(avecLangue('https://h/api?q=a%2Bb&lang=fr#details', 'hu'));
    expect(u.searchParams.get('q')).toBe('a+b');
    expect(u.searchParams.getAll('lang')).toEqual(['hu']);
    expect(u.hash).toBe('#details');
    expect(avecLangue('/zones?q=a%20b', 'vi')).toBe('/zones?q=a%20b&lang=vi');
    expect(avecLangueSignal('/api/v1/ext/circle', 'vi')).toBe('/api/v1/ext/circle');
    expect(avecLangueSignal('/api/v1/plugins/crossfeed/zones/1', 'vi')).toBe('/api/v1/plugins/crossfeed/zones/1');
    expect(avecLangueSignal('/api/relay/serveur/zones/1', 'hu')).toBe('/api/relay/serveur/zones/1?lang=hu');
  });
  it('envoie la langue courante dans les lectures et écritures HTTP', async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    langue.store.set('vi');
    await apiFetch('/zones');
    langue.store.set('hu');
    await fetchJSON('/api/v1/zones/1/play', { method: 'POST', body: '{}' });
    expect(new URL(fetch.mock.calls[0][0], 'http://h').searchParams.get('lang')).toBe('vi');
    expect(new URL(fetch.mock.calls[1][0], 'http://h').searchParams.get('lang')).toBe('hu');
  });
  it('reconnecte le WebSocket avec la nouvelle langue sans perdre le jeton', () => {
    vi.useFakeTimers();
    const sockets: FauxSocket[] = [];
    class FauxSocket {
      onclose: (() => void) | null = null;
      close = vi.fn(() => this.onclose?.());
      constructor(public url: string) { sockets.push(this); }
    }
    vi.stubGlobal('WebSocket', FauxSocket);
    langue.store.set('vi');
    ws.connect();
    expect(new URL(sockets[0].url).searchParams.get('lang')).toBe('vi');
    langue.store.set('hu');
    expect(sockets[0].close).toHaveBeenCalledOnce();
    expect(sockets).toHaveLength(2);
    const current = new URL(sockets[1].url);
    expect(current.searchParams.get('lang')).toBe('hu');
    expect(current.searchParams.get('token')).toBe('a+b');
    vi.advanceTimersByTime(10000);
    expect(sockets).toHaveLength(2);
    ws.disconnect();
    langue.store.set('en');
    expect(sockets).toHaveLength(2);
  });
});
