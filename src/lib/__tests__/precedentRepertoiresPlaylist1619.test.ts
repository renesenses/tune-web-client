// @vitest-environment jsdom
//
// web#1619 — LE PRÉCÉDENT DU NAVIGATEUR REFAIT LE CHEMIN PARCOURU, dans les
// Répertoires et dans le détail d'une playlist.
//
// FabienM, fil 1955 (0.9.165), « Le BACK du navigateur mal géré » :
//
//   « dans un répertoire, le BACK devrait simuler le bouton Retour mais il
//     renvoie à la dernière page de 1er niveau (accueil, bibliothèque, ...)
//     alors que dans l'exemple il devrait remonter d'un répertoire »
//   « dans une playlist Qobuz, le BACK devrait simuler le bouton Retour mais
//     il renvoie à la dernière page de 1er niveau »
//
// Décision de Bertrand (26/09) : le Précédent refait le chemin parcouru. Un
// dossier ouvert à la main est une étape ; arrivé par « Localiser sur le
// disque » (#854), le Précédent REVIENT À L'ALBUM ; ouvrir une playlist
// empile une étape, et le Précédent referme le calque.
//
// CAUSE, lue dans le code : `BrowseView.navigateTo` ne changeait que
// `currentPath`, un `$state` local, et `PlaylistsV2.ouvrirPl` ne posait que
// `opened`. Aucun des deux ne passait par `ouvrirDetail`, le seul chemin par
// lequel la coquille (`historiqueCoquille.ts`) empile un niveau de détail.
//
// ON MONTE LA VRAIE `ShellV2` : c'est elle qui branche l'historique et qui
// monte les écrans. Le test clique, puis appuie sur Précédent
// (`history.back()`, attendu sur son `popstate`). Il n'appelle jamais
// `pushState` lui-même.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, pendingLibraryAlbum, vueDeRetour } from '../stores/navigation';
import { albums as albumsStore } from '../stores/library';
import { repertoireCible } from '../stores/repertoireCible';
import { detailOuvert } from '../historiqueCoquille';
import { t } from '../i18n';
import { reculer } from './reculer';

/** Monter la coquille compile tous ses écrans. */
vi.setConfig({ testTimeout: 30_000 });

const RACINE = { name: 'Musique', path: '/music', track_count: 12, exists: true };

/** L'arborescence du signalement : Emplacements / Musique / Blues. */
const DOSSIERS: Record<string, { parent: string | null; enfants: string[] }> = {
  '/music': { parent: null, enfants: ['/music/Blues', '/music/Jazz'] },
  '/music/Blues': { parent: '/music', enfants: ['/music/Blues/Chicago'] },
  '/music/Blues/Chicago': { parent: '/music/Blues', enfants: [] },
  '/music/Jazz': { parent: '/music', enfants: [] },
  // Le dossier d'un album localisé, et un de ses sous-dossiers.
  '/music/Depeche Mode/101': { parent: '/music/Depeche Mode', enfants: ['/music/Depeche Mode/101/CD1'] },
  '/music/Depeche Mode/101/CD1': { parent: '/music/Depeche Mode/101', enfants: [] },
};

function dossier(path: string) {
  const d = DOSSIERS[path];
  return {
    path,
    parent: d?.parent ?? null,
    music_root: '/music',
    directories: (d?.enfants ?? []).map((p) => ({ name: p.split('/').pop(), path: p, track_count: 1 })),
    tracks: [],
    accessible: true,
  };
}

const ALBUM = { id: 55, title: '101', artist_id: 994, artist_name: 'Depeche Mode', year: 1989 };
const PISTES_ALBUM = [
  { id: 1, title: 'Pimpf', album_id: 55, track_number: 1, source: 'local',
    file_path: '/music/Depeche Mode/101/01 Pimpf.flac' },
  { id: 2, title: 'Behind the Wheel', album_id: 55, track_number: 2, source: 'local',
    file_path: '/music/Depeche Mode/101/02 Behind the Wheel.flac' },
];

const PLAYLIST_LOCALE = { id: 3, name: 'Soirée', track_count: 0 };
const PLAYLIST_QOBUZ = { source_id: 'q-777', name: 'Sleepy Mix', track_count: 50, source: 'qobuz' };

