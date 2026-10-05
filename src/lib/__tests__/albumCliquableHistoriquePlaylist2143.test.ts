// @vitest-environment jsdom
//
// Fil forum 2143, point 3 — FabienM, v1.0.0-rc2 : « Manque l'hyperlien sur le
// nom de l'album dans l'historique et une playlist ». Deux demandes du même
// testeur l'avaient déjà portée :
//   • web#1871 (fil 2097) — la colonne ALBUM du tableau de pistes est inerte ;
//   • web#1895 (fil 2120) — le nom d'une ligne Album de l'Historique ne mène
//     pas à sa fiche, toute la ligne ne fait que déplier le tiroir.
//
// 🔴 CES TÉMOINS CLIQUENT : le vrai tableau, le vrai Historique, et l'on
// regarde où l'on arrive.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import HistoriqueV2 from '../../components/v2/HistoriqueV2.svelte';
import { ouvertureAlbumDePiste } from '../lienAlbumDePiste';
import { activeView, gestesNavigationService, pendingLibraryAlbum } from '../stores/navigation';
import { playbackHistory } from '../stores/history';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';
import type { Track } from '../types';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const PISTE_LOCALE = {
  id: 7, title: 'Moonlight', artist_name: 'Chris Connor', album_title: 'Chris Craft',
  album_id: 55, source: 'local', duration_ms: 198_000,
} as unknown as Track;
/** Une piste de playlist Qobuz : `album_id` est l'identifiant QOBUZ de l'album. */
const PISTE_QOBUZ = {
  id: null, title: 'Little Girl Blue', artist_name: 'Nina Simone', artist_id: '77',
  album_title: 'Little Girl Blue', album_id: '0060253', source: 'qobuz', source_id: 'q1',
  cover_path: 'https://x/c.jpg', duration_ms: 200_000,
} as unknown as Track;
/** Ni identifiant local ni identifiant de service : le nom reste du texte. */
const PISTE_SANS_ALBUM = {
  id: null, title: 'Radio', artist_name: 'X', album_title: 'Inconnu', source: 'qobuz', source_id: 'q2',
} as unknown as Track;

const ouvertures: unknown[] = [];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let lignes: unknown[] = [];
const respirer = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  locale.set('fr');
  ouvertures.length = 0;
  activeView.set('playlists');
  pendingLibraryAlbum.set(null);
  playbackHistory.clear();
  gestesNavigationService.set({ ouvrirAlbum: (c) => { ouvertures.push(c); }, ouvrirArtiste: () => {} });
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    const corps = url.includes('/library/history') ? { items: lignes, total: lignes.length } : [];
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  preferences.update((p) => ({
    ...p,
    settingsLevel: 'expert' as never,
    v2Colonnes: { ...p.v2Colonnes, expert: ['artist', 'album'] as never },
  }));
});

afterEach(() => {
  if (monte) unmount(monte, { outro: false });
  monte = null;
  hote?.remove();
  hote = null;
  gestesNavigationService.set(null);
  playbackHistory.clear();
  vi.unstubAllGlobals();
});

function monterTableau(pistes: Track[]) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ListePistesV2, { target: hote, props: { pistes, onLire: () => {}, numerotation: 'aucune' } });
  flushSync();
  return hote;
}

const lienAlbum = (rang: number) => hote!.querySelectorAll('.trow')[rang]?.querySelector<HTMLButtonElement>('button.lien-album') ?? null;

