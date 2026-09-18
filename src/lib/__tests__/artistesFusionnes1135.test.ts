// @vitest-environment jsdom
//
// renesenses/tune-web-client#1135 — FabienM, fil forum 1762 (11/09/2026),
// v0.9.145 :
//
//   « Exemple: je cherche "Pink Floyd", je vais avoir 3 résultats pour le même
//     artiste, un pour le local, un pour Qobuz et un pour Bancamp. Il faut
//     unifier et faire qu'une vignette avec un label par source (ce qui
//     existait déjà pour l'interface actuelle). »
//
// `fusionnerParType` CONCATÈNE : un `push` par ligne et par source, aucune
// `Map`, aucune clé de regroupement. Trois sources qui connaissent Pink Floyd
// donnent donc trois vignettes.
//
// ══════════════════════════════════════════════════════════════════════════
// 🔴 CE TÉMOIN MONTE L'ÉCRAN ET COMPTE SES VIGNETTES.
//
// Pas une garde de texte : chercher `Map` dans `rechercheClassement.ts`
// resterait vert si `SearchV2` cessait d'appeler le regroupement — « écrit
// mais pas branché ».
//
// 🔴 ET IL N'ÉTEND RIEN AUX ALBUMS.
//
// Le corps de l'issue établit que l'ANCIENNE interface fusionne les artistes
// (`SearchView.groupedArtists`, `Map` sur `name.toLowerCase()`) mais PAS les
// albums (`groupedAlbums` pousse à plat, malgré son nom). « Idem pour les
// albums (ce qui existait déjà) » est inexact, et deux éditions d'un même
// titre ne sont pas un doublon : masters différents, années différentes.
// La dernière assertion de ce fichier GARDE cette frontière — si quelqu'un
// étendait la fusion aux albums, elle rougirait.
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import { setSearchCriteria } from '../stores/shortcuts';
import { preferences } from '../stores/preferences';
import { fusionnerParType } from '../rechercheClassement';

/**
 * 🔴 Chargé PAR PROPRIÉTÉ, pas par `import` nommé — et c'est délibéré.
 *
 * Un `import { regrouperArtistes }` d'un export qui n'existe pas encore fait
 * échouer le LIEN du module : le fichier entier ne se charge pas, et les
 * assertions d'écran ci-dessous n'ont jamais l'occasion de rougir. On aurait
 * alors un rouge de compilation à la place d'un rouge de mesure, et on ne
 * saurait pas ce que l'écran fait aujourd'hui.
 */
const regrouperArtistes = async (rows: unknown[]): Promise<any[]> => {
  const mod: any = await import('../rechercheClassement');
  if (typeof mod.regrouperArtistes !== 'function') {
    throw new Error('rechercheClassement n’exporte aucun regrouperArtistes — #1135');
  }
  return mod.regrouperArtistes(rows);
};

vi.setConfig({ testTimeout: 30_000 });

/** La requête de sa capture. */
const REQUETE = 'Pink Floyd';

const vide = { artists: [], albums: [], tracks: [], playlists: [] };

/** Le MÊME artiste, dans les trois seaux de son exemple. */
const LOCAL = {
  ...vide,
  artists: [{ id: 42, name: 'Pink Floyd', image_path: '/artists/pf.jpg' }],
  // Deux ÉDITIONS du même album, exprès : le témoin des albums s'en sert.
  albums: [{ id: 60, title: 'Wish You Were Here', artist_name: 'Pink Floyd', year: 1975, cover_path: '/c/a.jpg' }],
};

