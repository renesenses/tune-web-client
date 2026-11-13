// @vitest-environment jsdom
/**
 * renesenses/tune-web-client#2800 (serveur #8090) — la carte Pays montre par
 * défaut le pays de l'ARTISTE (`artist_country`), au choix celui de l'ÉDITION
 * (`country_albums`), comptés en albums ; le filtre suit (`artist_country=` ou
 * `country=`). Devant un serveur rc11 (facettes absentes), l'ancienne carte en
 * morceaux, sans choix ni erreur.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import CartePaysBibliothequeV2 from '../../components/v2/CartePaysBibliothequeV2.svelte';
import { chargerPays, filtreDuPays } from '../bibliothequePays';
import { albums, libraryLoading, libraryFolderScope } from '../stores/library';
import { activeView } from '../stores/navigation';
import { locale } from '../i18n';

let hote: HTMLDivElement;
let montes: Record<string, any>[] = [];
let appels: string[];
/** `true` : serveur rc12 (#8090) ; `false` : rc11, sans les facettes en albums. */
let rc12: boolean;
let artistes: { value: string; count: number }[];

const json = (corps: unknown) => new Response(JSON.stringify(corps), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});

function route(url: string): unknown {
  const u = new URL(url, 'http://localhost');
  if (u.pathname.endsWith('/library/facets')) {
    const champs = (u.searchParams.get('fields') ?? '').split(',');
    const r: Record<string, unknown> = {};
    if (champs.includes('country')) r.country = [{ value: 'DE', count: 40 }];
    if (rc12 && champs.includes('artist_country')) r.artist_country = artistes;
    if (rc12 && champs.includes('country_albums')) r.country_albums = [{ value: 'GB', count: 2 }, { value: 'gb', count: 1 }];
    return r;
  }
  if (u.pathname.endsWith('/library/albums-detailed')) {
    const ids = u.searchParams.getAll('artist_country').includes('FR') ? [1]
      : u.searchParams.getAll('country').includes('GB') ? [2] : [];
    const offset = Number(u.searchParams.get('offset') ?? 0);
    return { items: offset ? [] : ids.map((album_id) => ({ album_id })), total: ids.length };
  }
  return [];
}

async function stabiliser() {
  for (let i = 0; i < 10; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
function poser(C: any, props: Record<string, unknown>) {
  const m = mount(C, { target: hote, props: props as any });
  montes.push(m);
  flushSync();
  return m;
}
const codes = () => [...hote.querySelectorAll<HTMLElement>('[data-pays]')].map((b) => b.dataset.pays);
const titres = () => [...hote.querySelectorAll('.grid .card')].map((c) => c.textContent ?? '');

beforeEach(() => {
  locale.set('fr');
  appels = [];
  rc12 = true;
  artistes = [{ value: 'FR', count: 3 }, { value: 'JP', count: 1 }];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { appels.push(String(url)); return json(route(String(url))); }));
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
});
afterEach(() => {
  for (const m of montes) { try { unmount(m); } catch { /* déjà démonté */ } }
  montes = [];
  hote.remove();
  albums.set([] as any);
  vi.unstubAllGlobals();
});

describe('#2800 — chargerPays', () => {
  it('rc12 : la facette en albums, filtre artist_country ; vide reste vide (pas de repli)', async () => {
    const lire = vi.fn(async (f: string[]) => (f[0] === 'artist_country' ? { artist_country: [{ value: 'FR', count: 2 }] } : {}));
    const r = await chargerPays(lire as any, 'artiste', {});
    expect(r.ancien).toBe(false);
    expect(r.agregat.unite).toBe('albums');
    expect(r.agregat.pays[0]).toMatchObject({ code: 'FR', n: 2, filtre: 'artist_country' });
    expect(filtreDuPays(r.agregat.pays[0])).toEqual({ artist_country: ['FR'] });

    const vide = vi.fn(async () => ({ artist_country: [] }));
    const v = await chargerPays(vide as any, 'artiste', {});
    expect(v.ancien).toBe(false);
    expect(v.agregat.pays).toEqual([]);
    expect(vide).toHaveBeenCalledTimes(1);
  });

  it('édition : country_albums, filtre country avec les valeurs telles qu’écrites', async () => {
    const lire = vi.fn(async () => ({ country_albums: [{ value: 'GB', count: 2 }, { value: 'gb', count: 1 }] }));
    const r = await chargerPays(lire as any, 'edition', { folder: '/m' });
    expect(lire).toHaveBeenCalledWith(['country_albums'], { folder: '/m' }, 0);
    expect(r.agregat.pays[0]).toMatchObject({ code: 'GB', n: 3, filtre: 'country' });
    expect(filtreDuPays(r.agregat.pays[0])).toEqual({ country: ['GB', 'gb'] });
  });

  it('rc11 (clé absente) : repli sur country, en morceaux', async () => {
    const lire = vi.fn(async (f: string[]) => (f[0] === 'country' ? { country: [{ value: 'DE', count: 40 }] } : {}));
    const r = await chargerPays(lire as any, 'artiste', {});
    expect(r.ancien).toBe(true);
    expect(r.agregat.unite).toBe('morceaux');
    expect(r.agregat.pays[0]).toMatchObject({ code: 'DE', filtre: 'country' });
  });
});

