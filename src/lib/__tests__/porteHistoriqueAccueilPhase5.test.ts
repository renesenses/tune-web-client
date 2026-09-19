// @vitest-environment jsdom
//
// PHASE 5 — « aucune perte d'accès » (Bertrand, 19/09/2026).
//
// Le domaine « Historique, accueil et tableau de bord » de
// `docs/capacites-sans-chemin-phase5.md` : des fonctions d'`api.ts` que seuls
// `DashboardView`, `DashboardHighlights` et l'onglet « Ajouts récents » de
// `LibraryView` appelaient. Ces écrans partent avec l'ancienne interface.
//
// 🔴 CES TÉMOINS MONTENT L'ÉCRAN ET CLIQUENT. Ils n'inspectent pas le source :
// un test qui chercherait « getDashboard » dans un fichier resterait vert si
// l'onglet disparaissait du balisage (leçon de la PR #832).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const getDashboard = vi.fn();
const getHistoryAtSlot = vi.fn();
const getTopTracks = vi.fn();
const getTopMixes = vi.fn();
const getRecentlyAdded = vi.fn();
const getRecentlyAddedSummary = vi.fn();
const play = vi.fn();

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getDashboard: (...a: any[]) => getDashboard(...a),
  getHistoryAtSlot: (...a: any[]) => getHistoryAtSlot(...a),
  getTopTracks: (...a: any[]) => getTopTracks(...a),
  getTopMixes: (...a: any[]) => getTopMixes(...a),
  getRecentlyAdded: (...a: any[]) => getRecentlyAdded(...a),
  getRecentlyAddedSummary: (...a: any[]) => getRecentlyAddedSummary(...a),
  play: (...a: any[]) => play(...a),
  getPlaybackHistory: async () => ({ items: [] }),
  getProfilePreferences: async () => ({}),
  setProfilePreferences: async () => ({}),
}));

import HistoriqueV2 from '../../components/v2/HistoriqueV2.svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { widgetParId, type Contexte } from '../accueilWidgets';
import { currentZoneId } from '../stores/zones';
import { currentProfileId } from '../stores/profile';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
const ctx: Contexte = { profileId: 1, albums: [], zones: [] };

/** Un tableau de bord tel que `/library/history/dashboard` le rend. */
const TABLEAU = {
  period: '30d', range: { from: null, to: '2026-09-19' },
  totals: { plays: 42, listening_ms: 7_200_000, unique_tracks: 30, unique_artists: 12 },
  top_artists: [{ artist_name: 'Miles Davis', plays: 9, listening_ms: 1_800_000 }],
  top_albums: [{ album_title: 'Kind of Blue', artist_name: 'Miles Davis', cover_path: null, plays: 9, album_id: 12 }],
  top_tracks: [{ track_id: 77, title: 'So What', artist_name: 'Miles Davis', plays: 5, listening_ms: 1_000_000 }],
  trend: [], hourly: [], by_zone: [], by_source: [],
  // Mardi (2), 21 h : la SEULE case pleine de la carte.
  weekday_hourly: [{ weekday: 2, hour: 21, plays: 4 }],
  completion: { completed: 0, skipped: 0, avg_listened_ms: 0, avg_track_duration_ms: 0 },
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(C: any, props: any = {}) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(C, { target: hote, props });
  flushSync();
  return hote;
}
const respirer = async (ms = 30) => { await new Promise((r) => setTimeout(r, ms)); flushSync(); };
const bouton = (el: HTMLElement, libelle: string) =>
  [...el.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === libelle) ?? null;

