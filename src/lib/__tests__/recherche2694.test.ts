/**
 * web#2694 — « The Wall » dans la grille d'albums rendait 69 albums sans
 * rapport, et pas The Wall en tête : la réponse serveur de la PHRASE
 * entière (union des mots, « the » attrape presque tout) était admise, et
 * aucun classement ne remontait la correspondance exacte.
 */
import { describe, expect, it } from 'vitest';
import {
  repondALaRecherche, prioriserRecherche, motsDeRecherche,
} from '../facettesBibliotheque';
import { fold } from '../utils';
import type { Album } from '../types';

const alb = (o: Partial<Album>): Album => ({ id: 1, title: 't', ...o }) as Album;

const ALBUMS = [
  alb({ id: 1, title: 'Second Edition', artist_name: 'Baritones' }),
  alb({ id: 2, title: 'A Love Supreme', artist_name: 'John Coltrane', label: 'Impulse' }),
  alb({ id: 3, title: 'The Wall (Remastered 2011 Version)', artist_name: 'Pink Floyd' }),
  alb({ id: 4, title: 'The Wall', artist_name: 'Pink Floyd' }),
  alb({ id: 5, title: 'Walls of the Sea', artist_name: 'Quelqu\'un' }),
  alb({ id: 6, title: 'Écoute-moi', artist_name: 'Édith Piaf' }),
  alb({ id: 7, title: 'Brick in the Wall', artist_name: 'Cover Band' }),
];

// Le serveur rend l'union des mots : « the » attrape tout, « wall » presque rien.
const SERVEUR_THE = new Set([1, 2, 3, 4, 5, 6, 7]);
const SERVEUR_WALL = new Set([3, 4, 5, 7]);

const trouves = (q: string, parMot?: Map<string, Set<number>>, phrase?: Set<number>) =>
  prioriserRecherche(
    ALBUMS.filter((a) => repondALaRecherche(a, q, {
      plier: fold, albumsDuTexte: phrase ?? null, albumsParMot: parMot ?? null,
    })),
    q, fold,
  ).map((a) => a.id);

describe('recherche de la grille : tous les mots, correspondance exacte devant (#2694)', () => {
  it('« The Wall » : The Wall en tête, aucun album sans « wall »', () => {
    const parMot = new Map([['the', SERVEUR_THE], ['wall', SERVEUR_WALL]]);
    const ids = trouves('The Wall', parMot, SERVEUR_THE);
    expect(ids[0]).toBe(4);            // titre exact
    expect(ids[1]).toBe(3);            // titre qui commence par la saisie
    expect(ids).toEqual([4, 3, 5, 7]); // le reste, dans l'ordre reçu
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(2);
    expect(ids).not.toContain(6);
  });

  it('la réponse serveur de la phrase entière ne fait plus entrer personne', () => {
    expect(trouves('The Wall', undefined, SERVEUR_THE)).toEqual([4, 3, 5, 7]);
  });

  it('« wall » seul : les albums qui contiennent « wall »', () => {
    // « Walls of the Sea » commence par la saisie : groupe 1, devant le reste.
    expect(trouves('wall')).toEqual([5, 3, 4, 7]);
  });

  it('accents et casse ignorés', () => {
    expect(trouves('ECOUTE')).toEqual([6]);
    expect(trouves('édith piaf')).toEqual([6]);
    expect(trouves('EDITH ecoute')).toEqual([6]);
  });

  it('le label compte, et les mots peuvent venir de champs différents', () => {
    expect(trouves('coltrane impulse')).toEqual([2]);
    expect(trouves('coltrane floyd')).toEqual([]);
  });

  it('saisie vide : tout passe, ordre inchangé', () => {
    expect(trouves('')).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(trouves('   ')).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('motsDeRecherche : pliés, sans guillemets ni doublons', () => {
    expect(motsDeRecherche('  "The"  Wall the ', fold)).toEqual(['the', 'wall']);
  });

  it("le tri choisi s'applique dans chaque groupe (stable)", () => {
    const l = [
      alb({ id: 10, title: 'Wall B' }), alb({ id: 11, title: 'Wall' }),
      alb({ id: 12, title: 'Wall A' }), alb({ id: 13, title: 'Big Wall' }),
    ];
    expect(prioriserRecherche(l, 'wall', fold).map((a) => a.id)).toEqual([11, 10, 12, 13]);
  });
});
