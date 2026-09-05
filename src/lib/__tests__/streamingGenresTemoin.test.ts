import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getStreamingGenres, getStreamingGenreAlbums } from '../api';

/**
 * TÉMOIN de la contre-épreuve de l'onglet Genres.
 *
 * Il porte sur la moitié CLIENT qui existait déjà et que ce lot ne touche pas :
 * les deux fonctions de lecture de `api.ts`. Il doit être VERT avant comme
 * après. S'il rougissait d'un côté, la rougeur de
 * `streamingGenresOnglet.test.ts` ne prouverait plus rien : elle pourrait venir
 * d'une suite cassée plutôt que du manque qu'on comble.
 *
 * Il vit dans son propre fichier parce qu'avant le lot, `../streamingGenres`
 * n'existe pas : placé à côté des autres, l'échec d'import l'aurait emporté
 * avec eux et un témoin qu'on ne peut pas exécuter n'est pas un témoin.
 */
describe('TÉMOIN — les deux lectures de genres, inchangées', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/lib/api.ts'), 'utf-8');

  it('les deux fonctions existent', () => {
    expect(typeof getStreamingGenres).toBe('function');
    expect(typeof getStreamingGenreAlbums).toBe('function');
  });

  it('parent_id n’est ajouté à l’URL que lorsqu’il est fourni', () => {
    const f = src.slice(src.indexOf('export function getStreamingGenres'), src.indexOf('export function getStreamingGenreAlbums'));
    expect(f).toContain('parentId ?');
    expect(f).toContain('?parent_id=${encodeURIComponent(parentId)}');
  });

  it('les albums d’un genre passent bien par la route genres/{id}/albums', () => {
    const f = src.slice(src.indexOf('export function getStreamingGenreAlbums'));
    expect(f.slice(0, 400)).toContain('/genres/${encodeURIComponent(genreId)}/albums?limit=${limit}');
  });

  it('les deux passent par fetchJSON — l’aide réseau en LECTURE seule', () => {
    // L'aide d'écriture (`apiPost`) enverrait un POST sur une route GET, et
    // l'appel échouerait sans bruit côté écran.
    const g = src.slice(src.indexOf('export function getStreamingGenres'), src.indexOf('export function getStreamingPlaylists'));
    expect(g).toContain('fetchJSON<');
    expect(g).not.toContain('apiPost');
  });
});