function corpsPour(url: string): unknown {
  const u = new URL(url, 'http://localhost');
  const p = u.pathname.replace(/^\/api\/v1/, '');
  if (p === '/library/browse') return { roots: [RACINE] };
  if (p === '/library/browse/dir') return dossier(u.searchParams.get('path') ?? '');
  if (/^\/library\/albums\/55\/tracks/.test(p)) return PISTES_ALBUM;
  if (/^\/library\/albums\/55$/.test(p)) return ALBUM;
  if (/^\/library\/albums/.test(p)) return [ALBUM];
  if (p === '/playlists') return [PLAYLIST_LOCALE];
  if (/^\/playlists\/3\/tracks/.test(p)) return [];
  if (p === '/streaming/services') return { qobuz: { authenticated: true, enabled: true } };
  if (p === '/streaming/qobuz/playlists') return [PLAYLIST_QOBUZ];
  if (/^\/streaming\/qobuz\/playlists\/q-777/.test(p)) return [];
  if (/\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\/|$)/.test(p)) return [];
  return {};
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function stabiliser(tours = 10): Promise<void> {
  for (let i = 0; i < tours; i++) { await respirer(); flushSync(); }
}

/** Attendre qu'une condition tienne, sans chronomètre fixe (charge de Shrek). */
async function attendreQue(cond: () => boolean, quoi: string, ms = 4_000): Promise<void> {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error(`jamais atteint : ${quoi}`);
    await respirer();
    flushSync();
  }
}

/**
 * Le `popstate` qu'un bouton Retour d'écran doit provoquer. Un filet de 4 s
 * rend l'échec LISIBLE (le Retour a empilé au lieu de reculer) avant le
 * chronomètre du test.
 */
function popstateAttendu(quoi: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const filet = setTimeout(() => reject(new Error(`aucun popstate : ${quoi}`)), 4_000);
    window.addEventListener('popstate', () => { clearTimeout(filet); resolve(); }, { once: true });
  });
}

/** Le Précédent du navigateur, puis le temps que l'écran suive. */
async function precedent(): Promise<void> {
  await reculer();
  flushSync();
  await stabiliser();
}

function poserCoquille(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote, props: {} });
  flushSync();
  return hote;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const corps = corpsPour(String(url));
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
  for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
  }
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  activeView.set('home');
  pendingLibraryAlbum.set(null);
  vueDeRetour.set(null);
  repertoireCible.set(null);
  detailOuvert.set(null);
  albumsStore.set([]);
  // Chaque cas repart d'une pile propre.
  history.replaceState(null, '', '/');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  albumsStore.set([]);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/* RÉPERTOIRES                                                         */
/* ------------------------------------------------------------------ */

const dossierCourant = (el: HTMLElement) =>
  el.querySelector('.browse-view .breadcrumb-current')?.textContent?.trim() ?? null;
const listeDesEmplacements = (el: HTMLElement) => el.querySelector('.browse-view .roots-list');

function cliquerDossier(el: HTMLElement, nom: string) {
  const b = [...el.querySelectorAll<HTMLButtonElement>('.browse-view .dir-item, .browse-view .root-item')]
    .find((x) => x.textContent?.includes(nom));
  expect(b, `pas de dossier « ${nom} » à cliquer`).toBeTruthy();
  b!.click();
  flushSync();
}

/** Accueil → Répertoires → Musique → Blues : la pile du signalement. */
async function descendreJusquaBlues(): Promise<HTMLDivElement> {
  const el = poserCoquille();
  activeView.set('browse');
  flushSync();
  await attendreQue(() => !!listeDesEmplacements(el), 'la liste des emplacements');
  cliquerDossier(el, 'Musique');
  await attendreQue(() => dossierCourant(el) === 'music', 'le dossier Musique');
  cliquerDossier(el, 'Blues');
  await attendreQue(() => dossierCourant(el) === 'Blues', 'le dossier Blues');
  return el;
}

