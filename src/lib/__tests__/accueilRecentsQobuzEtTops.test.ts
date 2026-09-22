// @vitest-environment jsdom
//
// Deux défauts de l'accueil, signalés par Bertrand sur le .18 (v0.9.161),
// 22/09/2026.
//
// 1. « Récemment écoutés » — une tuile Qobuz répondait « Erreur de lecture :
//    qobuz /album/get: 404 No result matching given argument ». La ligne
//    d'historique porte le `source_id` de la PISTE (serveur, `record_listen`),
//    et la tuile l'envoyait en `streaming_album_id`.
//
// 2. « Vos tops » — « rien n'est cliquable !! ». Les trois colonnes étaient
//    des `<li>` inertes.
//
// Le second témoin MONTE `PageWidgets` et clique là où Bertrand clique : c'est
// le BRANCHEMENT entre la fabrique d'éléments et le rendu qui manquait, et un
// témoin qui n'appellerait que la fabrique serait resté vert sur une ligne
// inerte.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import * as api from '../api';
import { widgetParId, versElement } from '../accueilWidgets';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';
import { currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';

const ctx: any = { profileId: null, langue: 'fr', albums: [], zones: [] };

/** La ligne du .18, telle que `/library/history` la rend (« Get Lucky »). */
const GET_LUCKY = {
  id: 661,
  track_id: null,
  title: 'Get Lucky',
  artist_name: 'Daft Punk',
  album_title: 'Random Access Memories',
  source: 'qobuz',
  source_id: '9140031',
  album_id: null,
  context_type: 'track',
  context_id: null,
  context_position: null,
};

describe('« Récemment écoutés » — une ligne d’historique de service', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  async function tuiles(lignes: any[]) {
    vi.spyOn(api, 'getPlaybackHistory').mockResolvedValue({ items: lignes, total: lignes.length });
    return widgetParId('recemment-ecoutes')!.charger(ctx);
  }

  it('🔴 la ligne 9140031 joue la PISTE, jamais un `streaming_album_id`', async () => {
    const play = vi.spyOn(api, 'play').mockResolvedValue({} as any);
    const [el] = await tuiles([GET_LUCKY]);
    expect(el.jouer, 'la tuile n’a plus de geste de lecture').toBeTypeOf('function');
    await el.jouer!(3);
    expect(play).toHaveBeenCalledTimes(1);
    const [zone, corps] = play.mock.calls[0];
    expect(zone).toBe(3);
    expect(corps).toEqual({ source: 'qobuz', source_id: '9140031' });
    expect(corps).not.toHaveProperty('streaming_album_id');
  });

  it('sans `context_type` non plus, `source_id` reste celui de la piste', async () => {
    const play = vi.spyOn(api, 'play').mockResolvedValue({} as any);
    const [el] = await tuiles([{ ...GET_LUCKY, context_type: null }]);
    await el.jouer!(1);
    expect(play.mock.calls[0][1]).toEqual({ source: 'qobuz', source_id: '9140031' });
  });

  it('un ALBUM demandé se rejoue par `context_id`, depuis `context_position`', async () => {
    const play = vi.spyOn(api, 'play').mockResolvedValue({} as any);
    const [el] = await tuiles([
      { ...GET_LUCKY, context_type: 'album', context_id: '0060254705991', context_position: 7 },
    ]);
    await el.jouer!(1);
    expect(play.mock.calls[0][1]).toEqual({
      streaming_album_id: '0060254705991',
      source: 'qobuz',
      start_index: 7,
    });
  });

  it('un album demandé sans rang repart de son début', async () => {
    const play = vi.spyOn(api, 'play').mockResolvedValue({} as any);
    const [el] = await tuiles([{ ...GET_LUCKY, context_type: 'album', context_id: '0060254705991' }]);
    await el.jouer!(1);
    expect(play.mock.calls[0][1]).toEqual({ streaming_album_id: '0060254705991', source: 'qobuz' });
  });

  it('contre-épreuve : un album ÉDITORIAL Qobuz se joue toujours comme un album', async () => {
    // Hors historique, `source_id` désigne bien l'album : la garde ne doit
    // valoir que pour les lignes d'historique.
    const play = vi.spyOn(api, 'play').mockResolvedValue({} as any);
    const el = versElement({ source_id: '0060254705991', title: 'RAM' }, 0, 'qob', { service: 'qobuz' });
    await el.jouer!(1);
    expect(play.mock.calls[0][1]).toEqual({ streaming_album_id: '0060254705991', source: 'qobuz' });
  });
});

// ── « Vos tops » ────────────────────────────────────────────────────────────

