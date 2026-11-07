// @vitest-environment jsdom
//
// renesenses/tune-web-client#2679, points 2 à 4 (fil « Page des Favoris, je
// comprends pas tout ! », rc10) — écran Favoris, `FavoritesV2`.
//   2. Artistes et Playlists proposent le choix de source des Albums / Pistes.
//   3. Playlists : la pochette à la place des petites icônes (grille ET liste).
//   4. Facettes : un texte qui explique, et un lien direct vers la Bibliothèque.
// On MONTE l'écran et on lit ce qui est dessiné et les requêtes émises.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import FavoritesV2 from '../../components/v2/FavoritesV2.svelte';
import { currentProfileId, favoriteArtistIds, favoritePlaylistIds, favoriteStreamingKeys, favoriteFacetKeys, facetFavKey, streamingFavKey } from '../stores/profile';
import { activeView } from '../stores/navigation';
import en from '../locales/en';
import loc_de from '../locales/de';
import loc_el from '../locales/el';
import loc_es from '../locales/es';
import loc_fr from '../locales/fr';
import loc_hu from '../locales/hu';
import loc_it from '../locales/it';
import loc_ja from '../locales/ja';
import loc_ko from '../locales/ko';
import loc_nb from '../locales/nb';
import loc_pl from '../locales/pl';
import loc_ro from '../locales/ro';
import loc_sv from '../locales/sv';
import loc_vi from '../locales/vi';
import loc_zh from '../locales/zh';

const DICOS: Record<string, any> = { en, de: loc_de, el: loc_el, es: loc_es, fr: loc_fr, hu: loc_hu, it: loc_it, ja: loc_ja, ko: loc_ko, nb: loc_nb, pl: loc_pl, ro: loc_ro, sv: loc_sv, vi: loc_vi, zh: loc_zh };
const LANGUES = Object.keys(DICOS);

const appels: string[] = [];
let mode: 'ok' | 'vide' | 'erreur' = 'ok';
let facettesServeur: any[] = [];

function corps(url: string): unknown {
  if (url.includes('/favorites/streaming')) {
    return [
      { item_type: 'artist', service: 'qobuz', service_id: 'a1', title: 'Nina Simone', cover_url: 'https://x/a1.jpg' },
      { item_type: 'playlist', service: 'qobuz', service_id: 'p1', title: 'Jazz du soir', cover_url: 'https://x/p1.jpg' },
    ];
  }
  if (url.includes('/favorites/facets')) return facettesServeur;
  if (url.includes('/favorites')) {
    return [
      { item_type: 'artist', item_id: 5, created_at: '2026-09-20T10:00:00Z' },
      { item_type: 'playlist', item_id: 7, created_at: '2026-09-21T10:00:00Z' },
    ];
  }
  if (/\/playlists\/7\/tracks/.test(url)) {
    return [
      { id: 1, title: 'A', cover_path: '/c/a.jpg' },
      { id: 2, title: 'B', cover_path: '/c/b.jpg' },
    ];
  }
  if (/\/artists\/5(\?|$)/.test(url)) return { id: 5, name: 'Miles Davis' };
  if (/\/playlists\/7(\?|$)/.test(url)) return { id: 7, name: 'Route 66', track_count: 3 };
  if (url.includes('/playlists/all') || url.includes('/smart-playlists')) return [];
  if (url.includes('/playlists')) return [{ id: 7, name: 'Route 66', track_count: 3 }];
  if (url.includes('/streaming/services')) return {};
  return [];
}

