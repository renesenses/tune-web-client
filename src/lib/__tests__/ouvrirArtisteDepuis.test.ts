import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';

vi.mock('../api', () => ({ searchLibrary: vi.fn() }));
import * as api from '../api';
import { ouvrirArtisteDepuis } from '../ouvrirArtisteDepuis';
import { activeView, pendingLibraryArtist, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';

describe('point 9 — un clic sur un artiste favori ouvre sa fiche', () => {
  beforeEach(() => {
    activeView.set('favorites');
    pendingLibraryArtist.set(null);
    vueDeRetour.set(null);
    ficheArtisteService.set(null as any);
  });

  it('artiste de la bibliothèque : la fiche v2, retour vers les Favoris', async () => {
    await ouvrirArtisteDepuis({ id: 42, name: 'Miles Davis' }, 'favorites');
    expect(get(activeView)).toBe('library');
    expect(get(pendingLibraryArtist)).toBe(42);
    expect(get(vueDeRetour)).toBe('favorites');
  });

  it('artiste de service : la vue CHANGE (elle ne bougeait pas)', async () => {
    await ouvrirArtisteDepuis({ name: 'Miles Davis', source: 'qobuz', source_id: '123' }, 'favorites');
    expect(get(activeView)).toBe('streamingartist');
    expect(get(ficheArtisteService)).toEqual({ service: 'qobuz', id: '123', nom: 'Miles Davis' });
    expect(get(vueDeRetour)).toBe('favorites');
  });

  it('nom seul : correspondance exacte, sinon onglet Artistes sans fiche', async () => {
    (api.searchLibrary as any).mockResolvedValueOnce({ artists: [{ id: 7, name: 'Air' }] });
    await ouvrirArtisteDepuis({ name: 'Air' }, 'favorites');
    expect(get(pendingLibraryArtist)).toBe(7);
    expect(get(activeView)).toBe('library');

    pendingLibraryArtist.set(null);
    (api.searchLibrary as any).mockResolvedValueOnce({ artists: [{ id: 8, name: 'Airbourne' }] });
    await ouvrirArtisteDepuis({ name: 'Air' }, 'favorites');
    expect(get(pendingLibraryArtist)).toBeNull();
  });

  it("l'écran Favoris n'utilise plus la navigation de l'ancienne coquille", () => {
    const src = readFileSync('src/components/v2/FavoritesV2.svelte', 'utf8');
    expect(src).not.toContain("from '../../lib/libraryNavigation'");
    expect(src).toContain("ouvrirArtisteDepuis(a, 'favorites')");
  });
});
