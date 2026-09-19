// @vitest-environment jsdom
//
// Phase 5 (web#1257) — « aucune perte d'accès ». Deux capacités n'étaient
// atteignables QUE par l'ancienne interface :
//
//  - `bandcampArtist` — la discographie d'un artiste Bandcamp trouvé par la
//    recherche (`BandcampView`). `StreamingV2` recevait les artistes de
//    `/ext/bandcamp/search` et les jetait ;
//  - `getConcertsAVenir` — l'écran Concerts (`ConcertsView`). La coquille v2
//    n'avait ni route `concerts`, ni entrée de barre.
//
// 🔴 Les témoins MONTENT l'écran et CLIQUENT. Ils ne lisent pas le source : un
// test qui chercherait « bandcampArtist » dans un fichier resterait vert sur un
// appel débranché.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.setConfig({ testTimeout: 30_000 });

const bandcampArtist = vi.fn();
const getConcertsAVenir = vi.fn();

// Mock PARTIEL : le reste de l'écran garde son chemin réel (via `fetch`).
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  bandcampArtist: (url: string) => bandcampArtist(url),
  getConcertsAVenir: () => getConcertsAVenir(),
}));

import { concertsPlugin } from '../stores/concerts';
import lFr from '../locales/fr';
const fr = lFr as unknown as Record<string, string>;

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

class Inerte { observe() {} unobserve() {} disconnect() {} }

const ARTISTE = { titre: 'Sevy Tabroc', url: 'https://sevy.bandcamp.com', lieu: 'Lyon', artiste: null };

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', Inerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', Inerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/ext\/bandcamp\/tags/.test(u)) return reponse({ tags: ['rock'], genres: [{ slug: 'rock', label: 'Rock', sous_genres: [] }] });
    if (/\/ext\/bandcamp\/search/.test(u)) return reponse({ q: 'sevy', artistes: [ARTISTE], albums: [], pistes: [] });
    if (/\/streaming\/services/.test(u)) return reponse({ bandcamp: { enabled: true, authenticated: true, username: 'berthos' } });
    if (/\/ext\/bandcamp\/(discover|collection)/.test(u)) return reponse({ items: [] });
    return reponse([]);
  }));
  bandcampArtist.mockReset();
  getConcertsAVenir.mockReset();
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* hors sujet */ } }
  monte = null;
  hote?.remove();
  hote = null;
  concertsPlugin.set(null);
  vi.unstubAllGlobals();
});

async function respirer(n = 20, ms = 0) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, ms));
    flushSync();
  }
}

describe('Bandcamp — la discographie d’un artiste trouvé par la recherche', () => {
  it('cliquer un artiste appelle bandcampArtist avec son adresse et dessine ses albums', async () => {
    bandcampArtist.mockResolvedValue({
      url: ARTISTE.url, count: 2,
      albums: [
        { titre: 'Nuit blanche', url: 'https://sevy.bandcamp.com/album/nuit', pochette: null, type: 'album' },
        { titre: 'Aube', url: 'https://sevy.bandcamp.com/album/aube', pochette: null, type: 'album' },
      ],
    });
    const { default: StreamingV2 } = await import('../../components/v2/StreamingV2.svelte');
    monte = mount(StreamingV2 as any, { target: hote! });
    await respirer(40);

    const champ = hote!.querySelector<HTMLInputElement>('.v2-rech input');
    expect(champ, 'pas de champ de recherche : onglet Bandcamp non actif — témoin sans objet').not.toBeNull();
    champ!.value = 'sevy';
    champ!.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 320));
    await respirer(10);

    const bouton = [...hote!.querySelectorAll<HTMLButtonElement>('button.bc-nom')]
      .find((b) => (b.textContent ?? '').includes('Sevy Tabroc'));
    expect(bouton, 'les artistes de la recherche ne sont pas dessinés').toBeTruthy();
    bouton!.click();
    await respirer(10);

    expect(bandcampArtist).toHaveBeenCalledWith(ARTISTE.url);
    const texte = hote!.textContent ?? '';
    expect(texte).toContain('Nuit blanche');
    expect(texte).toContain('Aube');
  });
});

describe('Concerts — l’écran v2 lit les concerts à venir', () => {
  it('greffon monté : getConcertsAVenir est appelé et les dates sont groupées par artiste', async () => {
    concertsPlugin.set({ name: 'concerts', installed: true, enabled: true });
    getConcertsAVenir.mockResolvedValue({
      concerts: [
        { artist_name: 'Radiohead', event_date: '2026-11-02', city: 'Paris', venue: 'Accor Arena' },
        { artist_name: 'Radiohead', event_date: '2026-11-03', city: 'Lyon', venue: 'LDLC Arena' },
        { artist_name: 'Air', event_date: '2026-12-01', city: 'Nantes', venue: null },
      ],
    });
    const { default: ConcertsV2 } = await import('../../components/v2/ConcertsV2.svelte');
    monte = mount(ConcertsV2 as any, { target: hote! });
    await respirer(10);

    expect(getConcertsAVenir).toHaveBeenCalledTimes(1);
    const titres = [...hote!.querySelectorAll('.artiste h2')].map((h) => h.textContent?.trim());
    expect(titres).toEqual(['Air', 'Radiohead']);
    expect(hote!.textContent).toContain('Accor Arena');
  });

  it('greffon absent du binaire chargé mais non actif : RIEN n’est demandé, le geste est expliqué', async () => {
    concertsPlugin.set({ name: 'concerts', installed: false, enabled: false });
    const { default: ConcertsV2 } = await import('../../components/v2/ConcertsV2.svelte');
    monte = mount(ConcertsV2 as any, { target: hote! });
    await respirer(10);
    expect(getConcertsAVenir).not.toHaveBeenCalled();
    expect(hote!.textContent).toContain(fr['concerts.greffonAInstaller']);
  });

  it('la coquille v2 route la vue « concerts » vers cet écran', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    // Garde de BRANCHEMENT, complémentaire du montage ci-dessus : sans route,
    // `activeView = 'concerts'` retombe sur le repli « À venir ».
    const shell = readFileSync(resolve(process.cwd(), 'src/components/v2/ShellV2.svelte'), 'utf-8');
    expect(shell).toMatch(/\$activeView === 'concerts'\}\s*(<!--[\s\S]*?-->\s*)?<ConcertsV2 \/>/);
  });
});
