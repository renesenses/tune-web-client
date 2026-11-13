// renesenses/tune-server-rust#7903 (fil forum 2656) — le tri d'une collection
// intelligente ouverte propose « Ordre d'ajout dans Tune » (la date d'ajout de
// la Bibliothèque, `added_at`, jointe par le serveur). « Date de sortie »
// reste : la Bibliothèque, les dossiers, la recherche et la fiche artiste la
// proposent aussi (web#2206).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { trierAlbums } from '../trierAlbums';
import type { Album } from '../types';

const src = readFileSync(resolve(__dirname, '../../components/v2/CollectionsV2.svelte'), 'utf8');
const trisSmart = (): string[] => {
  const m = src.match(/const TRIS_SMART = \[([^\]]*)\]/);
  expect(m, 'TRIS_SMART introuvable').toBeTruthy();
  return [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
};

describe('#7903 — tris d’une collection intelligente', () => {
  it('propose l’ordre d’ajout, et garde la date de sortie', () => {
    const t = trisSmart();
    expect(t).toContain('added_at');
    expect(t).toContain('release_date');
  });

  it('l’ordre d’ajout a son libellé', () => {
    expect(src).toMatch(/added_at: 'library\.sortAddedDate', random: 'library\.sortRandom',\n {2}\};\n {2}\/\*\* Ce que la grille AFFICHE/);
  });

  it('trie sur added_at, les albums sans date en queue', () => {
    const al = (id: number, added_at?: number) => ({ id, title: `A${id}`, added_at }) as unknown as Album;
    const albums = [al(1, 1546300800), al(2), al(3, 1704067200)];
    expect(trierAlbums(albums, 'added_at', 'desc').map((a) => a.id)).toEqual([3, 1, 2]);
    expect(trierAlbums(albums, 'added_at', 'asc').map((a) => a.id)).toEqual([1, 3, 2]);
  });
});