describe('web#1619 — Répertoires : chaque dossier ouvert est une étape', () => {
  it('🔴 ouvrir un dossier EMPILE une entrée qui le porte', async () => {
    const el = poserCoquille();
    activeView.set('browse');
    flushSync();
    await attendreQue(() => !!listeDesEmplacements(el), 'la liste des emplacements');
    const hauteur = history.length;

    cliquerDossier(el, 'Musique');
    await attendreQue(() => dossierCourant(el) === 'music', 'le dossier Musique');

    expect(
      history.length,
      'ouvrir un dossier n’empile AUCUNE entrée : le Précédent dépile la vue d’avant',
    ).toBe(hauteur + 1);
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'browse', detail: 'dossier:/music' });
  });

  it('🔴 le Précédent remonte au dossier d’où l’on vient, puis aux emplacements, puis à l’Accueil', async () => {
    const el = await descendreJusquaBlues();

    await precedent();
    expect(get(activeView), 'le Précédent a quitté les Répertoires').toBe('browse');
    expect(dossierCourant(el), 'le Précédent ne remonte pas au dossier Musique').toBe('music');

    await precedent();
    expect(get(activeView)).toBe('browse');
    expect(listeDesEmplacements(el), 'le Précédent ne rend pas la liste des emplacements').not.toBeNull();

    await precedent();
    expect(get(activeView), 'le dernier Précédent ne rend pas l’Accueil').toBe('home');
  });

  it('le bouton Retour de l’écran RECULE quand le parent est l’entrée d’en dessous', async () => {
    const el = await descendreJusquaBlues();
    const hauteur = history.length;

    const attente = popstateAttendu('le Retour de l’écran n’a pas reculé');
    el.querySelector<HTMLButtonElement>('.browse-header .back-btn')!.click();
    await attente;
    flushSync();
    await stabiliser();

    expect(dossierCourant(el)).toBe('music');
    expect(history.length, 'le Retour a EMPILÉ au lieu de reculer').toBe(hauteur);
    expect(history.state).toMatchObject({ vue: 'browse', detail: 'dossier:/music' });

    // Et la pile reste celle du chemin : un Précédent de plus rend les emplacements.
    await precedent();
    expect(listeDesEmplacements(el)).not.toBeNull();
  });

  it('le fil d’Ariane est une navigation : le Précédent y revient', async () => {
    const el = await descendreJusquaBlues();
    cliquerDossier(el, 'Chicago');
    await attendreQue(() => dossierCourant(el) === 'Chicago', 'le dossier Chicago');

    const miette = [...el.querySelectorAll<HTMLButtonElement>('.breadcrumb-link')]
      .find((b) => b.textContent?.trim() === 'music');
    miette!.click();
    flushSync();
    await attendreQue(() => dossierCourant(el) === 'music', 'le dossier Musique par le fil d’Ariane');

    await precedent();
    expect(dossierCourant(el), 'le Précédent ne revient pas au dossier quitté').toBe('Chicago');
  });
});

describe('web#1619 / #854 — arrivé par « Localiser sur le disque », le Précédent revient à l’album', () => {
  const fiche = (el: HTMLElement) => el.querySelector('.v2-detail');

  async function localiserDepuisLAlbum(): Promise<HTMLDivElement> {
    albumsStore.set([ALBUM as any]);
    const el = poserCoquille();
    activeView.set('library');
    flushSync();
    await stabiliser();
    // « Aller à l'album » : la Bibliothèque ouvre la fiche et empile son entrée.
    pendingLibraryAlbum.set(55);
    flushSync();
    await attendreQue(() => !!fiche(el), 'la fiche de l’album');
    expect(history.state).toMatchObject({ vue: 'library', detail: 'album:55' });

    const libelle = get(t)('v2.album.locate' as any);
    await attendreQue(
      () => !!el.querySelector(`.v2-detail button[aria-label="${libelle}"]`),
      'le bouton « Localiser sur le disque »',
    );
    hauteurAvantLocaliser = history.length;
    el.querySelector<HTMLButtonElement>(`.v2-detail button[aria-label="${libelle}"]`)!.click();
    flushSync();
    await attendreQue(() => dossierCourant(el) === '101', 'le dossier de l’album');
    return el;
  }
  let hauteurAvantLocaliser = 0;

  it('l’arrivée coûte UN cran, et cette entrée porte le dossier d’arrivée', async () => {
    await localiserDepuisLAlbum();
    expect(
      history.length,
      'l’arrivée a coûté plus d’un cran : le Précédent ne reviendrait pas directement à l’album',
    ).toBe(hauteurAvantLocaliser + 1);
    expect(
      history.state,
      'l’entrée d’arrivée ne porte pas le dossier : remonter d’un sous-dossier rendrait les emplacements',
    ).toMatchObject({ vue: 'browse', detail: 'dossier:/music/Depeche Mode/101' });
  });

  it('le Précédent depuis le dossier d’arrivée rouvre la fiche de l’album', async () => {
    const el = await localiserDepuisLAlbum();

    await precedent();
    await attendreQue(() => !!fiche(el), 'la fiche de l’album après le Précédent');
    expect(get(activeView)).toBe('library');
    expect(history.state).toMatchObject({ vue: 'library', detail: 'album:55' });
  });

  it('🔴 depuis un sous-dossier : Précédent → dossier d’arrivée → album', async () => {
    const el = await localiserDepuisLAlbum();
    cliquerDossier(el, 'CD1');
    await attendreQue(() => dossierCourant(el) === 'CD1', 'le sous-dossier CD1');

    await precedent();
    expect(get(activeView)).toBe('browse');
    expect(dossierCourant(el), 'le Précédent ne remonte pas au dossier d’arrivée').toBe('101');

    await precedent();
    await attendreQue(() => !!fiche(el), 'la fiche de l’album');
    expect(get(activeView)).toBe('library');
  });
});

