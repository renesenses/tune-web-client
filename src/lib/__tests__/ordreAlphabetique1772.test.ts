/**
 * #1772 (suite de tune-server-rust#4956) — le web trie alphabétiquement comme
 * le serveur.
 *
 * La liste piège est celle du témoin serveur
 * (`tune-server/tests/serveur_media_ordre_alphabetique_4956.rs`, PR
 * tune-server-rust#5401), plus « 9s » et « 10s ». L'ordre attendu est celui
 * que rend `comparer_alphabetique` : signes de tête ignorés, nombres par leur
 * valeur, sans casse ni accents, ex æquo départagés par le texte brut.
 */
import { describe, it, expect } from 'vitest';
import { comparerAlphabetique, initialeAlphabetique } from '../ordreAlphabetique';
import { trierAlbums } from '../trierAlbums';
import { trierEtFiltrer } from '../favorisTriFiltre';
import { genresConnus } from '../manquesAlbums';
import type { Album } from '../types';

const ATTENDU = [
  '2 Tone', '9s', '10s', '70s', 'Ambient', ' Blues', 'electro', 'Électro',
  '(Hip-Hop)', "'Jazz", 'Rock', 'Zzz-garde',
];
/** Un désordre qui met chaque piège du mauvais côté de son voisin. */
const ARRIVEE = [
  'Zzz-garde', "'Jazz", 'Électro', '10s', '(Hip-Hop)', ' Blues', 'Rock',
  '70s', 'electro', '9s', 'Ambient', '2 Tone',
];

describe('comparerAlphabetique — ordre du serveur (#1772)', () => {
  it('range la liste piège exactement comme le serveur', () => {
    expect([...ARRIVEE].sort(comparerAlphabetique)).toEqual(ATTENDU);
  });

  it("ne dépend pas de l'ordre d'arrivée : « electro » précède toujours « Électro »", () => {
    expect([...ATTENDU].reverse().sort(comparerAlphabetique)).toEqual(ATTENDU);
    expect(['Électro', 'electro'].sort(comparerAlphabetique)).toEqual(['electro', 'Électro']);
    expect(['electro', 'Électro'].sort(comparerAlphabetique)).toEqual(['electro', 'Électro']);
  });

  it('reprend le test unitaire du serveur (dossiers.rs, #4956)', () => {
    const v = ['(Hip-Hop)', ' Blues', "'Jazz", 'Électro', 'electro', 'Ambient'];
    expect(v.sort(comparerAlphabetique)).toEqual(['Ambient', ' Blues', 'electro', 'Électro', '(Hip-Hop)', "'Jazz"]);
  });

  it('lit les nombres par valeur, zéros de tête compris, et les met avant le texte', () => {
    const v = ['CD10', 'cd2', 'CD1', 'Émile', 'Eric', '007', '8'];
    expect(v.sort(comparerAlphabetique)).toEqual(['007', '8', 'CD1', 'cd2', 'CD10', 'Émile', 'Eric']);
  });

  it('les artistes du témoin serveur', () => {
    const v = ['ZZ Top', "'Til Tuesday", 'Édith Piaf', '2Pac', '(hed) p.e.', 'Zazie', 'edith Crash', '10cc', 'Aphex Twin'];
    expect(v.sort(comparerAlphabetique)).toEqual([
      '2Pac', '10cc', 'Aphex Twin', 'edith Crash', 'Édith Piaf', '(hed) p.e.', "'Til Tuesday", 'Zazie', 'ZZ Top',
    ]);
  });

  it('vaut null et undefined comme la chaîne vide', () => {
    expect(comparerAlphabetique(null, '')).toBe(0);
    expect(comparerAlphabetique(undefined, 'a')).toBeLessThan(0);
  });

  it("l'initiale du rail suit l'ordre : signes de tête sautés, accents repliés", () => {
    expect(initialeAlphabetique('(Hip-Hop)')).toBe('H');
    expect(initialeAlphabetique(' Blues')).toBe('B');
    expect(initialeAlphabetique('Électro')).toBe('E');
    expect(initialeAlphabetique('2 Tone')).toBe('#');
    expect(initialeAlphabetique('')).toBe('#');
  });
});

describe('les tris branchés sur comparerAlphabetique (#1772)', () => {
  const albums = (titres: string[]): Album[] =>
    titres.map((title, i) => ({ id: i + 1, title, artist_name: title }) as unknown as Album);

  it('trierAlbums, clé titre et clé artiste', () => {
    expect(trierAlbums(albums(ARRIVEE), 'title', 'asc').map((a) => a.title)).toEqual(ATTENDU);
    expect(trierAlbums(albums(ARRIVEE), 'artist', 'asc').map((a) => a.title)).toEqual(ATTENDU);
  });

  it('favoris, tri alphabétique', () => {
    const favoris = ARRIVEE.map((name) => ({ name }));
    expect(trierEtFiltrer(favoris, null, 'alpha').map((f) => f.name)).toEqual(ATTENDU);
  });

  it('genres connus (écran des manques)', () => {
    const lib = ARRIVEE.map((genre, i) => ({ id: i + 1, genre }) as unknown as Album);
    // `genresConnus` rogne les genres : « ␣Blues » y devient « Blues ».
    expect(genresConnus(lib)).toEqual(ATTENDU.map((g) => g.trim()));
  });
});

describe('coffrets (#1434) sous le comparateur commun', () => {
  it('« Disc 2 » avant « Disc 10 »', () => {
    const v = ['Radio Nova, Disc 10', 'Radio Nova, Disc 2', 'Radio Nova, Disc 1'];
    expect(v.sort(comparerAlphabetique)).toEqual(['Radio Nova, Disc 1', 'Radio Nova, Disc 2', 'Radio Nova, Disc 10']);
  });
});
