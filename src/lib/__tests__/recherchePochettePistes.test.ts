// Bertrand, 17/09/2026 : « Search : ajouter l'icône de l'album associé à la
// piste ». Le rendu de la vignette est éprouvé par vignetteHistoriqueTableau3823 ;
// ici on tient le branchement de l'écran de Recherche, sur ses DEUX listes.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const s = readFileSync(resolve(process.cwd(), 'src/components/v2/SearchV2.svelte'), 'utf-8');

describe('Recherche : la pochette de l’album sur chaque piste', () => {
  it('la liste des titres', () => {
    expect(s).toMatch(/<ListePistesV2 pistes=\{vusTitres as any\} numerotation="aucune" pochetteEnTableau/);
  });
  it('la liste « Ambiance » (recherche acoustique)', () => {
    expect(s).toMatch(/<ListePistesV2 pistes=\{acoustic\.tracks as any\} numerotation="aucune" pochetteEnTableau/);
  });
});
