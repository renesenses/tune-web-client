// @vitest-environment jsdom
/**
 * Recette rc12 de Bertrand (.18, 14/11/2026) — Bibliothèque › Albums,
 * « Source · Local » : « Tout (0) » et « Aucun album ne correspond à ces
 * filtres. », alors que la bibliothèque compte 3 996 albums locaux et que
 * `GET /library/albums` les rend tous.
 *
 * La cause est dans le client. Un filtre Source sort du mode paginé : l'écran
 * demande la LISTE ENTIÈRE (`demanderBibliothequeEntiere`, trois lots de
 * 2 000 sur le .18, plusieurs Mo). Le .18 synchronisait un serveur UPnP :
 * `library.updated` tombait PENDANT ce chargement. L'invalidation avançait la
 * génération et remettait `libraryLoading` à faux ; la réponse, d'une
 * génération périmée, était JETÉE ; et rien ne la redemandait — `albums`
 * étant vide, la liste n'était pas marquée « périmée », l'effet de l'écran ne
 * se rejouait pas. Il ne restait dans `src` que les favoris des services
 * (« Bibliothèque élargie ») : aucun n'est local, d'où « Tout (0) ».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope, libraryLoading } from '../stores/library';
import { _remiseAZeroPourTests, invaliderBibliotheque } from '../stores/albumsPagines';
import { currentProfileId } from '../stores/profile';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

let id = 0;
const album = (source: 'local' | 'upnp'): Album => ({
  id: ++id, title: `Album ${id}`, artist_name: 'A', artist_id: 1, genre: 'Rock', year: 1990,
  format: 'FLAC', sample_rate: 44100, bit_depth: 16, source,
  source_id: source === 'upnp' ? `uuid:serveur|objet-${id}` : null,
}) as unknown as Album;
/** Trois albums locaux, un album UPnP. */
const BIBLIOTHEQUE: Album[] = [album('local'), album('local'), album('local'), album('upnp')];
/** Deux favoris de service, ajoutés par la « Bibliothèque élargie ». */
const FAVORIS_DE_SERVICE = [
  { id: 1, item_type: 'album', service: 'qobuz', service_id: 'q1', title: 'Qobuz 1', artist: 'B', created_at: '2026-11-04T15:47:25Z' },
  { id: 2, item_type: 'album', service: 'tidal', service_id: 't1', title: 'Tidal 1', artist: 'C', created_at: '2026-11-04T15:47:25Z' },
];

const json = (c: unknown) => new Response(JSON.stringify(c), { status: 200, headers: { 'Content-Type': 'application/json' } });
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };

/** Les réponses de la liste entière, retenues jusqu'à ce que le test les libère. */
let liberer: (() => void)[] = [];
let requetesListeEntiere = 0;

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  history.replaceState(null, '', '/#library');
  _remiseAZeroPourTests();
  locale.set('fr');
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
  liberer = [];
  requetesListeEntiere = 0;
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => {
    const url = String(typeof u === 'string' ? u : (u as Request)?.url ?? u);
    if (/\/library\/albums\?limit=2000&offset=/.test(url)) {
      requetesListeEntiere++;
      await new Promise<void>((r) => liberer.push(r));
      return json({ items: BIBLIOTHEQUE, total: BIBLIOTHEQUE.length });
    }
    if (/\/library\/albums(\?|$)/.test(url)) return json({ items: BIBLIOTHEQUE, total: BIBLIOTHEQUE.length });
    if (/\/settings\/bibliotheque-etendue/.test(url)) return json({ enabled: true });
    if (/\/favorites\/streaming\?item_type=album/.test(url)) return json(FAVORIS_DE_SERVICE);
    return json([]);
  }));
  vi.stubGlobal('IntersectionObserver', ObservateurInerte as unknown as typeof IntersectionObserver);
  vi.stubGlobal('ResizeObserver', ObservateurInerte as unknown as typeof ResizeObserver);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  currentProfileId.set(2);
  activeView.set('library');
  libraryFolderScope.set(null as never);
  libraryLoading.set(false);
  albumsStore.set([]);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  albumsStore.set([]);
  currentProfileId.set(null);
  history.replaceState(null, '', '/');
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
  [...el.querySelectorAll<HTMLButtonElement>('button.chip.count')].find((b) => b.textContent?.trim().startsWith('Tout'))?.textContent?.trim();
async function toutLiberer() {
  for (let i = 0; i < 5 && liberer.length; i++) { const l = liberer; liberer = []; l.forEach((r) => r()); await flush(); }
}

describe('Bibliothèque › Source · Local pendant une synchronisation (recette rc12 du .18)', () => {
  it('témoin : sans événement, Source · Local montre les trois albums locaux', async () => {
    localStorage.setItem('tune_v2_ecran_v2.lib.source', 'local');
    const el = await ecran();
    await toutLiberer();
    expect(tout(el)).toBe('Tout (3)');
  });

  it('🔴 un `library.updated` PENDANT le chargement de la liste entière ne laisse pas « Tout (0) »', async () => {
    localStorage.setItem('tune_v2_ecran_v2.lib.source', 'local');
    const el = await ecran();
    expect(requetesListeEntiere, 'la liste entière est demandée').toBe(1);
    // La synchronisation UPnP du .18 : la bibliothèque change pendant que la
    // liste est en route.
    invaliderBibliotheque();
    await flush();
    await toutLiberer();
    expect(el.querySelector('.state')?.textContent ?? '').not.toContain('Aucun album ne correspond');
    expect(tout(el)).toBe('Tout (3)');
  });

  it('🔴 la liste écrite d’une génération périmée est redemandée, puis remplacée', async () => {
    localStorage.setItem('tune_v2_ecran_v2.lib.source', 'local');
    const el = await ecran();
    invaliderBibliotheque();
    await flush();
    await toutLiberer();
    expect(requetesListeEntiere, 'une seconde liste, de la génération courante').toBeGreaterThanOrEqual(2);
    expect(liberer.length, 'plus rien en attente').toBe(0);
    expect(tout(el)).toBe('Tout (3)');
  });
});