const SERVICES = {
  qobuz: {
    ...vide,
    artists: [{ id: null, source_id: '2113961', name: 'Pink Floyd', image_path: null }],
    albums: [{ id: null, source_id: 'q-1', title: 'Wish You Were Here', artist_name: 'Pink Floyd', year: 2011, cover_path: null }],
  },
  bandcamp: {
    ...vide,
    // La CASSE diffère — l'ancienne interface apparie sur `name.toLowerCase()`.
    artists: [{ id: null, source_id: 'pinkfloyd.bandcamp.com', name: 'PINK FLOYD', image_path: '/artists/pf-bc.jpg' }],
    albums: [{ id: null, source_id: 'b-1', title: 'Wish You Were Here', artist_name: 'Pink Floyd', year: 2016, cover_path: null }],
  },
  youtube: {
    ...vide,
    // Un artiste VOISIN, pas le même : il ne doit PAS être avalé par la fusion.
    artists: [{ id: null, source_id: 'UCxxx', name: 'New Pink Floyd', image_path: null }],
  },
};

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function reponse(corps: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      if (/\/library\/search/.test(u)) return reponse(LOCAL);
      if (/\/search\?/.test(u)) return reponse({ local: LOCAL, services: SERVICES, radios: [] });
      if (/\/playlists/.test(u)) return reponse([]);
      return reponse([]);
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  setSearchCriteria(null);
  vi.unstubAllGlobals();
});

async function chercher(): Promise<HTMLDivElement> {
  setSearchCriteria({ q: REQUETE });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SearchV2, { target: hote, props: {} as any });
  flushSync();
  // L'anti-rebond de la recherche vaut 240 ms ; on le laisse passer.
  await new Promise((r) => setTimeout(r, 320));
  for (let i = 0; i < 10; i++) await respirer();
  flushSync();
  return hote;
}

/** Les vignettes de la rangée « Artistes ». */
const vignettes = (el: HTMLElement) => [...el.querySelectorAll('.arow .artile')];
/** Le nom peint sur une vignette. */
const nom = (t: Element) => (t.querySelector('.an')?.textContent ?? '').trim();

describe('#1135 — le même artiste ne sort qu’UNE fois', () => {
  it('la réponse mesurée contient bien trois fois « Pink Floyd » — sinon le témoin ne mesure rien', () => {
    // La contre-épreuve amont : si le jeu d'essai ne portait pas le doublon,
    // le reste du fichier serait vert sans rien prouver.
    const g = fusionnerParType(LOCAL as any, SERVICES as any);
    expect(g.artistes.map((a) => a.name)).toEqual(['Pink Floyd', 'Pink Floyd', 'PINK FLOYD', 'New Pink Floyd']);
  });

  it('🔴 trois sources, UNE vignette « Pink Floyd »', async () => {
    const el = await chercher();
    const pf = vignettes(el).filter((t) => nom(t).toLowerCase() === 'pink floyd');
    expect(
      pf.length,
      'le même artiste sort en autant de vignettes que de sources — #1135',
    ).toBe(1);
  });

  it('🔴 la vignette fusionnée DIT ses trois provenances', async () => {
    // Dédupliquer sans dire d'où vient l'artiste, ce serait échanger un défaut
    // contre un autre : la pastille `OÙ` annonce « Bibliothèque · Bandcamp ·
    // Qobuz », et la vignette doit rester d'accord avec elle.
    const el = await chercher();
    const pf = vignettes(el).find((t) => nom(t).toLowerCase() === 'pink floyd');
    expect(pf, 'aucune vignette « Pink Floyd »').toBeTruthy();
    const peintes = [...pf!.querySelectorAll('.asrc .service-badge')].map((b) => (b.textContent ?? '').trim());
    expect(
      peintes,
      'la vignette fusionnée a perdu l’information de source',
    ).toEqual(['LOCAL', 'QOBUZ', 'BANDCAMP']);
  });

  it('🔴 un artiste VOISIN n’est pas avalé — « New Pink Floyd » garde sa vignette', async () => {
    const el = await chercher();
    expect(
      vignettes(el).map(nom).sort(),
      'la fusion a mangé un artiste différent',
    ).toEqual(['New Pink Floyd', 'Pink Floyd']);
  });

  it('🔴 la vignette fusionnée garde le PORTRAIT disponible', async () => {
    // Qobuz ne rend pas d'`image_path` ici. Si la fusion retenait sa ligne
    // sans reprendre l'image des autres, on perdrait le portrait — l'ancienne
    // interface reprend « la première `image_path` disponible ».
    const el = await chercher();
    const pf = vignettes(el).find((t) => nom(t).toLowerCase() === 'pink floyd');
    expect(pf!.querySelector('img'), 'le portrait a été perdu par la fusion').not.toBeNull();
  });
});

