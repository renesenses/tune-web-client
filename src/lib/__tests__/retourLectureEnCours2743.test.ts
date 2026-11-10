// @vitest-environment jsdom
//
// web#2743 — cpadiou77 (rc10, tablette) : depuis « Lecture en cours », le
// Retour ramenait la Bibliothèque au début et les Favoris Qobuz sur l'accueil
// Qobuz. Le bouton CHANGEAIT de vue : la coquille empilait une entrée neuve,
// sans onglet ni fiche. Il RECULE désormais quand on vient de la vue de
// retour : l'entrée quittée repose vue, onglet et fiche.
//
// Les témoins branchent la VRAIE coquille d'historique (`brancherHistoriqueCoquille`)
// sur l'historique de jsdom, où `history.back()` et `popstate` se comportent
// comme dans Chrome (voir `historiqueAlbumBibliotheque1121.test.ts`).
//
// Contre-épreuve : le geste d'avant (`activeView.set(destinationDeRetour(…))`)
// est rejoué dans le même banc et perd l'onglet et la fiche.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView, previousView } from '../stores/navigation';
import { brancherHistoriqueCoquille, detailOuvert, ongletCourant } from '../historiqueCoquille';
import { destinationDeRetour } from '../destinationDeRetour';
import { decisionRetourLectureEnCours, retourDepuisLectureEnCours } from '../retourLectureEnCours';
import { rangDeReprise, reprendreAlbumOuvert, retenirAlbumOuvert, oublierAlbumOuvert } from '../positionBibliotheque';

const attendre = (ms = 60) => new Promise((r) => setTimeout(r, ms));
let debrancher: (() => void) | null = null;

beforeEach(() => {
  history.replaceState(null, '', '/');
  activeView.set('home');
  detailOuvert.set(null);
  ongletCourant.set(null);
  debrancher = brancherHistoriqueCoquille();
});
afterEach(() => {
  debrancher?.();
  debrancher = null;
});

/** L'ancien geste du bouton, gardé pour la contre-épreuve. */
function ancienRetour() {
  activeView.set(destinationDeRetour(get(previousView), { depuis: 'nowplaying', repli: 'library' }));
}

async function versLectureEnCours() {
  activeView.set('nowplaying');
  await attendre();
  expect(history.state).toMatchObject({ tune: 'v2', vue: 'nowplaying' });
}

describe('web#2743 — le Retour de « Lecture en cours » rend l’écran quitté', () => {
  it('Favoris Qobuz : l’onglet « favorites » revient (pas l’accueil du service)', async () => {
    activeView.set('streaming');
    ongletCourant.set('favorites');
    await attendre();
    await versLectureEnCours();
    retourDepuisLectureEnCours();
    await attendre();
    expect(get(activeView)).toBe('streaming');
    expect(get(ongletCourant)).toBe('favorites');
  });

  it('Bibliothèque : la fiche d’album ouverte revient', async () => {
    activeView.set('library');
    await attendre();
    detailOuvert.set('album:55');
    await attendre();
    await versLectureEnCours();
    retourDepuisLectureEnCours();
    await attendre();
    expect(get(activeView)).toBe('library');
    expect(get(detailOuvert)).toBe('album:55');
  });

  it('contre-épreuve : l’ancien geste perd l’onglet et la fiche', async () => {
    activeView.set('streaming');
    ongletCourant.set('favorites');
    await attendre();
    await versLectureEnCours();
    ancienRetour();
    await attendre();
    expect(get(activeView)).toBe('streaming');
    expect(get(ongletCourant)).toBeNull();

    activeView.set('library');
    await attendre();
    detailOuvert.set('album:55');
    await attendre();
    await versLectureEnCours();
    ancienRetour();
    await attendre();
    expect(get(detailOuvert)).toBeNull();
  });
});

describe('web#2743 — quand reculer', () => {
  const lecture = { tune: 'v2', vue: 'nowplaying', detail: null };
  it('recule depuis l’entrée de lecture quand la vue de retour est la précédente', () => {
    expect(decisionRetourLectureEnCours('library', lecture, 3)).toEqual({ action: 'reculer' });
  });
  it('change de vue sans entrée de la coquille (démarrage, entrée étrangère)', () => {
    expect(decisionRetourLectureEnCours('library', null, 3)).toEqual({ action: 'aller', vers: 'library' });
    expect(decisionRetourLectureEnCours(null, lecture, 3)).toEqual({ action: 'aller', vers: 'library' });
  });
  it('change de vue quand la précédente n’est pas une destination (sortie du Grand écran)', () => {
    const d = decisionRetourLectureEnCours('tv', lecture, 3);
    expect(d.action).toBe('aller');
  });
});

describe('web#2743 — la grille de la Bibliothèque retrouve l’album', () => {
  it('retient l’album ouvert, le rend une fois, l’oublie à la fermeture', () => {
    retenirAlbumOuvert(55, 812);
    expect(reprendreAlbumOuvert()).toEqual({ albumId: 55, index: 812 });
    expect(reprendreAlbumOuvert()).toBeNull();
    retenirAlbumOuvert(55, 812);
    oublierAlbumOuvert();
    expect(reprendreAlbumOuvert()).toBeNull();
  });
  it('rang : celui de l’album dans la liste remontée, sinon le rang retenu en pages', () => {
    const liste = [{ id: 1 }, { id: 2 }, { id: 55 }];
    expect(rangDeReprise({ albumId: 55, index: 40 }, liste, false)).toBe(2);
    expect(rangDeReprise({ albumId: 99, index: 1 }, liste, false)).toBeNull();
    expect(rangDeReprise({ albumId: 99, index: 1 }, [null, null, null], true)).toBe(1);
    expect(rangDeReprise(null, liste, false)).toBeNull();
    expect(rangDeReprise({ albumId: 55, index: 0 }, [], false)).toBeNull();
  });
});

// ─── Le VRAI bouton Retour de l'écran ─────────────────────────────────────
const PISTE = {
  track_id: 12, album_id: 55, artist_id: 994,
  title: 'The Price', artist_name: 'Leprous', album_title: 'Malina',
  source: 'library', duration_ms: 321000,
};
function reponse(url: string): Response {
  let corps: unknown = /\/(zones|profiles|devices|playlists|shortcuts|search|library)/.test(url) ? [] : {};
  if (/\/queue/.test(url)) corps = { tracks: [], position: 0, length: 0 };
  if (/\/(credits|history|favorites|plays)/.test(url)) corps = [];
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

describe('web#2743 — le bouton Retour de NowPlaying, monté', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, unknown> | null = null;
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (u: unknown) => reponse(String(typeof u === 'string' ? u : (u as Request)?.url ?? u))));
    vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as never);
    zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: PISTE, position_ms: 1000 }] as never);
    currentZoneId.set(1);
  });
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    hote = null;
    zones.set([]);
    vi.unstubAllGlobals();
  });

  it('🔴 Favoris Qobuz → Lecture en cours → Retour : l’onglet « favorites » revient', async () => {
    activeView.set('streaming');
    ongletCourant.set('favorites');
    await attendre();
    await versLectureEnCours();
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(NowPlaying, { target: hote, props: {} as never }) as Record<string, unknown>;
    flushSync();
    await attendre();
    const retour = hote.querySelector<HTMLButtonElement>('.np-back-btn');
    expect(retour, 'bouton Retour absent — témoin sans objet').not.toBeNull();
    retour!.click();
    await attendre(120);
    expect(get(activeView)).toBe('streaming');
    expect(get(ongletCourant), 'l’accueil Qobuz au lieu des favoris (#2743)').toBe('favorites');
  }, 60_000);
});
