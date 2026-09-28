// @vitest-environment jsdom
// #1688 / server #4907 — the real Settings screen saves the effective order
// of configured music directories; older servers keep the existing controls.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { locale } from '../i18n';

const ROOTS = ['/music/a', '/music/b', '/music/c'];
const response = (body: unknown, status = 200) => ({
  ok: status < 400, status, statusText: status === 404 ? 'Not Found' : 'OK',
  headers: new Headers({ 'Content-Type': 'application/json' }),
  text: async () => JSON.stringify(body),
  json: async () => body,
} as unknown as Response);
const wait = () => new Promise((resolve) => setTimeout(resolve, 0));
async function until(predicate: () => boolean, limit = 5000) {
  const end = Date.now() + limit;
  while (!predicate() && Date.now() < end) { await wait(); flushSync(); }
  expect(predicate()).toBe(true);
}
class Observer { observe() {} unobserve() {} disconnect() {} }
interface Call { url: string; method: string; body: unknown }
let calls: Call[];
let order: string[];
let oldServer: boolean;
let failSave: boolean;
let host: HTMLDivElement;
let component: Record<string, unknown> | null;

beforeEach(() => {
  locale.set('fr');
  calls = [];
  order = [...ROOTS];
  oldServer = false;
  failSave = false;
  v2SettingsTarget.set({ tab: 'library', section: 'musicDirs' });
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { setTimeout(() => fn(0), 0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });
    if (url.endsWith('/library/repertoires/ordre')) {
      if (oldServer) return response({ error: 'missing' }, 404);
      if (method === 'PUT') {
        if (failSave) return response({ error: 'failed' }, 500);
        order = (body as { ordre: string[] }).ordre;
      }
      return response({ ordre: order, music_dirs: ROOTS, regle: order });
    }
    if (url.endsWith('/system/config')) return response({ music_dirs: ROOTS });
    return response([]);
  }));
  host = document.createElement('div');
  document.body.appendChild(host);
  component = null;
});

afterEach(() => {
  if (component) unmount(component);
  host.remove();
  v2SettingsTarget.set(null);
  vi.unstubAllGlobals();
});

function mountSettings() {
  component = mount(SettingsV2, { target: host, props: {} });
  flushSync();
}
const card = () => host.querySelector<HTMLElement>('section[data-section="musicDirs"]');
const rows = () => [...(card()?.querySelectorAll('.dir .dp') ?? [])].map((node) => node.textContent?.trim());
const move = (path: string, direction: 'up' | 'down') =>
  card()?.querySelector<HTMLButtonElement>(`button[aria-label="${direction === 'up' ? 'Monter' : 'Descendre'} ${path}"]`);
const puts = () => calls.filter((call) => call.url.endsWith('/library/repertoires/ordre') && call.method === 'PUT');

describe('directory order in Library settings', () => {
  it('moves a directory and sends the complete ordered list to the server', async () => {
    mountSettings();
    await until(() => rows().length === 3 && move(ROOTS[1], 'up') !== null);
    expect(rows()).toEqual(ROOTS);
    expect(card()?.textContent).toContain('qualité égale');
    expect(move(ROOTS[0], 'up')?.disabled).toBe(true);
    move(ROOTS[1], 'up')!.click();
    await until(() => puts().length === 1);
    expect(puts()[0].body).toEqual({ ordre: [ROOTS[1], ROOTS[0], ROOTS[2]] });
    await until(() => rows()[0] === ROOTS[1]);
    expect(move(ROOTS[1], 'up')?.disabled).toBe(true);
  });

  it('keeps the previous order and reports a failed save', async () => {
    failSave = true;
    mountSettings();
    await until(() => move(ROOTS[1], 'up') !== null);
    move(ROOTS[1], 'up')!.click();
    await until(() => card()?.querySelector('[role="alert"]') !== null);
    expect(rows()).toEqual(ROOTS);
    expect(order).toEqual(ROOTS);
  });

  it('leaves existing folder controls usable on an older server', async () => {
    oldServer = true;
    mountSettings();
    await until(() => rows().length === 3);
    await wait(); flushSync();
    expect(move(ROOTS[1], 'up')).toBeNull();
    expect(card()?.querySelector('input[placeholder="/Volumes/Musique"]')).not.toBeNull();
    expect(card()?.querySelectorAll('button.scan-dir')).toHaveLength(3);
  });
});
