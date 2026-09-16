import { describe, expect, it } from 'vitest';
import { champsEditesALaMain, fautSuivreReparation, traites } from '../compilations';

describe('compilations : réparation et édition manuelle (serveur #4244)', () => {
  it('lit le marqueur edition_manuelle, et se tait sur une valeur illisible', () => {
    expect(champsEditesALaMain({ edition_manuelle: '["artist","is_compilation"]' })).toEqual(['artist', 'is_compilation']);
    expect(champsEditesALaMain({ edition_manuelle: '{"artist":true}' })).toEqual([]);
    expect(champsEditesALaMain({ edition_manuelle: 'pas du json' })).toEqual([]);
    expect(champsEditesALaMain({ edition_manuelle: '["", 3, "title"]' })).toEqual(['title']);
    expect(champsEditesALaMain({ conductor: 'Karajan' })).toEqual([]);
    expect(champsEditesALaMain(null)).toEqual([]);
  });

  it('compte tout ce qui a été traité, et ne suit que tant que ça tourne', () => {
    expect(traites({ status: 'running', total: 10, repaired: 2, unchanged: 5, manual_skipped: 1, unreadable: 1, errors: 1 })).toBe(10);
    expect(traites({ status: 'idle' })).toBe(0);
    expect(fautSuivreReparation({ status: 'running' })).toBe(true);
    expect(fautSuivreReparation({ status: 'done' })).toBe(false);
    expect(fautSuivreReparation(null)).toBe(false);
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('compilations : les écrans sont branchés', () => {
  it('Métadonnées porte l’onglet et appelle les DEUX routes de réparation', () => {
    const src = lire('../../components/v2/MetadataV2.svelte');
    expect(src).toMatch(/tab === 'compil'\}/);
    // Appels, pas définitions : les fonctions vivent dans api.ts.
    expect(src.includes('api.getReparationCompilations()')).toBe(true);
    expect(src.includes('api.lancerReparationCompilations()')).toBe(true);
    const api = lire('../api.ts');
    expect(api).toMatch(/apiPost\('\/library\/compilations\/reparation'/);
  });

  it('la fiche album lit le marqueur et rend la mention', () => {
    const src = lire('../../components/v2/AlbumDetailV2.svelte');
    expect(src.includes('champsManuels = champsEditesALaMain(m)')).toBe(true);
    expect(src).toMatch(/\{#if champsManuels\.length\}<div class="qbadge/);
  });
});
