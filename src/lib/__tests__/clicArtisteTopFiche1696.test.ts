// @vitest-environment jsdom
//
// 🔴 #1696 — Daniel LEVY, forum fil 2005, 27/09/2026, 0.9.166, Docker Synology :
// « page accueil, widget Artistes les plus écoutés […] le clique sur un
// portrait renvoie a la page bibliothèque, dernier index sélectionné ».
//
// Le clic n'est pas inerte et son branchement est bon depuis le 23/09
// (`accueilTopsPageArtiste.test.ts` le garde) : c'est la RÉSOLUTION qui
// échouait. Le classement ne porte que le NOM de l'artiste (`TopArtistEntry`,
// serveur `history_repo.rs:1419` — aucun identifiant), et sans correspondance
// exacte `ouvrirArtisteDepuis` retombait sur `activeView.set('library')` SANS
// cible : la Bibliothèque se rouvre dans son dernier état, mot pour mot le
// symptôme.
//
// Les deux causes de l'échec sont MESURÉES sur le .18 le 28/09/2026, les
// cinquante artistes du classement de 30 jours interrogés un par un
// (`GET /library/search`) — 4 échecs sur 50 :
//
//     'Air'   limit=5  → 5 artistes, AUCUN exact (Airto Moreira, Des Airs,
//                        Chairmen of the Board, Fred Astaire, Jefferson
//                        Airplane) ; limit=50 → 17 artistes, exact id 3671
//     'Daft Punk feat. Pharrell Williams' → 0 artiste, à 5 comme à 100 ;
//                        'Daft Punk' seul → exact id 3399
//
// Les deux autres ('Gretchen Parlato', 'Agnes Obel') ne sont PAS dans la
// bibliothèque — écoutés en streaming. Ce ticket ne les traite pas : sans
// service, aucune fiche à ouvrir. Le repli Bibliothèque reste leur sort, et la
// dernière garde de ce fichier l'exige encore — élargir la fenêtre ne doit pas
// devenir « ouvrir un artiste au hasard ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { nomsDeRechercheArtiste } from '../libraryNavigation';
import { artisteLocalParNom, ouvrirArtisteDepuis } from '../ouvrirArtisteDepuis';
import { widgetParId } from '../accueilWidgets';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';
import { currentZoneId } from '../stores/zones';
import { activeView, pendingLibraryArtist, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';

/**
 * La bibliothèque du .18, telle que `GET /library/search?q=Air` la classe :
 * l'entrée cherchée arrive en SIXIÈME position, derrière cinq approchants.
 * C'est tout le défaut — la fenêtre de cinq ne l'atteignait jamais.
 */
const ARTISTES_AIR = [
  { id: 101, name: 'Airto Moreira' },
  { id: 102, name: 'Des Airs' },
  { id: 103, name: 'Chairmen of the Board' },
  { id: 104, name: 'Fred Astaire' },
  { id: 105, name: 'Jefferson Airplane' },
  { id: 3671, name: 'Air' },
];

/** Ce que la bibliothèque rend pour une requête donnée, avant la coupe. */
function bibliotheque(q: string): { id: number; name: string }[] {
  if (q === 'Air') return ARTISTES_AIR;
  if (q === 'Daft Punk') return [{ id: 3399, name: 'Daft Punk' }];
  // Le nom composé de l'historique ne désigne aucune fiche — mesuré.
  if (q === 'Daft Punk feat. Pharrell Williams') return [];
  if (q === 'Dionne Warwick') return [{ id: 51, name: 'Dionne Warwick' }];
  return [];
}

/** Les requêtes parties au serveur, dans l'ordre : `[q, limit]`. */
let appels: [string, number][] = [];

const TABLEAU = {
  period: '7d',
  range: { from: null, to: '' },
  totals: { plays: 10, listening_ms: 1, unique_tracks: 3, unique_artists: 2 },
  top_artists: [{ artist_name: 'Air', plays: 12, listening_ms: 1, cover_path: null }],
  top_albums: [
    { album_title: 'Moon Safari', artist_name: 'Air', cover_path: null, plays: 9, album_id: 4242 },
  ],
  top_tracks: [{ track_id: 777, title: 'La femme d’argent', artist_name: 'Air', plays: 6, listening_ms: 1 }],
  trend: [], hourly: [], by_zone: [], by_source: [],
  completion: { completed: 0, skipped: 0, avg_listened_ms: 0, avg_track_duration_ms: 0 },
};

function poserLeServeur() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      let corps: any = {};
      if (u.includes('/history/dashboard')) corps = TABLEAU;
      else if (u.includes('/library/search')) {
        const p = new URLSearchParams(u.slice(u.indexOf('?') + 1));
        const q = p.get('q') ?? '';
        const limite = Number(p.get('limit') ?? 0);
        appels.push([q, limite]);
        // Le serveur COUPE à `limit` : c'est cette coupe qui cachait l'artiste.
        corps = { artists: bibliotheque(q).slice(0, limite), albums: [], tracks: [] };
      } else if (u.includes('/tracks')) corps = [];
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

beforeEach(() => {
  appels = [];
  poserLeServeur();
  activeView.set('home' as any);
  pendingLibraryArtist.set(null);
  ficheArtisteService.set(null);
  vueDeRetour.set(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('#1696 — les noms sous lesquels un artiste de classement est cherché', () => {
  it('🔴 le nom composé de l’historique laisse sa TÊTE comme second candidat', () => {
    expect(nomsDeRechercheArtiste('Daft Punk feat. Pharrell Williams')).toEqual([
      'Daft Punk feat. Pharrell Williams',
      'Daft Punk',
    ]);
    expect(nomsDeRechercheArtiste('Sia ft. Kendrick Lamar')).toEqual(['Sia ft. Kendrick Lamar', 'Sia']);
    expect(nomsDeRechercheArtiste('Santana featuring Rob Thomas')).toEqual([
      'Santana featuring Rob Thomas',
      'Santana',
    ]);
    expect(nomsDeRechercheArtiste('Eminem (feat. Dido)')).toEqual(['Eminem (feat. Dido)', 'Eminem']);
  });

  it('🔴 un NOM DE GROUPE n’est jamais coupé — « & » et « With » sont des pièges', () => {
    // Les trois sont dans le classement mesuré du .18 : les couper chercherait
    // « Daryl Hall », « Polo », « Diving ».
    expect(nomsDeRechercheArtiste('Daryl Hall & John Oates')).toEqual(['Daryl Hall & John Oates']);
    expect(nomsDeRechercheArtiste('Polo & Pan')).toEqual(['Polo & Pan']);
    expect(nomsDeRechercheArtiste('Diving With Andy')).toEqual(['Diving With Andy']);
    // Le marqueur est un MOT : un nom qui se termine par ces lettres reste entier.
    expect(nomsDeRechercheArtiste('Daft')).toEqual(['Daft']);
    expect(nomsDeRechercheArtiste('Kraftwerk')).toEqual(['Kraftwerk']);
  });

  it('un nom vide ou blanc ne produit aucune recherche', () => {
    expect(nomsDeRechercheArtiste('')).toEqual([]);
    expect(nomsDeRechercheArtiste('   ')).toEqual([]);
    expect(nomsDeRechercheArtiste(null)).toEqual([]);
    expect(nomsDeRechercheArtiste(undefined)).toEqual([]);
  });
});

describe('#1696 — retrouver l’artiste d’un classement dans la bibliothèque', () => {
  it('🔴 « Air » est TROUVÉ : la fenêtre de lecture dépasse les cinq approchants', async () => {
    expect(await artisteLocalParNom('Air'), 'l’artiste « Air » reste introuvable').toEqual({
      id: 3671,
      nom: 'Air',
    });
    expect(appels[0]?.[1], 'la recherche ne lit toujours que cinq résultats').toBeGreaterThanOrEqual(6);
  });

  it('🔴 « Daft Punk feat. Pharrell Williams » ouvre la fiche de Daft Punk', async () => {
    expect(await artisteLocalParNom('Daft Punk feat. Pharrell Williams')).toEqual({
      id: 3399,
      nom: 'Daft Punk',
    });
    expect(appels.map((a) => a[0])).toEqual(['Daft Punk feat. Pharrell Williams', 'Daft Punk']);
  });

  it('un artiste absent de la bibliothèque ne rend RIEN — jamais un approchant', async () => {
    // « Gretchen Parlato » : zéro artiste rendu, mesuré. Et « Dionne » n'est
    // pas « Dionne Warwick » : la correspondance reste EXACTE.
    expect(await artisteLocalParNom('Gretchen Parlato')).toBeNull();
    expect(await artisteLocalParNom('Dionne')).toBeNull();
  });

  it('une recherche qui LÈVE laisse une trace en console et ne bloque pas', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('réseau coupé'); }));
    expect(await artisteLocalParNom('Air')).toBeNull();
    expect(warn, 'le repli reste muet : rien ne distingue une panne d’un artiste absent').toHaveBeenCalled();
  });
});