beforeEach(() => {
  for (const f of [getDashboard, getHistoryAtSlot, getTopTracks, getTopMixes, getRecentlyAdded, getRecentlyAddedSummary, play]) f.mockReset();
  getDashboard.mockResolvedValue(TABLEAU);
  getHistoryAtSlot.mockResolvedValue({ weekday: 2, hour: 21, period: '30d', tracks: [
    { track_id: 91, title: 'Blue in Green', artist_name: 'Miles Davis', album_title: 'Kind of Blue',
      album_id: 12, source: 'local', source_id: null, plays: 2, last_listened_at: null },
  ] });
  play.mockResolvedValue({ id: 1 });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  // Tout ce que les écrans lisent d'autre (zones, favoris radio…) : vide, et
  // jamais une erreur réseau qui ferait tomber le montage.
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => [], text: async () => '[]',
  })));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} });
  currentZoneId.set(1);
  currentProfileId.set(1);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('Historique → Statistiques : le tableau de bord de l’ancienne interface', () => {
  it('getDashboard — l’onglet charge la période par défaut et montre les totaux', async () => {
    const h = poser(HistoriqueV2);
    expect(getDashboard, 'le journal ne doit pas charger les statistiques').not.toHaveBeenCalled();
    const onglet = bouton(h, fr['v2.hist.tabStats']);
    expect(onglet, 'aucun onglet « Statistiques » dans l’Historique').not.toBeNull();
    onglet!.click();
    await respirer();
    expect(getDashboard).toHaveBeenCalledWith('30d', { topN: 20 });
    expect(h.textContent).toContain(fr['dashboard.totals.plays']);
    expect(h.textContent).toContain('42');
    expect(h.textContent).toContain('So What');

    // Changer de période relance la MÊME route avec la nouvelle période.
    bouton(h, fr['dashboard.period.7d'])!.click();
    await respirer();
    expect(getDashboard).toHaveBeenLastCalledWith('7d', { topN: 20 });
  });

  it('un titre du classement se JOUE par son identifiant', async () => {
    const h = poser(HistoriqueV2);
    bouton(h, fr['v2.hist.tabStats'])!.click();
    await respirer();
    const titre = [...h.querySelectorAll<HTMLButtonElement>('button.lien')].find((b) => b.textContent?.includes('So What'));
    titre!.click();
    await respirer();
    expect(play).toHaveBeenCalledWith(1, { track_id: 77 });
  });

  it('getHistoryAtSlot — une case de la carte dit ce qui jouait alors', async () => {
    const h = poser(HistoriqueV2);
    bouton(h, fr['v2.hist.tabStats'])!.click();
    await respirer();
    const pleines = [...h.querySelectorAll<HTMLButtonElement>('button.case')].filter((b) => !b.disabled);
    expect(pleines.length, 'la carte semaine × heure n’a pas de case cliquable').toBe(1);
    pleines[0].click();
    await respirer();
    // Mardi = jour ISO 2, 21 h, sur la période affichée.
    expect(getHistoryAtSlot).toHaveBeenCalledWith('30d', 2, 21, 100);
    expect(h.textContent).toContain('Blue in Green');
  });
});

describe('Accueil : les bandes venues du tableau de bord et des ajouts récents', () => {
  it('getTopTracks — « Titres les plus écoutés » joue la piste locale', async () => {
    getTopTracks.mockResolvedValue([
      { title: 'So What', artist_name: 'Miles Davis', album_title: 'Kind of Blue', cover_path: 'c.jpg', track_id: 77, source: 'local', plays: 5 },
    ]);
    const els = await widgetParId('plus-ecoutes')!.charger(ctx);
    expect(getTopTracks).toHaveBeenCalled();
    expect(els[0]).toMatchObject({ titre: 'So What', sous: 'Miles Davis' });
    await els[0].jouer!(3);
    expect(play).toHaveBeenCalledWith(3, { track_id: 77 });
  });

  it('getTopMixes — « Mix par genre » joue les pistes du mix', async () => {
    getTopMixes.mockResolvedValue([
      { genre: 'Jazz', title: 'Mix Jazz', play_count: 9, tracks: [
        { id: 5, title: 'A', artist_name: 'Coltrane', cover_path: 'x.jpg' }, { id: 6, title: 'B', artist_name: 'Monk' },
      ] },
    ]);
    const els = await widgetParId('mix-genres')!.charger(ctx);
    expect(getTopMixes).toHaveBeenCalled();
    // Le GENRE, pas « Mix Jazz » : ce titre-là est écrit en français côté serveur.
    expect(els[0]).toMatchObject({ titre: 'Jazz', cover: 'x.jpg' });
    await els[0].jouer!(3);
    expect(play).toHaveBeenCalledWith(3, { track_ids: [5, 6] });
  });

  it('getRecentlyAdded — une bande par fenêtre, 15 et 30 jours', async () => {
    getRecentlyAdded.mockResolvedValue([{ id: 12, title: 'Kind of Blue', artist_name: 'Miles Davis' }]);
    for (const j of [15, 30]) {
      const els = await widgetParId(`ajouts-${j}-jours`)!.charger(ctx);
      expect(getRecentlyAdded).toHaveBeenLastCalledWith(j, 500);
      await els[0].jouer!(3);
      expect(play).toHaveBeenLastCalledWith(3, { album_id: 12 });
    }
  });

  it('getRecentlyAddedSummary — le bilan de la fenêtre s’affiche sous le titre de la bande', async () => {
    getRecentlyAdded.mockResolvedValue([{ id: 12, title: 'Kind of Blue', artist_name: 'Miles Davis' }]);
    getRecentlyAddedSummary.mockResolvedValue({ days: 15, album_count: 7, track_count: 71, duration_ms: 21_300_000, duration_seconds: 21_300 });
    const w = widgetParId('ajouts-15-jours')!;
    const h = poser(PageWidgets, { catalogue: [w], dispositionDefaut: [w.id], cle: 'temoin_phase5' });
    await respirer(120);
    expect(getRecentlyAddedSummary).toHaveBeenCalledWith(15);
    const resume = h.querySelector('.tete .resume');
    expect(resume, 'le bilan de la fenêtre n’est pas rendu').not.toBeNull();
    expect(resume!.textContent).toContain('7');
    expect(resume!.textContent).toContain('71');
  });
});
