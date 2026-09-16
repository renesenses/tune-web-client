// Tri des albums à l'écran de recherche et sur la fiche artiste — Bertrand,
// 16/09/2026 : « ajouter le tri par Album / dates asc desc pour un artiste et
// Artiste / dates asc desc pour un album », puis « idem dans la vue Library /
// Artists ».
//
// Le tri est en JavaScript ici, et c'est voulu : la recherche interroge
// plusieurs sources à la fois et aucune route ne trie l'union. La règle est
// celle du serveur pour les dossiers (`album_order.rs`) : sens sur la clé
// principale seulement, manquants TOUJOURS en dernier, départages croissants.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLES_TRI_ALBUMS, LIBELLES_TRI_ALBUMS, trierAlbums } from '../trierAlbums';
import type { Album } from '../types';

const a = (title: string, extra: Partial<Album> & Record<string, unknown> = {}): Album =>
  ({ id: title.length, title, ...extra }) as unknown as Album;
const titres = (l: Album[]) => l.map((x) => x.title);

describe('trierAlbums', () => {
  it('pertinence = l’ordre reçu, renversé en desc', () => {
    const l = [a('C'), a('A'), a('B')];
    expect(titres(trierAlbums(l, 'pertinence', 'asc'))).toEqual(['C', 'A', 'B']);
    expect(titres(trierAlbums(l, 'pertinence', 'desc'))).toEqual(['B', 'A', 'C']);
    // La liste reçue n'est pas modifiée.
    expect(titres(l)).toEqual(['C', 'A', 'B']);
  });

  it('année : manquante en dernier dans les deux sens, départage par titre croissant', () => {
    const l = [a('Low'), a('Hot Rats', { year: 1969 }), a('Arrival', { year: 1976 }), a('Ege', { year: 1972 }), a('Neu', { year: 1972 })];
    expect(titres(trierAlbums(l, 'year', 'asc'))).toEqual(['Hot Rats', 'Ege', 'Neu', 'Arrival', 'Low']);
    expect(titres(trierAlbums(l, 'year', 'desc'))).toEqual(['Arrival', 'Ege', 'Neu', 'Hot Rats', 'Low']);
  });

  it('titre et artiste : accents et casse repliés, nombres naturels', () => {
    const l = [a('CD10'), a('cd2'), a('Édith'), a('eagles')];
    expect(titres(trierAlbums(l, 'title', 'asc'))).toEqual(['cd2', 'CD10', 'eagles', 'Édith']);
    const m = [a('x', { artist_name: 'Zappa' }), a('y', { artist_name: 'ABBA' }), a('z')];
    expect(titres(trierAlbums(m, 'artist', 'desc'))).toEqual(['x', 'y', 'z']);
    expect(titres(trierAlbums(m, 'artist', 'asc'))).toEqual(['y', 'x', 'z']);
  });

  it('date de sortie : release_date, sinon original_date, sinon l’année', () => {
    const l = [
      a('Sortie', { year: 2000, release_date: '1999-03-01' }),
      a('Origine', { year: 2000, original_date: '1998-11' }),
      a('Annee', { year: 1997 }),
      a('Rien'),
    ];
    expect(titres(trierAlbums(l, 'release_date', 'asc'))).toEqual(['Annee', 'Origine', 'Sortie', 'Rien']);
    expect(titres(trierAlbums(l, 'release_date', 'desc'))).toEqual(['Sortie', 'Origine', 'Annee', 'Rien']);
  });

  it('date d’ajout : nombre positif, sinon manquante', () => {
    const l = [a('Vieux', { added_at: 1_600_000_000 }), a('Recent', { added_at: 1_700_000_000 }), a('Service', { added_at: null })];
    expect(titres(trierAlbums(l, 'added_at', 'asc'))).toEqual(['Vieux', 'Recent', 'Service']);
    expect(titres(trierAlbums(l, 'added_at', 'desc'))).toEqual(['Recent', 'Vieux', 'Service']);
  });

  it('chaque clé a un libellé qui existe dans les onze langues', () => {
    for (const l of ['de','en','es','fr','hu','it','ja','ko','ro','sv','zh']) {
      const src = readFileSync(resolve(process.cwd(), `src/lib/locales/${l}.ts`), 'utf-8');
      for (const k of CLES_TRI_ALBUMS) {
        const cle = LIBELLES_TRI_ALBUMS[k];
        expect(src.includes(`"${cle}":`) || src.includes(`'${cle}':`), `${l} : ${cle}`).toBe(true);
      }
    }
  });
});

describe('les deux écrans', () => {
  const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
  it('la recherche trie sa section Albums par le module partagé, pertinence par défaut', () => {
    const s = lire('src/components/v2/SearchV2.svelte');
    expect(s).toMatch(/trierAlbums\(groupes\.albums\.filter\(dansLePerimetre\), triAlbums, sensAlbums\)/);
    expect(s).toMatch(/lireChoix<CleTriAlbums>\('v2\.rech\.albums\.tri', CLES_TRI_ALBUMS, 'pertinence'\)/);
    expect(s).toContain('<TriAlbums bind:cle={triAlbums} bind:sens={sensAlbums} />');
  });
  it('la fiche artiste trie par le même module, année par défaut, sans « Artiste » ni « Pertinence »', () => {
    const s = lire('src/components/v2/ArtistesV2.svelte');
    expect(s).toMatch(/CLES_FICHE: readonly CleTriAlbums\[\] = \['year', 'title', 'release_date', 'added_at'\]/);
    expect(s).toMatch(/lireChoix<CleTriAlbums>\('v2\.art\.albums\.tri', CLES_FICHE, 'year'\)/);
    expect(s).toMatch(/\{#each albumsTries as al \(al\.id\)\}/);
  });
});
