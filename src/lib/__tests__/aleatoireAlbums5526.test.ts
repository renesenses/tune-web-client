// 🔴 tune-server-rust#5526 — Sevy Tabroc, fil 2051, v0.9.168, 109 004 pistes :
//
//   « A 10h54 j'ai sélectionné lecture en aléatoire et cela a pris 30 secondes
//     (voire plus) pour que la mise en lecture joue. »
//
// LE MÉCANISME
// ------------
// La file partie comptait 322 pistes : celles de 25 albums (branche
// `albumsAleatoire` de `shuffleAll`, fil 1917). Pour les trouver, l'écran
// chargeait TOUTE la bibliothèque par `api.getAllTracks()` : `GET
// /library/tracks?limit=2000` page après page, une cinquantaine sur 109 004
// pistes, chacune triant la table entière côté serveur (≈ 0,5 s). Le journal
// n'en gardait que les six dernières — les seules au-dessus du seuil
// `slow_query` de 500 ms.
//
// CONTRE-ÉPREUVE : faire rendre `charger.toutes()` à `pistesDesAlbums` quel que
// soit le nombre d'albums rougit le premier bloc ; remettre
// `api.getAllTracks()` dans la branche de sélection de `shuffleAll` rougit la
// garde de source.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pistesDeLaSelection, pistesDesAlbums, SEUIL_ALBUMS_PAR_FICHE } from '../porteeAleatoire';
import type { Track } from '../types';

const piste = (id: number, album_id: number): Track => ({ id, title: `T${id}`, album_id } as Track);

/** Une bibliothèque de `albums` albums de 13 pistes, et des chargeurs qui
 *  comptent ce qu'on leur demande. */
function banc(albums: number, echecs = 0) {
  const toutes: Track[] = [];
  for (let a = 1; a <= albums; a++) for (let n = 1; n <= 13; n++) toutes.push(piste(a * 100 + n, a));
  const appels = { parAlbums: [] as number[][], toutes: 0 };
  return {
    appels,
    toutes,
    charger: {
      parAlbums: async (ids: number[]) => {
        appels.parAlbums.push(ids);
        const voulus = new Set(ids);
        return { tracks: toutes.filter((t) => voulus.has(t.album_id as number)), failedAlbums: echecs };
      },
      toutes: async () => {
        appels.toutes++;
        return toutes;
      },
    },
  };
}

describe('#5526 — les pistes d’une sélection d’albums', () => {
  it('🔴 le cas de Sevy : 25 albums se lisent fiche par fiche, jamais toute la bibliothèque', async () => {
    const b = banc(8_762);
    const albums = new Set(Array.from({ length: 25 }, (_, i) => 1 + i * 300));
    const liste = await pistesDesAlbums(albums, b.charger);
    expect(b.appels.toutes, 'la bibliothèque entière a été chargée pour 25 albums').toBe(0);
    expect(b.appels.parAlbums).toEqual([[...albums]]);
    expect(liste).toHaveLength(25 * 13);
  });

  it('même tirage qu’avant : l’ensemble retenu est celui de la bibliothèque entière', async () => {
    const b = banc(400);
    const albums = new Set([3, 17, 250]);
    const avant = pistesDeLaSelection(b.toutes, albums, 500).sort((x, y) => x - y);
    const apres = pistesDeLaSelection(await pistesDesAlbums(albums, b.charger), albums, 500).sort((x, y) => x - y);
    expect(apres).toEqual(avant);
  });

  it('au-delà du seuil, la bibliothèque entière redevient moins chère : chargée comme avant', async () => {
    const b = banc(SEUIL_ALBUMS_PAR_FICHE + 10);
    const albums = Array.from({ length: SEUIL_ALBUMS_PAR_FICHE + 1 }, (_, i) => i + 1);
    await pistesDesAlbums(albums, b.charger);
    expect(b.appels.parAlbums).toHaveLength(0);
    expect(b.appels.toutes).toBe(1);
  });

  it('un album illisible après reprise : repli sur la bibliothèque entière, jamais une file tronquée', async () => {
    const b = banc(50, 1);
    const liste = await pistesDesAlbums([1, 2, 3], b.charger);
    expect(b.appels.toutes).toBe(1);
    expect(liste).toBe(b.toutes);
  });

  it('une sélection vide ne charge rien', async () => {
    const b = banc(10);
    expect(await pistesDesAlbums(new Set<number>(), b.charger)).toEqual([]);
    expect(b.appels).toEqual({ parAlbums: [], toutes: 0 });
  });

  it('un album cité deux fois (groupes qui se recoupent) n’est demandé qu’une fois', async () => {
    const b = banc(10);
    await pistesDesAlbums([4, 2, 4], b.charger);
    expect(b.appels.parAlbums).toEqual([[4, 2]]);
  });
});

describe('#5526 — la Bibliothèque V2 branche bien le chargement par album', () => {
  const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
  const sansCommentaires = (s: string) =>
    s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const src = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));

  const corpsDe = (debut: string, fin: string) => {
    const i = src.indexOf(debut);
    expect(i, `${debut} a disparu`).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf(fin, i));
  };

  it('🔴 « Aléatoire » sur une sélection : pistesDesAlbums, plus getAllTracks', () => {
    const corps = corpsDe('async function shuffleAll()', 'async function aleatoireDistant');
    const branche = corps.slice(
      corps.indexOf('else if (albumsAleatoire != null)'),
      corps.indexOf('else if (fProvenance != null)'),
    );
    expect(branche).toContain('pistesDesAlbums(albumsVoulus, chargeursDePistes)');
    expect(branche).not.toContain('api.getAllTracks()');
  });

  it('« Lire » (fil 1946) : la même chose, dans l’ordre des albums', () => {
    const corps = corpsDe('async function lireDansLOrdre()', 'async function aleatoireDistant');
    expect(corps).toContain('pistesDesAlbums(ordre, chargeursDePistes)');
    expect(corps).not.toContain('api.getAllTracks()');
  });

  it('les chargeurs sont ceux de l’API : fiche par fiche avec reprise, et la liste entière', () => {
    expect(src).toMatch(
      /const chargeursDePistes = \{ parAlbums: api\.getAlbumTracksBatch, toutes: \(\) => demanderToutesLesPistes\(\) \};/,
    );
  });
});
