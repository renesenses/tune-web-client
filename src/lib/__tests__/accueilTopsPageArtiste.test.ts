// @vitest-environment jsdom
//
// 🔴 Bertrand, 23/09/2026 : « Homepage, widget "Vos tops" : click sur un
// artiste doit afficher sa page artiste ! »
//
// Le clic n'était pas inerte — il l'était jusqu'au 22/09 (#1437), et il a été
// branché ce jour-là — mais il partait dans `libraryNavigation.ouvrirArtisteParNom`,
// la navigation de l'ANCIENNE coquille : elle pose `selectedArtist` et
// `libraryTab`, que plus aucun écran de ce client ne lit depuis le retrait de
// l'ancienne interface (19/09, #1257). Seul son `activeView.set('library')`
// avait un effet : on quittait l'accueil pour la GRILLE de la Bibliothèque,
// sans jamais ouvrir de fiche. C'est le point 9 d'Yves Corbat sur les Favoris
// (17/09) à l'identique, et son remède existait déjà : `ouvrirArtisteDepuis`.
//
// Le témoin MONTE `PageWidgets` et clique là où Bertrand clique. Une garde qui
// n'appellerait que la fabrique d'éléments resterait verte sur un branchement
// mort : c'est le BRANCHEMENT qui manquait, pas le geste.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { widgetParId } from '../accueilWidgets';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';
import { currentZoneId } from '../stores/zones';
import { activeView, pendingLibraryArtist, vueDeRetour } from '../stores/navigation';

/** `GET /library/history/dashboard` — un seul artiste suffit ici. */
const TABLEAU = {
  period: '7d',
  range: { from: null, to: '' },
  totals: { plays: 10, listening_ms: 1, unique_tracks: 3, unique_artists: 2 },
  top_artists: [{ artist_name: 'Dionne Warwick', plays: 12, listening_ms: 1, cover_path: null }],
  top_albums: [
    { album_title: 'Valley of the Dolls', artist_name: 'Dionne Warwick', cover_path: null, plays: 9, album_id: 4242 },
  ],
  top_tracks: [{ track_id: 777, title: 'Walk On By', artist_name: 'Dionne Warwick', plays: 6, listening_ms: 1 }],
  trend: [], hourly: [], by_zone: [], by_source: [],
  completion: { completed: 0, skipped: 0, avg_listened_ms: 0, avg_track_duration_ms: 0 },
};

/**
 * Ce que la recherche de bibliothèque rend au clic. « Dionne Warwick » est
 * dans la bibliothèque sous l'identifiant 51 ; « Dionne » est l'approchant que
 * la recherche ramène toujours et qu'il ne faut JAMAIS ouvrir.
 */
let artistesTrouves: { id: number; name: string }[] = [];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poserLeServeur() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      let corps: any = {};
      if (u.includes('/history/dashboard')) corps = TABLEAU;
      else if (u.includes('/library/search')) corps = { artists: artistesTrouves, albums: [], tracks: [] };
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
    props: { catalogue: [widgetParId('tops')!], dispositionDefaut: ['tops'], cle: 'accueil_tops_artiste_test' },
  });
  flushSync();
  await souffler(150);
  flushSync();
  return hote;
}

/** La première ligne de la colonne des artistes. */
function premierArtiste(page: HTMLElement): HTMLButtonElement {
  const colonnes = page.querySelectorAll('.tops .topcol');
  expect(colonnes.length, 'le widget des tops n’a pas rendu ses trois colonnes').toBe(3);
  return colonnes[0].querySelector('li button.toprang') as HTMLButtonElement;
}

async function cliquer(b: HTMLButtonElement) {
  b.click();
  await souffler(120);
  flushSync();
}

describe('« Vos tops » — un artiste ouvre SA PAGE, pas la grille', () => {
  beforeEach(() => {
    poserLeServeur();
    currentProfileId.set(1);
    currentZoneId.set(1);
    activeView.set('home' as any);
    pendingLibraryArtist.set(null);
    vueDeRetour.set(null);
    artistesTrouves = [{ id: 51, name: 'Dionne Warwick' }];
  });
  afterEach(() => {
    if (monte) { unmount(monte); monte = null; }
    hote?.remove();
    hote = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('🔴 le clic POSE l’artiste que la Bibliothèque consomme (`pendingLibraryArtist`)', async () => {
    const page = await poserLaPage();
    await cliquer(premierArtiste(page));
    // Le magasin de l'ancienne coquille ne prouvait rien : c'est celui-ci que
    // `LibraryV2` lit pour ouvrir la fiche.
    expect(get(pendingLibraryArtist), 'la fiche de l’artiste ne s’ouvre pas').toBe(51);
    expect(get(activeView)).toBe('library');
  });

  it('le Retour de la fiche ramène à l’accueil, pas à la Bibliothèque', async () => {
    const page = await poserLaPage();
    await cliquer(premierArtiste(page));
    expect(get(vueDeRetour)).toBe('home');
  });

  it('un approchant n’ouvre AUCUNE fiche — « Dionne » n’est pas « Dionne Warwick »', async () => {
    artistesTrouves = [{ id: 99, name: 'Dionne' }];
    const page = await poserLaPage();
    await cliquer(premierArtiste(page));
    expect(get(pendingLibraryArtist), 'un artiste au hasard a été ouvert').toBeNull();
    expect(get(activeView)).toBe('library');
  });
});
