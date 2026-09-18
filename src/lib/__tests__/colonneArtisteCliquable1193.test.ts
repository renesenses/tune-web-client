import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';

vi.mock('../api', () => ({ searchLibrary: vi.fn() }));
import * as api from '../api';
import { artisteDePiste, ouvrirArtisteDepuis } from '../ouvrirArtisteDepuis';
import { activeView, pendingLibraryArtist, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';

describe('#1193 — la colonne ARTISTE renvoie à la fiche de l’artiste', () => {
  beforeEach(() => {
    activeView.set('playlists');
    pendingLibraryArtist.set(null);
    vueDeRetour.set(null);
    ficheArtisteService.set(null as any);
  });

  it('distingue un identifiant de BIBLIOTHÈQUE d’un identifiant de SERVICE', () => {
    // Local : `artist_id` est un id de bibliothèque.
    expect(artisteDePiste({ artist_id: 12, artist_name: 'Elliott Smith' }))
      .toMatchObject({ id: 12, source: 'local' });
    // UPnP est une provenance de bibliothèque, pas un service (#4201).
    expect(artisteDePiste({ artist_id: 7, artist_name: 'X', source: 'upnp' }))
      .toMatchObject({ id: 7 });
    // Service : le MÊME nombre désigne un artiste chez Qobuz. Les confondre
    // ouvrirait un artiste au hasard.
    expect(artisteDePiste({ artist_id: 12, artist_name: 'Aldous Harding', source: 'qobuz' }))
      .toMatchObject({ source: 'qobuz', source_id: '12', name: 'Aldous Harding' });
  });

  it('sans identifiant, il reste le nom ; sans nom, aucun geste', () => {
    expect(artisteDePiste({ artist_name: 'Phosphorescent' })).toEqual({ name: 'Phosphorescent' });
    expect(artisteDePiste({})).toBeNull();
    expect(artisteDePiste(null)).toBeNull();
  });

  it('le clic mène à la bonne fiche selon la provenance', async () => {
    await ouvrirArtisteDepuis(artisteDePiste({ artist_id: 12, artist_name: 'Elliott Smith' }), 'playlists');
    expect(get(pendingLibraryArtist)).toBe(12);
    expect(get(activeView)).toBe('library');
    expect(get(vueDeRetour)).toBe('playlists');

    activeView.set('playlists');
    await ouvrirArtisteDepuis(
      artisteDePiste({ artist_id: 98, artist_name: 'Aldous Harding', source: 'qobuz' }),
      'playlists',
    );
    expect(get(activeView)).toBe('streamingartist');
    expect(get(ficheArtisteService)).toMatchObject({ service: 'qobuz', id: '98' });
  });

  it('un nom seul n’ouvre PAS un approchant', async () => {
    (api.searchLibrary as any).mockResolvedValueOnce({ artists: [{ id: 5, name: 'Airbourne' }] });
    await ouvrirArtisteDepuis(artisteDePiste({ artist_name: 'Air' }), 'playlists');
    expect(get(pendingLibraryArtist)).toBeNull();
    expect(get(activeView)).toBe('library');
  });

  it('le tableau PARTAGÉ porte le lien — donc playlist, favoris, album et bibliothèque', () => {
    const src = readFileSync('src/components/v2/ListePistesV2.svelte', 'utf8');
    expect(src).toContain("c.cle === 'artist' ? artisteDePiste(p) : null");
    expect(src).toContain('class="lien-artiste"');
    // Le clic ne doit pas déclencher la lecture de la ligne au passage.
    expect(src).toContain('e.stopPropagation()');
    // Sans artiste exploitable, la cellule reste un TEXTE : pas de bouton mort.
    expect(src).toMatch(/\{:else\}\s*\n\s*<span class="td"/);
  });
});
