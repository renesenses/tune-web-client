// @vitest-environment jsdom
//
// renesenses/tune-web-client#2549 (alec_eiffel, fil 2561, rc9) : « Tune Circle:
// can't share Qobuz Playlists ». Le partage d'une playlist de service avec un
// cercle n'existait que dans le menu « … » de la vignette ; la fiche ouverte
// d'une playlist (Qobuz ou locale) n'en avait aucune trace.
//
// Le témoin monte la FICHE, et suit le geste jusqu'à la fenêtre de partage :
// la demande posée, puis les pistes lues chez le service quand elle les demande.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { preparerLocale } from '../i18n';
import { circlePlugin } from '../circle';
import { demandeCercle } from '../circlePlaylists';

const appels: string[] = [];
beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  appels.length = 0;
  demandeCercle.set(null);
  vi.stubGlobal('fetch', vi.fn(async (entree: RequestInfo | URL) => {
    const url = String(entree);
    appels.push(url);
    let b: unknown = [];
    if (url.includes('/streaming/qobuz/playlists/77/tracks')) {
      b = [{ id: 't1', source_id: 't1', title: 'Berceuse', artist: 'X', duration_ms: 1000, source: 'qobuz' }];
    } else if (url.includes('/playlists/5/tracks')) {
      b = [{ id: 3, title: 'Locale', artist_name: 'Y', duration_ms: 1000, source: 'local' }];
    }
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => b, text: async () => JSON.stringify(b),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
});

const montes: { m: Record<string, any>; h: HTMLDivElement }[] = [];
afterEach(() => {
  for (const { m, h } of montes.splice(0)) { unmount(m); h.remove(); }
  circlePlugin.set(null);
  demandeCercle.set(null);
  vi.unstubAllGlobals();
});
const respirer = (ms = 60) => new Promise((r) => setTimeout(r, ms));
async function poser(item: unknown): Promise<HTMLDivElement> {
  const h = document.createElement('div');
  document.body.appendChild(h);
  const m = mount(PlaylistDetailV2, { target: h, props: { item, onClose: () => {} } as any });
  montes.push({ m, h });
  flushSync();
  await respirer();
  flushSync();
  return h;
}
const QOBUZ = {
  kind: 'streaming', service: 'qobuz',
  pl: { source_id: '77', name: 'Sleepy Mix', track_count: 1, duration_ms: 0, cover_path: null, source: 'qobuz' },
};
const LOCALE = { kind: 'local', pl: { id: 5, name: 'Dimanche', track_count: 1 } };
const greffonActif = () => circlePlugin.set({ name: 'circle', installed: true, enabled: true } as any);

describe('#2549 — partager une playlist avec un cercle depuis sa fiche', () => {
  it('🔴 playlist Qobuz : le bouton est là, et ouvre le partage avec ses pistes du service', async () => {
    greffonActif();
    const h = await poser(QOBUZ);
    const bouton = h.querySelector<HTMLButtonElement>('[data-partager-cercle]');
    expect(bouton, 'aucun bouton « Partager avec un cercle » sur la fiche Qobuz').not.toBeNull();
    expect(bouton!.textContent).toContain('Partager avec un cercle');
    bouton!.click();
    const d = get(demandeCercle);
    expect(d?.mode).toBe('partage');
    expect(d?.nom).toBe('Sleepy Mix');
    expect(d?.playlistLocale ?? null).toBeNull();
    const pistes = await d!.pistes();
    expect(pistes.map((p) => p.title)).toEqual(['Berceuse']);
    expect(appels.some((u) => u.includes('/streaming/qobuz/playlists/77/tracks'))).toBe(true);
  });

  it('playlist locale : même bouton, la copie est suivie (playlistLocale)', async () => {
    greffonActif();
    const h = await poser(LOCALE);
    h.querySelector<HTMLButtonElement>('[data-partager-cercle]')!.click();
    expect(get(demandeCercle)?.playlistLocale).toBe(5);
  });

  it('greffon Tune Circle absent : pas de bouton', async () => {
    circlePlugin.set('absent' as any);
    const h = await poser(QOBUZ);
    expect(h.querySelector('[data-partager-cercle]')).toBeNull();
  });
});
