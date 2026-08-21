/**
 * #1659 — le choix du sens de tri sur les albums d'un artiste (Sevy Tabroc).
 *
 * L'invariant qui compte n'est pas le tri lui-même, c'est le sort réservé aux
 * albums sans année : ils restent en FIN de liste dans les deux sens.
 */
import { describe, it, expect } from 'vitest';
import { trierAlbumsParAnnee } from '../trierAlbums';
import type { Album } from '../types';

const a = (title: string, year: number | null): Album =>
  ({ id: Math.random(), title, year } as unknown as Album);

const titres = (l: Album[]) => l.map((x) => x.title);

describe('trierAlbumsParAnnee', () => {
  it('classe du plus ancien au plus récent en croissant', () => {
    const l = [a('C', 2001), a('A', 1975), a('B', 1990)];
    expect(titres(trierAlbumsParAnnee(l, 'asc'))).toEqual(['A', 'B', 'C']);
  });

  it('inverse en décroissant', () => {
    const l = [a('C', 2001), a('A', 1975), a('B', 1990)];
    expect(titres(trierAlbumsParAnnee(l, 'desc'))).toEqual(['C', 'B', 'A']);
  });

  it('garde les albums sans année en FIN, en croissant', () => {
    const l = [a('Sans', null), a('A', 1975), a('B', 1990)];
    expect(titres(trierAlbumsParAnnee(l, 'asc'))).toEqual(['A', 'B', 'Sans']);
  });

  /// Le cas qui motive l'extraction : un tri naïf remonterait « Sans » en tête,
  /// et l'auteur cherchant son album le plus récent tomberait sur des pochettes
  /// sans date. Ce n'est pas le tri qui est en cause, c'est la donnée absente.
  it('garde les albums sans année en FIN, en décroissant AUSSI', () => {
    const l = [a('Sans', null), a('A', 1975), a('B', 1990)];
    expect(titres(trierAlbumsParAnnee(l, 'desc'))).toEqual(['B', 'A', 'Sans']);
  });

  it('traite une année à 0 comme une année absente', () => {
    const l = [a('Zero', 0), a('A', 1975)];
    expect(titres(trierAlbumsParAnnee(l, 'asc'))).toEqual(['A', 'Zero']);
    expect(titres(trierAlbumsParAnnee(l, 'desc'))).toEqual(['A', 'Zero']);
  });

  it('départage deux albums de la même année par le titre', () => {
    const l = [a('Zebre', 1980), a('Alpha', 1980)];
    expect(titres(trierAlbumsParAnnee(l, 'asc'))).toEqual(['Alpha', 'Zebre']);
    expect(titres(trierAlbumsParAnnee(l, 'desc'))).toEqual(['Alpha', 'Zebre']);
  });

  it('ne modifie pas la liste reçue', () => {
    const l = [a('C', 2001), a('A', 1975)];
    const avant = titres(l);
    trierAlbumsParAnnee(l, 'asc');
    expect(titres(l)).toEqual(avant);
  });
});