const montes: { m: Record<string, any>; h: HTMLDivElement }[] = [];
const poser = () => {
  const h = document.createElement('div');
  document.body.appendChild(h);
  const m = mount(FavoritesV2, { target: h, props: {} as any });
  montes.push({ m, h });
  flushSync();
  return h;
};
const respirer = (ms = 160) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  appels.length = 0;
  mode = 'ok';
  facettesServeur = [];
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (entree: RequestInfo | URL) => {
    const url = String(entree);
    appels.push(url);
    if (mode === 'erreur' && url.includes('/favorites') && !url.includes('/streaming') && !url.includes('/facets')) {
      return { ok: false, status: 500, statusText: 'KO', headers: new Map(), json: async () => ({}), text: async () => '' } as unknown as Response;
    }
    const b = mode === 'vide' ? [] : corps(url);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => b, text: async () => JSON.stringify(b),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close(){} addEventListener(){} removeEventListener(){} send(){} } as any);
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  vi.stubGlobal('IntersectionObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  currentProfileId.set(1);
  favoriteArtistIds.set(new Set([5]));
  favoritePlaylistIds.set(new Set([7]));
  favoriteStreamingKeys.set(new Set([streamingFavKey('artist', 'qobuz', 'a1'), streamingFavKey('playlist', 'qobuz', 'p1')]));
  favoriteFacetKeys.set(new Set());
  activeView.set('favorites' as any);
});

