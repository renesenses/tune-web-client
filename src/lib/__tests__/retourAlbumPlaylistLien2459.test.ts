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
import { preferences } from '../stores/preferences';

// #2459, signalement du 10/11 (rc11, malgré #2460) : le LIEN d'album de la
// colonne Album (pas seulement « Aller à l'album » du menu), et le titre Qobuz
// d'une playlist LOCALE. Même banc que `retourAlbumPlaylist2459.test.ts`.

vi.setConfig({ testTimeout: 30_000 });
const ALBUM = { id: 55, title: 'Album témoin', artist_name: 'Artiste témoin' };
const PISTE = { id: 91, title: 'Piste de la playlist', album_id: 55, album_title: ALBUM.title,
  artist_name: ALBUM.artist_name, source: 'local', file_path: '/music/temoin.flac' };
const DISTANTE = { ...PISTE, id: null, source: 'qobuz', source_id: 'q91', album_id: 'q55' };
/** Un titre Qobuz rangé dans une playlist Tune (locale) : ligne mixte. */
const QOBUZ_EN_LOCALE = { ...DISTANTE, title: 'Titre Qobuz de la playlist locale', album_title: 'Album Qobuz témoin' };
const LOCALE = { id: 3, name: 'Soirée témoin', track_count: 2 };
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
  if (/^\/playlists\/3\/tracks/.test(p)) return [PISTE, QOBUZ_EN_LOCALE];
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
  // La colonne Album affichée (Expert), comme chez le testeur : son nom est le lien.
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' as never,
    v2Colonnes: { ...p.v2Colonnes, expert: ['artist', 'album'] as never } }));
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
type Playlist = 'local' | 'qobuz';
type Ligne = 'locale' | 'qobuz';
type Geste = 'lien' | 'menu';
/** La ligne de piste du détail de playlist, par son titre. */
function ligneDe(titre: string): HTMLElement {
  const l = [...hote.querySelectorAll<HTMLElement>('.v2-pldetail .tracks [role="row"]')]
    .find((r) => r.textContent?.includes(titre));
  expect(l, `la ligne « ${titre} » doit être dans la playlist`).toBeDefined();
  return l!;
}
async function ouvrirAlbum(playlist: Playlist, ligne: Ligne, geste: Geste) {
  composant = mount(ShellV2, { target: hote }); flushSync(); await stabiliser();
  activeView.set('playlists'); flushSync(); await stabiliser();
  if (playlist === 'qobuz') {
    const b = [...hote.querySelectorAll<HTMLButtonElement>('.srcs button')].find(b => b.textContent?.includes('qobuz'));
    expect(b, 'le filtre Qobuz de la vraie liste doit être présent').toBeDefined();
    b!.click(); flushSync(); await stabiliser();
  }
  cliquer(playlist === 'local' ? '.card.local button.meta' : '.card button.meta');
  await stabiliser();
  expect(hote.querySelector('.v2-pldetail'), 'la playlist de départ doit être ouverte').not.toBeNull();
  const depart = history.state;
  const l = ligneDe(ligne === 'locale' ? PISTE.title : playlist === 'local' ? QOBUZ_EN_LOCALE.title : DISTANTE.title);
  if (geste === 'lien') {
    const lien = l.querySelector<HTMLButtonElement>('button.lien-album');
    expect(lien, 'le nom d’album de la ligne doit être un lien').not.toBeNull();
    lien!.click(); flushSync();
  } else {
    l.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click(); flushSync(); await stabiliser();
    const aller = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find(b => b.textContent?.trim() === get(t)('library.goToAlbum'));
    expect(aller, 'le vrai menu doit proposer Aller à l’album').toBeDefined();
    aller!.click(); flushSync();
  }
  await stabiliser();
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
const CAS: [Playlist, Ligne, Geste][] = [
  ['local', 'locale', 'lien'],
  ['local', 'qobuz', 'lien'],
  ['local', 'qobuz', 'menu'],
  ['qobuz', 'qobuz', 'lien'],
];
for (const [playlist, ligne, geste] of CAS) {
  describe(`playlist ${playlist}, titre ${ligne}, ${geste} d’album → retour (#2459, 10/11)`, () => {
    for (const retour of ['bouton', 'navigateur'] as const) {
      it(`${retour} retrouve la playlist de départ en un seul retour`, async () => {
        const depart = await ouvrirAlbum(playlist, ligne, geste);
        if (retour === 'bouton') await retourDuBouton(); else await reculer();
        await stabiliser();
        expect(get(activeView), 'un seul retour depuis l’album doit rendre les playlists').toBe('playlists');
        expect(history.state, 'le retour doit rendre l’entrée précise de la playlist, sans cran intermédiaire').toEqual(depart);
        expect(hote.querySelector('.v2-pldetail')?.textContent, 'la playlist de départ doit être rouverte, pas seulement son gestionnaire')
          .toContain(playlist === 'local' ? LOCALE.name : QOBUZ.name);
        await reculer(); await stabiliser();
        expect(get(activeView), 'le retour suivant doit rester dans le gestionnaire de playlists').toBe('playlists');
        expect(hote.querySelector('.v2-pldetail'), 'la restauration ne doit pas réempiler la playlist').toBeNull();
        expect(appels.filter(a => a.method !== 'GET' && /playback|queue|\/zones\//.test(a.url)), 'naviguer ne doit jamais déclencher une lecture').toEqual([]);
      });
    }
  });
}