describe('fil 2143 point 3 — la cible du lien', () => {
  it('bibliothèque, service, inconnu, coquille sans gestes', () => {
    ouvertureAlbumDePiste(PISTE_LOCALE)!();
    expect(get(pendingLibraryAlbum)).toBe(55);
    expect(get(activeView)).toBe('library');

    ouvertureAlbumDePiste(PISTE_QOBUZ)!();
    expect(ouvertures).toEqual([expect.objectContaining({ service: 'qobuz', albumId: '0060253', titre: 'Little Girl Blue' })]);

    expect(ouvertureAlbumDePiste(PISTE_SANS_ALBUM)).toBeNull();
    expect(ouvertureAlbumDePiste(PISTE_QOBUZ, null), 'sans gestes de service, le lien est absent').toBeNull();
    // Une piste locale sans album : pas de lien, pas de recherche par titre.
    expect(ouvertureAlbumDePiste({ ...PISTE_LOCALE, album_id: null })).toBeNull();
  });
});

describe('fil 2143 point 3 / web#1871 — la colonne ALBUM d’une playlist', () => {
  it('🔴 le nom d’album d’une piste locale ouvre sa fiche, sans lancer la lecture', () => {
    const onLire = vi.fn();
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ListePistesV2, { target: hote, props: { pistes: [PISTE_LOCALE], onLire, numerotation: 'aucune' } });
    flushSync();
    const b = lienAlbum(0);
    expect(b, 'la colonne ALBUM est inerte — fil 2143, point 3').not.toBeNull();
    expect(b!.textContent).toBe('Chris Craft');
    b!.click();
    flushSync();
    expect(get(pendingLibraryAlbum)).toBe(55);
    expect(get(activeView)).toBe('library');
    expect(onLire).not.toHaveBeenCalled();
  });

  it('🔴 une piste de playlist Qobuz ouvre la fiche de l’album Qobuz', () => {
    monterTableau([PISTE_QOBUZ]);
    lienAlbum(0)!.click();
    flushSync();
    expect(ouvertures).toEqual([expect.objectContaining({ service: 'qobuz', albumId: '0060253' })]);
  });

  it('sans identifiant d’album, la cellule reste du texte', () => {
    const el = monterTableau([PISTE_SANS_ALBUM]);
    expect(lienAlbum(0)).toBeNull();
    expect(el.querySelector('.trow')!.textContent).toContain('Inconnu');
  });
});

describe('fil 2143 point 3 / web#1895 — le nom d’une ligne Album de l’Historique', () => {
  const ilYA = (ms: number) => new Date(Date.now() - ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const ligne = (titre: string, trackId: number, depuisMs: number, position: number) => ({
    id: trackId, track_id: trackId, title: titre, artist_name: 'Moby', album_title: '18',
    source: 'local', source_id: null, album_id: 18, cover_url: null, duration_ms: 200_000,
    listened_at: ilYA(depuisMs), zone_id: 3,
    context_type: 'album', context_id: '18', context_position: position, context_name: '18', context_source: null,
  });

  async function poserHistorique(): Promise<HTMLElement> {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(HistoriqueV2, { target: hote });
    for (let i = 0; i < 20; i++) await respirer();
    flushSync();
    return hote;
  }

  it('🔴 un clic sur le nom ouvre la fiche ; un clic ailleurs sur la ligne déplie toujours', async () => {
    lignes = [ligne('We Are All Made of Stars', 1, 60_000, 1), ligne('Extreme Ways', 2, 300_000, 0)];
    const el = await poserHistorique();
    const objet = el.querySelector<HTMLButtonElement>('button.objet');
    expect(objet, 'pas de ligne Album — le témoin ne mesure rien').not.toBeNull();
    const nom = objet!.querySelector<HTMLElement>('.otitre.lien-album');
    expect(nom, 'le nom de l’album n’est pas un lien — web#1895').not.toBeNull();

    nom!.click();
    flushSync();
    expect(get(pendingLibraryAlbum)).toBe(18);
    expect(get(activeView)).toBe('library');
    expect(objet!.getAttribute('aria-expanded'), 'le clic sur le nom a aussi déplié le tiroir').toBe('false');

    objet!.querySelector<HTMLElement>('.pli')!.click();
    flushSync();
    expect(objet!.getAttribute('aria-expanded')).toBe('true');
  });
});
