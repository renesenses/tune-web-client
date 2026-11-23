// @vitest-environment jsdom
//
// Fil 3009 (FabienM, 1.0.0-rc13), point 7 — « Je n'ai pas la même
// présentation de la page artiste bibliothèque et la page artiste Qobuz.
// Cette dernière doit reprendre la présentation de la première avec l'onglet
// crédit et le cartouche "artistes similaires", etc. »
//
// Les deux fiches sont le même composant (`ArtisteServiceV2`) ; ce qui
// manquait à celle d'un artiste de service, c'étaient les blocs que la fiche
// de bibliothèque tire des métadonnées LOCALES : « À propos » (similaires,
// membres, instruments des crédits), l'onglet « Artistes similaires » et les
// liens externes. Ce banc MONTE la fiche Qobuz et vérifie qu'elle les montre :
//   • les similaires du SERVICE (`/streaming/qobuz/artists/{id}/similar`),
//     avec leur portrait, ouverts chez le service ;
//   • à défaut, ceux de l'artiste du même nom dans la bibliothèque, avec ses
//     membres et ses instruments — sans aucun de ses gestes d'édition.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import ArtisteServiceV2 from '../../components/v2/ArtisteServiceV2.svelte';
import { ficheArtisteService, streamingServices } from '../stores/streaming';
import { currentProfileId, favoriteStreamingKeys } from '../stores/profile';
import { locale, t } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

const QOBUZ = { id: '61592', name: 'Alela Diane', image_path: 'https://static.qobuz.com/a.jpg' };
/** Une discographie : sans elle, la fiche dit « rien trouvé » et n'a pas d'aperçu. */
const ALBUMS_QOBUZ = [{ id: null, title: 'Cusp', source: 'qobuz', source_id: 'a-1', artist_name: 'Alela Diane', year: 2018, cover_path: null }];
const LOCAL = { id: 42, name: 'Alela Diane', image_path: null };
const META_LOCALE = {
  similar_artists: [{ name: 'Laura Marling', reason: 'folk' }],
  members: [{ name: 'Tom Bevitori', role: 'guitare' }],
};
const CREDITS_LOCAUX = [{ instrument: 'Vibraphone' }];
const VOISINS_QOBUZ = [
  { id: '44021', name: 'Agnes Obel', image_path: 'https://static.qobuz.com/agnes.jpg' },
  { id: '51233', name: 'Marissa Nadler', image_path: null },
];

/** Ce que rend la route des similaires du service : une liste, ou un statut. */
let voisins: unknown[] | number = VOISINS_QOBUZ;
let rechercheLocale: unknown[] = [];
/** Relecture du 23/11 : l'homonyme n'est retenu que s'il est unique et que ses albums recoupent ceux du service. */
let albumsLocaux: unknown[] = [{ id: 7, title: 'Cusp', year: 2018 }];

