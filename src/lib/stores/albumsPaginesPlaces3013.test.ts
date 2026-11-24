/**
 * Fil du forum 3013 — les places des pages en vol (`PAGES_EN_VOL_MAX`).
 *
 * - Un changement de tri (ou une fin de scan) pendant que deux pages de
 *   l'ancienne liste sont en vol : la page 0 de la nouvelle liste part TOUT DE
 *   SUITE. Les demandes périmées ne tiennent plus de place, sinon elle
 *   attendrait leur réponse (9 à 30 s sur un serveur figé).
 * - Une fois la file vidée, aucune page demandée ne manque (pas de trou).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('../api', () => ({
  getAlbumsPagines: vi.fn(),
  getAllAlbums: vi.fn(),
}));

import * as api from '../api';
import type { Album } from '../types';
import {
  _remiseAZeroPourTests, albumsPagines, demanderPage, invaliderBibliotheque,
  TAILLE_PAGE, type ClefDeListe,
} from './albumsPagines';

const TOTAL = 1_000;
const ALBUMS: Album[] = Array.from({ length: TOTAL }, (_, i) => ({ id: i + 1, title: `T${i}`, artist_name: 'X' }));
const TITRE: ClefDeListe = { sort: 'title', order: 'asc' };
const ARTISTE: ClefDeListe = { sort: 'artist', order: 'asc' };

/** Chaque requête attend que le banc la libère : un serveur figé. */
let enAttente: { sort: string; offset: number; liberer: () => void }[] = [];
const attendre = () => new Promise((r) => setTimeout(r, 0));
const appels = () => vi.mocked(api.getAlbumsPagines).mock.calls.map(([d]) => `${d.sort}@${d.offset}`);

beforeEach(() => {
  _remiseAZeroPourTests();
  enAttente = [];
  vi.mocked(api.getAlbumsPagines).mockReset().mockImplementation(({ limit, offset = 0, sort }) =>
    new Promise((r) => {
      enAttente.push({
        sort: String(sort), offset,
        liberer: () => r({ items: ALBUMS.slice(offset, offset + limit), total: TOTAL }),
      });
    }));
});

describe('fil 3013 — places des pages en vol', () => {
  it('un changement de tri avec deux pages en vol : la page 0 du nouveau tri part tout de suite', async () => {
    void demanderPage(TITRE, 1);
    void demanderPage(TITRE, 2);
    expect(appels()).toEqual(['title@100', 'title@200']);
    void demanderPage(ARTISTE, 0);
    await attendre();
    expect(appels(), 'la page 0 du tri Artiste ne doit pas attendre les pages périmées').toContain('artist@0');

    // Même chose après une fin de scan.
    void demanderPage(ARTISTE, 3);
    invaliderBibliotheque();
    void demanderPage(ARTISTE, 0, { forcer: true });
    await attendre();
    expect(appels().filter((a) => a === 'artist@0'), 'la page 0 de la génération neuve est partie').toHaveLength(2);
  });

  it('aucun trou une fois la file vidée', async () => {
    const demandes = [1, 2, 3, 4, 5, 6, 7].map((i) => demanderPage(TITRE, i));
    // Un changement de tri et un retour, pendant que tout attend.
    void demanderPage(ARTISTE, 0);
    const retour = [1, 2, 3, 4, 5, 6, 7].map((i) => demanderPage(TITRE, i));
    for (let tour = 0; tour < 50 && enAttente.length; tour++) {
      enAttente.shift()!.liberer();
      await attendre();
    }
    await Promise.all([...demandes, ...retour]);
    const e = get(albumsPagines);
    expect(e.clef).toBe('title|asc|');
    expect([...e.pages.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const i of [1, 2, 3, 4, 5, 6, 7]) {
      expect(e.pages.get(i)?.[0]?.title, `page ${i}`).toBe(`T${i * TAILLE_PAGE}`);
    }
    expect(e.enVol.size).toBe(0);
    expect(enAttente).toHaveLength(0);
  });
});
