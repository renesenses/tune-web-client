// @vitest-environment jsdom
//
// web#3120 (FabienM, fil 2864, points 8 et 9 ; go de Bertrand du 16/11/2026)
// — « Reprendre l'écoute » :
//   8. « afficher le label ALBUM sur les vignettes des albums, PLAYLIST sur
//      les vignettes des playlists, pour les titres laissez tel quel » ;
//   9. « ajouter dans autres actions : "Aller à l'album" et "Aller à
//      l'artiste" dans le cas de la reprise d'un album ou d'un titre. Pour la
//      reprise d'une playlist, "Aller à playlist", "Aller à l'album" et
//      "Aller à l'artiste" du dernier titre à reprendre ».
//
// Les lignes servies sont celles de `GET /home/continue-listening`
// (`home.rs`, `continuer_l_ecoute`) : `context_type`, `context_id`, `source`,
// `title`, `last_track_title`, `artist_name`, `album_title`, `album_id`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('../ouvrirArtisteDepuis', () => ({ ouvrirArtisteDepuis: vi.fn(async () => {}) }));

import { ouvrirArtisteDepuis } from '../ouvrirArtisteDepuis';
import { allerDeReprise, natureDeReprise, widgetParId } from '../accueilWidgets';
import { entreesPochette } from '../actionsPochette';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';
import { currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const ALBUM_LOCAL = {
  resume_key: 'k1', context_type: 'album', context_id: '12', source: 'local',
  title: 'La Fossette', last_track_title: 'Le Courage des oiseaux', artist_name: 'Dominique A',
  album_title: 'La Fossette', cover_path: 'c1', album_id: 12, id: 12,
};
const PLAYLIST_LOCALE = {
  resume_key: 'k2', context_type: 'playlist', context_id: '34', source: 'local',
  title: 'Dimanche', last_track_title: 'Sea Song', artist_name: 'Robert Wyatt',
  album_title: 'Rock Bottom', cover_path: 'c2', album_id: 11, id: 11,
};
const PLAYLIST_QOBUZ = {
  resume_key: 'k3', context_type: 'playlist', context_id: '9090', source: 'qobuz',
  title: 'Jazz du dimanche', last_track_title: 'So What', artist_name: 'Miles Davis',
  album_title: 'Kind of Blue', cover_path: 'c3', album_id: null, id: 0,
};
const ALBUM_QOBUZ = {
  resume_key: 'k4', context_type: 'album', context_id: 'q42', source: 'qobuz',
  title: 'Ambient 1', last_track_title: '1/1', artist_name: 'Brian Eno',
  album_title: 'Ambient 1', cover_path: 'c4', album_id: null, id: 0,
};
const TITRE = {
  resume_key: 'k5', context_type: 'track', context_id: '501', source: 'local',
  title: 'Extreme Ways', artist_name: 'Moby', album_title: '18', cover_path: 'c5', album_id: 77, id: 77,
};

describe('web#3120 — la nature d’une reprise', () => {
  it('ALBUM et PLAYLIST portent leur étiquette ; un titre et un épisode non', () => {
    expect(natureDeReprise(ALBUM_LOCAL)).toBe('album');
    expect(natureDeReprise(PLAYLIST_QOBUZ)).toBe('playlist');
    expect(natureDeReprise(TITRE)).toBeNull();
    expect(natureDeReprise({ context_type: 'podcast' })).toBeNull();
    expect(natureDeReprise({})).toBeNull();
  });
});

describe('web#3120 — où mènent les « Aller à »', () => {
  it('une playlist LOCALE : la playlist, l’album et l’artiste du dernier titre', () => {
    const a = allerDeReprise(PLAYLIST_LOCALE);
    expect(a.playlist).toEqual({ ouvrir: 'cible', cible: { sorte: 'playlist', id: 34, nom: 'Dimanche' } });
    expect(a.album?.ouvrir).toBe('album');
    expect(a.album?.fiche?.id).toBe(11);
    expect(a.album?.fiche?.title).toBe('Rock Bottom');
    expect(a.artiste).toEqual({ ouvrir: 'artiste', artiste: 'Robert Wyatt' });
  });

  it('une playlist de SERVICE : sa fiche par la paire ; l’album inconnu n’est PAS deviné', () => {
    const a = allerDeReprise(PLAYLIST_QOBUZ);
    expect(a.playlist?.ouvrir).toBe('playlist');
    expect(a.playlist?.playlist).toMatchObject({ source: 'qobuz', source_id: '9090', name: 'Jazz du dimanche' });
    expect(a.album, 'aucun identifiant d’album sur la ligne : pas d’entrée').toBeUndefined();
    expect(a.artiste).toEqual({ ouvrir: 'artiste', artiste: 'Miles Davis', artisteService: 'qobuz' });
  });

  it('un album de SERVICE : sa fiche par `context_id`, pas de playlist', () => {
    const a = allerDeReprise(ALBUM_QOBUZ);
    expect(a.playlist).toBeUndefined();
    expect(a.album?.source).toBe('qobuz');
    expect(a.album?.fiche).toMatchObject({ id: null, source: 'qobuz', source_id: 'q42', title: 'Ambient 1' });
  });

  it('un titre : son album et son artiste', () => {
    const a = allerDeReprise(TITRE);
    expect(a.playlist).toBeUndefined();
    expect(a.album?.fiche?.id).toBe(77);
    expect(a.artiste?.artiste).toBe('Moby');
  });
});

describe('web#3120 — le menu « … »', () => {
  const ident = (k: string) => k;
  const rien = () => {};

  it('« Aller à la playlist / l’album / l’artiste », dans cet ordre, à la place d’« Ouvrir »', () => {
    const cles = entreesPochette(
      { type: 'playlist', idBibliotheque: 34 },
      { ouvrir: rien, allerPlaylist: rien, allerAlbum: rien, allerArtiste: rien },
      ident,
    ).map((e) => e.cle);
    expect(cles).not.toContain('common.open');
    const i = (k: string) => cles.indexOf(k);
    expect(i('v2.home.goToPlaylist')).toBeGreaterThanOrEqual(0);
    expect(i('v2.home.goToPlaylist')).toBeLessThan(i('library.goToAlbum'));
    expect(i('library.goToAlbum')).toBeLessThan(i('library.goToArtist'));
  });

  it('contre-épreuve : sans geste « Aller à », le menu d’un album garde « Ouvrir »', () => {
    const cles = entreesPochette({ type: 'album', idBibliotheque: 12, artisteConnu: true }, { ouvrir: rien, allerArtiste: rien }, ident)
      .map((e) => e.cle);
    expect(cles).toContain('common.open');
    expect(cles).not.toContain('library.goToAlbum');
    expect(cles).not.toContain('v2.home.goToPlaylist');
    // Une playlist sans geste d'artiste fourni n'en invente pas.
    expect(entreesPochette({ type: 'playlist', idBibliotheque: 34 }, { ouvrir: rien }, ident).map((e) => e.cle))
      .not.toContain('library.goToArtist');
  });
});

// ── À l'écran ──────────────────────────────────────────────────────────────
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  locale.set('fr');
  currentProfileId.set(1);
  currentZoneId.set(1);
  activeView.set('home' as never);
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const charge = url.includes('/home/continue-listening') ? [ALBUM_LOCAL, PLAYLIST_QOBUZ, TITRE] : [];
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.querySelectorAll('[role="menu"]').forEach((e) => e.remove());
  currentProfileId.set(null);
  currentZoneId.set(null);
  vi.unstubAllGlobals();
  vi.mocked(ouvrirArtisteDepuis).mockClear();
});

