// @vitest-environment jsdom
//
// renesenses/tune-web-client#1802 — « Écouter plus tard » : la bascule grille /
// liste et les tris (date d'ajout, titre, artiste, type). Bertrand, 29/09/2026.
//
// 🔴 Ce témoin MONTE l'écran contre un `fetch` simulé qui rend la forme réelle
// des trois routes `/tags/{id}/albums|tracks|playlists` (mesurée sur le .18),
// puis lit ce qui est DESSINÉ : l'ordre des cartes, le mode de la vue, les
// options du tri, et ce qui est écrit dans le magasin de préférences.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import EcouterPlusTardV2 from '../../components/v2/EcouterPlusTardV2.svelte';
import { oublierSas } from '../ecouterPlusTard';
import { currentProfileId } from '../stores/profile';
import { get } from 'svelte/store';
import { t } from '../i18n';

/**
 * Trois albums, un titre, deux playlists. Les dates de dépôt sont CROISÉES
 * avec les titres et les familles : aucun tri n'y retombe par hasard sur
 * l'ordre du serveur.
 */
const ALBUMS = [
  { id: 11, title: 'Kind of Blue', artist_name: 'Miles Davis', cover_path: '/c/11.jpg', tagged_at: '2026-09-20T10:00:00Z' },
  { id: null, title: 'Floating', artist_name: 'Emile Parisien', cover_path: 'https://q/f.jpg', source: 'qobuz', source_id: 'f1', tagged_at: '2026-09-28T10:00:00Z' },
  { id: 12, title: 'Blue Train', artist_name: 'John Coltrane', cover_path: '/c/12.jpg', tagged_at: null },
];
const PISTES = [
  { id: null, title: 'Alabama', artist_name: 'John Coltrane', album_title: 'Live', cover_path: 'https://q/a.jpg', source: 'tidal', source_id: 't1', tagged_at: '2026-09-29T08:00:00Z' },
];
const LISTES = [
  { id: 7, name: 'Zen du dimanche', description: null, track_count: 3, tagged_at: '2026-09-25T10:00:00Z' },
  { id: null, name: 'Afro Jazz', description: null, track_count: null, cover_path: 'https://q/p1.jpg', source: 'qobuz', source_id: 'p1', tagged_at: '2026-09-21T10:00:00Z' },
];

/** Un serveur d'avant tune-server-rust#5478 : aucune clé `tagged_at`. */
let sansDate = false;
const sans = (l: any[]) => l.map(({ tagged_at: _t, ...r }) => r);

function corps(url: string): unknown {
  if (/\/profiles\/1\/settings/.test(url)) return { ecouterPlusTardEtiquette: 6 };
  if (/\/tags\/6\/albums/.test(url)) return { tag_id: 6, albums: sansDate ? sans(ALBUMS) : ALBUMS, count: 3 };
  if (/\/tags\/6\/tracks/.test(url)) return { tag_id: 6, tracks: sansDate ? sans(PISTES) : PISTES, count: 1 };
  if (/\/tags\/6\/playlists/.test(url)) return { tag_id: 6, playlists: sansDate ? sans(LISTES) : LISTES, count: 2 };
  if (/\/tags\/?(\?|$)/.test(url)) return [{ id: 6, name: 'Écouter plus tard', color: '#808080', count: 6 }];
  return [];
}

const montes: { m: Record<string, any>; h: HTMLDivElement }[] = [];
const respirer = (ms = 120) => new Promise((r) => setTimeout(r, ms));

async function poser(): Promise<HTMLDivElement> {
  const h = document.createElement('div');
  document.body.appendChild(h);
  const m = mount(EcouterPlusTardV2, { target: h, props: {} as any });
  montes.push({ m, h });
  flushSync();
  await respirer();
  flushSync();
  return h;
}

