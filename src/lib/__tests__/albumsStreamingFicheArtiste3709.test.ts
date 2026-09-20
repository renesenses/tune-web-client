// @vitest-environment jsdom
//
// renesenses/tune-server-rust#3709 — FabienM, fil forum 1726 (08/09/2026),
// v0.9.143 :
//
//   « Dans menu bibliothèque, si on sélectionne un artiste, on a que les
//     albums de sa bibliothèque. Il manque ses albums des services de
//     streaming, comme le fait Roon depuis sa bibliothèque »
//
//   « Ex ici: artiste Alain Souchon, il retourne que mon seul album de ma
//     bibliothèque. Il manque tous ses albums de Qobuz / Tidal / Bandcamp /
//     Youtube »
//
// `ArtistesV2.svelte` n'appelait que `api.getArtistAlbums` (lignes 141 et 212
// sur `origin/main`), et `git grep -c streaming` n'y rendait AUCUNE
// correspondance. Côté serveur, `artist_albums` ne lit que `AlbumRepo` — la
// bibliothèque locale, rien d'autre. La capacité, elle, existe et sert :
// `LibraryView.svelte:1821` et `StreamingView.svelte:792` appellent
// `getStreamingArtistAlbums` depuis longtemps. Une moitié non portée.
//
// 🔴 DEUX ÉTAGES DE TÉMOINS, et aucun ne lit du source :
//   • le module reçoit ses deux appels réseau INJECTÉS : la garde les fournit
//     et regarde ce qui part et ce qui revient ;
//   • l'écran est MONTÉ, avec `fetch` bouchonné : la garde lit les URL
//     réellement demandées et le DOM réellement rendu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ArtistesV2 from '../../components/v2/ArtistesV2.svelte';
import {
  albumsDeStreamingPourArtiste,
  apparierArtiste,
  servicesInterrogeables,
  statutsStreaming,
  type PasserellesStreaming,
} from '../albumsArtisteStreaming';
import { streamingServices } from '../stores/streaming';
import { currentZoneId } from '../stores/zones';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });

// ── Étage 1 : le module, appelé pour de bon ────────────────────────────────

/** Une passerelle qui NOTE ce qu'on lui demande. */
function passerelles(
  artistes: Record<string, { id?: unknown; source_id?: unknown; name: string }[]>,
  albums: Record<string, Album[]>,
  quiEchoue: string[] = [],
) {
  const vus: string[] = [];
  const p: PasserellesStreaming = {
    resoudreArtiste: async (service, nom) => {
      vus.push(`search:${service}:${nom}`);
      if (quiEchoue.includes(service)) throw new Error('session expirée');
      return artistes[service] ?? [];
    },
    albumsDeLArtiste: async (service, id) => {
      vus.push(`albums:${service}:${id}`);
      if (quiEchoue.includes(service)) throw new Error('session expirée');
      return albums[`${service}:${id}`] ?? [];
    },
  };
  return { p, vus };
}

const al = (o: Partial<Album>) => o as Album;

describe('#3709 — quels services on interroge', () => {
  it('seulement ceux dont la SESSION est ouverte', () => {
    // Un service activé mais déconnecté rendrait un 401 par artiste ouvert.
    expect(
      servicesInterrogeables({
        qobuz: { enabled: true, authenticated: true } as never,
        tidal: { enabled: true, authenticated: false } as never,
        deezer: { enabled: false, authenticated: false } as never,
      }),
    ).toEqual(['qobuz']);
  });

  it('aucun statut connu ⇒ aucun service', () => {
    expect(servicesInterrogeables(null)).toEqual([]);
    expect(servicesInterrogeables({})).toEqual([]);
  });
});

