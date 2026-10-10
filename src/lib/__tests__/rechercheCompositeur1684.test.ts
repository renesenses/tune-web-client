import { describe, expect, it } from 'vitest';
import { filtresDeRechercheServeur, repondALaRecherche } from '../facettesBibliotheque';
import { pisteRepondAuTexteLibre } from '../texteLibreOxygen';
import { fold } from '../utils';
import type { Album, Track } from '../types';

/**
 * Fil 1684 (10/10/2026) — « Ravel » doit trouver le Boléro joué par un
 * orchestre : le compositeur n'est ni le titre ni l'artiste de l'album.
 *
 * La Bibliothèque demande au serveur les albums qui répondent au texte
 * (`/library/albums-detailed?q=`, #4319) ; le serveur y compare désormais
 * `composer` (jumelle rc4 de `facet_filter.rs`). Oxygen compare les mêmes
 * champs dans sa fenêtre chargée : les deux listes restent identiques.
 */
const bolero: Album = { id: 7, title: 'Boléro', artist_name: 'Orchestre de Paris' } as Album;

describe('recherche par compositeur (fil 1684)', () => {
  it('Oxygen : une piste se trouve par son compositeur, casse et accents repliés', () => {
    const p = { id: 1, title: 'Boléro', artist_name: 'Orchestre de Paris', composer: 'Maurice Ravel' } as Track;
    expect(pisteRepondAuTexteLibre(p, 'ravel')).toBe(true);
    expect(pisteRepondAuTexteLibre(p, 'RAVÉL')).toBe(true);
    expect(pisteRepondAuTexteLibre(p, 'Debussy')).toBe(false);
    // Sans compositeur servi, rien ne correspond par ce champ.
    expect(pisteRepondAuTexteLibre({ id: 2, title: 'Boléro' } as Track, 'ravel')).toBe(false);
  });

  it('Bibliothèque : « Ravel » part au serveur, et l’album qu’il rend s’affiche', () => {
    expect(filtresDeRechercheServeur('Ravel', null)).toEqual({ q: 'Ravel' });
    // Le titre et l'artiste de l'album ne disent rien de Ravel…
    expect(repondALaRecherche(bolero, 'Ravel', { plier: fold, albumsDuTexte: null })).toBe(false);
    // …c'est la réponse du serveur (compositeur de ses pistes) qui le garde.
    expect(repondALaRecherche(bolero, 'Ravel', { plier: fold, albumsDuTexte: new Set([7]) })).toBe(true);
  });
});
