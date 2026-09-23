/**
 * Le magasin paginé — renesenses/tune-server-rust#4800, cause 3.
 *
 * Ce qu'il promet : des pages demandées une par une et mises en cache, un
 * total tenu, une invalidation qui fait tomber le cache SANS rien recharger,
 * une liste entière qui ne se charge qu'à la demande et une seule fois, et
 * un rail A–Z qui trouve sa lettre par dichotomie sur `offset`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('../api', () => ({
  getAlbumsPagines: vi.fn(),
  getAllAlbums: vi.fn(),
}));

import * as api from '../api';
import type { Album } from '../types';
import { albums, libraryLoading } from './library';
import {
  _remiseAZeroPourTests, albumsPagines, albumsCharges, casesDeLaListe, clefDeListe,
  demanderBibliothequeEntiere, demanderPage, generationBibliotheque, invaliderBibliotheque,
  mettreAJourAlbum, offsetDeLettre, rangLettre, TAILLE_PAGE, type ClefDeListe,
} from './albumsPagines';

/** 250 albums rangés par titre : dix par lettre, de A à Y. */
const TOTAL = 250;
const ALBUMS: Album[] = Array.from({ length: TOTAL }, (_, i) => ({
  id: i + 1,
  title: `${String.fromCharCode(65 + Math.floor(i / 10))}${i % 10}`,
  artist_name: 'X',
}));
const TITRE: ClefDeListe = { sort: 'title', order: 'asc' };
const initiale = (a: Album) => a.title.charAt(0);

const attendre = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  _remiseAZeroPourTests();
  albums.set([]);
  libraryLoading.set(false);
  vi.mocked(api.getAlbumsPagines).mockReset().mockImplementation(async ({ limit, offset = 0 }) => ({
    items: ALBUMS.slice(offset, offset + limit),
    total: TOTAL,
  }));
  vi.mocked(api.getAllAlbums).mockReset().mockResolvedValue(ALBUMS);
});

describe('les pages', () => {
  it('deux pages : deux requêtes bornées, le tri envoyé au serveur, le total tenu', async () => {
    await demanderPage(TITRE, 0);
    await demanderPage(TITRE, 1);
    const appels = vi.mocked(api.getAlbumsPagines).mock.calls.map(([d]) => d);
    expect(appels).toEqual([
      { limit: TAILLE_PAGE, offset: 0, sort: 'title', order: 'asc', seed: null },
      { limit: TAILLE_PAGE, offset: TAILLE_PAGE, sort: 'title', order: 'asc', seed: null },
    ]);
    const e = get(albumsPagines);
    expect(e.clef).toBe(clefDeListe(TITRE));
    expect(e.total).toBe(TOTAL);
    expect([...e.pages.keys()]).toEqual([0, 1]);
    expect(e.pages.get(1)![0].title).toBe('K0');
    // Les cases : une par album, vides au-delà des pages arrivées.
    const cases = casesDeLaListe(e);
    expect(cases.length).toBe(TOTAL);
    expect(cases[0]!.title).toBe('A0');
    expect(cases[199]!.title).toBe('T9');
    expect(cases[200]).toBeNull();
    expect(albumsCharges(e).length).toBe(200);
  });

  it('une page déjà là, ou en vol, ne repart pas', async () => {
    await demanderPage(TITRE, 0);
    await demanderPage(TITRE, 0);
    expect(api.getAlbumsPagines).toHaveBeenCalledTimes(1);
    // Deux demandes simultanées de la même page : une seule requête.
    await Promise.all([demanderPage(TITRE, 2), demanderPage(TITRE, 2)]);
    expect(api.getAlbumsPagines).toHaveBeenCalledTimes(2);
  });

  it('changer de liste (tri, graine) vide les pages et garde le total', async () => {
    await demanderPage(TITRE, 0);
    await demanderPage({ sort: 'random', order: 'asc', seed: 42 }, 0);
    const e = get(albumsPagines);
    expect(e.clef).toBe('random|asc|42');
    expect([...e.pages.keys()]).toEqual([0]);
    expect(e.total).toBe(TOTAL);
    expect(vi.mocked(api.getAlbumsPagines).mock.calls[1][0].seed).toBe(42);
  });

  it("un serveur sans `total` : on le déduit du dernier lot, comme avant", async () => {
    vi.mocked(api.getAlbumsPagines).mockImplementation(async ({ limit, offset = 0 }) => ({
      items: ALBUMS.slice(offset, offset + limit).slice(0, offset === 200 ? 50 : limit), total: null,
    }));
    await demanderPage(TITRE, 0);
    expect(get(albumsPagines).total).toBeNull();
    await demanderPage(TITRE, 2);
    expect(get(albumsPagines).total).toBe(250);
  });

  it("un échec est DIT, et ne bloque pas la page", async () => {
    vi.mocked(api.getAlbumsPagines).mockRejectedValueOnce(new Error('HTTP 503'));
    await demanderPage(TITRE, 0);
    expect(get(albumsPagines).erreur).toBe('HTTP 503');
    expect(get(albumsPagines).enVol.size).toBe(0);
    await demanderPage(TITRE, 0);
    expect(get(albumsPagines).erreur).toBeNull();
    expect(get(albumsPagines).pages.has(0)).toBe(true);
  });
});