beforeEach(() => {
  sansDate = false;
  localStorage.clear();
  oublierSas();
  vi.stubGlobal('fetch', vi.fn(async (entree: RequestInfo | URL) => {
    const b = corps(String(entree));
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
});

afterEach(() => {
  for (const { m, h } of montes.splice(0)) { unmount(m); h.remove(); }
  vi.unstubAllGlobals();
  localStorage.clear();
  oublierSas();
});

/** Les titres dans l'ordre DESSINÉ, quelle que soit la vue. */
function ordre(h: HTMLElement): string[] {
  return Array.from(h.querySelectorAll('[data-genre] .ct')).map((e) => e.textContent?.trim() ?? '');
}
function genres(h: HTMLElement): string[] {
  return Array.from(h.querySelectorAll<HTMLElement>('[data-genre]')).map((e) => e.dataset.genre ?? '');
}
function selectTri(h: HTMLElement): HTMLSelectElement {
  const s = h.querySelector<HTMLSelectElement>('.tris select');
  expect(s, 'le sélecteur de tri est absent — témoin sans objet').toBeTruthy();
  return s!;
}
function choisir(h: HTMLElement, valeur: string) {
  const s = selectTri(h);
  s.value = valeur;
  s.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}
const cle = (k: string) => localStorage.getItem('tune_v2_ecran_' + k);

describe('#1802 — les quatre tris', () => {
  it('🔴 défaut : date d’ajout, les plus récents d’abord, une date inconnue en dernier', async () => {
    const h = await poser();
    expect(selectTri(h).value).toBe('ajout');
    expect(ordre(h)).toEqual([
      'Alabama', 'Floating', 'Zen du dimanche', 'Afro Jazz', 'Kind of Blue', 'Blue Train',
    ]);
    // 🔴 #1650 — afficher le défaut n'est PAS un choix : rien n'est écrit.
    expect(cle('later.sort')).toBeNull();
    expect(cle('later.display')).toBeNull();
  });

  it('titre : ordre alphabétique commun (comparerAlphabetique), familles mêlées', async () => {
    const h = await poser();
    choisir(h, 'titre');
    expect(ordre(h)).toEqual([
      'Afro Jazz', 'Alabama', 'Blue Train', 'Floating', 'Kind of Blue', 'Zen du dimanche',
    ]);
    expect(cle('later.sort')).toBe('titre');
  });

  it('artiste : par artiste puis titre, les playlists (sans artiste) en dernier', async () => {
    const h = await poser();
    choisir(h, 'artiste');
    expect(ordre(h)).toEqual([
      'Floating', 'Alabama', 'Blue Train', 'Kind of Blue', 'Afro Jazz', 'Zen du dimanche',
    ]);
  });

  it('type : albums, puis titres, puis playlists — chacun dans l’ordre du serveur, avec ses intertitres', async () => {
    const h = await poser();
    choisir(h, 'type');
    expect(genres(h)).toEqual(['album', 'album', 'album', 'track', 'playlist', 'playlist']);
    expect(ordre(h)).toEqual([
      'Kind of Blue', 'Floating', 'Blue Train', 'Alabama', 'Zen du dimanche', 'Afro Jazz',
    ]);
    expect(h.querySelectorAll('h2.fam').length).toBe(3);
  });

  it('🔴 le tri choisi est RETENU d’une visite à l’autre', async () => {
    let h = await poser();
    choisir(h, 'artiste');
    for (const { m, h: x } of montes.splice(0)) { unmount(m); x.remove(); }
    oublierSas();
    h = await poser();
    expect(selectTri(h).value).toBe('artiste');
    expect(ordre(h)[0]).toBe('Floating');
  });

  it('🔴 serveur sans `tagged_at` : le tri par date est CACHÉ, le défaut rend l’écran d’avant', async () => {
    sansDate = true;
    const h = await poser();
    const options = Array.from(selectTri(h).options).map((o) => o.value);
    expect(options).toEqual(['titre', 'artiste', 'type']);
    expect(selectTri(h).value).toBe('type');
    expect(genres(h)).toEqual(['album', 'album', 'album', 'track', 'playlist', 'playlist']);
  });

  it('un « ajout » retenu contre un serveur sans date retombe sur le défaut, sans être effacé', async () => {
    localStorage.setItem('tune_v2_ecran_later.sort', 'ajout');
    sansDate = true;
    const h = await poser();
    expect(selectTri(h).value).toBe('type');
    expect(cle('later.sort')).toBe('ajout');
  });
});

describe('#1802 — les vues', () => {
  const bouton = (h: HTMLElement) => {
    const b = h.querySelector<HTMLButtonElement>('button.viewtog');
    expect(b, 'la bascule BasculeAffichage est absente').toBeTruthy();
    return b!;
  };
  const cliquer = (h: HTMLElement) => { bouton(h).click(); flushSync(); };
  const vue = (h: HTMLElement) =>
    h.querySelector('.grille.grande') ? 'grande'
      : h.querySelector('.grille') ? 'petite'
      : h.querySelector('.lignes') ? 'liste' : 'aucune';

  it('🔴 trois crans : petite vignette (défaut) → grande vignette → liste → petite', async () => {
    const h = await poser();
    expect(vue(h)).toBe('petite');
    expect(h.querySelectorAll('.grille .carte').length).toBe(6);
    // Le bouton annonce la DESTINATION : les grandes vignettes.
    expect(bouton(h).getAttribute('aria-label')).toBe(get(t)('v2.lib.viewGridLarge' as any));
    expect(cle('later.display')).toBeNull();

    cliquer(h);
    expect(vue(h)).toBe('grande');
    expect(h.querySelector('[data-vue="gridLarge"]')).toBeTruthy();
    expect(h.querySelectorAll('.grille.grande .carte').length).toBe(6);
    expect(cle('later.display')).toBe('gridLarge');
    expect(bouton(h).getAttribute('aria-label')).toBe(get(t)('v2.lib.viewList' as any));

    cliquer(h);
    expect(vue(h)).toBe('liste');
    expect(h.querySelectorAll('.lignes .ligne').length).toBe(6);
    // La liste garde l'ordre du tri courant.
    expect(ordre(h)[0]).toBe('Alabama');
    expect(cle('later.display')).toBe('list');
    expect(bouton(h).getAttribute('aria-label')).toBe(get(t)('v2.later.viewSmall' as any));

    cliquer(h);
    expect(vue(h)).toBe('petite');
    expect(cle('later.display')).toBe('grid');
  });

  it('🔴 l’ancien choix « grille » est la PETITE vignette, la grille d’avant', async () => {
    localStorage.setItem('tune_v2_ecran_later.display', 'grid');
    const h = await poser();
    expect(vue(h)).toBe('petite');
    expect(cle('later.display')).toBe('grid');
  });

  it('les grandes vignettes et la liste retenues reviennent à la visite suivante', async () => {
    localStorage.setItem('tune_v2_ecran_later.display', 'gridLarge');
    let h = await poser();
    expect(vue(h)).toBe('grande');
    for (const { m, h: x } of montes.splice(0)) { unmount(m); x.remove(); }
    oublierSas();
    localStorage.setItem('tune_v2_ecran_later.display', 'list');
    h = await poser();
    expect(vue(h)).toBe('liste');
  });

  it('🔴 une playlist sans image a une vignette de REPLI, une avec image garde la sienne', async () => {
    const h = await poser();
    const cartes = Array.from(h.querySelectorAll<HTMLElement>('.carte[data-genre="playlist"]'));
    expect(cartes.length).toBe(2);
    const zen = cartes.find((c) => c.textContent?.includes('Zen du dimanche'))!;
    const afro = cartes.find((c) => c.textContent?.includes('Afro Jazz'))!;
    expect(zen.querySelector('.repli'), 'playlist locale sans image : repli attendu').toBeTruthy();
    expect(afro.querySelector('.repli'), 'playlist de service avec cover_path : sa propre image').toBeNull();
    // Un album garde sa pochette, jamais le repli.
    const album = h.querySelector<HTMLElement>('.carte[data-genre="album"]')!;
    expect(album.querySelector('.repli')).toBeNull();
  });
});

describe('#1802 — le troisième cran reste dans « Écouter plus tard »', () => {
  it('🔴 les autres écrans n’ont ni le cran ni les options de la bascule', async () => {
    const { readFileSync } = await import('node:fs');
    const { AFFICHAGES, GRILLE_OU_LISTE } = await import('../affichage');
    expect([...AFFICHAGES]).toEqual(['grid', 'list', 'carousel']);
    expect([...GRILLE_OU_LISTE]).toEqual(['grid', 'list']);
    // PlaylistsV2 a reçu les trois crans le 30/09/2026, comme Collections et
    // les écrans Playlists de la barre latérale (#1848) : il sort de la liste,
    // et son comportement est gardé par `basculePlaylistsV2EcriteAuClic.test.ts`.
    for (const f of ['LibraryV2', 'FavoritesV2']) {
      const src = readFileSync(`src/components/v2/${f}.svelte`, 'utf8');
      expect(src, f).not.toMatch(/iconeDeDestination|LISTE_ET_DEUX_GRILLES|gridLarge/);
    }
  });
});