describe('#1696 — le clic sur un artiste du classement', () => {
  it('🔴 ouvre la PAGE COMMUNE et non la Bibliothèque', async () => {
    await ouvrirArtisteDepuis({ name: 'Air' }, 'home' as any);
    expect(get(activeView), 'le clic retombe sur la Bibliothèque').toBe('streamingartist');
    expect(get(ficheArtisteService)).toEqual({ service: null, id: '3671', nom: 'Air' });
    expect(get(vueDeRetour)).toBe('home');
  });

  it('la fiche porte le nom de l’ARTISTE, pas celui de la piste', async () => {
    await ouvrirArtisteDepuis({ name: 'Daft Punk feat. Pharrell Williams' }, 'home' as any);
    expect(get(ficheArtisteService)).toEqual({ service: null, id: '3399', nom: 'Daft Punk' });
  });

  it('sans correspondance EXACTE, aucune fiche n’est ouverte (non-régression #1437)', async () => {
    await ouvrirArtisteDepuis({ name: 'Gretchen Parlato' }, 'home' as any);
    expect(get(ficheArtisteService), 'un artiste au hasard a été ouvert').toBeNull();
    expect(get(pendingLibraryArtist), 'un artiste au hasard a été ouvert').toBeNull();
    expect(get(activeView)).toBe('library');
  });
});

describe('#1696 — le geste réel, sur le widget monté', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;

  beforeEach(() => {
    currentProfileId.set(1);
    currentZoneId.set(1);
  });
  afterEach(() => {
    if (monte) { unmount(monte); monte = null; }
    hote?.remove();
    hote = null;
  });

  it('🔴 le portrait du classement mène à la fiche de l’artiste', async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(PageWidgets, {
      target: hote,
      props: { catalogue: [widgetParId('tops')!], dispositionDefaut: ['tops'], cle: 'accueil_tops_1696' },
    });
    flushSync();
    await souffler(150);
    flushSync();
    const colonnes = hote.querySelectorAll('.tops .topcol');
    expect(colonnes.length, 'le widget des tops n’a pas rendu ses trois colonnes').toBe(3);
    const bouton = colonnes[0].querySelector('li button.toprang') as HTMLButtonElement;
    bouton.click();
    await souffler(150);
    flushSync();
    expect(get(ficheArtisteService), 'le clic n’ouvre pas la fiche de l’artiste').toEqual({
      service: null,
      id: '3671',
      nom: 'Air',
    });
    expect(get(activeView)).toBe('streamingartist');
  });
});
