// @vitest-environment jsdom
//
// Recette de Bertrand du 15/11 (« Manque les covers de playlists !! ») : les
// cartes de playlists de cercle montrent la mosaïque de pochettes résolues
// CHEZ MOI, comme l'en-tête de la vue d'une playlist ; sans rafale ; la
// vignette du thème reste quand rien n'est résolu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const lire = vi.fn();
const resoudre = vi.fn();
vi.mock('../circlePlaylists', async (orig) => ({ ...(await orig<object>()), lirePlaylistCercle: (...a: unknown[]) => lire(...a), resoudrePlaylistCercle: (...a: unknown[]) => resoudre(...a) }));

import { pochettesDeCarte, tuilesDeCarte, viderPochettesDeCarte, reglerDelaiCarte, DELAI_CARTE_MS } from '../circlePochettesCartes';
import Vignette from '../../components/v2/VignettePochettesCercle.svelte';

const item = (n: number) => ({ item_id: `i${n}`, title: `T${n}`, artist_name: 'A', added_by: null, mine: false, added_at: null });
const resolu = (n: number, album: number) => [`i${n}`, { etat: 'bibliotheque', piste: { track_id: n, album_id: album } }] as const;

let enCours = 0; let maxEnCours = 0;
beforeEach(() => {
  viderPochettesDeCarte(); lire.mockReset(); resoudre.mockReset(); enCours = 0; maxEnCours = 0;
  lire.mockImplementation(async (id: string) => {
    enCours++; maxEnCours = Math.max(maxEnCours, enCours);
    await new Promise((r) => setTimeout(r, 5));
    enCours--;
    if (id === 'vide') return { id, items: [] };
    return { id, items: [1, 2, 3, 4, 5].map(item) };
  });
  resoudre.mockImplementation(async (id: string) => {
    if (id === 'rien') return new Map();
    if (id === 'une') return new Map([resolu(1, 10)]);
    return new Map([resolu(1, 10), resolu(2, 11), resolu(3, 10), resolu(4, 12), resolu(5, 13)]);
  });
});

describe('pochettesDeCarte', () => {
  it('quatre pochettes distinctes, dans l’ordre de la playlist', async () => {
    const p = await pochettesDeCarte('a', 1);
    expect(p.map((x) => x.albumId)).toEqual([10, 11, 12, 13]);
    expect(tuilesDeCarte(p)).toHaveLength(4);
  });
  it('une seule pochette résolue : une tuile ; rien de résolu : aucune ; playlist vide : pas de résolution', async () => {
    expect(tuilesDeCarte(await pochettesDeCarte('une', 1))).toHaveLength(1);
    expect(await pochettesDeCarte('rien', 1)).toEqual([]);
    expect(await pochettesDeCarte('vide', 1)).toEqual([]);
    expect(resoudre).not.toHaveBeenCalledWith('vide');
  });
  it('sans rafale : une playlist à la fois, et une seule lecture par version', async () => {
    await Promise.all(['a', 'b', 'c', 'a'].map((id) => pochettesDeCarte(id, 1)));
    expect(maxEnCours).toBe(1);
    expect(lire).toHaveBeenCalledTimes(3);
    await pochettesDeCarte('a', 2);
    expect(lire).toHaveBeenCalledTimes(4);
  });
  it('une panne ne casse rien : pas de pochette', async () => {
    lire.mockRejectedValueOnce(new Error('503'));
    expect(await pochettesDeCarte('x', 1)).toEqual([]);
  });
  it('une panne passagère n’est pas gardée : le prochain affichage réessaie et trouve les pochettes', async () => {
    lire.mockRejectedValueOnce(new Error('503'));
    expect(await pochettesDeCarte('a', 1)).toEqual([]);
    expect((await pochettesDeCarte('a', 1)).map((x) => x.albumId)).toEqual([10, 11, 12, 13]);
    expect(lire).toHaveBeenCalledTimes(2);
  });
  it('une carte qui ne répond jamais est abandonnée (délai d’environ 8 s) et la file passe à la suivante', async () => {
    expect(DELAI_CARTE_MS).toBe(8000);
    reglerDelaiCarte(30);
    lire.mockImplementationOnce(() => new Promise(() => {}));
    const bloquee = pochettesDeCarte('muette', 1);
    const suivante = pochettesDeCarte('a', 1);
    expect(await bloquee).toEqual([]);
    expect((await suivante).map((x) => x.albumId)).toEqual([10, 11, 12, 13]);
  });
});

describe('VignettePochettesCercle', () => {
  let hote: HTMLDivElement; let vue: ReturnType<typeof mount> | null = null;
  let rappel: ((e: { isIntersecting: boolean }[]) => void) | null = null;
  beforeEach(() => {
    hote = document.createElement('div'); document.body.append(hote);
    vi.stubGlobal('IntersectionObserver', class { constructor(cb: any) { rappel = cb; } observe() {} disconnect() {} });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
  });
  afterEach(() => { if (vue) unmount(vue); vue = null; hote.remove(); rappel = null; vi.unstubAllGlobals(); });
  const finir = async () => { for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 10)); flushSync(); } };

  it('rien n’est demandé tant que la carte n’approche pas de l’écran ; puis la mosaïque 2×2', async () => {
    vue = mount(Vignette, { target: hote, props: { id: 'a', version: 1, count: 5 } });
    flushSync();
    expect(lire).not.toHaveBeenCalled();
    expect(hote.querySelector('.pochettes-carte.vide')).not.toBeNull();
    rappel!([{ isIntersecting: true }]);
    await finir();
    expect(hote.querySelectorAll('.pochettes-carte .tuile')).toHaveLength(4);
    expect(hote.querySelector('.pochettes-carte.vide')).toBeNull();
  });
  it('playlist vide : aucune demande, la vignette du thème reste', async () => {
    vue = mount(Vignette, { target: hote, props: { id: 'z', version: 1, count: 0 } });
    flushSync();
    expect(rappel).toBeNull();
    expect(hote.querySelector('.pochettes-carte.vide')).not.toBeNull();
  });
});
