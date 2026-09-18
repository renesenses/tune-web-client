// @vitest-environment jsdom
// #1179 / serveur #3482 : vrai bootstrap, stores et LibraryV2.
// Seules les frontières HTTP et événements serveur sont simulées.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { bootstrapV2, loadAlbums, suivreLaBibliotheque } from '../v2Bootstrap';
import * as api from '../api';
import { albums, libraryLoading, libraryAlbumsLoadState, libraryFolderScope } from '../stores/library';
import { activeView } from '../stores/navigation';
import { t } from '../i18n';
import type { Album } from '../types';

const evenements = vi.hoisted(() => new Set<(event: { type: string }) => void>());
vi.mock('../websocket', () => ({
  tuneWS: { onEvent: (cb: (event: { type: string }) => void) => {
    evenements.add(cb);
    return () => evenements.delete(cb);
  } },
}));
vi.mock('../api', async (original) => ({
  ...await original<typeof import('../api')>(),
  getAllAlbums: vi.fn(),
  getZones: vi.fn(async () => []),
  getDevices: vi.fn(async () => []),
}));
vi.mock('../stores/profile', async (original) => ({
  ...await original<typeof import('../stores/profile')>(),
  loadProfiles: vi.fn(async () => {}),
  loadFavoriteIds: vi.fn(async () => {}),
}));
vi.mock('../stores/license', async (original) => ({
  ...await original<typeof import('../stores/license')>(),
  loadLicense: vi.fn(async () => {}),
}));
vi.mock('../stores/preferences', async (original) => ({
  ...await original<typeof import('../stores/preferences')>(),
  syncPreferencesFromServer: vi.fn(async () => {}),
}));

vi.setConfig({ testTimeout: 30_000 });
class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, value] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value });
}
const premierePage = Array.from({ length: 100 }, (_, n) => ({
  id: n + 1, title: 'Zulu ' + n, artist_name: 'Témoin', year: 2001,
})) as Album[];
const albumComplement = { id: 101, title: 'AAA Jamaican Legends', artist_name: 'Témoin', year: 2001 } as Album;
const complet = [...premierePage, albumComplement];
function differee<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((ok, ko) => { resolve = ok; reject = ko; });
  return { promise, resolve, reject };
}
let ecran: ReturnType<typeof mount> | undefined;
let cible: HTMLDivElement;
const tr = (key: string) => get(t)(key as any);
async function monter() {
  cible = document.createElement('div');
  document.body.appendChild(cible);
  ecran = mount(LibraryV2, { target: cible });
  flushSync();
  await Promise.resolve();
}
async function attendreEtat(etat: 'idle' | 'loading' | 'error' | 'partial-error') {
  await vi.waitFor(() => { flushSync(); expect(get(libraryAlbumsLoadState)).toBe(etat); });
}
const envoyer = (type: string) => evenements.forEach((cb) => cb({ type }));

beforeEach(() => {
  vi.clearAllMocks(); evenements.clear();
  albums.set([]); libraryLoading.set(false); libraryAlbumsLoadState.set('idle');
  libraryFolderScope.set(null); activeView.set('library');
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}), text: async () => '{}',
  } as unknown as Response)));
});
afterEach(async () => {
  if (ecran) await unmount(ecran);
  ecran = undefined; document.body.innerHTML = '';
  evenements.clear(); activeView.set('home'); libraryFolderScope.set(null);
  vi.unstubAllGlobals();
});