describe('#4330 — les statuts des services, chargés s’il le faut', () => {
  const connecte = { qobuz: { enabled: true, authenticated: true } as never };
  it('magasin garni : on s’en sert, sans appel', async () => {
    let appele = false;
    const r = await statutsStreaming(connecte, async () => { appele = true; return {}; }, () => {});
    expect(r).toBe(connecte);
    expect(appele).toBe(false);
  });
  it('magasin vide : on charge, et on RANGE pour les écrans suivants', async () => {
    let range: unknown = null;
    const r = await statutsStreaming({}, async () => connecte, (x) => { range = x; });
    expect(r).toEqual(connecte);
    expect(range).toEqual(connecte);
  });
  it('échec du chargement : rien, sans lever', async () => {
    expect(await statutsStreaming(null, async () => { throw new Error('502'); }, () => {})).toEqual({});
  });
});

describe('#3709 — quel artiste du service est le nôtre', () => {
  it('le nom EXACT prime, casse ignorée', () => {
    expect(
      apparierArtiste(
        [{ id: 'A1', name: 'Alain Souchon & Laurent Voulzy' }, { id: 'A2', name: 'alain souchon' }],
        'Alain Souchon',
      ),
    ).toBe('A2');
  });

  // ⚠️ Attente RÉVISÉE par #1373. Elle figeait le repli « à défaut, le
  // PREMIER », qui est exactement ce que FabienM a vu en 0.9.158 : sa fiche
  // « Matt Elliott » recevait la discographie de Keystone Homeschool, parce que
  // le service, ne connaissant pas l'artiste, rend quand même des résultats.
  // « Souchon Alain » n'est pas « Alain Souchon » pour la normalisation (ordre
  // des mots) : ce service n'aura donc pas de section, au lieu d'en avoir une
  // fausse.
  it('sans correspondance de nom, AUCUN artiste n’est adopté (#1373)', () => {
    expect(apparierArtiste([{ id: 'A1', name: 'Souchon Alain' }], 'Alain Souchon')).toBeNull();
  });

  it('`source_id` fait foi quand `id` manque, et rien ⇒ null', () => {
    expect(apparierArtiste([{ source_id: 77, name: 'X' }], 'X')).toBe('77');
    expect(apparierArtiste([], 'X')).toBeNull();
    expect(apparierArtiste([{ name: 'X' }], 'X')).toBeNull();
  });
});

describe('#3709 — ce que les services rendent pour l’artiste', () => {
  it('interroge chaque service et TAMPONNE la source', async () => {
    // 🔴 Le serveur ne pose `source` sur aucun objet de streaming. Sans le
    // tampon, l'album n'est ni ouvrable ni jouable : il ne dit plus d'où il
    // vient.
    const { p, vus } = passerelles(
      { qobuz: [{ id: 'Q7', name: 'Alain Souchon' }] },
      { 'qobuz:Q7': [al({ id: null, title: 'Ultra Moderne Solitude', source_id: 'AL1' })] },
    );
    const sections = await albumsDeStreamingPourArtiste('Alain Souchon', ['qobuz'], p);

    expect(vus).toEqual(['search:qobuz:Alain Souchon', 'albums:qobuz:Q7']);
    expect(sections).toHaveLength(1);
    expect(sections[0].service).toBe('qobuz');
    expect(sections[0].albums[0].title).toBe('Ultra Moderne Solitude');
    expect(sections[0].albums[0].source, 'la source n’a pas été tamponnée').toBe('qobuz');
  });

  it('un service qui ÉCHOUE ne fait pas tomber les autres', async () => {
    // Une session Tidal expirée cacherait sinon les albums Qobuz.
    const { p } = passerelles(
      { qobuz: [{ id: 'Q7', name: 'Alain Souchon' }] },
      { 'qobuz:Q7': [al({ id: null, title: 'C’est déjà ça', source_id: 'AL2' })] },
      ['tidal'],
    );
    const sections = await albumsDeStreamingPourArtiste('Alain Souchon', ['tidal', 'qobuz'], p);
    expect(sections.map((s) => s.service)).toEqual(['qobuz']);
  });

  it('un service qui ne connaît pas l’artiste n’ouvre pas de section vide', async () => {
    const { p, vus } = passerelles({ qobuz: [] }, {});
    expect(await albumsDeStreamingPourArtiste('Inconnu', ['qobuz'], p)).toEqual([]);
    // Et on ne demande PAS ses albums : il n'y a pas d'identifiant à passer.
    expect(vus).toEqual(['search:qobuz:Inconnu']);
  });

  it('sans nom d’artiste, AUCUN appel', async () => {
    const { p, vus } = passerelles({}, {});
    expect(await albumsDeStreamingPourArtiste('   ', ['qobuz'], p)).toEqual([]);
    expect(vus).toEqual([]);
  });
});

