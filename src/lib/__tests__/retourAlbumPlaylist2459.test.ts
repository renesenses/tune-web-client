// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setImmediate as finDuTour } from 'node:timers/promises';
import { flushSync, mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, pendingLibraryAlbum, vueDeRetour } from '../stores/navigation';
import { albums } from '../stores/library';
import { ficheAlbumService } from '../stores/streaming';
import { detailOuvert } from '../historiqueCoquille';
import { t } from '../i18n';
import { reculer } from './reculer';

vi.setConfig({ testTimeout: 30_000 });
const ALBUM = { id: 55, title: 'Album témoin', artist_name: 'Artiste témoin' };
const PISTE = { id: 91, title: 'Piste de la playlist', album_id: 55, album_title: ALBUM.title,
  artist_name: ALBUM.artist_name, source: 'local', file_path: '/music/temoin.flac' };
const DISTANTE = { ...PISTE, id: null, source: 'qobuz', source_id: 'q91', album_id: 'q55' };
const LOCALE = { id: 3, name: 'Soirée témoin', track_count: 1 };
const QOBUZ = { source_id: 'q777', name: 'Playlist distante témoin', track_count: 1, source: 'qobuz' };
let hote: HTMLDivElement;
let composant: Record<string, any> | null;
let appels: { url: string; method: string }[];
async function stabiliser() {
  await finDuTour(); await tick(); flushSync();
  await finDuTour(); await tick(); flushSync();
}
function corps(url: string): unknown {
  const p = new URL(url, 'http://localhost').pathname.replace(/^\/api\/v1/, '');
  if (p === '/playlists') return [LOCALE];
  if (/^\/playlists\/3\/tracks/.test(p)) return [PISTE];
  if (p === '/streaming/services') return { qobuz: { authenticated: true, enabled: true } };
  if (p === '/streaming/qobuz/playlists') return [QOBUZ];
  if (/^\/streaming\/qobuz\/playlists\/q777/.test(p)) return [DISTANTE];
  if (/^\/streaming\/qobuz\/albums\/q55/.test(p)) return [DISTANTE];
  if (/^\/library\/albums\/55\/tracks/.test(p)) return [PISTE];
  if (p === '/library/albums/55') return ALBUM;
  if (p === '/library/albums') return [ALBUM];
  if (/\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\/|$)/.test(p)) return [];
  return {};
}
beforeEach(() => {
  appels = []; composant = null;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    appels.push({ url: String(url), method: (init?.method ?? 'GET').toUpperCase() });
    const data = corps(String(url));
    return { ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
      json: async () => data, text: async () => JSON.stringify(data) } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  for (const [prop, value] of [['clientHeight', 2000], ['clientWidth', 1400]] as const)
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value });
  localStorage.clear(); activeView.set('home'); pendingLibraryAlbum.set(null);
  vueDeRetour.set(null); ficheAlbumService.set(null); detailOuvert.set(null); albums.set([ALBUM] as any);
  history.replaceState(null, '', '/');
  hote = document.createElement('div'); document.body.appendChild(hote);
});
afterEach(async () => {
  if (composant) await unmount(composant); hote.remove();
  albums.set([]); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
function cliquer(selecteur: string) {
  const b = document.querySelector<HTMLButtonElement>(selecteur);
  expect(b, `geste disponible : ${selecteur}`).not.toBeNull();
  b!.click(); flushSync();
}
async function ouvrirAlbumDepuisPlaylist(source: 'local' | 'qobuz') {
  composant = mount(ShellV2, { target: hote }); flushSync(); await stabiliser();
  activeView.set('playlists'); flushSync(); await stabiliser();
  if (source === 'qobuz') {
    const b = [...hote.querySelectorAll<HTMLButtonElement>('.srcs button')].find(b => b.textContent?.includes('qobuz'));
    expect(b, 'le filtre Qobuz de la vraie liste doit être présent').toBeDefined();
    b!.click(); flushSync(); await stabiliser();
  }
  cliquer(source === 'local' ? '.card.local button.meta' : '.card button.meta');
  await stabiliser();
  expect(hote.querySelector('.v2-pldetail'), 'la playlist de départ doit être ouverte').not.toBeNull();
  const depart = history.state;
  cliquer('.v2-pldetail .tracks button[aria-haspopup="menu"]'); await stabiliser();
  const aller = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    .find(b => b.textContent?.trim() === get(t)('library.goToAlbum'));
  expect(aller, 'le vrai menu doit proposer Aller à l’album').toBeDefined();
  aller!.click(); flushSync(); await stabiliser();
  expect(hote.querySelector('.v2-detail'), 'le geste doit ouvrir la fiche album').not.toBeNull();
  return depart;
}
function retourDuBouton(): Promise<void> {
  return new Promise((resolve, reject) => {
    const filet = setTimeout(() => reject(new Error('le Retour de l’album doit reculer vers la playlist de départ')), 4000);
    window.addEventListener('popstate', () => { clearTimeout(filet); resolve(); }, { once: true });
    cliquer('.v2-detail button.close');
  });
}
for (const source of ['local', 'qobuz'] as const) {
  describe(`playlist ${source} → album → retour (#2459 / serveur #7226)`, () => {
    for (const geste of ['bouton', 'navigateur'] as const) {
      it(`${geste} retrouve la playlist de départ en un seul retour`, async () => {
        const depart = await ouvrirAlbumDepuisPlaylist(source);
        if (geste === 'bouton') await retourDuBouton(); else await reculer();
        await stabiliser();
        expect(get(activeView), 'un seul retour depuis l’album doit rendre les playlists').toBe('playlists');
        expect(history.state, 'le retour doit rendre l’entrée précise de la playlist, sans cran intermédiaire').toEqual(depart);
        expect(hote.querySelector('.v2-pldetail')?.textContent, 'la playlist de départ doit être rouverte, pas seulement son gestionnaire')
          .toContain(source === 'local' ? LOCALE.name : QOBUZ.name);
        await reculer(); await stabiliser();
        expect(get(activeView), 'le retour suivant doit rester dans le gestionnaire de playlists').toBe('playlists');
        expect(hote.querySelector('.v2-pldetail'), 'la restauration ne doit pas réempiler la playlist').toBeNull();
        expect(appels.filter(a => a.method !== 'GET' && /playback|queue|\/zones\//.test(a.url)), 'naviguer ne doit jamais déclencher une lecture').toEqual([]);
      });
    }
  });
}
