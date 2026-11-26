// @vitest-environment jsdom
/**
 * Recette rc12 du 15/11 sur le .18 — Lecture en cours (Moby, « 18 », 2002),
 * clic sur l'année : Bibliothèque › Albums, vue Années, « Source · Local »
 * retenu. La pastille annonçait « 2002 · 96 albums » au-dessus de
 * « Tout (90) » : elle comptait aussi les 6 albums UPnP de 2002 que la
 * grille écartait.
 *
 * Le filtre de l'année, lui, était juste (vérifié sur l'API du .18 : les
 * albums « d'autres années » de la capture portent tous `year = 2002`, sans
 * `original_year` — leur année d'ÉDITION).
 *
 * Même capture : « (22) » seul au milieu de la carte « Come Away With Me »,
 * « FLAC 192/24 » passé à la ligne dessous — les écoutes de la communauté
 * poussaient la qualité hors de la ligne.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView, pendingLibraryYear } from '../stores/navigation';
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
const album = (year: number, source: string, extra: Partial<Album> = {}): Album =>
  ({
    id: ++id, title: `Album ${year} ${source} #${id}`, artist_name: 'A', genre: 'Rock',
    year, format: 'flac', sample_rate: 44100, bit_depth: 16, source, max_channels: 2,
    ...(source === 'upnp' ? { source_id: `upnp:uuid-x/${id}` } : {}),
    ...extra,
  }) as unknown as Album;

const CATALOGUE: Album[] = [
  album(2002, 'local'), album(2002, 'local'),
  album(2002, 'local', { title: 'Come Away With Me', sample_rate: 192000, bit_depth: 24, community_listens: 22 } as Partial<Album>),
  album(2002, 'upnp'), album(2002, 'upnp'),
  album(1999, 'local'),
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
  pendingLibraryYear.set(null);
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
const tout = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLButtonElement>('button.chip.count')].find((b) => b.textContent?.trim().startsWith('Tout'))?.textContent?.trim() ?? '';
const pastille = (el: HTMLElement) => el.querySelector('[data-ligne-annees] .yearpill')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('Bibliothèque › Années : la pastille de l’année compte comme la grille', () => {
  it('🔴 « Source · Local » retenu : la pastille ne compte pas les albums UPnP de l’année', async () => {
    localStorage.setItem('tune_v2_ecran_v2.lib.source', 'local');
    const el = await ecran();
    pendingLibraryYear.set(2002);
    await flush();
    // Contre-épreuve : la grille ne montre que les 3 albums locaux de 2002.
    expect(tout(el)).toBe('Tout (3)');
    expect(pastille(el)).toMatch(/^2002 · 3 albums/);
  });

  it('sans filtre de source, la pastille compte toute l’année', async () => {
    const el = await ecran();
    pendingLibraryYear.set(2002);
    await flush();
    expect(tout(el)).toBe('Tout (5)');
    expect(pastille(el)).toMatch(/^2002 · 5 albums/);
  });
});

/**
 * La feuille de LibraryV2 n'est pas injectée sous jsdom (`getComputedStyle`
 * y rend `inline` pour une rangée flex) : on lit donc la feuille que le
 * COMPILATEUR Svelte produit — règles conservées, sélecteurs scopés — et on
 * vérifie que le montage rend bien la carte que ces règles visent.
 */
async function feuilleCompilee(): Promise<string> {
  const { compile } = await import('svelte/compiler');
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  // Racine du dépôt = dossier de lancement de Vitest (`include: src/**`).
  const chemin = resolve(process.cwd(), 'src/components/v2/LibraryV2.svelte');
  const r = compile(readFileSync(chemin, 'utf-8'), { filename: chemin, css: 'external', generate: 'client' });
  return (r.css?.code ?? '').replace(/\s+/g, ' ');
}

describe('Carte d’album : les écoutes de la communauté ne cassent pas la ligne', () => {
  it('🔴 la qualité ne passe pas à la ligne, les écoutes ne rétrécissent pas', async () => {
    const el = await ecran();
    // Le montage : « (22) » est bien dans la rangée `.cbot`, à côté de `.qa`.
    const ecoutes = el.querySelector<HTMLElement>('.cbot > [data-ecoutes-communaute]');
    expect(ecoutes, 'les écoutes de « Come Away With Me » manquent').not.toBeNull();
    expect(ecoutes!.parentElement!.querySelector(':scope > .qa')).not.toBeNull();
    // La feuille : `.qa` ne passe pas à la ligne dans `.cbot`, les écoutes
    // gardent leur largeur.
    const css = await feuilleCompilee();
    expect(/\.cbot\.svelte-[\w-]+ > \.qa\s*\{\s*flex-wrap:\s*nowrap;?\s*\}/.test(css), '.cbot > .qa { flex-wrap: nowrap }').toBe(true);
    expect(/\.cbot\.svelte-[\w-]+ > \.ecoutes-communaute\s*\{\s*flex:\s*none;?\s*\}/.test(css), '.cbot > .ecoutes-communaute { flex: none }').toBe(true);
  }, 120_000);
});