async function poser(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: { catalogue: [widgetParId('reprendre')!], dispositionDefaut: ['reprendre'], cle: `essai_3120_${Math.random()}` },
  });
  for (let i = 0; i < 30; i++) await respirer();
  flushSync();
  return hote;
}

async function menuDe(carte: Element): Promise<HTMLButtonElement[]> {
  (carte.querySelector('.coin.bl') as HTMLButtonElement).click();
  for (let i = 0; i < 5; i++) await respirer();
  flushSync();
  return [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"][data-cle]')];
}

describe('web#3120 — à l’écran', () => {
  it('🔴 ALBUM, PLAYLIST, et rien sur le titre', async () => {
    const page = await poser();
    const cartes = [...page.querySelectorAll('.carte')];
    expect(cartes).toHaveLength(3);
    expect(cartes.map((c) => c.querySelector('.cn')?.textContent?.trim() ?? null)).toEqual(['Album', 'Playlist', null]);
  });

  it('🔴 le menu d’une playlist reprise mène à la playlist et à l’artiste du dernier titre', async () => {
    const page = await poser();
    const carte = page.querySelectorAll('.carte')[1];
    const entrees = await menuDe(carte);
    const cles = entrees.map((b) => b.dataset.cle);
    expect(cles).toContain('v2.home.goToPlaylist');
    expect(cles).toContain('library.goToArtist');
    expect(cles).not.toContain('common.open');
    entrees.find((b) => b.dataset.cle === 'library.goToArtist')!.click();
    expect(ouvrirArtisteDepuis).toHaveBeenCalledWith({ name: 'Miles Davis', service_ecoute: 'qobuz' }, 'home');
  });

  it('🔴 le menu d’un album repris : « Aller à l’album » et « Aller à l’artiste »', async () => {
    const page = await poser();
    const cles = (await menuDe(page.querySelectorAll('.carte')[0])).map((b) => b.dataset.cle);
    expect(cles).toContain('library.goToAlbum');
    expect(cles).toContain('library.goToArtist');
    expect(cles).not.toContain('common.open');
  });
});
