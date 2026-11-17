// @vitest-environment jsdom
//
// renesenses/tune-web-client#3144 et #3145 (Didier, fil 2690, retour rc12
// relevé dans tune-server-rust#8061) — écran Favoris, `FavoritesV2`.
//   #3144  Facettes : un groupe par type, sous son intitulé (Genre, Label, Année).
//   #3145  Playlists : un repère de source sur chaque playlist (locales
//          comprises) quand toutes les sources sont affichées ; le cœur d'une
//          playlist Qobuz ne passe plus à la ligne.
// On MONTE l'écran et on lit ce qui est dessiné.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import FavoritesV2 from '../../components/v2/FavoritesV2.svelte';
import { currentProfileId, favoriteArtistIds, favoritePlaylistIds, favoriteStreamingKeys, favoriteFacetKeys, facetFavKey, streamingFavKey } from '../stores/profile';
import { activeView } from '../stores/navigation';
import { repereSource, SOURCE_BIBLIOTHEQUE } from '../favorisTriFiltre';
import { nomService } from '../convertisseurPlaylists';
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
      { item_type: 'playlist', service: 'apple', service_id: 'p2', title: 'Mix pomme' },
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
  favoriteStreamingKeys.set(new Set([streamingFavKey('artist', 'qobuz', 'a1'), streamingFavKey('playlist', 'qobuz', 'p1'), streamingFavKey('playlist', 'apple', 'p2')]));
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

describe('#3144 — Facettes rangées sous leur intitulé', () => {
  const poserFacettes = (liste: { facet: string; value: string }[]) => {
    facettesServeur = liste;
    favoriteFacetKeys.set(new Set(liste.map((f) => facetFavKey(f.facet, f.value))));
  };

  it('un groupe par type, dans l’ordre Genre, Label, Année, chacun sous son intitulé et avec ses seules valeurs', async () => {
    poserFacettes([
      { facet: 'year', value: '1975' },
      { facet: 'genre', value: 'Jazz' },
      { facet: 'label', value: 'ECM' },
      { facet: 'genre', value: 'Rock' },
      { facet: 'year', value: '1969' },
    ]);
    const h = poser();
    await onglet(h, /facet|facette/i);
    const groupes = Array.from(h.querySelectorAll<HTMLElement>('.groupe-facettes'));
    expect(groupes.map((g) => g.dataset.facette)).toEqual(['genre', 'label', 'year']);
    const titres = groupes.map((g) => g.querySelector('.gf-titre span')!.textContent);
    expect(titres).toEqual([DICOS.fr['v2.fav.facetGenre'], DICOS.fr['v2.fav.facetLabel'], DICOS.fr['v2.fav.facetYear']]);
    const valeurs = groupes.map((g) => Array.from(g.querySelectorAll('.sn')).map((n) => n.textContent));
    expect(valeurs).toEqual([['Jazz', 'Rock'], ['ECM'], ['1975', '1969']]);
    expect(groupes.map((g) => g.querySelector('.gf-n')!.textContent)).toEqual(['2', '1', '2']);
    // Le titre nomme la région : un lecteur d'écran annonce le groupe.
    for (const g of groupes) {
      expect(h.querySelector(`#${g.getAttribute('aria-labelledby')}`)).toBe(g.querySelector('.gf-titre'));
    }
    // Le type n'est plus répété en petit au bout de chaque ligne.
    expect(h.querySelectorAll('.groupe-facettes .simple .sc').length).toBe(0);
  });

  it('un type absent ne laisse pas de groupe vide ; un type inconnu vient après, sous son nom brut', async () => {
    poserFacettes([
      { facet: 'composer', value: 'Bach' },
      { facet: 'genre', value: 'Jazz' },
    ]);
    const h = poser();
    await onglet(h, /facet|facette/i);
    const groupes = Array.from(h.querySelectorAll<HTMLElement>('.groupe-facettes'));
    expect(groupes.map((g) => g.dataset.facette)).toEqual(['genre', 'composer']);
    expect(groupes[1].querySelector('.gf-titre span')!.textContent).toBe('composer');
  });

  it('la recherche filtre dans les groupes et retire un groupe devenu vide', async () => {
    poserFacettes([
      { facet: 'genre', value: 'Jazz' },
      { facet: 'label', value: 'ECM' },
    ]);
    const h = poser();
    await onglet(h, /facet|facette/i);
    const rech = h.querySelector<HTMLInputElement>('input[type="search"], .v2-rech input');
    expect(rech, 'champ de recherche introuvable — témoin sans objet').toBeTruthy();
    rech!.value = 'ecm';
    rech!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(Array.from(h.querySelectorAll<HTMLElement>('.groupe-facettes')).map((g) => g.dataset.facette)).toEqual(['label']);
  });

  it('les trois intitulés existent dans les 15 langues', () => {
    for (const l of LANGUES) {
      for (const cle of ['v2.fav.facetGenre', 'v2.fav.facetLabel', 'v2.fav.facetYear']) {
        expect(typeof DICOS[l][cle], `${l} : ${cle} manque`).toBe('string');
        expect(DICOS[l][cle].length).toBeGreaterThan(0);
      }
    }
  });
});

