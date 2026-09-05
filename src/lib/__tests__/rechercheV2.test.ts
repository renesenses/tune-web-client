import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fusionnerParType, meilleurResultat } from '../rechercheClassement';
import type { SearchResult } from '../types';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const vide = (): SearchResult => ({ tracks: [], albums: [], artists: [] });
const res = (o: Partial<SearchResult>): SearchResult => ({ ...vide(), ...o }) as SearchResult;

describe('Recherche v2 (retours Bertrand, 05/09/2026)', () => {
  const src = sansCommentaires(lire('src/components/v2/SearchV2.svelte'));

  it("les SERVICES ne sont plus derrière un niveau d'interface", () => {
    // Le défaut : `if (advanced) { federatedSearch(...) } else { fed = {} }`.
    expect(src).toContain('api.federatedSearch(query)');
    expect(src).not.toMatch(/if\s*\(\s*advanced\s*\)/);
    expect(src).not.toContain("atLeast($preferences.settingsLevel, 'intermediate')");
  });

  it('les résultats sont groupés par TYPE, plus par source', () => {
    expect(src).toContain('fusionnerParType(local, fed)');
    // Le bloc « Sur les services » et son sous-découpage par service ont
    // disparu : c'était le regroupement par source.
    expect(src).not.toContain('v2.sc.onServices');
    expect(src).not.toContain('fedEntries');
    expect(src).not.toContain('class="svcn"');
  });

  it("l'écran vide propose une découverte, pas une loupe grise", () => {
    expect(src).toContain('v2.rech.recent');
    expect(src).toContain("$t('search.topArtists')");
    expect(src).toContain('v2.rech.recentAdds');
    expect(src).toContain('api.getTopArtists(');
    expect(src).toContain('api.getRecentAlbums(');
  });

  it('le meilleur résultat et les playlists existent', () => {
    // Il sort du PÉRIMÈTRE choisi, pas de tous les résultats : mettre en avant
    // un album d'un service qu'on vient d'écarter n'aurait pas de sens.
    expect(src).toContain('meilleurResultat(q, {');
    expect(src).toContain('artistes: groupes.artistes.filter(dansLePerimetre)');
    expect(src).toContain('v2.rech.best');
    expect(src).toContain('api.getStreamingPlaylists(');
    expect(src).toContain('lirePlaylist');
  });

  it('le PÉRIMÈTRE de la recherche est visible et réglable', () => {
    // Bertrand, 05/09/2026 : « il manque les services de streaming dans le
    // périmètre de la recherche ». Les résultats arrivaient — mesuré sur le
    // .18 : 20 locaux, 20 Bandcamp, 20 Qobuz, 20 Tidal — mais groupés par type
    // ils se fondaient dans les mêmes listes, et rien ne disait où l'on
    // cherchait.
    expect(src).toContain('sourcesTrouvees');
    expect(src).toContain('v2.rech.where');
    expect(src).toContain('basculerSource');
    // La rangée n'apparaît qu'à partir de DEUX sources : à une seule case, un
    // périmètre ne choisit rien.
    expect(src).toContain('sourcesTrouvees.length > 1');
    // Le local passe en tête : c'est ce que l'utilisateur possède déjà.
    expect(src).toContain("a[0] === 'local' ? -1");
  });

  it('changer de requête remet le périmètre à zéro', () => {
    // Un filtre hérité d'une recherche précédente masquerait des résultats sans
    // qu'on sache pourquoi.
    expect(src).toContain('$effect(() => { void q; sourcesActives = new Set(); })');
  });

  it('les compteurs de type suivent le périmètre', () => {
    // Annoncer 152 albums alors qu'on s'est restreint à la bibliothèque serait
    // un chiffre qui ment.
    expect(src).toContain('groupes.albums.filter(dansLePerimetre).length');
    expect(src).toContain('groupes.pistes.filter(dansLePerimetre).length');
  });

  it('les filtres par type sont TOUS allumés au départ', () => {
    for (const f of ['voirArtistes', 'voirAlbums', 'voirTitres', 'voirPlaylists']) {
      expect(src).toContain(`let ${f} = $state(true)`);
    }
  });

  it('la fusion met le local devant et marque la provenance', () => {
    const g = fusionnerParType(
      res({ albums: [{ id: 1, title: 'A' } as any] }),
      { qobuz: res({ albums: [{ source_id: 'x', title: 'B' } as any] }) },
    );
    expect(g.albums.map((a) => a.title)).toEqual(['A', 'B']);
    expect(g.albums.map((a) => a.source)).toEqual(['local', 'qobuz']);
  });

  it("une source déjà portée par la ligne n'est pas écrasée par le nom du service", () => {
    const g = fusionnerParType(null, { qobuz: res({ tracks: [{ title: 'T', source: 'tidal' } as any] }) });
    expect(g.pistes[0].source).toBe('tidal');
  });

  it('le meilleur résultat préfère une correspondance exacte à un préfixe', () => {
    const g = fusionnerParType(res({
      albums: [{ id: 1, title: 'Blue Train' } as any, { id: 2, title: 'Blue' } as any],
    }), {});
    const m = meilleurResultat('blue', g);
    expect(m).toEqual({ genre: 'album', album: expect.objectContaining({ id: 2 }) });
  });

  it("un artiste avec portrait passe devant un album au même score de texte", () => {
    const g = fusionnerParType(res({
      artists: [{ id: 1, name: 'Miles', image_path: '/p.jpg' } as any],
      albums: [{ id: 2, title: 'Miles' } as any],
    }), {});
    expect(meilleurResultat('miles', g)?.genre).toBe('artiste');
  });

  it('rien de correspondant : on propose quand même la première ligne rendue', () => {
    const g = fusionnerParType(res({ albums: [{ id: 9, title: 'Zzz' } as any] }), {});
    expect(meilleurResultat('quelque chose', g)).toEqual({ genre: 'album', album: expect.objectContaining({ id: 9 }) });
  });

  it('une requête vide ne désigne rien', () => {
    expect(meilleurResultat('  ', fusionnerParType(res({ albums: [{ id: 1, title: 'A' } as any] }), {}))).toBeNull();
  });
});
