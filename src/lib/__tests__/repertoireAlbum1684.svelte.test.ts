// @vitest-environment jsdom
// #1684 / tune-server-rust#4907 — the real album detail controls its preferred
// music directory through the server contract, including automatic fallback.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import { locale } from '../i18n';
import type { Album } from '../types';

const ID = 4907;
const ROOT_A = '/music/compact disc';
const ROOT_B = '/music/high resolution';
const ALBUM = { id: ID, title: 'Copies', artist_name: 'Artiste' } as Album;
const COPIES = [
  { racine: ROOT_A, format: 'flac', sample_rate: 44100, bit_depth: 16, pistes: 2, joignable: true, prefere: false },
  { racine: ROOT_B, format: 'flac', sample_rate: 96000, bit_depth: 24, pistes: 2, joignable: true, prefere: false },
];
const response = (body: unknown, status = 200) => ({
  ok: status < 400, status, statusText: status === 404 ? 'Not Found' : 'OK',
  headers: new Headers({ 'Content-Type': 'application/json' }),
  text: async () => JSON.stringify(body),
  json: async () => body,
} as unknown as Response);
const wait = () => new Promise((resolve) => setTimeout(resolve, 0));
async function until(predicate: () => boolean, limit = 4000) {
  const end = Date.now() + limit;
  while (!predicate() && Date.now() < end) { await wait(); flushSync(); }
  expect(predicate()).toBe(true);
}
class Observer { observe() {} unobserve() {} disconnect() {} }

interface Call { url: string; method: string; body: unknown }
let calls: Call[];
let copies: unknown;
let preference: string | null;
let failSave: boolean;
let host: HTMLDivElement;
let component: Record<string, unknown> | null;

beforeEach(() => {
  locale.set('fr');
  calls = [];
  copies = COPIES;
  preference = null;
  failSave = false;
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });
    if (url.endsWith(`/library/albums/${ID}/repertoire-prefere`)) {
      if (method !== 'GET' && failSave) return response({ error: 'failed' }, 500);
      if (method === 'PUT') preference = (body as { racine: string }).racine;
      if (method === 'DELETE') preference = null;
      return response({ album_id: ID, racine: preference, retire: method === 'DELETE' });
    }
    if (url.endsWith(`/library/albums/${ID}`)) {
      return response({ ...ALBUM, ...(copies === undefined ? {} : { exemplaires: copies }) });
    }
    return response([]);
  }));
  host = document.createElement('div');
  document.body.appendChild(host);
  component = null;
});

afterEach(() => {
  if (component) unmount(component);
  host.remove();
  vi.unstubAllGlobals();
});

function mountAlbum(props: Record<string, unknown> = {}) {
  component = mount(AlbumDetailV2, { target: host, props: { album: ALBUM, onClose: () => {}, ...props } });
  flushSync();
}
const selector = () => host.querySelector<HTMLSelectElement>('select[data-album-source]');
const preferenceCalls = () => calls.filter((call) => call.url.endsWith('/repertoire-prefere'));

describe('preferred album directory', () => {
  it('shows distinct roots and saves a choice, then restores automatic selection', async () => {
    mountAlbum();
    await until(() => selector() !== null);
    expect([...selector()!.options].map((option) => option.value)).toEqual(['', ROOT_A, ROOT_B]);
    expect(selector()!.textContent).toContain('96 kHz');
    selector()!.value = ROOT_B;
    selector()!.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => preferenceCalls().some((call) => call.method === 'PUT'));
    expect(preferenceCalls().find((call) => call.method === 'PUT')?.body).toEqual({ racine: ROOT_B });
    await until(() => selector()?.value === ROOT_B && !selector()?.disabled);
    selector()!.value = '';
    selector()!.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => preferenceCalls().some((call) => call.method === 'DELETE'));
    await until(() => selector()?.value === '' && !selector()?.disabled);
  });

  it('retains the previous choice and reports an unsuccessful save', async () => {
    preference = ROOT_A;
    mountAlbum();
    await until(() => selector()?.value === ROOT_A);
    failSave = true;
    selector()!.value = ROOT_B;
    selector()!.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => host.querySelector('[role="alert"]') !== null);
    expect(selector()!.value).toBe(ROOT_A);
    expect(preference).toBe(ROOT_A);
  });

  it('does not query the preference route when an older server omits exemplaires', async () => {
    copies = undefined;
    mountAlbum();
    await until(() => calls.some((call) => call.url.endsWith(`/library/albums/${ID}`)));
    await wait(); flushSync();
    expect(selector()).toBeNull();
    expect(preferenceCalls()).toEqual([]);
  });

  it('does not expose local directories for a remote album', async () => {
    mountAlbum({ depot: { id: 'remote' } });
    await wait(); flushSync();
    expect(selector()).toBeNull();
    expect(calls.some((call) => call.url.endsWith(`/library/albums/${ID}`))).toBe(false);
  });
});