describe("l'invalidation (fin de scan)", () => {
  it('fait tomber les pages et la liste entière, avance la génération, et ne recharge RIEN', async () => {
    await demanderPage(TITRE, 0);
    await demanderBibliothequeEntiere();
    expect(get(albums).length).toBe(TOTAL);
    const avant = get(generationBibliotheque);
    const requetes = vi.mocked(api.getAlbumsPagines).mock.calls.length + vi.mocked(api.getAllAlbums).mock.calls.length;

    invaliderBibliotheque();
    await attendre();

    const e = get(albumsPagines);
    expect(e.pages.size).toBe(0);
    expect(e.total, 'le total reste : la grille garde sa hauteur').toBe(TOTAL);
    expect(get(generationBibliotheque)).toBe(avant + 1);
    expect(get(albums)).toEqual([]);
    expect(
      vi.mocked(api.getAlbumsPagines).mock.calls.length + vi.mocked(api.getAllAlbums).mock.calls.length,
      "une invalidation ne recharge rien d'elle-même",
    ).toBe(requetes);
  });

  it("une réponse partie AVANT l'invalidation ne s'écrit pas", async () => {
    let repondre: (p: any) => void = () => {};
    vi.mocked(api.getAlbumsPagines).mockImplementationOnce(() => new Promise((r) => { repondre = r; }));
    const enVol = demanderPage(TITRE, 0);
    invaliderBibliotheque();
    repondre({ items: ALBUMS.slice(0, 100), total: TOTAL });
    await enVol;
    expect(get(albumsPagines).pages.size).toBe(0);
    expect(get(albumsPagines).enVol.size).toBe(0);
    // Et la page se redemande normalement ensuite.
    await demanderPage(TITRE, 0);
    expect(get(albumsPagines).pages.has(0)).toBe(true);
  });
});

describe('la liste entière, à la demande', () => {
  it('se charge une fois, sans tri, et remplit `albums`', async () => {
    const [a, b] = await Promise.all([demanderBibliothequeEntiere(), demanderBibliothequeEntiere()]);
    expect(a).toBe(b);
    expect(api.getAllAlbums).toHaveBeenCalledTimes(1);
    expect(api.getAllAlbums).toHaveBeenCalledWith(2000, null, null);
    expect(get(albums).length).toBe(TOTAL);
    expect(get(libraryLoading)).toBe(false);
    await demanderBibliothequeEntiere();
    expect(api.getAllAlbums, 'mémorisée : pas de second chargement').toHaveBeenCalledTimes(1);
  });

  it('après invalidation, elle se recharge SEULEMENT si on la redemande', async () => {
    await demanderBibliothequeEntiere();
    invaliderBibliotheque();
    await attendre();
    expect(api.getAllAlbums).toHaveBeenCalledTimes(1);
    await demanderBibliothequeEntiere();
    expect(api.getAllAlbums).toHaveBeenCalledTimes(2);
    expect(get(albums).length).toBe(TOTAL);
  });

  it("un échec n'est pas mémorisé", async () => {
    vi.mocked(api.getAllAlbums).mockRejectedValueOnce(new Error('HTTP 500'));
    await expect(demanderBibliothequeEntiere()).rejects.toThrow('HTTP 500');
    expect(get(libraryLoading)).toBe(false);
    await demanderBibliothequeEntiere();
    expect(api.getAllAlbums).toHaveBeenCalledTimes(2);
  });
});