/** `GET /library/history/dashboard`, formes de `history_repo.rs`. */
const TABLEAU = {
  period: '7d',
  range: { from: null, to: '' },
  totals: { plays: 10, listening_ms: 1, unique_tracks: 3, unique_artists: 2 },
  top_artists: [{ artist_name: 'Dionne Warwick', plays: 12, listening_ms: 1, cover_path: null }],
  top_albums: [
    { album_title: 'Valley of the Dolls', artist_name: 'Dionne Warwick', cover_path: null, plays: 9, album_id: 4242 },
    { album_title: 'Random Access Memories', artist_name: 'Daft Punk', cover_path: null, plays: 4,
      album_id: null, source: 'qobuz', source_id: '9140031' },
  ],
  top_tracks: [
    { track_id: 777, title: 'Walk On By', artist_name: 'Dionne Warwick', plays: 6, listening_ms: 1 },
    { track_id: null, title: 'Get Lucky', artist_name: 'Daft Punk', plays: 3, listening_ms: 1,
      source: 'qobuz', source_id: '9140031' },
  ],
  trend: [], hourly: [], by_zone: [], by_source: [],
  completion: { completed: 0, skipped: 0, avg_listened_ms: 0, avg_track_duration_ms: 0 },
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let appels: { url: string; methode: string; corps: any }[] = [];

function poserLeServeur() {
  appels = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      appels.push({ url: u, methode: init?.method ?? 'GET', corps: init?.body ? JSON.parse(init.body) : null });
      let corps: any = {};
      if (u.includes('/history/dashboard')) corps = TABLEAU;
      else if (u.includes('/library/search')) corps = { artists: [], albums: [], tracks: [] };
      else if (u.includes('/tracks')) corps = [];
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps,
        text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }),
  );
}

const souffler = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function poserLaPage() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: { catalogue: [widgetParId('tops')!], dispositionDefaut: ['tops'], cle: 'accueil_tops_test' },
  });
  flushSync();
  await souffler(150);
  flushSync();
  return hote;
}

/** La ligne `n` (0-based) de la colonne `col` (0 artistes, 1 albums, 2 titres). */
function ligne(page: HTMLElement, col: number, n: number) {
  const colonnes = page.querySelectorAll('.tops .topcol');
  expect(colonnes.length, 'le widget des tops n’a pas rendu ses trois colonnes').toBe(3);
  const li = colonnes[col].querySelectorAll('li')[n] as HTMLElement;
  return {
    rangee: li.querySelector('button.toprang') as HTMLButtonElement | null,
    lire: li.querySelector('button.toplire') as HTMLButtonElement | null,
  };
}

async function cliquer(b: HTMLButtonElement) {
  b.click();
  await souffler(80);
  flushSync();
}

const lectures = () => appels.filter((a) => a.methode === 'POST' && /\/zones\/1\/play$/.test(a.url));

describe('« Vos tops » — les lignes sont des gestes', () => {
  beforeEach(() => {
    poserLeServeur();
    currentProfileId.set(1);
    currentZoneId.set(1);
    activeView.set('home' as any);
  });
  afterEach(() => {
    if (monte) { unmount(monte); monte = null; }
    hote?.remove();
    hote = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('🔴 chaque ligne est un BOUTON actif (« rien n’est cliquable !! »)', async () => {
    const page = await poserLaPage();
    const boutons = [...page.querySelectorAll('.tops button.toprang')] as HTMLButtonElement[];
    expect(boutons.length, 'aucune ligne n’est un bouton').toBe(5);
    expect(boutons.filter((b) => b.disabled)).toEqual([]);
  });

  it('un ARTISTE s’ouvre par son nom, comme au Tableau de bord', async () => {
    const page = await poserLaPage();
    await cliquer(ligne(page, 0, 0).rangee!);
    const recherche = appels.find((a) => a.url.includes('/library/search'));
    expect(recherche, 'le clic sur l’artiste n’a rien cherché').toBeTruthy();
    expect(decodeURIComponent(recherche!.url)).toContain('q=Dionne Warwick');
    // Pas de correspondance exacte : l'onglet Artistes de la bibliothèque.
    expect(get(activeView)).toBe('library');
  });

  it('un album de la BIBLIOTHÈQUE s’ouvre, et son bouton Lire le joue', async () => {
    const page = await poserLaPage();
    const { rangee, lire } = ligne(page, 1, 0);
    await cliquer(rangee!);
    expect(document.querySelector('.v2-detail'), 'la fiche album ne s’est pas ouverte').toBeTruthy();
    expect(lire, 'l’album local n’a pas de bouton Lire').toBeTruthy();
    await cliquer(lire!);
    expect(lectures().map((a) => a.corps)).toEqual([{ album_id: 4242 }]);
  });

  it('un album de SERVICE sans id local joue sa piste, jamais `streaming_album_id`', async () => {
    // `TopAlbumEntry.source_id` est le MAX des `source_id` de l'historique :
    // celui d'une piste, pas de l'album.
    const page = await poserLaPage();
    await cliquer(ligne(page, 1, 1).rangee!);
    expect(lectures().map((a) => a.corps)).toEqual([{ source: 'qobuz', source_id: '9140031' }]);
  });

  it('un TITRE se joue : local par `track_id`, service par la paire', async () => {
    const page = await poserLaPage();
    await cliquer(ligne(page, 2, 0).rangee!);
    await cliquer(ligne(page, 2, 1).rangee!);
    expect(lectures().map((a) => a.corps)).toEqual([
      { track_id: 777 },
      { source: 'qobuz', source_id: '9140031' },
    ]);
  });
});

describe('« Artistes les plus écoutés » — la bande aussi', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('une carte d’artiste s’ouvre par son nom', async () => {
    vi.spyOn(api, 'getDashboard').mockResolvedValue(TABLEAU as any);
    const [el] = await widgetParId('top-artistes')!.charger(ctx);
    expect(el.ouvrir).toBe('artiste');
    expect(el.artiste).toBe('Dionne Warwick');
  });
});
