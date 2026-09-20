// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import HistoriqueV2 from '../../components/v2/HistoriqueV2.svelte';
import { playbackHistory } from '../stores/history';
import { currentZoneId, zones } from '../stores/zones';
import { tuneWS } from '../websocket';

class Socket {
  static OPEN = 1;
  static last: Socket;
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { Socket.last = this; }
  send() {}
  close() { this.readyState = 3; }
  emit(type: string, data: unknown = { zone_id: 99 }) {
    this.onmessage?.({ data: JSON.stringify({ type, data }) });
  }
}
class GeometryObserver { observe() {} unobserve() {} disconnect() {} }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});
const rows = (count: number) => Array.from({ length: count }, (_, i) => ({
  id: i + 1, track_id: null, title: `History track ${i + 1}`, artist_name: 'History artist',
  album_title: 'History album', source: 'qobuz', source_id: String(700 + i), album_id: null,
  duration_ms: 180000, listened_at: `2026-09-18T12:0${i}:00Z`, zone_id: 99,
  cover_url: null, context_type: 'playlist', context_id: 'playlist-42',
  context_position: i, context_name: 'Four-track playlist',
}));
const payload = (count: number) => ({ items: rows(count), total: count });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
let target: HTMLDivElement;
let component: ReturnType<typeof mount> | null;
let getCount: number;
let deleteCount: number;
let activeGets: number;
let maxActiveGets: number;
let serverCount: number;
let getReply: () => Response | Promise<Response>;
let deleteReply: () => Response | Promise<Response>;
let hidden: boolean;

