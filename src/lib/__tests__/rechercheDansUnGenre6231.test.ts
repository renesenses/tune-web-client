// @vitest-environment jsdom
/**
 * tune-server-rust#6231 (Didier, fil 2128) — onglet Genres du streaming : la
 * saisie ne filtrait que les NOUVEAUTÉS du genre ouvert. « Roxy Music » dans
 * Pop/Rock ne trouvait rien, alors que le catalogue Qobuz en est plein.
 *
 * Attendu : la saisie interroge le service, restreinte au genre ; un service
 * qui ne le permet pas, l'écran le DIT au lieu de filtrer en silence.
 *
 * Témoin COMPORTEMENTAL : vrai écran monté, `fetch` simulé, on clique, on tape.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { activeView } from '../stores/navigation';
import { activeStreamingService, streamingServices } from '../stores/streaming';
import StreamingV2 from '../../components/v2/StreamingV2.svelte';
import { chercherDansLeGenre } from '../rechercheGenre';

vi.setConfig({ testTimeout: 60_000 });

const SERVICES = { qobuz: { enabled: true, authenticated: true, username: 'Didier' } } as any;
const GENRES = [{ id: '112', name: 'Pop/Rock', has_children: false }];
const NOUVEAUTES = [{ source_id: 'n1', title: 'Une nouveauté', artist_name: 'Quelqu’un' }];
const CATALOGUE = {
  albums: [{ source_id: 'a1', title: 'Avalon', artist_name: 'Roxy Music' }],
  examined: 50,
  genre_filter: 'results',
};

function reponse(corps: unknown, status = 200) {
  return {
    ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Not Implemented',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => (typeof corps === 'string' ? corps : JSON.stringify(corps)),
  } as unknown as Response;
}
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let statutRecherche = 200;
let urls: string[] = [];

async function laisserTourner(n = 40) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}
const sousOnglets = () => Array.from(hote!.querySelectorAll('nav.subs > button')) as HTMLButtonElement[];
const champ = () => hote!.querySelector('header input') as HTMLInputElement | null;
const texte = () => hote!.textContent ?? '';

async function ouvrirLeGenreEtTaper(saisie: string) {
  monte = mount(StreamingV2 as any, { target: hote! });
  for (let i = 0; i < 60 && !sousOnglets().length; i++) await laisserTourner(1);
  const genres = sousOnglets().find((b) => /genre/i.test(b.textContent ?? ''));
  expect(genres, 'pas d’onglet Genres').toBeTruthy();
  genres!.click();
  flushSync();
  await laisserTourner(10);
  const puce = Array.from(hote!.querySelectorAll('button.chip')).find((b) => b.textContent?.trim() === 'Pop/Rock') as HTMLButtonElement | undefined;
  expect(puce, 'pas de puce Pop/Rock').toBeTruthy();
  puce!.click();
  flushSync();
  await laisserTourner(20);
  expect(texte(), 'les nouveautés du genre ne sont pas affichées').toContain('Une nouveauté');
  const input = champ()!;
  input.value = saisie;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  await new Promise((r) => setTimeout(r, 450));
  await laisserTourner(20);
}

beforeEach(() => {
  statutRecherche = 200;
  urls = [];
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    urls.push(u);
    if (/\/ext\/bandcamp\/tags/.test(u)) throw new Error('extension non chargée');
    if (/\/streaming\/services/.test(u)) return reponse(SERVICES);
    if (/\/streaming\/qobuz\/genres\/112\/search/.test(u)) {
      return statutRecherche === 200 ? reponse(CATALOGUE) : reponse('genre search not supported for this service', statutRecherche);
    }
    if (/\/streaming\/qobuz\/genres\/112\/albums/.test(u)) return reponse(NOUVEAUTES);
    if (/\/streaming\/qobuz\/genres(\?|$)/.test(u)) return reponse(GENRES);
    if (/\/config/.test(u)) return reponse({});
    return reponse([]);
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeStreamingService.set(null);
  streamingServices.set({});
  activeView.set('streaming');
});

afterEach(() => {
  try { if (monte) unmount(monte); } catch { /* hors sujet */ }
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('#6231 — chercherDansLeGenre', () => {
  it('rend le catalogue du genre, ou dit que le service ne le permet pas', async () => {
    const ok = async () => CATALOGUE as any;
    const refus = (status: number) => async () => { throw Object.assign(new Error('x'), { status }); };
    expect(await chercherDansLeGenre('qobuz', '112', 'roxy', ok)).toMatchObject({ etat: 'catalogue', examined: 50 });
    expect(await chercherDansLeGenre('tidal', '1', 'roxy', refus(501))).toEqual({ etat: 'nonPrise' });
    expect(await chercherDansLeGenre('qobuz', '112', 'roxy', refus(404))).toEqual({ etat: 'nonPrise' });
    expect(await chercherDansLeGenre('qobuz', '112', 'roxy', refus(502))).toEqual({ etat: 'erreur' });
    expect(await chercherDansLeGenre('qobuz', '112', 'r', ok)).toEqual({ etat: 'inactive' });
  });
});

describe('#6231 — la saisie dans un genre, sur l’écran réel', () => {
  it('🔴 « Roxy » dans Pop/Rock interroge le catalogue du service, restreint au genre', async () => {
    await ouvrirLeGenreEtTaper('Roxy');
    expect(urls.some((u) => /\/streaming\/qobuz\/genres\/112\/search\?q=Roxy/.test(u)),
      'la saisie n’a pas interrogé le service dans le genre').toBe(true);
    expect(texte(), 'Avalon, trouvé au catalogue, n’est pas affiché').toContain('Avalon');
    expect(hote!.querySelector('[data-recherche-genre="catalogue"]'), 'l’écran ne dit pas d’où viennent les résultats').not.toBeNull();
  });

  it('🔴 service sans recherche par genre (501) : l’écran le DIT, et filtre les albums affichés', async () => {
    statutRecherche = 501;
    await ouvrirLeGenreEtTaper('Roxy');
    expect(hote!.querySelector('[data-recherche-genre="filtre"]'), 'le filtre se fait en silence').not.toBeNull();
    expect(texte()).not.toContain('Avalon');
    expect(texte(), 'la nouveauté filtrée reste absente').not.toContain('Une nouveauté');
  });
});