/* ------------------------------------------------------------------ */
/* PLAYLISTS                                                           */
/* ------------------------------------------------------------------ */

const detailPlaylist = (el: HTMLElement) => el.querySelector('.v2-pldetail');

async function ouvrirLesPlaylists(): Promise<HTMLDivElement> {
  const el = poserCoquille();
  activeView.set('playlists');
  flushSync();
  await attendreQue(() => !!el.querySelector('.card.local button.meta'), 'la carte de la playlist locale');
  return el;
}

describe('web#1619 — ouvrir une playlist empile une étape, le Précédent referme le calque', () => {
  it('🔴 playlist locale : une entrée à l’ouverture, le Précédent referme, le suivant rend l’Accueil', async () => {
    const el = await ouvrirLesPlaylists();
    const hauteur = history.length;

    el.querySelector<HTMLButtonElement>('.card.local button.meta')!.click();
    flushSync();
    await attendreQue(() => !!detailPlaylist(el), 'le détail de la playlist');
    expect(history.length, 'ouvrir une playlist n’empile AUCUNE entrée').toBe(hauteur + 1);
    expect(history.state).toMatchObject({ vue: 'playlists', detail: 'playlists:3' });

    await precedent();
    expect(get(activeView), 'le Précédent a quitté les Playlists').toBe('playlists');
    expect(detailPlaylist(el), 'le Précédent ne referme pas le détail').toBeNull();

    await precedent();
    expect(get(activeView)).toBe('home');
  });

  it('🔴 playlist Qobuz (le cas du fil 1955) : le Précédent referme le détail', async () => {
    const el = await ouvrirLesPlaylists();
    await attendreQue(
      () => [...el.querySelectorAll('.srcs button')].some((b) => b.textContent?.includes('qobuz')),
      'la pastille Qobuz',
    );
    [...el.querySelectorAll<HTMLButtonElement>('.srcs button')].find((b) => b.textContent?.includes('qobuz'))!.click();
    flushSync();
    await attendreQue(() => !!el.querySelector('.card button.meta'), 'la carte Sleepy Mix');
    el.querySelector<HTMLButtonElement>('.card button.meta')!.click();
    flushSync();
    await attendreQue(() => !!detailPlaylist(el), 'le détail de Sleepy Mix');
    expect(history.state).toMatchObject({ vue: 'playlists', detail: 'streamingplaylists:qobuz:q-777' });

    await precedent();
    expect(get(activeView)).toBe('playlists');
    expect(detailPlaylist(el), 'le Précédent ne referme pas la playlist Qobuz').toBeNull();
  });

  it('le Retour du détail referme ET dépile : aucun cran mort derrière', async () => {
    const el = await ouvrirLesPlaylists();
    el.querySelector<HTMLButtonElement>('.card.local button.meta')!.click();
    flushSync();
    await attendreQue(() => !!detailPlaylist(el), 'le détail de la playlist');

    const attente = popstateAttendu('le Retour du détail n’a pas dépilé');
    el.querySelector<HTMLButtonElement>('.v2-pldetail button.close')!.click();
    await attente;
    flushSync();
    await stabiliser();
    expect(detailPlaylist(el)).toBeNull();
    expect(history.state).toMatchObject({ vue: 'playlists', detail: null });

    await precedent();
    expect(get(activeView), 'un Précédent après le Retour est resté sur place : cran mort').toBe('home');
  });
});