async function settle() {
  await vi.advanceTimersByTimeAsync(0);
  for (let i = 0; i < 20; i++) { await Promise.resolve(); flushSync(); }
}
async function advance(ms: number) { await vi.advanceTimersByTimeAsync(ms); await settle(); }
async function openScreen() { component = mount(HistoriqueV2, { target }); await settle(); }
const group = () => target.querySelector<HTMLButtonElement>('button.objet');
const groupCount = () => group()?.querySelector('.ocompte')?.textContent;
function visibility(value: boolean) {
  hidden = value;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-18T12:30:00Z'));
  hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  playbackHistory.clear();
  currentZoneId.set(1);
  zones.set([{ id: 1, name: 'Selected zone', state: 'stopped' }, { id: 99, name: 'Other room', state: 'playing' }] as never);
  getCount = deleteCount = activeGets = maxActiveGets = 0;
  serverCount = 1;
  getReply = () => response(payload(serverCount));
  deleteReply = () => { serverCount = 0; return response({}); };
  vi.stubGlobal('ResizeObserver', GeometryObserver);
  vi.stubGlobal('IntersectionObserver', GeometryObserver);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/library/history')) {
      if (init?.method === 'DELETE') { deleteCount++; return await deleteReply(); }
      expect(url).toContain('limit=100');
      getCount++;
      activeGets++;
      maxActiveGets = Math.max(maxActiveGets, activeGets);
      try { return await getReply(); } finally { activeGets--; }
    }
    if (url.includes('/radio-favorites')) return response([]);
    throw new Error(`Unexpected request: ${url}`);
  }));
  vi.stubGlobal('WebSocket', Socket);
  tuneWS.connect();
  Socket.last.onopen?.();
  target = document.createElement('div');
  document.body.append(target);
  component = null;
});
afterEach(async () => {
  if (component) await unmount(component);
  component = null;
  tuneWS.disconnect();
  target.remove();
  playbackHistory.clear();
  currentZoneId.set(null);
  zones.set([]);
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('#4038 / web #990 — visible history refresh', () => {
  it('updates an already expanded playlist from one to four tracks, including another zone', async () => {
    await openScreen();
    expect(groupCount()).toBe('1');
    group()!.click();
    await settle();
    expect(group()?.getAttribute('aria-expanded')).toBe('true');
    serverCount = 4;
    Socket.last.emit('playback.track_changed');
    await advance(100);
    expect(groupCount(), 'server history must refresh while the screen stays mounted').toBe('4');
    expect(group()?.getAttribute('aria-expanded')).toBe('true');
    for (let i = 1; i <= 4; i++) expect(target.textContent).toContain(`History track ${i}`);
  });

  it('catches a write visible only after fifteen seconds without another playback event', async () => {
    await openScreen();
    Socket.last.emit('playback.started');
    await advance(100);
    await advance(9900);
    expect(groupCount()).toBe('1');
    serverCount = 4;
    await advance(5000);
    expect(groupCount(), 'a playback event is not an acknowledgement of the history write').toBe('4');
    expect(getCount).toBe(5); // Initial, event, then 5s/10s/15s.
  });

  it('coalesces events and retains an invalidation received while a request is in flight', async () => {
    const first = deferred<Response>();
    getReply = () => first.promise;
    await openScreen();
    for (let i = 0; i < 12; i++) Socket.last.emit('playback.track_changed');
    await advance(100);
    expect(getCount).toBe(1);
    visibility(true);
    visibility(false);
    expect(getCount).toBe(1);
    getReply = () => response(payload(4));
    first.resolve(response(payload(1)));
    await settle();
    expect(getCount).toBe(2);
    expect(maxActiveGets).toBe(1);
    expect(groupCount()).toBe('4');
  });

  it('ignores position, levels, snapshots and resume, but refreshes on reconnection', async () => {
    await openScreen();
    for (const type of ['playback.position', 'playback.audio_levels', 'snapshot', 'zone.updated', 'playback.resumed']) {
      Socket.last.emit(type);
    }
    await advance(200);
    expect(getCount).toBe(1);
    serverCount = 4;
    Socket.last.onopen?.(); // Real tuneWS turns this into _connected.
    await advance(100);
    expect(groupCount()).toBe('4');
  });

  it('does not request while hidden and immediately refreshes on becoming visible', async () => {
    await openScreen();
    Socket.last.emit('playback.started');
    visibility(true);
    await advance(15000);
    Socket.last.emit('playback.track_changed');
    await advance(100);
    expect(getCount).toBe(1);
    serverCount = 4;
    visibility(false);
    await settle();
    expect(groupCount()).toBe('4');
    expect(getCount).toBe(2);
  });

  it('keeps the last successful snapshot on an HTTP error and later catches up', async () => {
    await openScreen();
    getReply = () => response({ error: 'temporary history failure' }, 503);
    await advance(5000);
    expect(groupCount()).toBe('1');
    getReply = () => response(payload(4));
    await advance(5000);
    expect(groupCount()).toBe('4');
  });

  it('does not resurrect cleared history from a pre-delete request', async () => {
    await openScreen();
    const old = deferred<Response>();
    getReply = () => old.promise;
    await advance(5000);
    expect(activeGets).toBe(1);
    target.querySelector<HTMLButtonElement>('button.danger')!.click();
    await settle();
    expect(deleteCount).toBe(1);
    expect(group()).toBeNull();
    const fresh = deferred<Response>();
    getReply = () => fresh.promise;
    old.resolve(response(payload(1)));
    await settle();
    expect(group(), 'old GET must not restore the deleted playlist').toBeNull();
    expect(maxActiveGets).toBe(1);
    fresh.resolve(response(payload(0)));
    await settle();
    expect(group()).toBeNull();
  });

  it('preserves history when clearing fails', async () => {
    await openScreen();
    deleteReply = () => response({ error: 'delete refused' }, 500);
    target.querySelector<HTMLButtonElement>('button.danger')!.click();
    await settle();
    expect(deleteCount).toBe(1);
    expect(groupCount()).toBe('1');
  });

  it('cancels subscriptions and timers on unmount and ignores an outstanding result', async () => {
    await openScreen();
    const old = deferred<Response>();
    getReply = () => old.promise;
    await advance(5000);
    Socket.last.emit('playback.started');
    await unmount(component!);
    component = null;
    const count = getCount;
    Socket.last.emit('playback.track_changed');
    visibility(false);
    old.resolve(response(payload(4)));
    await advance(20000);
    expect(getCount).toBe(count);
    expect(target.textContent).toBe('');
  });
});
