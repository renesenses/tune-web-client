/**
 * Favoris — le tri par DATE D'AJOUT, et le tri sur TOUS les types (#2001).
 *
 * Tades, fil forum 1487 :
 *
 * > « J'ai enregistré mes favoris dans le mauvais ordre et aurais aimé les
 * >   écouter dans l'ordre séquentiel. Ne parvenant pas à les déplacer par une
 * >   manœuvre de souris… »
 *
 * La v0.9.96 a livré le tri par titre, artiste et album. Deux moitiés du besoin
 * restaient dehors, et ce sont exactement celles qui le concernaient :
 *
 *  1. **la date d'ajout n'était pas une clé de tri.** La pastille « Date
 *     d'ajout » désignait la clé `defaut`, qui rend la liste TELLE QUE le
 *     serveur l'a donnée — donc du plus récent au plus ancien, sans inversion
 *     possible : le bouton de sens est masqué sur `defaut`. Or « l'ordre
 *     séquentiel » de Tades est le plus ANCIEN d'abord, précisément ce que
 *     l'écran ne savait pas rendre ;
 *  2. **`defaut` n'est même pas un ordre chronologique.** La liste affichée est
 *     la CONCATÉNATION de trois blocs — favoris locaux, favoris de service
 *     posés dans Tune, favoris pris chez le service — chacun trié de son côté.
 *     Un favori Qobuz d'hier se range donc APRÈS un favori local de l'an
 *     dernier. Trier vraiment demande la date elle-même, pas le rang.
 *
 * Et la date n'arrivait pas jusqu'à l'écran : `getFavorites` relit chaque
 * favori par son identifiant et rendait l'objet de bibliothèque SEUL, en
 * laissant tomber le `created_at` de la ligne de favori.
 *
 * Enfin, la table est POLYMORPHE : #2503 y a fait entrer la playlist locale et
 * le label (par facette). Le tri ne valait que pour les pistes, les albums et
 * les artistes ; les deux nouveaux onglets n'avaient aucun tri du tout.
 *
 * ⚠️ Ce que ces tests verrouillent aussi, et qui compte autant : `defaut` rend
 * la liste INCHANGÉE. Personne ne doit voir son écran bouger.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { trier, valeurDeTri, dateDeTri, clesPourOnglet, type CleDeTri } from '../favoritesSort';

// ---------------------------------------------------------------------------
// Le tri par date d'ajout
// ---------------------------------------------------------------------------

const piste = (title: string, favorite_added_at?: string | null) => ({
  title,
  favorite_added_at,
});

describe("tri par date d'ajout", () => {
  it("croissant : le plus ANCIEN d'abord — l'ordre séquentiel que Tades demandait", () => {
    const liste = [
      piste('Troisième', '2026-03-01T10:00:00Z'),
      piste('Premier', '2026-01-01T10:00:00Z'),
      piste('Deuxième', '2026-02-01T10:00:00Z'),
    ];
    expect(trier(liste, 'ajout').map((x) => x.title)).toEqual([
      'Premier',
      'Deuxième',
      'Troisième',
    ]);
  });

  it('décroissant : le plus RÉCENT d\'abord', () => {
    const liste = [
      piste('Premier', '2026-01-01T10:00:00Z'),
      piste('Troisième', '2026-03-01T10:00:00Z'),
      piste('Deuxième', '2026-02-01T10:00:00Z'),
    ];
    expect(trier(liste, 'ajout', true).map((x) => x.title)).toEqual([
      'Troisième',
      'Deuxième',
      'Premier',
    ]);
  });

  it('range le 9 avant le 10 du même mois — une comparaison de dates, pas de rangs', () => {
    // Le piège des dates rendues en chaîne : « 2026-01-9 » passerait après
    // « 2026-01-10 ». Le serveur écrit de l'ISO-8601 zéro-complété ; ce test
    // interdit qu'on s'en écarte sans le voir.
    const liste = [
      piste('dix', '2026-01-10T00:00:00Z'),
      piste('neuf', '2026-01-09T23:59:59Z'),
    ];
    expect(trier(liste, 'ajout').map((x) => x.title)).toEqual(['neuf', 'dix']);
  });

  it('une entrée SANS date finit la liste, dans les DEUX sens', () => {
    // Les favoris pris chez le service (Qobuz/Tidal « starred ») n'ont aucune
    // date d'ajout côté Tune. Les remonter en tête d'une liste décroissante
    // donnerait l'apparence d'un écran cassé — même règle que les champs texte
    // absents, déjà posée en v0.9.96.
    const liste = [
      piste('sans date', null),
      piste('ancien', '2026-01-01T10:00:00Z'),
      piste('récent', '2026-06-01T10:00:00Z'),
    ];
    expect(trier(liste, 'ajout').map((x) => x.title)).toEqual([
      'ancien',
      'récent',
      'sans date',
    ]);
    expect(trier(liste, 'ajout', true).map((x) => x.title)).toEqual([
      'récent',
      'ancien',
      'sans date',
    ]);
  });

  it('lit aussi `created_at` — la forme rendue par les favoris de service et de facette', () => {
    // `streaming_favorites` et `favorite_facets` rendent leur date sous le nom
    // `created_at`, sans passer par la ré-hydratation de `getFavorites`.
    const liste = [
      { title: 'récent', created_at: '2026-06-01T10:00:00Z' },
      { title: 'ancien', created_at: '2026-01-01T10:00:00Z' },
    ];
    expect(trier(liste, 'ajout').map((x) => x.title)).toEqual(['ancien', 'récent']);
    expect(dateDeTri({ created_at: '2026-01-01T10:00:00Z' })).toBe('2026-01-01T10:00:00Z');
  });

  it('ne modifie pas la liste reçue', () => {
    const liste = [piste('b', '2026-02-01'), piste('a', '2026-01-01')];
    trier(liste, 'ajout');
    expect(liste.map((x) => x.title)).toEqual(['b', 'a']);
  });
});

// ---------------------------------------------------------------------------
// L'ordre par défaut ne bouge pas
// ---------------------------------------------------------------------------

describe("l'ordre par défaut est intact", () => {
  // Les dates sont choisies pour qu'AUCUN tri ne rende cet ordre : ni
  // croissant (B, C, A) ni décroissant (A, C, B). Un `defaut` qui se mettrait
  // à trier serait donc vu, quel que soit le sens qu'il prendrait — c'est tout
  // l'objet de ces deux tests.
  const contredit = () => [
    piste('A', '2026-03-01T10:00:00Z'),
    piste('B', '2026-01-01T10:00:00Z'),
    piste('C', '2026-02-01T10:00:00Z'),
  ];

  it('`defaut` rend la liste telle quelle, même si les dates la contredisent', () => {
    expect(trier(contredit(), 'defaut').map((x) => x.title)).toEqual(['A', 'B', 'C']);
  });

  it('`defaut` ignore le sens : il n\'y a pas de sens sur « tel quel »', () => {
    expect(trier(contredit(), 'defaut', true).map((x) => x.title)).toEqual(['A', 'B', 'C']);
  });

  it('`defaut` est la PREMIÈRE clé de chacun des cinq onglets', () => {
    for (const onglet of ['tracks', 'albums', 'artists', 'playlists', 'labels'] as const) {
      expect(clesPourOnglet(onglet)[0]).toBe('defaut');
    }
  });
});

// ---------------------------------------------------------------------------
// Le tri vaut pour TOUS les types d'entrée
// ---------------------------------------------------------------------------

describe('le tri vaut pour tous les types de favori', () => {
  it("l'onglet Playlists propose le titre et la date d'ajout", () => {
    expect(clesPourOnglet('playlists')).toEqual(['defaut', 'titre', 'ajout']);
  });

  it("l'onglet Labels propose le titre et la date d'ajout", () => {
    expect(clesPourOnglet('labels')).toEqual(['defaut', 'titre', 'ajout']);
  });

  it("les trois onglets d'origine gagnent la date d'ajout sans rien perdre", () => {
    expect(clesPourOnglet('tracks')).toEqual(['defaut', 'titre', 'artiste', 'album', 'ajout']);
    expect(clesPourOnglet('albums')).toEqual(['defaut', 'titre', 'artiste', 'ajout']);
    expect(clesPourOnglet('artists')).toEqual(['defaut', 'titre', 'ajout']);
  });

  it('une playlist se trie par son `name`', () => {
    const liste = [{ name: 'Zéphyr' }, { name: 'Aurore' }];
    expect(trier(liste, 'titre').map((x) => x.name)).toEqual(['Aurore', 'Zéphyr']);
  });

  it('un label se trie par sa VALEUR — il n\'a ni titre ni nom', () => {
    // `favorite_facets` désigne un label par une chaîne : `{ facet, value }`.
    // Sans cette forme, `valeurDeTri` rendait '' pour tous les labels et le
    // tri les laissait dans un ordre inchangé, en silence.
    expect(valeurDeTri({ value: 'ECM Records' }, 'titre')).toBe('ECM Records');
    const liste = [{ value: 'Verve' }, { value: 'Blue Note' }, { value: 'ECM' }];
    expect(trier(liste, 'titre').map((x) => x.value)).toEqual(['Blue Note', 'ECM', 'Verve']);
  });

  it('un label accentué se range avec sa lettre, pas en fin de liste', () => {
    const liste = [{ value: 'Zig-Zag' }, { value: 'Éditions Alpha' }, { value: 'Alpha' }];
    expect(trier(liste, 'titre').map((x) => x.value)).toEqual([
      'Alpha',
      'Éditions Alpha',
      'Zig-Zag',
    ]);
  });
});

// ---------------------------------------------------------------------------
// La date doit ARRIVER jusqu'à l'écran
// ---------------------------------------------------------------------------

vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k),
});
vi.stubGlobal('window', { ...globalThis.window, location: { hash: '' } });

let fetchCalls: string[] = [];
function mockFetchPar(routeur: (url: string) => unknown) {
  const fn = vi.fn(async (url: string) => {
    fetchCalls.push(url);
    const body = routeur(url);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => body,
      text: async () => JSON.stringify(body ?? null),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

let api: typeof import('../api');

beforeEach(async () => {
  fetchCalls = [];
  storage.clear();
  vi.resetModules();
  api = await import('../api');
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getFavorites porte la date d'ajout jusqu'à l'écran", () => {
  const routeur = (url: string) => {
    if (url.includes('/favorites')) {
      return [
        { item_type: 'track', item_id: 7, created_at: '2026-01-05T09:00:00Z' },
        { item_type: 'track', item_id: 8, created_at: '2026-03-05T09:00:00Z' },
        { item_type: 'album', item_id: 3, created_at: '2026-02-05T09:00:00Z' },
        { item_type: 'artist', item_id: 4, created_at: '2026-04-05T09:00:00Z' },
        { item_type: 'playlist', item_id: 9, created_at: '2026-05-05T09:00:00Z' },
      ];
    }
    if (url.includes('/library/tracks/')) {
      const id = Number(url.split('/').pop());
      return { id, title: `piste ${id}` };
    }
    if (url.includes('/library/albums/')) return { id: 3, title: 'un album' };
    if (url.includes('/library/artists/')) return { id: 4, name: 'un artiste' };
    if (url.includes('/playlists/')) return { id: 9, name: 'une playlist' };
    return null;
  };

  it('chaque favori réhydraté porte `favorite_added_at`', async () => {
    mockFetchPar(routeur);
    const out = await api.getFavorites(1);

    expect(out.tracks.map((t: any) => t.favorite_added_at)).toEqual([
      '2026-01-05T09:00:00Z',
      '2026-03-05T09:00:00Z',
    ]);
    expect((out.albums[0] as any).favorite_added_at).toBe('2026-02-05T09:00:00Z');
    expect((out.artists[0] as any).favorite_added_at).toBe('2026-04-05T09:00:00Z');
    expect((out.playlists[0] as any).favorite_added_at).toBe('2026-05-05T09:00:00Z');
  });

  it("la date accompagne le BON favori, pas celui d'à côté", () => {
    // Le défaut qu'un `map` sur deux listes parallèles produit sans bruit :
    // une relecture qui échoue décale toutes les dates suivantes d'un cran.
    return (async () => {
      mockFetchPar((url) => {
        if (url.endsWith('/library/tracks/7')) throw new Error('piste supprimée');
        return routeur(url);
      });
      const out = await api.getFavorites(1);
      expect(out.tracks).toHaveLength(1);
      expect((out.tracks[0] as any).id).toBe(8);
      expect((out.tracks[0] as any).favorite_added_at).toBe('2026-03-05T09:00:00Z');
    })();
  });

  it("l'objet de bibliothèque n'est pas amputé au passage", async () => {
    mockFetchPar(routeur);
    const out = await api.getFavorites(1);
    expect(out.tracks[0]).toMatchObject({ id: 7, title: 'piste 7' });
  });

  it("l'ordre rendu par le serveur est conservé — l'ordre d'ajout reste le défaut", async () => {
    mockFetchPar((url) => {
      if (url.includes('/profiles/1/favorites')) {
        return [
          { item_type: 'track', item_id: 8, created_at: '2026-03-05T09:00:00Z' },
          { item_type: 'track', item_id: 7, created_at: '2026-01-05T09:00:00Z' },
        ];
      }
      return routeur(url);
    });
    const out = await api.getFavorites(1);
    expect(out.tracks.map((t: any) => t.id)).toEqual([8, 7]);
  });
});

describe('un favori de service porte sa date', () => {
  it('`created_at` traverse getProfileStreamingFavorites', async () => {
    mockFetchPar(() => [
      {
        id: 1,
        profile_id: 1,
        item_type: 'track',
        service: 'qobuz',
        service_id: 'q1',
        title: 'une piste Qobuz',
        created_at: '2026-02-02T08:00:00Z',
      },
    ]);
    const favs = await api.getProfileStreamingFavorites(1);
    expect(favs[0].created_at).toBe('2026-02-02T08:00:00Z');
  });
});

// ---------------------------------------------------------------------------
// Les clés existantes ne régressent pas
// ---------------------------------------------------------------------------

describe('les clés livrées en v0.9.96 sont intactes', () => {
  it('titre, artiste et album trient toujours comme avant', () => {
    const liste = [
      { title: 'Volume 10', artist_name: 'Zoé', album_title: 'B' },
      { title: 'Volume 2', artist_name: 'Édith', album_title: 'A' },
    ];
    expect(trier(liste, 'titre').map((x) => x.title)).toEqual(['Volume 2', 'Volume 10']);
    expect(trier(liste, 'artiste').map((x) => x.artist_name)).toEqual(['Édith', 'Zoé']);
    expect(trier(liste, 'album').map((x) => x.album_title)).toEqual(['A', 'B']);
  });

  it('un champ texte absent finit la liste, dans les deux sens', () => {
    const liste = [{ title: '' }, { title: 'Bêta' }, { title: 'Alpha' }];
    expect(trier(liste, 'titre').map((x) => x.title)).toEqual(['Alpha', 'Bêta', '']);
    expect(trier(liste, 'titre', true).map((x) => x.title)).toEqual(['Bêta', 'Alpha', '']);
  });

  it('toute clé annoncée par un onglet est comprise par `trier`', () => {
    // Un onglet qui offrirait une clé que `trier` ignore rendrait une pastille
    // sans effet — le mal exact que Tades a rencontré.
    const liste = [
      { title: 'b', name: 'b', value: 'b', artist_name: 'b', album_title: 'b', favorite_added_at: '2026-02-01' },
      { title: 'a', name: 'a', value: 'a', artist_name: 'a', album_title: 'a', favorite_added_at: '2026-01-01' },
    ];
    for (const onglet of ['tracks', 'albums', 'artists', 'playlists', 'labels'] as const) {
      for (const cle of clesPourOnglet(onglet)) {
        if (cle === 'defaut') continue;
        expect(trier(liste, cle as CleDeTri).map((x) => x.title), `${onglet}/${cle}`).toEqual([
          'a',
          'b',
        ]);
      }
    }
  });
});
