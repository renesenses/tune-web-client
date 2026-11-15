// @vitest-environment jsdom
//
// tune-server-rust#7394 / web#2618 (Régis, fils 2524 et 2592 ; discussions
// #7481 et #8366, go de Bertrand du 12/11/2026, rc12) — chaque playlist
// s'affiche en liste de titres OU en pochettes, et le choix est retenu PAR
// PLAYLIST (locales, de service, mixtes). En pochettes, l'album complet
// s'atteint par son nom.
//
// web#2601 avait posé la bascule, mais un seul choix pour TOUTES les
// playlists : passer l'une en pochettes y mettait toutes les autres.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { locale } from '../i18n';
import { gestesNavigationService } from '../stores/navigation';
import { clePlaylistVue, lireVuePlaylist, ecrireVuePlaylist } from '../vuePlaylist';

vi.setConfig({ testTimeout: 60_000 });

const PISTES = [
  { id: 1, title: 'Alpha', artist_name: 'Un', album_title: 'Premier', cover_path: '/covers/a.jpg', album_id: 11, duration_ms: 1000, source: 'local' },
  { id: 2, title: 'Beta', artist_name: 'Deux', album_title: 'Second', cover_path: '/covers/b.jpg', album_id: 12, duration_ms: 1000, source: 'local' },
];
const PISTES_QOBUZ = [
  { id: null, title: 'So What', artist_name: 'Miles Davis', album_title: 'Kind of Blue', source: 'qobuz', source_id: '19512572',
    album_id: '0886443927087', cover_path: 'https://c/kob.jpg', duration_ms: 1000 },
];
const K = (s: string) => `tune_v2_ecran_${s}`;

class Inerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(typeof url === 'string' ? url : url?.url ?? '');
    const c = /\/playlists\/\d+\/tracks/.test(u) ? PISTES : /\/streaming\/qobuz\/playlists\/[^/]+\/tracks/.test(u) ? PISTES_QOBUZ : [];
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
async function monter(item: unknown): Promise<HTMLDivElement> {
  if (monte) { unmount(monte); monte = null; hote?.remove(); }
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistDetailV2, { target: hote, props: { item, onClose: () => {} } as any });
  flushSync();
  await tourner();
  return hote;
}
const locale42 = { kind: 'local', pl: { id: 42, name: 'Nocturnes', track_count: 2 } };
const locale43 = { kind: 'local', pl: { id: 43, name: 'Matin', track_count: 2 } };
const clic = (el: Element | null) => { (el as HTMLElement).click(); flushSync(); };

describe('#7394 — la clé d’une playlist', () => {
  it('locale, de service ; rien sans identifiant', () => {
    expect(clePlaylistVue(locale42 as any)).toBe('local:42');
    expect(clePlaylistVue({ kind: 'streaming', service: 'qobuz', pl: { source_id: '123' } } as any)).toBe('qobuz:123');
    expect(clePlaylistVue({ kind: 'local', pl: { id: null } } as any)).toBeNull();
    expect(clePlaylistVue(null)).toBeNull();
  });

  it('sans choix propre, le dernier choix fait ; un choix propre l’emporte', () => {
    expect(lireVuePlaylist('local:1')).toBe('liste');
    ecrireVuePlaylist('pochettes', 'local:1');
    expect(lireVuePlaylist('local:2'), 'nouvelle playlist : dernier choix').toBe('pochettes');
    ecrireVuePlaylist('liste', 'local:2');
    expect(lireVuePlaylist('local:1'), 'la première garde le sien').toBe('pochettes');
    expect(lireVuePlaylist('local:2')).toBe('liste');
  });
});

describe('#7394 — écran monté', () => {
  it('🔴 deux playlists, deux vues retenues chacune', async () => {
    let h = await monter(locale42);
    clic(h.querySelector('[data-vue="pochettes"]'));
    expect(h.querySelector('[data-pgrille]')).not.toBeNull();
    h = await monter(locale43);
    clic(h.querySelector('[data-vue="liste"]'));
    expect(h.querySelector('[data-pgrille]')).toBeNull();
    // Retour sur la première : toujours en pochettes (avant : liste, le dernier choix global).
    h = await monter(locale42);
    expect(h.querySelector('[data-pgrille]'), 'la vue de la playlist 42 n’est pas retenue').not.toBeNull();
    h = await monter(locale43);
    expect(h.querySelector('[data-pgrille]')).toBeNull();
    expect(localStorage.getItem(K('v2.playlist.vue.local:42'))).toBe('pochettes');
    expect(localStorage.getItem(K('v2.playlist.vue.local:43'))).toBe('liste');
  });

  it('🔴 une playlist de service retient aussi la sienne', async () => {
    const qobuz = { kind: 'streaming', service: 'qobuz', pl: { source_id: 'P9', name: 'Jazz', track_count: 1, duration_ms: 0 } };
    let h = await monter(qobuz);
    clic(h.querySelector('[data-vue="pochettes"]'));
    h = await monter(locale42);
    clic(h.querySelector('[data-vue="liste"]'));
    h = await monter(qobuz);
    expect(h.querySelector('[data-pgrille]')).not.toBeNull();
    expect(localStorage.getItem(K('v2.playlist.vue.qobuz:P9'))).toBe('pochettes');
  });

  it('rien n’est écrit au montage (#1650)', async () => {
    await monter(locale42);
    expect(Object.keys(localStorage).filter((k) => /v2\.playlist\.vue/.test(k))).toEqual([]);
  });

  it('🔴 en pochettes, le nom de l’album ouvre l’album complet', async () => {
    const ouvrirAlbum = vi.fn();
    gestesNavigationService.set({ ouvrirAlbum, ouvrirArtiste: vi.fn() } as any);
    const qobuz = { kind: 'streaming', service: 'qobuz', pl: { source_id: 'P9', name: 'Jazz', track_count: 1, duration_ms: 0 } };
    const h = await monter(qobuz);
    clic(h.querySelector('[data-vue="pochettes"]'));
    const lien = h.querySelector('[data-pgrille] [data-palbum]');
    expect(lien, 'aucun accès à l’album dans la vue en pochettes').not.toBeNull();
    expect(lien!.textContent).toBe('Kind of Blue');
    clic(lien);
    expect(ouvrirAlbum).toHaveBeenCalledWith(expect.objectContaining({ service: 'qobuz', albumId: '0886443927087' }));
  });

  it('CONTRE-ÉPREUVE : sans geste de navigation, le nom de l’album reste du texte', async () => {
    const h = await monter({ kind: 'streaming', service: 'qobuz', pl: { source_id: 'P9', name: 'Jazz', track_count: 1, duration_ms: 0 } });
    clic(h.querySelector('[data-vue="pochettes"]'));
    expect(h.querySelector('[data-palbum]')).toBeNull();
    expect(h.querySelector('[data-pgrille]')!.textContent).toContain('Kind of Blue');
  });
});
