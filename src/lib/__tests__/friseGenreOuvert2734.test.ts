// @vitest-environment jsdom
/**
 * web#2734 — Bibliothèque › Genres › genre ouvert : la frise se calcule sur
 * les albums DU GENRE, pas sur toute la bibliothèque.
 *
 * Relevé sur la capture de Bertrand du 09/11 (.18, genre ouvert, période
 * 1970-1979) : les barres étaient presque invisibles. `histogram` lisait `src`
 * (toute la bibliothèque) alors que la grille montre `groupeOuvert.albums` —
 * la hauteur des barres, les bornes des poignées et les compteurs parlaient
 * d'une autre population que celle affichée.
 *
 * Catalogue : « Jazz » tient en 1970–1972 (3 albums en 1971, 1 sans année) ;
 * « Rock » s'étale de 1960 à 1979 avec 6 albums en 1975 et 2 sans année.
 * Sur toute la bibliothèque la frise va de 1960 à 1979 et culmine à 6 ; dans
 * Jazz elle doit aller de 1970 à 1972 et culminer à 3.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope, libraryLoading } from '../stores/library';
import { _remiseAZeroPourTests } from '../stores/albumsPagines';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

const cd = { format: 'FLAC', sample_rate: 44100, bit_depth: 16, source: 'local' };
let id = 0;
const album = (genre: string, year: number | null): Album =>
  ({ id: ++id, title: `${genre} ${year ?? 'sans date'} #${id}`, artist_name: 'A', genre, year: year ?? undefined, ...cd }) as unknown as Album;

const JAZZ_ANNEES = [1970, 1970, 1971, 1971, 1971, 1972, null];
const ROCK_ANNEES = [1960, 1965, 1970, 1971, 1975, 1975, 1975, 1975, 1975, 1975, 1979, null, null];
const CATALOGUE: Album[] = [
  ...JAZZ_ANNEES.map((y) => album('Jazz', y)),
  ...ROCK_ANNEES.map((y) => album('Rock', y)),
];

function reponse(corps: unknown): Response {
  return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  history.replaceState(null, '', '/#library');
  _remiseAZeroPourTests();
  locale.set('fr');
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => {
    const url = String(typeof u === 'string' ? u : (u as Request)?.url ?? u);
    if (/\/library\/albums/.test(url)) return reponse({ items: CATALOGUE, total: CATALOGUE.length, limit: 500, offset: 0 });
    return reponse([]);
  }));
  vi.stubGlobal('IntersectionObserver', ObservateurInerte as unknown as typeof IntersectionObserver);
  vi.stubGlobal('ResizeObserver', ObservateurInerte as unknown as typeof ResizeObserver);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  activeView.set('library');
  libraryFolderScope.set(null as never);
  libraryLoading.set(false);
  albumsStore.set(CATALOGUE);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  albumsStore.set([]);
  history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function ecran(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} });
  await flush();
  return hote;
}
const bouton = (el: HTMLElement, sel: string, texte: string) =>
  [...el.querySelectorAll<HTMLButtonElement>(sel)].find((b) => b.textContent?.trim().startsWith(texte)) ?? null;
async function cliquer(el: HTMLElement, sel: string, texte: string) {
  const b = bouton(el, sel, texte);
  expect(b, `bouton « ${texte} » (${sel}) introuvable`).not.toBeNull();
  b!.click();
  await flush();
}
/** Le GESTE du testeur : l'onglet Genres, puis la valeur dans la liste. */
async function ouvrirGenre(el: HTMLElement, genre: string) {
  await cliquer(el, 'nav.tabs button.tab', 'Genres');
  const b = [...el.querySelectorAll<HTMLButtonElement>('.fliste button.flnom')]
    .find((x) => x.querySelector('.fk')?.textContent?.trim() === genre);
  expect(b, `genre « ${genre} » absent de la liste`).not.toBeNull();
  b!.click();
  await flush();
}
async function vueAnnees(el: HTMLElement) { await cliquer(el, '.navmode > button', 'Années'); }
async function saisir(el: HTMLElement, cote: 'de' | 'a', v: string) {
  const c = el.querySelector<HTMLInputElement>(`.periode-${cote}`)!;
  expect(c, `le champ ${cote} manque`).not.toBeNull();
  c.value = v;
  c.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
}
const bornes = (el: HTMLElement) => {
  const de = el.querySelector('.poignee-de')!;
  return [de.getAttribute('aria-valuemin'), de.getAttribute('aria-valuemax')];
};
const hauteur = (el: HTMLElement, annee: number) =>
  [...el.querySelectorAll<HTMLElement>('.bars .tick')].find((t) => t.getAttribute('aria-label')?.startsWith(`${annee},`))
    ?.style.getPropertyValue('--h').trim() ?? null;

describe('Bibliothèque › Genres › genre ouvert : la frise parle du genre (web#2734)', () => {
  it('🔴 les bornes, le nombre de barres et leur hauteur viennent des albums du genre', async () => {
    const el = await ecran();
    await ouvrirGenre(el, 'Jazz');
    await vueAnnees(el);
    // Contre-épreuve du montage : la grille montre bien les albums du genre.
    expect(el.querySelector('.ftitre .fc')?.textContent?.trim()).toBe('7');
    // Toute la bibliothèque va de 1960 à 1979 ; Jazz, de 1970 à 1972.
    expect(bornes(el)).toEqual(['1970', '1972']);
    expect(el.querySelectorAll('.bars .tick').length).toBe(3);
    // 1971 est l'année la mieux fournie DU GENRE : barre pleine, pas 3/6.
    expect(hauteur(el, 1971)).toBe('100%');
    expect(bouton(el, '.bars .tick', '')?.getAttribute('aria-label')).toBe('1970, 2 albums');
  });

  it('🔴 les compteurs de la période et du « sans année » comptent les albums du genre', async () => {
    const el = await ecran();
    await ouvrirGenre(el, 'Jazz');
    await vueAnnees(el);
    await saisir(el, 'de', '1970');
    await saisir(el, 'a', '1971');
    // Jazz 1970–1971 : 5 albums (toute la bibliothèque en compterait 7).
    expect(el.querySelector('.periode-n')?.textContent).toContain('5');
    expect(el.querySelector('.periode-n')?.textContent).not.toContain('7');
    // Un seul album de Jazz sans année (trois dans toute la bibliothèque).
    expect(el.querySelector('.periode-sans')?.textContent).toContain('1');
    expect(el.querySelector('.periode-sans')?.textContent).not.toContain('3');
    // La grille du genre suit la période, et la frise garde ses trois années :
    // elle ne se compte pas elle-même.
    expect(el.querySelector('.ftitre .fc')?.textContent?.trim()).toBe('5');
    expect(el.querySelectorAll('.bars .tick').length).toBe(3);
    expect(bornes(el)).toEqual(['1970', '1972']);
  });

  it('le Retour vers la liste des genres rend la frise de toute la bibliothèque', async () => {
    const el = await ecran();
    await ouvrirGenre(el, 'Jazz');
    await vueAnnees(el);
    expect(bornes(el)).toEqual(['1970', '1972']);
    await cliquer(el, '.fretour', 'Retour');
    expect(bornes(el)).toEqual(['1960', '1979']);
    expect(el.querySelectorAll('.bars .tick').length).toBe(20);
    // 1971 dans toute la bibliothèque : 3 Jazz + 1 Rock = 4, sur un maximum de 6.
    expect(hauteur(el, 1971)).toBe(`${34 + Math.round((4 / 6) * 66)}%`);
  });
});