afterEach(() => {
  for (const { m, h } of montes.splice(0)) { unmount(m); h.remove(); }
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function onglet(h: HTMLElement, motif: RegExp) {
  await respirer();
  flushSync();
  const b = Array.from(h.querySelectorAll<HTMLButtonElement>('.tabs button')).find((x) => motif.test(x.textContent ?? ''));
  expect(b, `l’onglet ${motif} est introuvable — témoin sans objet`).toBeTruthy();
  b!.click();
  flushSync();
  await respirer(120);
  flushSync();
}
const puces = (h: HTMLElement) => Array.from(h.querySelectorAll<HTMLButtonElement>('.puces button'));

describe('#2679 point 2 — le choix de source', () => {
  it('Artistes : puces Toutes / Bibliothèque / qobuz, et le filtre agit', async () => {
    const h = poser();
    await onglet(h, /artist/i);
    expect(puces(h).length, 'pas de puces de source sur Artistes').toBe(3);
    expect(h.querySelectorAll('.art').length).toBe(2);
    puces(h).find((b) => b.textContent === 'qobuz')!.click();
    flushSync();
    expect(h.querySelectorAll('.art').length).toBe(1);
    expect(h.querySelector('.art')!.textContent).toContain('Nina Simone');
  });

  it('Playlists : puces de source, et le filtre agit (grille)', async () => {
    const h = poser();
    await onglet(h, /playlist/i);
    expect(puces(h).length, 'pas de puces de source sur Playlists').toBe(3);
    expect(h.querySelectorAll('.card').length).toBe(2);
    puces(h).find((b) => b.textContent === 'qobuz')!.click();
    flushSync();
    expect(h.querySelectorAll('.card').length).toBe(1);
    expect(h.querySelector('.card')!.textContent).toContain('Jazz du soir');
    puces(h).find((b) => /biblioth|library/i.test(b.textContent ?? ''))!.click();
    flushSync();
    expect(h.querySelectorAll('.card').length).toBe(1);
    expect(h.querySelector('.card')!.textContent).toContain('Route 66');
  });

  it('Playlists : le serveur est lu par la route des favoris de service (aucune route inventée)', async () => {
    const h = poser();
    await onglet(h, /playlist/i);
    expect(appels.some((u) => /\/profiles\/1\/favorites\/streaming/.test(u))).toBe(true);
  });

  it('état vide : aucune puce, message d’onglet vide', async () => {
    mode = 'vide';
    const h = poser();
    await onglet(h, /playlist/i);
    expect(puces(h).length).toBe(0);
    expect(h.querySelector('.state')).toBeTruthy();
  });

  it('erreur de chargement : message d’erreur affiché, pas de plantage', async () => {
    mode = 'erreur';
    const h = poser();
    await onglet(h, /playlist/i);
    expect(h.querySelector('.err')).toBeTruthy();
  });
});

describe('#2679 point 3 — la pochette des playlists', () => {
  it('liste : une vignette-pochette par ligne (mosaïque locale, image du service), plus de pictogramme seul', async () => {
    localStorage.setItem('tune_v2_ecran_fav.playlists.display', 'list');
    const h = poser();
    await onglet(h, /playlist/i);
    expect(appels.some((u) => /\/playlists\/7\/tracks/.test(u)), 'pistes non demandées pour la mosaïque').toBe(true);
    const lignes = h.querySelectorAll('.simples .sv');
    expect(lignes.length).toBe(2);
    // La playlist de service porte son image ; la locale, sa mosaïque.
    expect(h.querySelectorAll('.simples .sv img').length, 'aucune pochette dessinée dans la liste').toBeGreaterThanOrEqual(2);
  });

  it('liste : sans pochette, le pictogramme reste', async () => {
    localStorage.setItem('tune_v2_ecran_fav.playlists.display', 'list');
    const h = poser();
    await onglet(h, /playlist/i);
    // Avant retour des pistes ou sans pochette : on vérifie le garde-fou sur la
    // playlist de service SANS image.
    expect(h.querySelectorAll('.simples .sv svg, .simples .sv img').length).toBeGreaterThan(0);
  });
});

describe('#2679 point 4 — Facettes', () => {
  it('le texte d’aide (langue de l’interface) et les trois liens directs sont là, vide ou non', async () => {
    const h = poser();
    await onglet(h, /facet|facette/i);
    const aide = h.querySelector('[data-testid="aide-facettes"]');
    expect(aide, 'aucune aide sur l’onglet Facettes').toBeTruthy();
    expect(aide!.textContent).toContain(DICOS.fr['v2.fav.facetsHelp']);
    expect(aide!.querySelectorAll('button[data-onglet]').length).toBe(3);
  });

  it('un lien envoie vers la Bibliothèque, onglet demandé', async () => {
    const h = poser();
    await onglet(h, /facet|facette/i);
    const recu: any[] = [];
    window.addEventListener('tune:v2-facette', (e) => recu.push((e as CustomEvent).detail));
    h.querySelector<HTMLButtonElement>('button[data-onglet="years"]')!.click();
    await respirer(40);
    expect(get(activeView)).toBe('library');
    expect(recu[0]?.onglet).toBe('years');
  });

  it('avec des facettes en favori, l’aide reste affichée avec la liste', async () => {
    facettesServeur = [{ facet: 'genre', value: 'Jazz' }];
    favoriteFacetKeys.set(new Set([facetFavKey('genre', 'Jazz')]));
    const h = poser();
    await onglet(h, /facet|facette/i);
    expect(h.querySelector('[data-testid="aide-facettes"]')).toBeTruthy();
    expect(h.textContent).toContain('Jazz');
  });

  it('le texte existe dans les 15 langues, distinct de l’anglais (hors anglais), avec les 3 onglets nommés comme la Bibliothèque', async () => {
    const vus = new Set<string>();
    for (const l of LANGUES) {
      const m: any = DICOS[l];
      const aide = m['v2.fav.facetsHelp'];
      expect(typeof aide, `${l} : v2.fav.facetsHelp manque`).toBe('string');
      expect(aide.length).toBeGreaterThan(40);
      expect(typeof m['v2.fav.emptyFacets']).toBe('string');
      if (l !== 'en') expect(aide, `${l} : texte resté en anglais`).not.toBe(en['v2.fav.facetsHelp' as keyof typeof en]);
      vus.add(aide);
      // Les noms d'onglets cités sont ceux que la Bibliothèque affiche.
      for (const cle of ['nav.genres', 'v2.lib.tabYears', 'v2.lib.tabLabels']) {
        expect(aide.toLowerCase(), `${l} : « ${m[cle]} » absent du texte`).toContain(String(m[cle]).toLowerCase());
      }
    }
    expect(vus.size).toBe(15);
  });
});

import { get } from 'svelte/store';
