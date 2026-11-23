// @vitest-environment jsdom
//
// Fil 3011 (Régis, 23/11/2026) — « Il serait plus cohérent que "retour" ramène
// systématiquement, et ce dans l'intégralité de TUNE, une seule étape en
// arrière. »
//
// Ses trois parcours, rejoués sur la VRAIE coquille (`ShellV2` montée, vrais
// clics), par le bouton Retour de l'écran ET par le Précédent du navigateur :
//
//   1. playlist → album Qobuz → onglet « Présentation » → Retour
//      vu : « À venir » ou la playlist, au hasard ; attendu : la playlist.
//   2. playlist → album Qobuz → « Voir l'artiste » → Retour → Retour
//      vu : l'album, puis « Lecture en cours » / « À venir » ; attendu :
//      l'album, puis la playlist.
//   3. playlist → album local → « Voir l'artiste » → Retour
//      vu : la Bibliothèque ; attendu : l'album, puis la playlist.
//
// La règle tenue ici : un Retour = UNE entrée dépilée. Un onglet de la fiche
// n'est pas une étape (rien n'est empilé), donc le Retour depuis
// « Présentation » rend l'écran d'avant l'album — et surtout jamais le repli
// « À venir » d'une fiche vidée.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setImmediate as finDuTour } from 'node:timers/promises';
import { flushSync, mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, pendingLibraryAlbum, vueDeRetour } from '../stores/navigation';
import { albums } from '../stores/library';
import { ficheAlbumDeRetour, ficheAlbumService, ficheArtisteService } from '../stores/streaming';
import { detailOuvert } from '../historiqueCoquille';
import { t } from '../i18n';
import { reculer } from './reculer';

vi.setConfig({ testTimeout: 30_000 });
const ALBUM = { id: 55, title: 'Album témoin', artist_name: 'Artiste témoin', artist_id: 7 };
const PISTE = { id: 91, title: 'Piste de la playlist', album_id: 55, album_title: ALBUM.title,
  artist_name: ALBUM.artist_name, artist_id: 7, source: 'local', file_path: '/music/temoin.flac' };
