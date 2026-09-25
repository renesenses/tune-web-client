// 🔴 Fil 1917 — Sevy Tabroc, v0.9.163, macOS, 58 359 pistes :
//
//   « La lecture aléatoire ne se limite pas à la sélection dans la vue
//     bibliothèque. »
//
// LE MÉCANISME
// ------------
// « Aléatoire » (Bibliothèque V2) appelait `api.shuffleAll` avec
// `optionsAleatoire({ dossier, recherche })` — les deux seules portées que
// `POST /playback/shuffle-all` sait tirer avec la recherche et le genre. Les
// filtres de l'écran (qualité, fréquence, format, profondeur, DR, compilation,
// année de la frise) et le groupe ouvert d'un onglet de facette (un genre, une
// année, un label) portent sur les ALBUMS et n'ont aucun nom côté serveur :
// `optionsAleatoire` rendait `undefined`, et le serveur tirait dans TOUT.
//
// La sélection, elle, est entière à l'écran : un filtre fait sortir la grille
// du mode paginé (#4800). On tire donc dans les pistes des albums retenus.
//
// CONTRE-ÉPREUVE : retirer la branche `albumsAleatoire` de `shuffleAll` fait
// rougir la garde de source ; la faire retomber sur `null` quand un filtre est
// posé fait rougir le premier bloc.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { albumsDeLaSelection, optionsAleatoire, pistesDeLaSelection } from '../porteeAleatoire';
import type { Album, Track } from '../types';

const album = (id: number): Album => ({ id, title: `A${id}` } as Album);
const piste = (id: number, album_id: number | null): Track => ({ id, title: `T${id}`, album_id } as Track);

describe('fil 1917 — la sélection d’albums', () => {
  const affiches = [album(1), album(2)];

  it('🔴 le cas de Sevy : un filtre d’album posé, rien que le serveur sache nommer', () => {
    // Ce que partait au serveur avant : RIEN — donc la bibliothèque entière.
    expect(optionsAleatoire({ dossier: null, recherche: '' })).toBeUndefined();
    // Ce que l'écran retient désormais : les albums affichés, et eux seuls.
    expect(albumsDeLaSelection({ filtresAlbum: true, groupe: null, affiches })).toEqual(new Set([1, 2]));
  });

  it('le groupe ouvert d’un onglet de facette est une sélection, filtre ou pas', () => {
    expect(albumsDeLaSelection({ filtresAlbum: false, groupe: [album(7)], affiches }))
      .toEqual(new Set([7]));
  });

  it('sans filtre ni groupe, on laisse le serveur tirer (portée nommée ou bibliothèque)', () => {
    expect(albumsDeLaSelection({ filtresAlbum: false, groupe: null, affiches })).toBeNull();
  });

  it('une sélection VIDE reste vide — jamais de repli sur la bibliothèque entière', () => {
    const s = albumsDeLaSelection({ filtresAlbum: true, groupe: null, affiches: [] });
    expect(s).not.toBeNull();
    expect(s!.size).toBe(0);
  });
});

describe('fil 1917 — les pistes tirées', () => {
  const pistes = [piste(10, 1), piste(11, 1), piste(20, 2), piste(30, 3), piste(40, null), { ...piste(0, 1), id: null }];

  it('seules les pistes des albums retenus partent, toutes, mélangées', () => {
    const ids = pistesDeLaSelection(pistes, new Set([1, 2]), 500);
    expect([...ids].sort((a, b) => a - b)).toEqual([10, 11, 20]);
  });

  it('le plafond de la file aléatoire est respecté (#2901)', () => {
    expect(pistesDeLaSelection(pistes, new Set([1, 2, 3]), 2)).toHaveLength(2);
  });

  it('le filtre à la piste affine (provenance)', () => {
    expect(pistesDeLaSelection(pistes, new Set([1, 2]), 500, (t) => t.id !== 11).sort((a, b) => a - b))
      .toEqual([10, 20]);
  });

  it('aucun album retenu : aucune piste', () => {
    expect(pistesDeLaSelection(pistes, new Set(), 500)).toEqual([]);
  });
});

describe('fil 1917 — la Bibliothèque V2 branche bien la sélection', () => {
  const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
  const sansCommentaires = (s: string) =>
    s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const src = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));

  it('la sélection se calcule sur les filtres d’album, l’année et le groupe ouvert', () => {
    const i = src.indexOf('const albumsAleatoire = $derived(');
    expect(i, 'albumsAleatoire a disparu').toBeGreaterThan(-1);
    const decl = src.slice(i, src.indexOf(');\n', i));
    expect(decl).toContain('albumsDeLaSelection(');
    expect(decl).toContain('filtreActif');
    expect(decl).toContain('anneeEffective');
    expect(decl).toContain('groupeOuvert');
    expect(decl).toContain('affiches');
  });

  it('🔴 « Aléatoire » tire dans la sélection AVANT de s’en remettre au serveur', () => {
    const debut = src.indexOf('async function shuffleAll()');
    expect(debut, 'shuffleAll a disparu').toBeGreaterThan(-1);
    const corps = src.slice(debut, src.indexOf('async function aleatoireDistant', debut));
    const branche = corps.indexOf('else if (albumsAleatoire != null)');
    const serveur = corps.indexOf('api.shuffleAll(');
    expect(branche, 'la branche de sélection manque').toBeGreaterThan(-1);
    expect(serveur, 'le tirage serveur a disparu').toBeGreaterThan(-1);
    expect(branche).toBeLessThan(serveur);
    expect(corps).toContain('pistesDeLaSelection(');
  });
});