describe('#1135 — la fonction de regroupement, hors de l’écran', () => {
  it('🔴 apparie sur le nom insensible à la casse, comme l’ancienne interface', async () => {
    const { artistes } = fusionnerParType(LOCAL as any, SERVICES as any);
    const g = await regrouperArtistes(artistes);
    expect(g.map((a) => a.name)).toEqual(['Pink Floyd', 'New Pink Floyd']);
    expect(g[0].sources.map((s: any) => s.source)).toEqual(['local', 'qobuz', 'bandcamp']);
  });

  it('🔴 le rang de source décide QUI prime — le local passe devant', async () => {
    // C'est la table `RANG_SOURCE` déjà en place (#856), pas une seconde qui
    // divergerait. La ligne retenue porte l'identité : c'est elle qui décide
    // du cœur, du crayon et de la destination du clic.
    const { artistes } = fusionnerParType(LOCAL as any, SERVICES as any);
    const [pf] = await regrouperArtistes(artistes);
    expect(pf.source).toBe('local');
    expect(pf.id).toBe(42);
  });

  it('🔴 sans ligne locale, c’est la source la mieux rangée qui prime', async () => {
    const { artistes } = fusionnerParType(null, {
      youtube: { artists: [{ id: null, source_id: 'y', name: 'X' }] },
      qobuz: { artists: [{ id: null, source_id: 'q', name: 'X' }] },
    } as any);
    const [x] = await regrouperArtistes(artistes);
    expect(x.source).toBe('qobuz');
    expect(x.source_id).toBe('q');
    expect(x.sources.map((s: any) => s.source)).toEqual(['qobuz', 'youtube']);
  });

  it('chaque provenance garde SA ligne — le badge sait encore où il mène', async () => {
    const { artistes } = fusionnerParType(LOCAL as any, SERVICES as any);
    const [pf] = await regrouperArtistes(artistes);
    const bc = pf.sources.find((s: any) => s.source === 'bandcamp');
    expect(bc?.artiste.source_id).toBe('pinkfloyd.bandcamp.com');
  });

  it('une même source deux fois ne compte qu’un badge', async () => {
    const g = await regrouperArtistes([
      { id: null, source_id: 'a', name: 'X', source: 'qobuz' },
      { id: null, source_id: 'b', name: 'X', source: 'qobuz' },
    ] as any);
    expect(g[0].sources.map((s: any) => s.source)).toEqual(['qobuz']);
  });
});

describe('#1135 — la fusion s’arrête aux ARTISTES', () => {
  it('🔴 les ALBUMS ne sont PAS dédupliqués — trois éditions, trois vignettes', async () => {
    // L'ancienne interface ne le fait pas (`groupedAlbums` pousse à plat), le
    // corps de l'issue le dit, et deux éditions d'un même titre sont deux
    // objets différents. Cette PR ne le fait pas non plus : cette assertion
    // rougirait si on étendait la fusion par mégarde.
    const el = await chercher();
    const titres = [...el.querySelectorAll('.grid .card')]
      .map((c) => (c.querySelector('.ct')?.textContent ?? '').trim())
      .filter((t) => t.toLowerCase() === 'wish you were here');
    expect(
      titres.length,
      'les albums ont été dédupliqués — hors périmètre de #1135',
    ).toBe(3);
  });
});