describe('#2800 — la carte', () => {
  it('par défaut le pays de l’artiste, compté en albums ; le choix édition relit country_albums et retire le pays choisi', async () => {
    const choix: unknown[] = [];
    poser(CartePaysBibliothequeV2, { choisi: 'FR', onChoisir: (p: unknown) => choix.push(p) });
    await stabiliser();
    expect(appels.some((u) => u.includes('fields=artist_country'))).toBe(true);
    expect(appels.some((u) => /fields=country(&|$)/.test(u)), 'repli rc11 déclenché à tort').toBe(false);
    expect(codes()).toEqual(['FR', 'JP']);
    expect(hote.querySelector('[data-pays="FR"]')!.textContent).toContain('3 albums');
    expect(hote.querySelector('[data-pays="JP"]')!.textContent).toContain('1 album');
    expect(hote.querySelector('[data-pays="JP"]')!.textContent).not.toContain('morceau');
    const artiste = hote.querySelector<HTMLButtonElement>('[data-carte-source-artiste]')!;
    expect(artiste.getAttribute('aria-pressed')).toBe('true');

    hote.querySelector<HTMLButtonElement>('[data-carte-source-edition]')!.click();
    await stabiliser();
    expect(choix).toEqual([null]);
    expect(appels.some((u) => u.includes('fields=country_albums'))).toBe(true);
    expect(codes()).toEqual(['GB']);
    expect(hote.querySelector('[data-pays="GB"]')!.textContent).toContain('3 albums');
  });

  it('pays d’artiste pas encore remplis : message propre, pas de repli sur l’édition', async () => {
    artistes = [];
    poser(CartePaysBibliothequeV2, { onChoisir: () => {} });
    await stabiliser();
    expect(hote.querySelector('[data-carte-vide]')!.textContent).toContain('MusicBrainz');
    expect(hote.querySelector('[data-carte-source-edition]')).not.toBeNull();
  });

  it('serveur rc11 : ancienne carte en morceaux, sans choix ni erreur', async () => {
    rc12 = false;
    poser(CartePaysBibliothequeV2, { onChoisir: () => {} });
    await stabiliser();
    expect(codes()).toEqual(['DE']);
    expect(hote.querySelector('[data-pays="DE"]')!.textContent).toContain('40 morceaux');
    expect(hote.querySelector('[data-carte-source]')).toBeNull();
    expect(hote.querySelector('[data-carte-erreur]')).toBeNull();
  });
});

describe('#2800 — le filtre de la Bibliothèque', () => {
  it('pays de l’artiste : albums-detailed?artist_country=FR, sans country=', { timeout: 30000 }, async () => {
    activeView.set('library');
    libraryFolderScope.set(null as any);
    libraryLoading.set(false);
    albums.set([
      { id: 1, title: 'Paris-Un', artist_name: 'A', year: 2000, cover_path: null, source: 'local' },
      { id: 2, title: 'Londres-Deux', artist_name: 'B', year: 2001, cover_path: null, source: 'local' },
    ] as any);
    poser(LibraryV2, {});
    await stabiliser();
    hote.querySelector<HTMLButtonElement>('[data-carte-pays-puce]')!.click();
    await stabiliser();
    hote.querySelector<HTMLButtonElement>('[data-pays="FR"]')!.click();
    await stabiliser();
    const req = appels.find((u) => u.includes('/library/albums-detailed') && u.includes('artist_country='));
    expect(req, 'aucun appel albums-detailed avec artist_country').toBeDefined();
    const sp = new URL(req!, 'http://localhost').searchParams;
    expect(sp.getAll('artist_country')).toEqual(['FR']);
    expect(sp.getAll('country')).toEqual([]);
    expect(titres().length).toBe(1);
    expect(titres()[0]).toContain('Paris-Un');
  });
});