function reponse(statut: number, corps: unknown): Response {
  return {
    ok: statut < 400, status: statut, statusText: String(statut),
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

function repondre(url: string): Response {
  if (/\/streaming\/qobuz\/artists\/61592\/similar/.test(url)) {
    return typeof voisins === 'number' ? reponse(voisins, { error: 'unsupported' }) : reponse(200, voisins);
  }
  if (/\/streaming\/qobuz\/artists\/61592\/albums/.test(url)) return reponse(200, ALBUMS_QOBUZ);
  if (/\/streaming\/qobuz\/artists\/61592\/top-tracks/.test(url)) return reponse(200, []);
  if (/\/streaming\/qobuz\/artists\/61592/.test(url)) return reponse(200, QOBUZ);
  if (/\/streaming\/services/.test(url)) return reponse(200, { qobuz: { enabled: true, authenticated: true } });
  if (/\/library\/search\?/.test(url)) return reponse(200, { artists: rechercheLocale, albums: [], tracks: [] });
  if (/\/library\/artists\/42\/metadata/.test(url)) return reponse(200, META_LOCALE);
  if (/\/library\/artists\/42\/credits/.test(url)) return reponse(200, CREDITS_LOCAUX);
  if (/\/library\/artists\/42\/external-links/.test(url)) return reponse(200, []);
  if (/\/library\/artists\/4[23]\/albums/.test(url)) return reponse(200, albumsLocaux);
  if (/\/library\/artists\/42(\?|$)/.test(url)) return reponse(200, LOCAL);
  return reponse(200, /\/(profiles|zones|playlists|devices|favorites|history|artists|albums|tracks)(\?|\/|$)/.test(url) ? [] : {});
}

let requetes: string[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  requetes = [];
  voisins = VOISINS_QOBUZ;
  rechercheLocale = [];
  albumsLocaux = [{ id: 7, title: 'Cusp', year: 2018 }];
  locale.set('fr');
  streamingServices.set({ qobuz: { enabled: true, authenticated: true } } as any);
  vi.stubGlobal('fetch', vi.fn(async (input: any) => {
    const url = String(input);
    requetes.push(url);
    return repondre(url);
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  currentProfileId.set(2);
  favoriteStreamingKeys.set(new Set());
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  ficheArtisteService.set(null);
  vi.unstubAllGlobals();
});

async function jusqua(condition: () => boolean, borne = 8000) {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition() || Date.now() >= fin) return;
    await new Promise((r) => setTimeout(r, 0));
  }
}
const libelle = (cle: string) => get(t)(cle as any);
const apropos = () => hote!.querySelector<HTMLElement>('.apropos');
const ouvrirQobuz = () => {
  ficheArtisteService.set({ service: 'qobuz', id: '61592', nom: 'Alela Diane' } as any);
  monte = mount(ArtisteServiceV2, { target: hote!, props: {} as any });
};

describe('fil 3009 point 7 — la fiche Qobuz reprend la présentation de la fiche de bibliothèque', () => {
  it('🔴 les similaires du SERVICE : encart, onglet, portraits, et un clic ouvre leur fiche Qobuz', async () => {
    ouvrirQobuz();
    await jusqua(() => !!apropos()?.textContent?.includes('Agnes Obel'));
    expect(apropos(), 'la fiche Qobuz n’a pas d’encart « Artistes similaires »').toBeTruthy();
    expect(apropos()!.textContent).toContain(libelle('artist.similarArtists'));
    expect(apropos()!.textContent).toContain('Marissa Nadler');

    const onglet = hote!.querySelector<HTMLButtonElement>('[data-onglet-artiste="similaires"]');
    expect(onglet, 'pas d’onglet « Artistes similaires » sur la fiche Qobuz').toBeTruthy();
    onglet!.click();
    await jusqua(() => !!hote!.querySelector('[data-similaire="Agnes Obel"]'));
    const carte = hote!.querySelector<HTMLButtonElement>('[data-similaire="Agnes Obel"]')!;
    // Le portrait vient du service : aucune recherche dans la bibliothèque pour lui.
    expect(carte.querySelector('img')?.getAttribute('src') ?? '').toContain('agnes.jpg');
    expect(requetes.some((u) => /\/library\/search\?q=Agnes/.test(u))).toBe(false);

    carte.click();
    await jusqua(() => get(ficheArtisteService)?.id === '44021');
    expect(get(ficheArtisteService)).toEqual(expect.objectContaining({ service: 'qobuz', id: '44021', nom: 'Agnes Obel' }));
  });

  it('🔴 service muet (501) : similaires, membres et crédits de l’homonyme local — sans ses gestes d’édition', async () => {
    voisins = 501;
    rechercheLocale = [LOCAL];
    ouvrirQobuz();
    await jusqua(() => !!apropos()?.textContent?.includes('Vibraphone'));
    expect(apropos(), 'la fiche Qobuz ne reprend pas « À propos » de la bibliothèque').toBeTruthy();
    expect(apropos()!.textContent).toContain('Laura Marling');
    expect(apropos()!.textContent).toContain('Tom Bevitori');
    expect(apropos()!.textContent).toContain(libelle('artist.credits'));
    // Lire n'est pas écrire : ni « Modifier », ni « Étiquettes » de l'homonyme.
    const titres = [...hote!.querySelectorAll('.v2-fas button')].filter((b) => !b.closest('.carte')).map((b) => b.getAttribute('title'));
    expect(titres).not.toContain(libelle('library.editArtist'));
    expect(titres).not.toContain(libelle('v2.cover.tags'));
  });

  it('ni voisins du service ni homonyme : pas d’encart vide', async () => {
    voisins = 501;
    ouvrirQobuz();
    await jusqua(() => requetes.some((u) => /\/similar/.test(u)) && requetes.some((u) => /\/library\/search\?/.test(u)));
    await jusqua(() => false, 200);
    expect(apropos()).toBeNull();
    expect(hote!.querySelector('[data-onglet-artiste="similaires"]')).toBeNull();
    expect(requetes.some((u) => /\/metadata|\/credits/.test(u))).toBe(false);
  });

  it('🔴 DEUX homonymes locaux : ni similaires, ni membres, ni crédits, ni métadonnées lues', async () => {
    voisins = 501;
    rechercheLocale = [LOCAL, { id: 43, name: 'Alela Diane', image_path: null }];
    ouvrirQobuz();
    await jusqua(() => requetes.some((u) => /\/library\/artists\/42\/albums/.test(u)));
    await jusqua(() => false, 200);
    expect(apropos()).toBeNull();
    expect(requetes.some((u) => /\/metadata|\/credits|\/external-links/.test(u))).toBe(false);
  });

  it('🔴 homonyme dont les albums ne recoupent pas ceux du service : rien de lui', async () => {
    voisins = 501;
    rechercheLocale = [LOCAL];
    albumsLocaux = [{ id: 8, title: 'Un tout autre disque', year: 1999 }];
    ouvrirQobuz();
    await jusqua(() => requetes.some((u) => /\/library\/artists\/42\/albums/.test(u)));
    await jusqua(() => false, 200);
    expect(apropos()).toBeNull();
    expect(requetes.some((u) => /\/metadata|\/credits|\/external-links/.test(u))).toBe(false);
  });

  it('🔴 deux voisins HOMONYMES d’identifiants différents : les deux s’affichent, chacun ouvre le sien', async () => {
    voisins = [
      { id: '700', name: 'Moonchild', image_path: null },
      { id: '701', name: 'Moonchild', image_path: null },
    ];
    ouvrirQobuz();
    await jusqua(() => (apropos()?.querySelectorAll('.puce').length ?? 0) === 2);
    expect(apropos()!.querySelectorAll('.puce')).toHaveLength(2);
    hote!.querySelector<HTMLButtonElement>('[data-onglet-artiste="similaires"]')!.click();
    await jusqua(() => hote!.querySelectorAll('[data-similaire="Moonchild"]').length === 2);
    const cartes = hote!.querySelectorAll<HTMLButtonElement>('[data-similaire="Moonchild"]');
    expect(cartes).toHaveLength(2);
    cartes[1].click();
    await jusqua(() => get(ficheArtisteService)?.id === '701');
    expect(get(ficheArtisteService)?.id).toBe('701');
  });
});
