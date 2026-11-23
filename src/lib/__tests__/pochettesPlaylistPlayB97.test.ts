// @vitest-environment jsdom
//
// Recette rc12 du 15/11/2026 sur la .18, point B97 : en VUE POCHETTES d'une
// fiche playlist (`PlaylistDetailV2`, web#2914/#3038), la vignette n'avait
// PAS de Play au centre, et un clic n'importe où sur la pochette démarrait le
// morceau. Bertrand attend le geste des grilles d'albums (`PochetteActions`,
// comme `LibraryV2`) :
//   - un bouton Play au centre (au survol ; toujours visible en tactile) ;
//   - un clic sur ce Play lance la lecture ;
//   - un clic ailleurs sur la pochette NE lance PAS la lecture : il ouvre
//     l'album de la piste.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { locale } from '../i18n';
import { activeView, gestesNavigationService, pendingLibraryAlbum } from '../stores/navigation';
import { currentZoneId } from '../stores/zones';

vi.setConfig({ testTimeout: 60_000 });

const PISTES = [
  { id: 138675, title: 'Un', album_id: 12394, album_title: '2+', cover_path: '0b51f37e', source: 'local', duration_ms: 1000 },
  { id: 132512, title: 'Deux', album_id: 11871, album_title: 'Kiwanuka', cover_path: 'af375b94', source: 'local', duration_ms: 1000 },
  // Sans album ouvrable : la pochette n'ouvre rien, et ne lit rien non plus.
  { id: 132506, title: 'Trois', album_id: null, album_title: null, cover_path: null, source: 'local', duration_ms: 1000 },
];
let appels: { url: string; method: string }[] = [];

class Inerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  appels = [];
  currentZoneId.set(1);
  activeView.set('playlists');
  pendingLibraryAlbum.set(null);
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(typeof url === 'string' ? url : url?.url ?? '');
    appels.push({ url: u, method: (init?.method ?? 'GET').toUpperCase() });
    const c = /\/playlists\/\d+\/tracks/.test(u) ? PISTES : [];
    return {
      ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
      json: async () => c, text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  gestesNavigationService.set(null);
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function tourner(n = 8) { for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } }
async function enPochettes(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistDetailV2, {
    target: hote,
    props: { item: { kind: 'local', pl: { id: 30, name: 'Recette B97', track_count: PISTES.length } }, onClose: () => {} } as any,
  });
  flushSync();
  await tourner();
  (hote.querySelector('[data-vue="pochettes"]') as HTMLElement).click();
  flushSync();
  return hote;
}
const lectures = () => appels.filter((a) => a.method !== 'GET' && /play|queue|zones/.test(a.url));
const vignettes = (h: HTMLElement) => [...h.querySelectorAll<HTMLElement>('[data-pgrille] [data-pvig]')];

describe('B97 — vue pochettes d’une playlist : le geste des grilles d’albums', () => {
  it('🔴 chaque vignette porte un bouton Play au centre, l’enveloppe des grilles d’albums', async () => {
    const h = await enPochettes();
    const v = vignettes(h);
    expect(v.length).toBe(PISTES.length);
    for (const x of v) {
      expect(x.querySelector('.pa'), 'la vignette n’emploie pas PochetteActions').not.toBeNull();
      const play = x.querySelector<HTMLButtonElement>('.pa > button.centre');
      expect(play, 'pas de Play au centre de la pochette').not.toBeNull();
      expect(play!.getAttribute('aria-label')).toMatch(/Lire|Play/i);
    }
  });

  it('🔴 un clic sur la pochette (hors Play) ne lance PAS la lecture et ouvre l’album', async () => {
    const h = await enPochettes();
    const pochette = vignettes(h)[0].querySelector<HTMLElement>('.pa > button.ouvrir');
    expect(pochette, 'la pochette n’ouvre pas l’album').not.toBeNull();
    pochette!.click(); flushSync(); await tourner(2);
    expect(lectures(), 'le clic sur la pochette a lancé la lecture').toEqual([]);
    expect(get(activeView)).toBe('library');
    expect(get(pendingLibraryAlbum)).toBe(12394);
  });

  it('un clic sur la pochette d’une piste sans album ne lance rien non plus', async () => {
    const h = await enPochettes();
    const v = vignettes(h)[2];
    expect(v.querySelector('.pa > button.ouvrir')).toBeNull();
    (v.querySelector('.pa') as HTMLElement).click();
    v.click(); flushSync(); await tourner(2);
    expect(lectures()).toEqual([]);
    expect(get(activeView)).toBe('playlists');
  });

  it('🔴 un clic sur le Play lance la lecture, et n’ouvre pas l’album', async () => {
    const h = await enPochettes();
    vignettes(h)[1].querySelector<HTMLButtonElement>('.pa > button.centre')!.click();
    flushSync(); await tourner(2);
    expect(lectures().length, 'le Play n’a pas lancé la lecture').toBeGreaterThan(0);
    expect(get(activeView)).toBe('playlists');
    expect(get(pendingLibraryAlbum)).toBeNull();
  });

  it('la vignette n’est plus un bouton de lecture plein cadre', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/PlaylistDetailV2.svelte'), 'utf-8');
    expect(src).not.toMatch(/<button[^>]*class="pvig"[^>]*onclick=\{\(\) => playFrom\(i\)\}/);
    expect(src).toMatch(/<PochetteActions onLire=\{injouable \? null : \(\) => playFrom\(i\)\} onOuvrir=\{versAlbum\}/);
  });
});