describe('chargement incomplet des albums V2', () => {
  it('le vrai bootstrap annonce une erreur initiale au lieu de bibliothèque vide', async () => {
    const first = differee<Album[]>();
    vi.mocked(api.getAllAlbums).mockReturnValueOnce(first.promise);
    await monter();
    const chargement = bootstrapV2();
    expect(get(libraryLoading)).toBe(true);
    first.reject(new Error('HTTP indisponible'));
    await chargement; flushSync();
    expect(get(libraryAlbumsLoadState)).toBe('error');
    expect(get(libraryLoading)).toBe(false);
    expect(cible.querySelector('[role="alert"]')?.textContent).toContain(tr('oxygen.loadError'));
    expect(cible.textContent).not.toContain(tr('v2.lib.emptyLibrary'));
    expect(get(albums)).toEqual([]);
  });

  it('garde les 100 albums visibles pendant le complément puis nomme son échec', async () => {
    const rest = differee<Album[]>();
    vi.mocked(api.getAllAlbums).mockResolvedValueOnce(premierePage).mockReturnValueOnce(rest.promise);
    await monter();
    const chargement = bootstrapV2();
    await vi.waitFor(() => expect(api.getAllAlbums).toHaveBeenCalledTimes(2));
    flushSync();
    expect(get(albums)).toHaveLength(100);
    expect(get(libraryLoading)).toBe(false);
    expect(get(libraryAlbumsLoadState)).toBe('loading');
    expect(cible.querySelector('.grid .card, .rows .lrow')).not.toBeNull();
    expect(cible.querySelector('[role="status"]')?.textContent).toContain(tr('v2.lib.loading'));
    rest.reject(new Error('complément refusé'));
    await chargement; flushSync();
    expect(get(albums)).toHaveLength(100);
    expect(get(libraryAlbumsLoadState)).toBe('partial-error');
    expect(cible.querySelector('[role="alert"]')?.textContent).toContain(tr('oxygen.truncated'));
    expect(cible.querySelector('[role="alert"]')?.textContent).toContain(tr('zone.retry'));
  });

  it('le bouton Réessayer recharge et retire le bandeau après succès complet', async () => {
    vi.mocked(api.getAllAlbums).mockResolvedValueOnce(premierePage).mockRejectedValueOnce(new Error('complément'));
    await monter(); await bootstrapV2(); flushSync();
    const retry = cible.querySelector('[role="alert"] button') as HTMLButtonElement;
    expect(retry, 'un échec partiel doit offrir un nouvel essai').not.toBeNull();
    vi.mocked(api.getAllAlbums).mockResolvedValueOnce(premierePage).mockResolvedValueOnce(complet);
    retry.click();
    await attendreEtat('idle'); flushSync();
    expect(api.getAllAlbums).toHaveBeenCalledTimes(4);
    expect(get(albums)).toHaveLength(101);
    expect(get(albums)).toContainEqual(albumComplement);
    expect(cible.querySelector('[role="alert"]')).toBeNull();
    expect(cible.textContent).toContain(albumComplement.title);
  });

  it('le succès complet remplace la première page et finit le chargement', async () => {
    vi.mocked(api.getAllAlbums).mockResolvedValueOnce(premierePage).mockResolvedValueOnce(complet);
    await monter(); await bootstrapV2(); flushSync();
    expect(api.getAllAlbums).toHaveBeenNthCalledWith(1, 100, null, null, 1, 100);
    expect(api.getAllAlbums).toHaveBeenNthCalledWith(2, 2000, null, null);
    expect(get(albums)).toEqual(complet);
    expect(get(libraryAlbumsLoadState)).toBe('idle');
    expect(get(libraryLoading)).toBe(false);
    expect(cible.querySelector('[role="alert"]')).toBeNull();
  });

  it('un rechargement WS refusé est absorbé et visible, puis le désabonnement agit', async () => {
    vi.mocked(api.getAllAlbums).mockRejectedValueOnce(new Error('HTTP après scan'));
    await monter();
    const stop = suivreLaBibliotheque();
    envoyer('library.scan.completed');
    await attendreEtat('error');
    expect(cible.querySelector('[role="alert"]')?.textContent).toContain(tr('oxygen.loadError'));
    stop(); envoyer('library.updated');
    await Promise.resolve();
    expect(api.getAllAlbums).toHaveBeenCalledTimes(1);
  });

  it('une ancienne liste complète conservée après échec initial ne devient pas partielle', async () => {
    vi.mocked(api.getAllAlbums).mockResolvedValueOnce([albumComplement]);
    await monter(); await bootstrapV2();
    vi.mocked(api.getAllAlbums).mockRejectedValueOnce(new Error('rafraîchissement refusé'));
    await loadAlbums(); flushSync();
    expect(get(albums)).toEqual([albumComplement]);
    expect(get(libraryAlbumsLoadState)).toBe('error');
    const alerte = cible.querySelector('[role="alert"]');
    expect(alerte?.textContent).toContain(tr('oxygen.loadError'));
    expect(alerte?.textContent).not.toContain(tr('oxygen.truncated'));
    expect(cible.textContent).toContain(albumComplement.title);
  });

  it('une réponse complémentaire ancienne ne remplace pas le dernier succès', async () => {
    const obsolete = differee<Album[]>();
    vi.mocked(api.getAllAlbums).mockResolvedValueOnce(premierePage).mockReturnValueOnce(obsolete.promise);
    const ancien = loadAlbums();
    await vi.waitFor(() => expect(api.getAllAlbums).toHaveBeenCalledTimes(2));
    vi.mocked(api.getAllAlbums).mockResolvedValueOnce([albumComplement]);
    await loadAlbums();
    obsolete.resolve(premierePage);
    await ancien;
    expect(get(albums)).toEqual([albumComplement]);
    expect(get(libraryAlbumsLoadState)).toBe('idle');
  });

  it('un ancien échec ne remplace pas le dernier succès ni son état', async () => {
    const obsolete = differee<Album[]>();
    vi.mocked(api.getAllAlbums).mockReturnValueOnce(obsolete.promise);
    const ancien = loadAlbums();
    vi.mocked(api.getAllAlbums).mockResolvedValueOnce([albumComplement]);
    await loadAlbums();
    obsolete.reject(new Error('ancienne requête'));
    await ancien;
    expect(get(albums)).toEqual([albumComplement]);
    expect(get(libraryAlbumsLoadState)).toBe('idle');
    expect(get(libraryLoading)).toBe(false);
  });
});