const DISTANTE = { ...PISTE, id: null, source: 'qobuz', source_id: 'q91', album_id: 'q55', artist_id: 'qa7' };
const LOCALE = { id: 3, name: 'Soirée témoin', track_count: 1 };
const QOBUZ = { source_id: 'q777', name: 'Playlist distante témoin', track_count: 1, source: 'qobuz' };
let hote: HTMLDivElement;
let composant: Record<string, any> | null;
async function stabiliser() {
  for (let i = 0; i < 3; i++) { await finDuTour(); await tick(); flushSync(); }
}
function corps(url: string): unknown {
  const p = new URL(url, 'http://localhost').pathname.replace(/^\/api\/v1/, '');
  if (p === '/playlists') return [LOCALE];
  if (/^\/playlists\/3\/tracks/.test(p)) return [PISTE];
  if (p === '/streaming/services') return { qobuz: { authenticated: true, enabled: true } };
  if (p === '/streaming/qobuz/playlists') return [QOBUZ];
  if (/^\/streaming\/qobuz\/playlists\/q777/.test(p)) return [DISTANTE];
  if (/^\/streaming\/qobuz\/albums\/q55\/description/.test(p)) return { texte: 'Une critique témoin.' };
  if (/^\/streaming\/qobuz\/albums\/q55/.test(p)) return [DISTANTE];
  if (/^\/streaming\/qobuz\/artists\/qa7$/.test(p)) return { id: 'qa7', name: ALBUM.artist_name };
  if (/^\/library\/albums\/55\/tracks/.test(p)) return [PISTE];
  if (p === '/library/albums/55') return ALBUM;
  if (p === '/library/albums') return [ALBUM];
  if (/^\/library\/artists\/7$/.test(p)) return { id: 7, name: ALBUM.artist_name };
  if (/\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\/|$)/.test(p)) return [];
  return {};
}
beforeEach(() => {
  composant = null;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const data = corps(String(url));
    return { ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
      json: async () => data, text: async () => JSON.stringify(data) } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  for (const [prop, value] of [['clientHeight', 2000], ['clientWidth', 1400]] as const)
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value });
  localStorage.clear(); activeView.set('home'); pendingLibraryAlbum.set(null);
  vueDeRetour.set(null); ficheAlbumService.set(null); ficheArtisteService.set(null); ficheAlbumDeRetour.set(null);
  detailOuvert.set(null); albums.set([ALBUM] as any);
  history.replaceState(null, '', '/');
  hote = document.createElement('div'); document.body.appendChild(hote);
});
afterEach(async () => {
  if (composant) await unmount(composant); hote.remove();
  albums.set([]); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
function cliquer(selecteur: string) {
  const b = hote.querySelector<HTMLButtonElement>(selecteur) ?? document.querySelector<HTMLButtonElement>(selecteur);
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
  // « Aller à l'album » : le même chemin que le nom d'album de la playlist
  // (`ouvertureAlbumDePiste`), par le vrai menu de la piste.
  cliquer('.v2-pldetail .tracks button[aria-haspopup="menu"]'); await stabiliser();
  const aller = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    .find(b => b.textContent?.trim() === get(t)('library.goToAlbum'));
  expect(aller, 'le vrai menu doit proposer Aller à l’album').toBeDefined();
  aller!.click(); flushSync(); await stabiliser();
  expect(hote.querySelector('.v2-detail'), 'le geste doit ouvrir la fiche album').not.toBeNull();
  return { depart, album: history.state };
}

/** Le bouton Retour d'un écran, attendu sur son `popstate` quand il recule. */
async function retourEcran(selecteur: string) {
  const avant = history.length;
  const vu = new Promise<void>((resolve) => {
    const filet = setTimeout(resolve, 1500);
    window.addEventListener('popstate', () => { clearTimeout(filet); resolve(); }, { once: true });
  });
  cliquer(selecteur);
  // Le `popstate` d'un `history.back()` arrive au tour SUIVANT : ce qui est à
  // l'écran entre les deux est vu par l'utilisateur. Vider la fiche avant
  // montrait le repli « À venir » — et y laissait Régis quand le recul
  // n'aboutissait pas.
  expect(hote.textContent, 'aucun écran « À venir » entre le clic et le retour').not.toContain(get(t)('v2.shell.soon' as any));
  await vu;
  await stabiliser();
  expect(history.length, 'un Retour ne doit jamais AJOUTER d’entrée à la pile').toBe(avant);
}
const retourAlbum = () => retourEcran('.v2-detail button.close');
const retourArtiste = () => retourEcran('.v2-fas .retour');

async function attendreAlbum(attendu: unknown, message: string) {
  // La fiche se rouvre APRÈS le `popstate` (une fiche locale recharge son
  // album) : on attend qu'elle soit là, sans compter les tours — sous charge,
  // trois tours ne suffisaient pas (relecture de web#3366).
  await vi.waitFor(() => {
    expect(hote.querySelector('.v2-detail')?.textContent ?? '', `${message} — la fiche album`).toContain(ALBUM.title);
  }, { timeout: 8000, interval: 20 });
  expect(hote.textContent, `${message} — jamais le repli « À venir »`).not.toContain(get(t)('v2.shell.soon' as any));
  expect(hote.querySelector('.v2-detail'), `${message} — la fiche album`).not.toBeNull();
  expect(hote.querySelector('.v2-detail')?.textContent, `${message} — le bon album`).toContain(ALBUM.title);
  expect(history.state, `${message} — l’entrée exacte de l’album`).toEqual(attendu);
}
function attendrePlaylist(depart: unknown, source: 'local' | 'qobuz', message: string) {
  expect(get(activeView), message).toBe('playlists');
  expect(history.state, `${message} — l’entrée exacte de la playlist`).toEqual(depart);
  expect(hote.querySelector('.v2-pldetail')?.textContent, `${message} — la playlist rouverte`)
    .toContain(source === 'local' ? LOCALE.name : QOBUZ.name);
}

for (const geste of ['bouton', 'navigateur'] as const) {
  const reculerAlbum = geste === 'bouton' ? retourAlbum : async () => { await reculer(); await stabiliser(); };
  const reculerArtiste = geste === 'bouton' ? retourArtiste : async () => { await reculer(); await stabiliser(); };

  describe(`fil 3011 — Retour = une étape (${geste})`, () => {
    it('1. playlist → album Qobuz → Présentation → Retour : la playlist, jamais « À venir »', async () => {
      const { depart } = await ouvrirAlbumDepuisPlaylist('qobuz');
      // web#3361 retire l'onglet (la présentation passe à côté de la
      // vignette) : sans onglet, la présentation est déjà affichée, et le
      // parcours se réduit à « album → Retour », qui doit rester juste.
      const onglet = hote.querySelector<HTMLButtonElement>('[data-onglet-album="presentation"]');
      if (onglet) { onglet.click(); flushSync(); await stabiliser(); }
      await reculerAlbum();
      expect(get(activeView), 'pas de repli « À venir » ni « Lecture en cours »').not.toBe('streamingalbum');
      attendrePlaylist(depart, 'qobuz', 'un seul Retour depuis la Présentation rend la playlist');
    });

    it('2. playlist → album Qobuz → Voir l’artiste → Retour → Retour : l’album, puis la playlist', async () => {
      const { depart, album } = await ouvrirAlbumDepuisPlaylist('qobuz');
      cliquer('.v2-detail .artist.lien'); await stabiliser();
      expect(get(activeView), 'le lien mène à la page artiste').toBe('streamingartist');
      await reculerArtiste();
      expect(get(activeView)).toBe('streamingalbum');
      await attendreAlbum(album, 'le premier Retour rend l’album Qobuz');
      await reculerAlbum();
      attendrePlaylist(depart, 'qobuz', 'le second Retour rend la playlist, pas « Lecture en cours »');
    });

    it('3. playlist → album local → Voir l’artiste → Retour : l’album, puis la playlist', async () => {
      const { depart, album } = await ouvrirAlbumDepuisPlaylist('local');
      cliquer('.v2-detail .artist.lien'); await stabiliser();
      expect(get(activeView), 'le lien mène à la page artiste').toBe('streamingartist');
      await reculerArtiste();
      expect(get(activeView)).toBe('library');
      await attendreAlbum(album, 'le Retour rend l’album local, pas la grille de la Bibliothèque');
      await reculerAlbum();
      attendrePlaylist(depart, 'local', 'le Retour suivant rend la playlist');
    });
  });
}

describe('fil 3011 — non-régression', () => {
  it('un DOUBLE clic sur Retour ne recule que d’une étape', async () => {
    const { album } = await ouvrirAlbumDepuisPlaylist('qobuz');
    cliquer('.v2-detail .artist.lien'); await stabiliser();
    expect(get(activeView)).toBe('streamingartist');
    const vu = new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
    const reculs = vi.spyOn(window.history, 'back');
    cliquer('.v2-fas .retour');
    cliquer('.v2-fas .retour');
    // Mesuré sur l'appel lui-même : jsdom peut fondre deux reculs en vol, un
    // navigateur non.
    expect(reculs, 'deux clics pendant le recul ne demandent qu’UN recul').toHaveBeenCalledTimes(1);
    await vu; await stabiliser();
    // Un second `popstate` éventuel aurait le temps d'arriver.
    await new Promise((r) => setTimeout(r, 100)); await stabiliser();
    expect(get(activeView), 'le second clic, pendant le recul, est ignoré').toBe('streamingalbum');
    await attendreAlbum(album, 'un double clic rend l’album, pas la playlist');
  });

  // Régis, 10 h 53 : « depuis la bibliothèque locale, tout marche ». Son
  // parcours qui marche reste vert, par le bouton comme par le navigateur.
  for (const geste of ['bouton', 'navigateur'] as const) {
    it(`Bibliothèque → album local → Voir l’artiste → Retour → Retour (${geste}) : l’album, puis la grille`, async () => {
      const reculerUn = async (sel: string) => {
        if (geste === 'bouton') await retourEcran(sel); else { await reculer(); await stabiliser(); }
      };
      composant = mount(ShellV2, { target: hote }); flushSync(); await stabiliser();
      activeView.set('library'); flushSync(); await stabiliser();
      const grille = history.state;
      cliquer('.grid .card button.meta'); await stabiliser();
      expect(hote.querySelector('.v2-detail'), 'la fiche album s’ouvre depuis la grille').not.toBeNull();
      const album = history.state;
      cliquer('.v2-detail .artist.lien'); await stabiliser();
      expect(get(activeView)).toBe('streamingartist');
      await reculerUn('.v2-fas .retour');
      expect(get(activeView)).toBe('library');
      await attendreAlbum(album, 'le Retour de l’artiste rend l’album de la Bibliothèque');
      await reculerUn('.v2-detail button.close');
      expect(get(activeView)).toBe('library');
      expect(hote.querySelector('.v2-detail'), 'le Retour de l’album rend la grille').toBeNull();
      expect(history.state, 'l’entrée exacte de la grille').toEqual(grille);
    });
  }

  it('playlist → album Qobuz → Retour, sans détour : la playlist (navigation simple)', async () => {
    const { depart } = await ouvrirAlbumDepuisPlaylist('qobuz');
    await retourAlbum();
    attendrePlaylist(depart, 'qobuz', 'le Retour simple reste juste');
  });

  it('l’entrée d’une fiche de service porte sa fiche, en valeurs simples (rechargement, clonage)', async () => {
    await ouvrirAlbumDepuisPlaylist('qobuz');
    const etat = history.state;
    expect(etat.vue).toBe('streamingalbum');
    // `history.state` survit au rechargement : il doit se cloner sans proxy.
    expect(() => structuredClone(etat)).not.toThrow();
    expect(typeof etat.fiche, 'la fiche est rangée en chaîne, jamais en objet').toBe('string');
    expect(JSON.parse(etat.fiche)).toMatchObject({ service: 'qobuz', id: 'q55', titre: ALBUM.title });
  });

  it('au rechargement, une fiche de service quittée est rouverte par le Précédent depuis son entrée', async () => {
    const { album } = await ouvrirAlbumDepuisPlaylist('qobuz');
    cliquer('.v2-detail .artist.lien'); await stabiliser();
    // Le rechargement : la coquille repart, les magasins sont vides, la pile
    // du navigateur est intacte.
    await unmount(composant!); composant = null;
    ficheAlbumService.set(null); ficheArtisteService.set(null); vueDeRetour.set(null); ficheAlbumDeRetour.set(null);
    composant = mount(ShellV2, { target: hote }); flushSync(); await stabiliser();
    await reculer(); await stabiliser();
    await attendreAlbum(album, 'le Précédent après rechargement rend l’album Qobuz');
  });
});
