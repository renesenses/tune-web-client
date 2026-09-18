// Les listes d'albums incomplets — Bertrand, 18/09/2026 : « présenter les
// albums sans cover, sans genre, sans année, et proposer des outils de
// correction des manques ».
//
// L'onglet « Manquants » donnait déjà les trois COMPTEURS et deux passes
// automatiques (pochettes, MusicBrainz). Il ne disait jamais QUELS albums :
// rien ne se corrigeait à la main quand la passe automatique n'avait pas su.
//
// Mesuré sur sa bibliothèque le jour même : 66 albums sans pochette,
// 1 234 sans genre, 1 269 sans année, sur 4 337.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { albumsAvecManque, genresConnus, manqueA } from '../manquesAlbums';
import type { Album } from '../types';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

const album = (p: Partial<Album>): Album =>
  ({ id: 1, title: 'X', source: 'local', track_count: 1, ...p }) as Album;

describe('ce qui manque à un album', () => {
  it('pochette, genre et année : vide ou blanc compte comme absent', () => {
    expect(manqueA(album({ cover_path: null }), 'cover')).toBe(true);
    expect(manqueA(album({ cover_path: '   ' }), 'cover')).toBe(true);
    expect(manqueA(album({ cover_path: 'abc' }), 'cover')).toBe(false);

    expect(manqueA(album({ year: null }), 'year')).toBe(true);
    expect(manqueA(album({ year: 0 }), 'year')).toBe(true);
    expect(manqueA(album({ year: 1969 }), 'year')).toBe(false);

    expect(manqueA(album({ genre: null }), 'genre')).toBe(true);
    expect(manqueA(album({ genre: 'Jazz' }), 'genre')).toBe(false);
  });

  it('🔴 un album qui n’a QUE la liste `genres` n’est pas sans genre', () => {
    // La base porte les deux champs (#1821). Le compter sans genre ferait
    // proposer une correction à qui n'en a pas besoin — et « Poser le genre »
    // écraserait une liste multiple par une valeur unique.
    expect(manqueA(album({ genre: null, genres: 'Jazz;Bebop' }), 'genre')).toBe(false);
    expect(manqueA(album({ genre: '', genres: '  ' }), 'genre')).toBe(true);
  });

  it('🔴 les albums d’un service ne sont pas listés', () => {
    // Un album Qobuz n'a pas de pochette à réparer ici : sa fiche vient du
    // service. Le lister serait promettre une correction impossible.
    const xs = albumsAvecManque(
      [
        album({ id: 1, cover_path: null, source: 'local' }),
        album({ id: 2, cover_path: null, source: 'qobuz' as Album['source'] }),
        album({ id: 3, cover_path: null, source: 'tidal' as Album['source'] }),
      ],
      'cover',
    );
    expect(xs.map((a) => a.id)).toEqual([1]);
  });

  it('une source absente vaut « local » — sinon la liste serait vide', () => {
    const xs = albumsAvecManque([album({ id: 9, cover_path: null, source: undefined })], 'cover');
    expect(xs.map((a) => a.id)).toEqual([9]);
  });

  it('les albums les plus fournis d’abord — un coffret vaut mieux qu’un single', () => {
    const xs = albumsAvecManque(
      [
        album({ id: 1, year: null, track_count: 1, title: 'Single' }),
        album({ id: 2, year: null, track_count: 40, title: 'Coffret' }),
        album({ id: 3, year: null, track_count: 12, title: 'Album' }),
      ],
      'year',
    );
    expect(xs.map((a) => a.id)).toEqual([2, 3, 1]);
  });

  it('les genres proposés à la saisie : distincts, triés, sans les vides', () => {
    expect(
      genresConnus([
        album({ genre: 'Rock' }),
        album({ genre: 'Jazz' }),
        album({ genre: 'Rock' }),
        album({ genre: '  ' }),
        album({ genre: null }),
      ]),
    ).toEqual(['Jazz', 'Rock']);
  });
});

describe('l’écran branche les listes', () => {
  const vue = sansCommentaires(lire('src/components/v2/ManquantsV2.svelte'));
  const api = sansCommentaires(lire('src/lib/api.ts'));

  it('les trois compteurs ouvrent leur liste', () => {
    expect(vue).toContain("basculer(quoi as Manque)");
    expect(vue).toContain("'cover'");
    expect(vue).toContain("'genre'");
    expect(vue).toContain("'year'");
    expect(vue).toContain('albumsAvecManque(albums, ouvert)');
  });

  it('la liste est paginée jusqu’au bout — pas seulement le premier lot', () => {
    // La route plafonne, et s'arrêter au premier lot cacherait la moitié de la
    // bibliothèque. C'est l'erreur déjà faite sur l'onglet Compilations.
    const i = vue.indexOf('async function chargerAlbums(');
    expect(i).toBeGreaterThan(-1);
    expect(vue.slice(i, vue.indexOf('\n  }', i))).toContain('offset += 2000');
  });

  it('🔴 getAlbumsPage déballe `items` — la signature ne ment plus', () => {
    // La route rend `{items, limit, offset, total}` ; `getAlbums` promettait un
    // tableau et rendait l'objet, si bien que `albums.find(...)` jetait
    // « find is not a function ».
    const i = api.indexOf('export async function getAlbumsPage');
    expect(i).toBeGreaterThan(-1);
    const corps = api.slice(i, api.indexOf('\n}', i));
    expect(corps).toContain('Array.isArray(r)');
    expect(corps).toContain('r?.items ?? []');
  });

  it('« tout cocher » ne coche que ce qui est AFFICHÉ', () => {
    // Cocher 1 200 albums qu'on ne voit pas serait une action en aveugle.
    const i = vue.indexOf('function cocherTout(');
    const corps = vue.slice(i, vue.indexOf('\n  }', i));
    expect(corps).toContain('liste.map');
    expect(corps).not.toContain('listeComplete');
  });

  it('une image déposée sur une ligne pose la pochette de CET album', () => {
    expect(vue).toContain('ondrop={(e) => a.id != null && deposer(e, a.id)}');
    const i = vue.indexOf('function deposer(');
    const corps = vue.slice(i, vue.indexOf('\n  }', i));
    expect(corps).toContain("f.type.startsWith('image/')");
    expect(corps).toContain('poserPochette(albumId, f)');
  });

  it('les quinze libellés existent dans les onze langues', () => {
    const cles = ['seeList','hideList','listEmpty','onlyLocal','selectAll','selectNone',
      'genrePlaceholder','yearPlaceholder','applyGenre','applyYear','applied','dropCover',
      'coverDone','tracks','more'];
    for (const l of ['de','en','es','fr','hu','it','ja','ko','ro','sv','zh']) {
      const src = lire(`src/lib/locales/${l}.ts`);
      for (const c of cles) expect(src, `${l} : v2.miss.${c}`).toContain(`"v2.miss.${c}":`);
    }
  });
});
