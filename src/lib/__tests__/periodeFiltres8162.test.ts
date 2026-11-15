// @vitest-environment jsdom
/**
 * tune-server-rust#8162 — Bibliothèque › Albums, vue Années, période
 * 1970–1979, filtre « Qualité · Multicanal » : la frise annonçait
 * « Albums dans la période : 156 » au-dessus d'une liste vide
 * (« Aucun album ne correspond à ces filtres », Tout (0)).
 *
 * Le filtre était juste (un seul fichier multicanal, sans année) : c'est
 * l'affichage qui égarait. Le compteur de la période ignorait les autres
 * filtres, et la liste vide ne disait pas lequel l'avait vidée.
 *
 * Catalogue : six albums stéréo de 1970 à 1979, un de 1985, et un seul album
 * multicanal, SANS année — la recette du .18.
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

let id = 0;
const album = (year: number | null, canaux: number): Album =>
  ({
    id: ++id, title: `Album ${year ?? 'sans date'} #${id}`, artist_name: 'A', genre: 'Rock',
    year: year ?? undefined, format: 'FLAC', sample_rate: 44100, bit_depth: 16, source: 'local',
    max_channels: canaux,
  }) as unknown as Album;

const CATALOGUE: Album[] = [
  ...[1970, 1972, 1974, 1975, 1977, 1979].map((y) => album(y, 2)),
  album(1985, 2),
  album(null, 6),
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
async function saisir(el: HTMLElement, cote: 'de' | 'a', v: string) {
  const c = el.querySelector<HTMLInputElement>(`.periode-${cote}`)!;
  expect(c, `le champ ${cote} manque`).not.toBeNull();
  c.value = v;
  c.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
}
/** La recette de Bertrand : Qualité › Multicanal, puis vue Années, 1970–1979.
 *  (Dans l'autre ordre, la valeur Multicanal est à 0 dans la période et le
 *  menu la grise : on ne peut pas la cocher.) */
async function recette(el: HTMLElement) {
  await cliquer(el, '.drop > button.chip', 'Qualité');
  await cliquer(el, '.drop .menu button', 'Multicanal');
  await cliquer(el, '.navmode > button', 'Années');
  await saisir(el, 'de', '1970');
  await saisir(el, 'a', '1979');
}
const compteur = (el: HTMLElement) => el.querySelector('.periode-n')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('Bibliothèque › Années : la période et les autres filtres (tune-server-rust#8162)', () => {
  it('🔴 le compteur de la période tient compte du filtre Multicanal, et donne aussi le nombre sans', async () => {
    const el = await ecran();
    await cliquer(el, '.navmode > button', 'Années');
    await saisir(el, 'de', '1970');
    await saisir(el, 'a', '1979');
    // Sans autre filtre : le compteur d'avant, inchangé.
    expect(compteur(el)).toBe('Albums dans la période : 6');
    await cliquer(el, '.periode-effacer', '');
    await recette(el);
    // Contre-épreuve du montage : la grille est bien vide (Tout (0)).
    expect(bouton(el, 'button.chip.count', 'Tout')?.textContent?.trim()).toBe('Tout (0)');
    // Le symptôme : « Albums dans la période : 6 » au-dessus d'une liste vide.
    expect(compteur(el)).toBe('Albums dans la période : 0 avec les filtres actuels (6 sans)');
  });

  it('🔴 la liste vide nomme les filtres qui la vident, et chacun se retire', async () => {
    const el = await ecran();
    await recette(el);
    const etat = el.querySelector('.state');
    expect(etat?.textContent).toContain('Aucun album ne correspond à ces filtres.');
    const retraits = [...el.querySelectorAll<HTMLButtonElement>('[data-retraits-filtres] button')].map((b) => b.textContent?.trim());
    expect(retraits).toEqual(['Retirer le filtre Qualité · Multicanal', 'Retirer le filtre Période · 1970–1979']);
    // Retirer Multicanal rend les six albums de la période, et le compteur simple.
    el.querySelector<HTMLButtonElement>('[data-retirer-filtre="quality"]')!.click();
    await flush();
    expect(bouton(el, 'button.chip.count', 'Tout')?.textContent?.trim()).toBe('Tout (6)');
    expect(compteur(el)).toBe('Albums dans la période : 6');
    expect(el.querySelector('[data-retraits-filtres]')).toBeNull();
  });

  it('retirer la période rend l’album multicanal sans année', async () => {
    const el = await ecran();
    await recette(el);
    el.querySelector<HTMLButtonElement>('[data-retirer-filtre="period"]')!.click();
    await flush();
    expect(bouton(el, 'button.chip.count', 'Tout')?.textContent?.trim()).toBe('Tout (1)');
  });
});