describe('#3145 — repère de source des playlists', () => {
  // Les styles CALCULÉS sur la feuille réellement compilée de l'écran (même
  // recette que coffretsGrilleCarree) : jsdom ne charge pas le CSS du composant.
  beforeAll(() => {
    const chemin = 'src/components/v2/FavoritesV2.svelte';
    const { css } = compile(readFileSync(resolve(process.cwd(), chemin), 'utf-8'), { css: 'external', filename: chemin });
    if (!css?.code) throw new Error(`${chemin} : aucune feuille compilée`);
    const el = document.createElement('style');
    el.textContent = css.code;
    document.head.appendChild(el);
  });
  const reperes = (h: HTMLElement) => Array.from(h.querySelectorAll<HTMLElement>('.simples .repere'));
  /** Ce que l'œil lit (la pastille), et ce que lit un lecteur d'écran. */
  const vu = (r: HTMLElement) => r.querySelector('.repere-v')!.textContent!.trim();
  const dit = (r: HTMLElement) => r.querySelector('.vh')!.textContent!.trim();

  it('liste, toutes sources : chaque playlist porte sa source, la locale comprise', async () => {
    localStorage.setItem('tune_v2_ecran_fav.playlists.display', 'list');
    const h = poser();
    await onglet(h, /playlist/i);
    const r = reperes(h);
    expect(r.length, 'une ligne sans repère').toBe(3);
    const loc = r.find((x) => x.dataset.repereSource === 'bibliotheque');
    expect(loc, 'la playlist locale n’a pas de repère').toBeTruthy();
    expect(vu(loc!)).toBe(DICOS.fr['v2.fav.sourceLibrary']);
    expect(dit(loc!)).toBe('Source : Bibliothèque');
    expect(loc!.querySelector('[aria-hidden="true"]')!.contains(loc!.querySelector('.src-loc'))).toBe(true);
    expect(loc!.getAttribute('title')).toBe('Source : Bibliothèque');
    expect(loc!.closest('.simple')!.textContent).toContain('Route 66');
    const qob = r.find((x) => x.dataset.repereSource === 'qobuz');
    expect(qob, 'la playlist Qobuz n’a pas de repère').toBeTruthy();
    expect(qob!.querySelector('.service-badge.qobuz')).toBeTruthy();
    expect(qob!.getAttribute('title')).toBe('Source : Qobuz');
    expect(dit(qob!)).toBe('Source : Qobuz');
  });

  it('service que ServiceBadge ne connaît pas (Apple Music) : repli sur la pastille texte, jamais un repère vide', async () => {
    localStorage.setItem('tune_v2_ecran_fav.playlists.display', 'list');
    const h = poser();
    await onglet(h, /playlist/i);
    const app = reperes(h).find((x) => x.dataset.repereSource === 'apple');
    expect(app, 'la playlist Apple n’a pas de repère — témoin sans objet').toBeTruthy();
    expect(app!.querySelector('.service-badge')).toBeNull();
    expect(vu(app!)).toBe('Apple Music');
    expect(dit(app!)).toBe('Source : Apple Music');
  });

  it('liste, filtrée sur une source : pas de repère (la puce le dit déjà)', async () => {
    localStorage.setItem('tune_v2_ecran_fav.playlists.display', 'list');
    const h = poser();
    await onglet(h, /playlist/i);
    puces(h).find((b) => /biblioth|library/i.test(b.textContent ?? ''))!.click();
    flushSync();
    expect(h.querySelectorAll('.simples .simple').length).toBe(1);
    expect(reperes(h).length).toBe(0);
  });

  it('une seule source : pas de repère', async () => {
    localStorage.setItem('tune_v2_ecran_fav.playlists.display', 'list');
    favoriteStreamingKeys.set(new Set([streamingFavKey('artist', 'qobuz', 'a1')]));
    const h = poser();
    await onglet(h, /playlist/i);
    expect(h.querySelectorAll('.simples .simple').length).toBe(1);
    expect(reperes(h).length).toBe(0);
  });

  it('grille, toutes sources : le repère est dans la seconde ligne, hors de la vignette (coins d’actions libres)', async () => {
    localStorage.setItem('tune_v2_ecran_fav.playlists.display', 'grid');
    const h = poser();
    await onglet(h, /playlist/i);
    const cartes = Array.from(h.querySelectorAll<HTMLElement>('.card'));
    expect(cartes.length).toBe(3);
    const locale = cartes.find((c) => c.textContent!.includes('Route 66'))!;
    const qobuz = cartes.find((c) => c.textContent!.includes('Jazz du soir'))!;
    // Le repère est dans la seconde ligne, HORS de la vignette : sur la
    // vignette il recouvrait un coin d'actions de PochetteActions.
    expect(locale.querySelector('.cv .repere'), 'repère posé sur la vignette').toBeNull();
    const rl = locale.querySelector<HTMLElement>('.ca .repere');
    expect(rl, 'la carte locale n’a pas de repère').toBeTruthy();
    expect(rl!.dataset.repereSource).toBe('bibliotheque');
    expect(vu(rl!)).toBe(DICOS.fr['v2.fav.sourceLibrary']);
    const rq = qobuz.querySelector<HTMLElement>('.ca .repere');
    expect(rq!.dataset.repereSource).toBe('qobuz');
    expect(qobuz.querySelector('.cv .repere')).toBeNull();
    // Service inconnu de ServiceBadge : même repli qu'en liste.
    const pomme = cartes.find((c) => c.textContent!.includes('Mix pomme'))!;
    expect(pomme.querySelector('.ca .repere .service-badge')).toBeNull();
    expect(vu(pomme.querySelector<HTMLElement>('.ca .repere')!)).toBe('Apple Music');
  });

  it('le cœur d’une playlist Qobuz reste sur la ligne : une colonne par pièce, sur une seule rangée', async () => {
    localStorage.setItem('tune_v2_ecran_fav.playlists.display', 'list');
    const h = poser();
    await onglet(h, /playlist/i);
    const ligne = Array.from(h.querySelectorAll<HTMLElement>('.simples .simple')).find((x) => x.textContent!.includes('Jazz du soir'))!;
    expect(ligne.querySelector(':scope > .sfav'), 'pas de cœur sur la ligne Qobuz — témoin sans objet').toBeTruthy();
    expect(ligne.children.length, 'témoin : la ligne a plus de trois pièces').toBeGreaterThan(3);
    const st = getComputedStyle(ligne);
    expect(st.display).toBe('grid');
    // Avec `auto 1fr auto` et sans placement en colonnes, la 4e pièce (le
    // cœur) ouvrait une 2e rangée.
    expect(st.getPropertyValue('grid-auto-flow')).toBe('column');
  });

  it('une playlist sans id NI source est rangée « Bibliothèque » par le filtre : son repère le dit aussi', () => {
    const r = repereSource({ id: null, source: null } as any, 'Bibliothèque', nomService);
    expect(r).toEqual({ cle: SOURCE_BIBLIOTHEQUE, bibliotheque: true, libelle: 'Bibliothèque' });
    expect(repereSource({ id: 7 } as any, 'Bibliothèque', nomService).libelle).toBe('Bibliothèque');
    expect(repereSource({ id: null, source: 'apple' } as any, 'Bibliothèque', nomService)).toEqual({ cle: 'apple', bibliotheque: false, libelle: 'Apple Music' });
    expect(repereSource({ id: null, source: 'zzz' } as any, 'Bibliothèque', nomService).libelle).toBe('zzz');
  });

  it('les titres de groupe de facettes sont des h2 (sous le h1 de l’écran)', async () => {
    facettesServeur = [{ facet: 'genre', value: 'Jazz' }];
    favoriteFacetKeys.set(new Set([facetFavKey('genre', 'Jazz')]));
    const h = poser();
    await onglet(h, /facet|facette/i);
    expect(h.querySelector('.groupe-facettes .gf-titre')!.tagName).toBe('H2');
  });

  it('la bulle « Source : … » existe dans les 15 langues, avec {source}', () => {
    for (const l of LANGUES) {
      const v = DICOS[l]['v2.fav.sourceOf'];
      expect(typeof v, `${l} : v2.fav.sourceOf manque`).toBe('string');
      expect(v, `${l} : {source} absent`).toContain('{source}');
      if (l !== 'en') expect(v, `${l} : resté en anglais`).not.toBe(en['v2.fav.sourceOf' as keyof typeof en]);
    }
  });
});
