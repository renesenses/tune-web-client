// @vitest-environment jsdom
//
// renesenses/tune-server-rust#3623 — « le compte des Albums est encore le
// nombre affiché, plafonné à 50, alors que le serveur publie `totals.albums`
// depuis la v0.9.132 ».
//
// La moitié PISTES a été réparée en v0.9.141 (#3189) : total réel, « voir
// plus », pagination par `offset`. La moitié ALBUMS ne l'avait pas été — le
// titre affichait `filteredAlbums.length`, c'est-à-dire la longueur de la page
// reçue —, et les ARTISTES n'affichaient aucun compte du tout, coupés à douze
// par un `slice(0, 12)` que rien ne signalait.
//
// Le serveur, lui, rend les TROIS familles depuis la même version
// (`routes/search.rs`) : `totals`, `totals_capped` et `has_more` par famille,
// et `search_page(q, limit, offset)` est appelée pour les trois. C'est un cas
// d'« écrit mais pas branché » : la donnée existait, une famille sur trois la
// lisait.
//
// 🔴 CES TÉMOINS MONTENT `SearchView`, TAPENT dans le champ, et lisent le
// nombre RÉELLEMENT AFFICHÉ ainsi que l'URL RÉELLEMENT DEMANDÉE. L'issue le
// demandait explicitement : les deux gardes existantes du filtrage Oxygen sont
// textuelles et resteraient vertes si la conduite était débranchée ailleurs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SearchView from '../../components/SearchView.svelte';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

/** Ce que le serveur COMPTE, face à ce qu'il rend dans la page. */
const TOTAL_ARTISTES = 137;
const TOTAL_ALBUMS = 731;
const TOTAL_PISTES = 2451;
/** `SEARCH_PAGE_LIMIT`, le plafond de page — et l'ancien « compte » affiché. */
const PAGE = 50;

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

const artiste = (i: number) => ({ id: 10_000 + i, name: `Artiste ${i}`, image_path: null });
const album = (i: number) => ({
  id: 20_000 + i,
  title: `Album ${i}`,
  artist_name: `Artiste ${i}`,
  artist_id: 10_000 + i,
  cover_path: null,
});
const piste = (i: number) => ({
  id: 30_000 + i,
  title: `Piste ${i}`,
  artist_name: `Artiste ${i}`,
  album_title: `Album ${i}`,
  album_id: 20_000 + i,
  duration_ms: 200_000,
});

/** Une page de recherche locale, telle que la rend `routes/search.rs`. */
function page(offset: number) {
  const n = (f: (i: number) => unknown, total: number) =>
    Array.from({ length: Math.max(0, Math.min(PAGE, total - offset)) }, (_, k) => f(offset + k));
  return {
    local: {
      artists: n(artiste, TOTAL_ARTISTES),
      albums: n(album, TOTAL_ALBUMS),
      tracks: n(piste, TOTAL_PISTES),
      totals: {
        artists: TOTAL_ARTISTES,
        albums: TOTAL_ALBUMS,
        tracks: TOTAL_PISTES,
        tracks_via_metadata: 0,
      },
      totals_capped: { artists: false, albums: false, tracks: false },
      has_more: {
        artists: offset + PAGE < TOTAL_ARTISTES,
        albums: offset + PAGE < TOTAL_ALBUMS,
        tracks: offset + PAGE < TOTAL_PISTES,
      },
      limit: PAGE,
      offset,
    },
    services: {},
    radios: [],
  };
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let urls: string[] = [];

function serveur() {
  urls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      urls.push(u);
      const m = u.match(/\/search\?/);
      if (m) {
        const off = Number(new URL(u, 'http://x').searchParams.get('offset') ?? 0);
        return reponse(page(off));
      }
      if (/\/playlists/.test(u)) return reponse([]);
      // ⚠️ Les blocs « à découvrir » sont chargés par un effet qui LIT ce
      // qu'il ÉCRIT (`if (topArtists.length > 0 …) return;`). Une réponse vide
      // le relance indéfiniment et fait exploser le tas. On rend donc une
      // ligne : l'effet se tait après un tour.
      return reponse([{ id: 1, name: 'Découverte', title: 'Découverte' }]);
    }),
  );
}

/** Monte l'écran, tape `q`, et laisse l'anti-rebond de 300 ms passer. */
async function chercher(q: string): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SearchView, { target: hote, props: {} as any });
  flushSync();
  const champ = hote.querySelector('input[type="text"]') as HTMLInputElement;
  expect(champ, 'aucun champ de recherche').toBeTruthy();
  champ.value = q;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  await attendreLAntiRebond();
  await reposer();
  return hote;
}

/** L'anti-rebond du champ vaut 300 ms ; on le laisse passer pour de vrai. */
async function attendreLAntiRebond() {
  await new Promise((r) => setTimeout(r, 360));
}

async function reposer(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
  flushSync();
}

/** L'entête de la section dont le titre commence par `nom`. */
function titreSection(el: HTMLElement, nom: string): HTMLElement | null {
  return (
    ([...el.querySelectorAll('.section-title')] as HTMLElement[]).find((h) =>
      (h.textContent ?? '').trim().startsWith(nom),
    ) ?? null
  );
}

/** Le compte AFFICHÉ à côté d'un titre de section. */
function compteAffiche(el: HTMLElement, nom: string): string | null {
  return titreSection(el, nom)?.querySelector('.count')?.textContent?.trim() ?? null;
}

/** Le bouton « voir plus » de la section dont le titre commence par `nom`. */
function boutonVoirPlus(el: HTMLElement, nom: string): HTMLButtonElement | null {
  const titre = titreSection(el, nom);
  const section = titre?.closest('section');
  return (section?.querySelector('.voir-plus button') as HTMLButtonElement) ?? null;
}

