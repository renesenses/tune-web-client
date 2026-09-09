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

describe('#3709 — quel artiste du service est le nôtre', () => {
  it('le nom EXACT prime, casse ignorée', () => {
    expect(
      apparierArtiste(
        [{ id: 'A1', name: 'Alain Souchon & Laurent Voulzy' }, { id: 'A2', name: 'alain souchon' }],
        'Alain Souchon',
      ),
    ).toBe('A2');
  });

  it('à défaut, le PREMIER — le service classe par pertinence', () => {
    expect(apparierArtiste([{ id: 'A1', name: 'Souchon Alain' }], 'Alain Souchon')).toBe('A1');
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
  if (/\/search\?/.test(url)) {
    return { local: { tracks: [], albums: [], artists: [], playlists: [] },
             services: { qobuz: { tracks: [], albums: [], artists: [{ id: 'Q7', name: 'Alain Souchon' }], playlists: [] } } };
  }
  if (/\/streaming\/qobuz\/artists\/Q7\/albums/.test(url)) return CHEZ_QOBUZ;
  if (/\/streaming\/qobuz\/albums\/AL1\/tracks/.test(url)) {
    return [{ id: null, title: 'Quand je serai KO', source_id: 'T1' }];
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
async function poserFiche(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ArtistesV2, { target: hote, props: { q: '', ouvrirId: 3 } });
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

  it('les albums du service sont À L’ÉCRAN, sous ceux de la bibliothèque', async () => {
    const el = await poserFiche();
    const vus = titres(el);
    expect(vus, `titres rendus : ${JSON.stringify(vus)}`).toContain('Au Ras Des Paquerettes');
    expect(
      vus,
      'les albums de Qobuz ne sont pas affichés — c’est exactement ce que Fabien signale',
    ).toContain('Ultra Moderne Solitude');
    // L'ORDRE compte : la bibliothèque d'abord, les services ensuite.
    expect(vus.indexOf('Au Ras Des Paquerettes')).toBeLessThan(vus.indexOf('Ultra Moderne Solitude'));
  });

  it('la section porte le badge du service et son compte', async () => {
    const el = await poserFiche();
    const sections = Array.from(el.querySelectorAll('.svc'));
    expect(sections, 'aucune section de service').toHaveLength(1);
    expect(sections[0].querySelector('.svct')?.textContent).toContain('2');
  });

  it('un service DÉCONNECTÉ n’est jamais interrogé', async () => {
    await poserFiche();
    expect(
      appels.filter((u) => /tidal/.test(u)),
      'Tidal est déconnecté : l’interroger rendrait un 401 par artiste ouvert',
    ).toEqual([]);
  });

  it('ouvrir un album de service passe le SERVICE avec lui', async () => {
    // Sans le service, `AlbumDetailV2` ne peut apparier aucun album de
    // streaming et resterait sur « Chargement… ».
    const el = await poserFiche();
    const carte = Array.from(el.querySelectorAll('.svc .carte .meta')) as HTMLElement[];
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