// ── Étage 2 : l'écran ──────────────────────────────────────────────────────

const ARTISTE = { id: 3, name: 'Alain Souchon' };
/** Le seul album de sa bibliothèque, celui de sa capture. */
const LOCAUX = [{ id: 7, title: 'Au Ras Des Paquerettes', artist_name: 'Alain Souchon', year: 1999 }];
const CHEZ_QOBUZ = [
  { id: null, title: 'Ultra Moderne Solitude', source_id: 'AL1', year: 1988 },
  { id: null, title: 'C’est déjà ça', source_id: 'AL2', year: 1993 },
];

let appels: string[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function corpsPour(url: string): unknown {
  if (/\/streaming\/services/.test(url)) {
    return { qobuz: { enabled: true, authenticated: true }, tidal: { enabled: true, authenticated: false } };
  }
  if (/\/search\?/.test(url)) {
    return { local: { tracks: [], albums: [], artists: [], playlists: [] },
             services: { qobuz: { tracks: [], albums: [], artists: [{ id: 'Q7', name: 'Alain Souchon' }], playlists: [] } } };
  }
  if (/\/streaming\/qobuz\/artists\/Q7\/albums/.test(url)) return CHEZ_QOBUZ;
  if (/\/streaming\/qobuz\/albums\/AL1\/tracks/.test(url)) {
    return [{ id: null, title: 'Quand je serai KO', source_id: 'T1' }];
  }
  if (/\/streaming\/qobuz\/artists\/Q7\/top-tracks/.test(url)) {
    return [{ id: null, source_id: 'TT1', title: 'Foule sentimentale', artist_name: 'Alain Souchon' }];
  }
  if (/\/library\/artists\/3\/bio/.test(url)) {
    return { artist: 'Alain Souchon', bio: 'Chanteur français né en 1944.' };
  }
  if (/\/library\/artists\/3\/albums/.test(url)) return LOCAUX;
  if (/\/library\/artists/.test(url)) return [ARTISTE];
  return {};
}

beforeEach(() => {
  appels = [];
  currentZoneId.set(1);
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  // Qobuz connecté, Tidal activé mais déconnecté : le second ne doit JAMAIS
  // être interrogé.
  streamingServices.set({
    qobuz: { enabled: true, authenticated: true } as never,
    tidal: { enabled: true, authenticated: false } as never,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      appels.push(String(url));
      const corps = corpsPour(String(url));
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
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  streamingServices.set({});
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

/** `ouvrirId` ouvre la fiche dès que la liste est là — le même chemin que le
 *  clic sur une vignette, sans traverser la grille. */
async function poserFiche(extra: Record<string, unknown> = {}): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ArtistesV2, { target: hote, props: { q: '', ouvrirId: 3, ...extra } });
  for (let i = 0; i < 12; i++) await respirer();
  flushSync();
  return hote;
}

const titres = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('.carte .ct')).map((n) => n.textContent);

describe('#3709 — la fiche artiste montre AUSSI les albums des services', () => {
  it('elle va les chercher, et par la route de STREAMING', async () => {
    await poserFiche();
    expect(
      appels.some((u) => /\/streaming\/qobuz\/artists\/Q7\/albums/.test(u)),
      'aucun album de service n’a été demandé : la fiche ne connaît que la bibliothèque locale.\n' +
        `URL vues : ${appels.join(' | ')}`,
    ).toBe(true);
  });

  it('les albums du service sont À L’ÉCRAN, avec ceux de la bibliothèque', async () => {
    const el = await poserFiche();
    const vus = titres(el);
    expect(vus, `titres rendus : ${JSON.stringify(vus)}`).toContain('Au Ras Des Paquerettes');
    expect(
      vus,
      'les albums de Qobuz ne sont pas affichés — c’est exactement ce que Fabien signale',
    ).toContain('Ultra Moderne Solitude');
    // #4330 : la grille est COMMUNE et triée (année par défaut) — la
    // bibliothèque n'est plus un bloc placé avant les services.
  });

  it('#4330 — UNE grille : chaque vignette dit ses sources, plus de section par service', async () => {
    // Les sections séparées de #3709 ont cédé la place à la discographie
    // commune (FabienM, fil 1823).
    const el = await poserFiche();
    expect(el.querySelectorAll('.svc'), 'une section par service a survécu').toHaveLength(0);
    const sources = Object.fromEntries(
      Array.from(el.querySelectorAll<HTMLElement>('.carte[data-sources]'))
        .map((c) => [c.querySelector('.ct')?.textContent, c.dataset.sources]),
    );
    expect(sources['Au Ras Des Paquerettes']).toBe('local');
    expect(sources['Ultra Moderne Solitude']).toBe('qobuz');
  });

  it('un service DÉCONNECTÉ n’est jamais interrogé', async () => {
    await poserFiche();
    expect(
      appels.filter((u) => /tidal/.test(u)),
      'Tidal est déconnecté : l’interroger rendrait un 401 par artiste ouvert',
    ).toEqual([]);
  });

  it('#4330 — magasin des services VIDE (nouveau client) : la fiche charge les statuts et interroge Qobuz', async () => {
    // Mesuré sur le .18 le 17/09/2026 : aucun écran v2 ne remplit
    // `streamingServices`, et la fiche n'interrogeait alors aucun service.
    streamingServices.set({});
    const el = await poserFiche();
    expect(appels.some((u) => /\/streaming\/services/.test(u)), 'les statuts n’ont pas été demandés').toBe(true);
    expect(
      appels.some((u) => /\/streaming\/qobuz\/artists\/Q7\/albums/.test(u)),
      `Qobuz n’a pas été interrogé. URL vues : ${appels.join(' | ')}`,
    ).toBe(true);
    expect(titres(el)).toContain('Ultra Moderne Solitude');
    expect(appels.filter((u) => /tidal/.test(u)), 'Tidal est déconnecté').toEqual([]);
  });

  it('#4330 — le menu « Source » reçoit les comptes de la FICHE, services compris', async () => {
    // Bertrand, .18, 17/09/2026 : « Source affiche des chiffres faux et pas les
    // services de streaming ».
    const recus: unknown[] = [];
    await poserFiche({ onComptesFiche: (c: unknown) => recus.push(c) });
    const dernier = recus.filter(Boolean).at(-1) as { total: number; comptes: Map<string, number> } | undefined;
    expect(dernier, 'aucun compte de fiche remonté au menu').toBeTruthy();
    expect(dernier!.total).toBe(3);
    expect(Object.fromEntries(dernier!.comptes)).toEqual({ local: 1, qobuz: 2 });
  });

  it('#4330 — « Source · QOBUZ » garde les albums Qobuz au lieu de tout cacher', async () => {
    const el = await poserFiche({ provenance: 'qobuz' });
    const vus = titres(el);
    expect(vus, `titres rendus : ${JSON.stringify(vus)}`).toContain('Ultra Moderne Solitude');
    expect(vus).not.toContain('Au Ras Des Paquerettes');
  });

  it('#4330 étape 2 — la fiche montre la biographie et les titres phares du service', async () => {
    const el = await poserFiche();
    expect(el.textContent, 'biographie absente').toContain('Chanteur français né en 1944.');
    expect(
      appels.some((u) => /\/streaming\/qobuz\/artists\/Q7\/top-tracks/.test(u)),
      `titres phares non demandés. URL vues : ${appels.join(' | ')}`,
    ).toBe(true);
    expect(el.textContent, 'titre phare absent').toContain('Foule sentimentale');
  });

  it('ouvrir un album de service passe le SERVICE avec lui', async () => {
    // Sans le service, `AlbumDetailV2` ne peut apparier aucun album de
    // streaming et resterait sur « Chargement… ».
    const el = await poserFiche();
    const carte = Array.from(el.querySelectorAll('.carte[data-sources="qobuz"] .meta')) as HTMLElement[];
    expect(carte.length, 'aucune vignette de service à ouvrir').toBeGreaterThan(0);
    carte[0].click();
    for (let i = 0; i < 8; i++) await respirer();
    flushSync();

    expect(
      appels.some((u) => /\/streaming\/qobuz\/albums\/AL1\/tracks/.test(u)),
      'la fiche ouverte n’a pas demandé les pistes du service.\n' +
        `URL vues : ${appels.join(' | ')}`,
    ).toBe(true);
  });
});

// #1373 — FabienM, 0.9.158 : sa fiche « Matt Elliott » proposait les albums de
// Keystone Homeschool. La règle d'avant prenait le nom exact « à défaut, le
// PREMIER » résultat du service : quand le service ne connaît pas l'artiste, il
// rend quand même des résultats, et la fiche devient celle de quelqu'un d'autre.
describe('#1373 — le NOM, ou rien', () => {
  const candidats = (...noms: string[]) => noms.map((name, i) => ({ id: `id-${i}`, name }));

  it('le cas de Fabien : aucun nom ne correspond ⇒ aucune section', () => {
    expect(apparierArtiste(candidats('Keystone Homeschool', 'Matt Ellis'), 'Matt Elliott')).toBeNull();
  });

  it('le bon artiste est retenu, même s’il n’est pas premier', () => {
    expect(apparierArtiste(candidats('Keystone Homeschool', 'Matt Elliott'), 'Matt Elliott')).toBe('id-1');
  });

  it('casse, accents, ponctuation et article de tête ne séparent pas', () => {
    expect(apparierArtiste(candidats('the beatles'), 'The Beatles')).toBe('id-0');
    expect(apparierArtiste(candidats('Beatles'), 'The Beatles')).toBe('id-0');
    expect(apparierArtiste(candidats('AC/DC'), 'AC-DC')).toBe('id-0');
    expect(apparierArtiste(candidats('Björk'), 'Bjork')).toBe('id-0');
    expect(apparierArtiste(candidats('Sigur Rós'), 'sigur ros')).toBe('id-0');
  });

  it('🔴 contre-épreuve : un nom PROCHE ne suffit pas', () => {
    expect(apparierArtiste(candidats('Matt Elliott Trio'), 'Matt Elliott')).toBeNull();
    expect(apparierArtiste(candidats('Bach'), 'Johann Sebastian Bach')).toBeNull();
  });

  it('un nom réduit à un article reste ce nom', () => {
    expect(apparierArtiste(candidats('The'), 'The')).toBe('id-0');
  });

  it('un nom vide ou sans lettre ne se rapproche de rien', () => {
    expect(apparierArtiste(candidats('Matt Elliott'), '')).toBeNull();
    expect(apparierArtiste(candidats('Matt Elliott'), '   ')).toBeNull();
    expect(apparierArtiste(candidats('???'), '???')).toBeNull();
  });

  it('source_id sert quand id manque, et un identifiant vide ne vaut rien', () => {
    expect(apparierArtiste([{ source_id: 'sid', name: 'Matt Elliott' }], 'Matt Elliott')).toBe('sid');
    expect(apparierArtiste([{ id: '', name: 'Matt Elliott' }], 'Matt Elliott')).toBeNull();
  });
});