describe('le rail A–Z par dichotomie', () => {
  it("'#' avant 'A', puis A..Z", () => {
    expect(rangLettre('#')).toBe(0);
    expect(rangLettre('A')).toBe(1);
    expect(rangLettre('z')).toBe(26);
    expect(rangLettre('É')).toBe(0);
  });

  it("trouve le premier offset de la lettre en ⌈log₂ n⌉ requêtes d'un album, puis le garde", async () => {
    await demanderPage(TITRE, 0);
    const avant = vi.mocked(api.getAlbumsPagines).mock.calls.length;
    expect(await offsetDeLettre(TITRE, 'M', initiale)).toBe(120);
    const sondes = vi.mocked(api.getAlbumsPagines).mock.calls.slice(avant).map(([d]) => d);
    expect(sondes.every((d) => d.limit === 1 && d.sort === 'title')).toBe(true);
    expect(sondes.length).toBeLessThanOrEqual(Math.ceil(Math.log2(TOTAL)));
    // Mémorisé par lettre et par liste.
    expect(await offsetDeLettre(TITRE, 'M', initiale)).toBe(120);
    expect(vi.mocked(api.getAlbumsPagines).mock.calls.length).toBe(avant + sondes.length);
  });

  it("'#' est l'offset 0 sans requête ; une lettre absente mène au bout", async () => {
    await demanderPage(TITRE, 0);
    const avant = vi.mocked(api.getAlbumsPagines).mock.calls.length;
    expect(await offsetDeLettre(TITRE, '#', initiale)).toBe(0);
    expect(vi.mocked(api.getAlbumsPagines).mock.calls.length).toBe(avant);
    // Pas d'album en Z : on va au dernier, plutôt que nulle part.
    expect(await offsetDeLettre(TITRE, 'Z', initiale)).toBe(TOTAL - 1);
  });

  it("une page déjà en cache répond sans sonde", async () => {
    await demanderPage(TITRE, 0);
    const avant = vi.mocked(api.getAlbumsPagines).mock.calls.length;
    // 'C' vit dans la page 0 (offset 20) : toutes les sondes tombent dans la
    // page 0 ou au-delà — celles de la page 0 ne coûtent rien.
    expect(await offsetDeLettre(TITRE, 'C', initiale)).toBe(20);
    const sondes = vi.mocked(api.getAlbumsPagines).mock.calls.slice(avant);
    expect(sondes.every(([d]) => (d.offset ?? 0) >= TAILLE_PAGE)).toBe(true);
  });

  it("l'invalidation fait tomber les bornes connues", async () => {
    await demanderPage(TITRE, 0);
    await offsetDeLettre(TITRE, 'M', initiale);
    invaliderBibliotheque();
    const avant = vi.mocked(api.getAlbumsPagines).mock.calls.length;
    expect(await offsetDeLettre(TITRE, 'M', initiale)).toBe(120);
    expect(vi.mocked(api.getAlbumsPagines).mock.calls.length).toBeGreaterThan(avant);
  });
});

describe('une fiche modifiée', () => {
  it('est reportée dans les pages et dans la liste entière', async () => {
    await demanderPage(TITRE, 0);
    await demanderBibliothequeEntiere();
    mettreAJourAlbum({ id: 1, title: 'Zéro' });
    expect(get(albumsPagines).pages.get(0)![0].title).toBe('Zéro');
    expect(get(albums)[0].title).toBe('Zéro');
    // Sans identifiant, rien ne bouge.
    const avant = get(albumsPagines);
    mettreAJourAlbum({ id: null, title: 'Rien' });
    expect(get(albumsPagines)).toBe(avant);
  });
});
