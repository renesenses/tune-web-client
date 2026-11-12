// tune-server-rust#7586 (FabienM, fil « 1.0.0RC9: Divers bugs », point 13 ;
// go de Bertrand du 12/11 : rc12) — « Uniquement favoris » sur tous les
// onglets de la Bibliothèque : Albums, Artistes, Pistes, Genres, Années,
// Labels. Favoris de la bibliothèque locale, pas ceux des services.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { estFacetteFavoriteDe, seulementFavoris, ONGLETS_UNIQUEMENT_FAVORIS } from '../uniquementFavoris';
import { correspond, type FiltresBibliotheque, type Outils } from '../facettesBibliotheque';
import { facetFavKey } from '../stores/profile';
import type { Album } from '../types';

const al = (o: Record<string, unknown>) => o as unknown as Album;

describe('#7586 — la logique', () => {
  it('les six onglets de la Bibliothèque portent la puce, pas les Ajouts récents ni les coffrets', () => {
    expect([...ONGLETS_UNIQUEMENT_FAVORIS].sort()).toEqual(['albums', 'artists', 'genres', 'labels', 'tracks', 'years']);
  });

  it('albums, artistes, pistes : les identifiants favoris ; un objet de service (sans id) jamais', () => {
    const liste = [{ id: 1 }, { id: 2 }, { id: null }, { id: 3 }];
    expect(seulementFavoris(liste, new Set([2, 3])).map((x) => x.id)).toEqual([2, 3]);
  });

  it('genres, années, labels : la valeur favorite, sous le nom serveur de la facette', () => {
    const cles = new Set([facetFavKey('genre', 'Jazz'), facetFavKey('year', '1959'), facetFavKey('label', 'ECM')]);
    expect(estFacetteFavoriteDe('genres', 'Jazz', cles)).toBe(true);
    expect(estFacetteFavoriteDe('genres', 'Rock', cles)).toBe(false);
    expect(estFacetteFavoriteDe('years', '1959', cles)).toBe(true);
    expect(estFacetteFavoriteDe('labels', 'ECM', cles)).toBe(true);
    // Pas de facette pour les onglets à identifiant.
    expect(estFacetteFavoriteDe('albums', 'Jazz', cles)).toBe(false);
  });

  it('les comptes des facettes suivent le filtre (onglet Albums)', () => {
    const f: FiltresBibliotheque = {
      qualite: [], frequence: [], annee: null, periode: null, format: [], profondeur: [],
      recherche: '', compilation: null, provenance: null, favoris: true,
    } as FiltresBibliotheque;
    const o: Outils = {
      qualiteDe: () => true, anneeDe: () => null, plier: (s) => (s ?? '').toLowerCase(),
      provenanceDe: () => 'local', estFavori: (a) => a.id === 1,
    };
    expect(correspond(al({ id: 1, title: 'A' }), f, o)).toBe(true);
    expect(correspond(al({ id: 2, title: 'B' }), f, o)).toBe(false);
    expect(correspond(al({ id: 2, title: 'B' }), { ...f, favoris: false }, o)).toBe(true);
  });
});

describe('#7586 — l’écran', () => {
  const lib = readFileSync('src/components/v2/LibraryV2.svelte', 'utf8');
  const artistes = readFileSync('src/components/v2/ArtistesV2.svelte', 'utf8');

  it('la puce bascule `fFavoris`, retirable et remise à zéro par « Tout »', () => {
    expect(lib).toContain('data-filtre-favoris');
    expect(lib).toContain('onclick={() => (fFavoris = !fFavoris)}');
    expect(lib).toContain("r.push({ cle: 'favorites', libelle: t('v2.lib.onlyFavorites'), retirer: () => (fFavoris = false) });");
    expect(lib).toMatch(/function reset\(\) \{[^}]*fFavoris = false;/);
  });

  it('chaque onglet lit le filtre', () => {
    expect(lib).toContain("if (fFavoris && tab === 'albums' && !estAlbumFavori(a)) return false;");
    expect(lib).toContain('estFacetteFavoriteDe(tab, g.key, $favoriteFacetKeys)');
    expect(lib).toContain('const base = fFavoris ? pistesFavorites : tracks;');
    expect(lib).toContain("&& !fFavoris);");
    expect(lib).toContain('seulementFavoris={fFavoris}');
    expect(artistes).toContain('seulementFavorisDe(dansLaPortee, $favoriteArtistIds)');
  });

  it('les trois textes existent dans toutes les langues', () => {
    for (const l of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'vi', 'el', 'nb', 'pl']) {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      for (const cle of ['v2.lib.onlyFavorites', 'v2.lib.onlyFavoritesHint', 'v2.lib.onlyFavoritesNone']) {
        expect(src, `${l} ${cle}`).toMatch(new RegExp(`"${cle.replace(/\./g, '\\.')}": "[^"]+"`));
      }
    }
  });
});
