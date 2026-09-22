// #4650 — la pochette du single dans un album ordinaire (Fuccaro, fil 1317).
//
// Deux choses à tenir, et elles tirent en sens inverse :
//  - le cas de Fuccaro : « Angry » porte sa jaquette, il faut la MONTRER ;
//  - le cas ordinaire : vingt pistes qui portent toutes la pochette de leur
//    album ne doivent PAS faire apparaître vingt vignettes identiques — c'est
//    la raison pour laquelle la fiche d'album n'en affichait aucune.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pochettesDePisteDistinctes } from './pochetteDePisteDistincte';

const POCHETTE_ALBUM = 'condensat-album-hackney-diamonds';
const POCHETTE_SINGLE = 'condensat-single-angry';

describe('#4650 — repérer une pochette propre à une piste', () => {
  it('le cas de Fuccaro : un single dans l’album', () => {
    const pistes = [
      { cover_path: POCHETTE_SINGLE }, // Angry
      { cover_path: POCHETTE_ALBUM },
      { cover_path: POCHETTE_ALBUM },
    ];
    expect(pochettesDePisteDistinctes(pistes, POCHETTE_ALBUM)).toBe(true);
  });

  it('le cas ORDINAIRE : trente pistes, la même pochette — aucune vignette', () => {
    const pistes = Array.from({ length: 30 }, () => ({ cover_path: POCHETTE_ALBUM }));
    expect(pochettesDePisteDistinctes(pistes, POCHETTE_ALBUM)).toBe(false);
  });

  it('un album sans pochette du tout : les pistes non plus', () => {
    expect(pochettesDePisteDistinctes([{ cover_path: null }, {}], null)).toBe(false);
  });

  it('un album sans pochette dont UNE piste en a une', () => {
    expect(pochettesDePisteDistinctes([{ cover_path: POCHETTE_SINGLE }, {}], null)).toBe(true);
  });

  it('une chaîne vide n’est pas une pochette', () => {
    expect(pochettesDePisteDistinctes([{ cover_path: '' }], POCHETTE_ALBUM)).toBe(false);
  });

  it('liste vide ou absente', () => {
    expect(pochettesDePisteDistinctes([], POCHETTE_ALBUM)).toBe(false);
    expect(pochettesDePisteDistinctes(null, POCHETTE_ALBUM)).toBe(false);
  });
});

// Le BRANCHEMENT : la fiche d'album doit s'en servir, sinon la fonction
// ci-dessus est juste et invisible (« écrit mais pas branché »).
describe('#4650 — la fiche d’album est branchée dessus', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/components/v2/AlbumDetailV2.svelte'),
    'utf-8',
  );

  it('elle importe la fonction, et ne recopie pas la règle', () => {
    expect(src).toMatch(/import \{ pochettesDePisteDistinctes \} from '\.\.\/\.\.\/lib\/pochetteDePisteDistincte';/);
  });

  it('la liste des pistes reçoit la vignette sous cette condition, et pas `false`', () => {
    expect(src).toMatch(/pochette=\{pochettesDePisteDistinctesIci\}/);
    expect(src).toMatch(/pochetteEnTableau=\{pochettesDePisteDistinctesIci\}/);
    expect(src).not.toMatch(/pochette=\{false\}/);
  });
});