const attendu = (montres: number, total: number) =>
  fr['search.shownOf'].replace('{shown}', String(montres)).replace('{total}', String(total));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  localStorage.clear();
  serveur();
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('Albums — le compteur menteur, plafonné à 50', () => {
  it('affiche le VRAI total du serveur, pas la longueur de la page', async () => {
    const el = await chercher('jazz');
    // 🔴 Avant : « 50 ». Le serveur en compte 731 sur le même prédicat.
    expect(compteAffiche(el, 'Albums')).toBe(attendu(PAGE, TOTAL_ALBUMS));
    expect(compteAffiche(el, 'Albums')).not.toBe(String(PAGE));
  });

  it('offre une suite, et la demande au bon rang', async () => {
    const el = await chercher('jazz');
    const bouton = boutonVoirPlus(el, 'Albums');
    expect(bouton, 'aucun bouton de suite sur les albums').toBeTruthy();
    expect(bouton!.textContent!.trim()).toBe(fr['search.loadMore']);

    urls.length = 0;
    bouton!.click();
    await reposer();

    const suite = urls.filter((u) => /\/search\?/.test(u));
    expect(suite, 'aucune requête de suite').toHaveLength(1);
    expect(suite[0], 'la suite doit repartir au rang 50').toContain('offset=50');
    // Et le compte affiché suit la liste réellement grossie.
    expect(compteAffiche(el, 'Albums')).toBe(attendu(2 * PAGE, TOTAL_ALBUMS));
  });
});

describe('Artistes — douze vignettes, aucun compte, aucun accès au reste', () => {
  it('le vrai total est affiché à côté du titre', async () => {
    const el = await chercher('jazz');
    // 🔴 Avant : rien du tout, et `slice(0, 12)` en silence.
    expect(compteAffiche(el, 'Artistes')).toBe(attendu(12, TOTAL_ARTISTES));
  });

  it('le bouton découvre d’abord ce qui est DÉJÀ reçu, sans rien demander', async () => {
    const el = await chercher('jazz');
    urls.length = 0;
    boutonVoirPlus(el, 'Artistes')!.click();
    await reposer();
    // La page en porte 50 : douze de plus étaient là, en mémoire, jetés à
    // l'affichage. Un aller-retour ici serait une promesse inutile.
    expect(urls.filter((u) => /\/search\?/.test(u))).toHaveLength(0);
    expect(compteAffiche(el, 'Artistes')).toBe(attendu(24, TOTAL_ARTISTES));
  });

  it('puis va chercher la page suivante quand tout le reçu est montré', async () => {
    const el = await chercher('jazz');
    // 12 → 24 → 36 → 48 : tout ce que la page de 50 portait, moins deux.
    for (let i = 0; i < 3; i++) {
      boutonVoirPlus(el, 'Artistes')!.click();
      await reposer();
    }
    expect(compteAffiche(el, 'Artistes')).toBe(attendu(48, TOTAL_ARTISTES));
    boutonVoirPlus(el, 'Artistes')!.click();
    await reposer();
    // Il restait un artiste reçu : il se découvre. 49 et non 50, parce que le
    // « meilleur résultat » est déjà montré à part et que la liste ne le
    // répète pas — le compte suit ce qui est RÉELLEMENT atteignable.
    expect(compteAffiche(el, 'Artistes')).toBe(attendu(49, TOTAL_ARTISTES));
    urls.length = 0;
    boutonVoirPlus(el, 'Artistes')!.click();
    await reposer();
    // …et c'est seulement maintenant que le serveur est sollicité.
    const suite = urls.filter((u) => /\/search\?/.test(u));
    expect(suite, 'la page suivante doit être demandée').toHaveLength(1);
    expect(suite[0]).toContain('offset=50');
  });
});

describe('un rang par famille — le piège de l’`offset` unique du serveur', () => {
  it('charger la suite des pistes ne fait pas sauter cinquante albums', async () => {
    const el = await chercher('jazz');
    // 1. La suite des PISTES : le rang des pistes passe à 100.
    boutonVoirPlus(el, 'Pistes')!.click();
    await reposer();
    expect(compteAffiche(el, 'Pistes')).toBe(attendu(2 * PAGE, TOTAL_PISTES));

    // 2. La suite des ALBUMS doit repartir de 50, pas de 100 : le serveur n'a
    //    qu'un `offset`, partagé — le relire dans la réponse ferait sauter la
    //    page 50-99 des albums, sans que rien ne le dise.
    urls.length = 0;
    boutonVoirPlus(el, 'Albums')!.click();
    await reposer();
    const suite = urls.filter((u) => /\/search\?/.test(u));
    expect(suite).toHaveLength(1);
    expect(suite[0]).toContain('offset=50');
    expect(suite[0]).not.toContain('offset=100');
  });

  it('une nouvelle recherche remet les trois rangs à zéro', async () => {
    const el = await chercher('jazz');
    boutonVoirPlus(el, 'Albums')!.click();
    await reposer();
    expect(compteAffiche(el, 'Albums')).toBe(attendu(2 * PAGE, TOTAL_ALBUMS));

    const champ = el.querySelector('input[type="text"]') as HTMLInputElement;
    champ.value = 'blues';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    await attendreLAntiRebond();
    await reposer();
    expect(compteAffiche(el, 'Albums')).toBe(attendu(PAGE, TOTAL_ALBUMS));
    expect(compteAffiche(el, 'Artistes')).toBe(attendu(12, TOTAL_ARTISTES));

    urls.length = 0;
    boutonVoirPlus(el, 'Albums')!.click();
    await reposer();
    expect(urls.filter((u) => /\/search\?/.test(u))[0]).toContain('offset=50');
  });
});
