/**
 * « Résultats de recherche : ne pas limiter sur les services de streaming
 *  => bouton voir plus » (Bertrand, 06/09/2026).
 *
 * Deux plafonds vivaient en dur dans le balisage : `artistes.slice(0, 12)` et
 * `titres.slice(0, 40)`. Ce qui dépassait était reçu du serveur, gardé en
 * mémoire — et jeté à l'affichage, sans que rien ne dise qu'il existait. Un
 * écran qui tronque en silence se lit comme un écran qui n'a pas trouvé.
 *
 * ⚠️ CE QUE CE BOUTON N'EST PAS : un chargement. Il révèle ce qui est déjà là.
 * Le serveur le dit dans `routes/search.rs` : « Les services de streaming ne
 * sont PAS paginés ici : `limit` continue de leur être passé tel quel, sans
 * `offset` » — et 50 est le plafond de page de l'API Qobuz, demander davantage
 * ne rend pas davantage. Promettre un chargement serait promettre ce que la
 * chaîne ne sait pas faire.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('les plafonds de la recherche', () => {
  const src = sansCommentaires(lire('src/components/v2/SearchV2.svelte'));

  it("aucun plafond n'est plus écrit en dur dans le balisage", () => {
    // 🔴 La garde qui compte : c'est cette forme précise qui jetait en silence.
    expect(src).not.toMatch(/artistes\.slice\(0, ?12\)/);
    expect(src).not.toMatch(/titres\.slice\(0, ?40\)/);
    expect(src).not.toMatch(/\{#each \w+\.slice\(0, ?\d+\) as /);
  });

  it('les trois familles ont leur révélateur', () => {
    for (const v of ['montreArtistes', 'montreAlbums', 'montreTitres'])
      expect(src, `${v} manque`).toContain(v);
    expect(src.match(/class="voirplus"/g)).toHaveLength(3);
  });

  it('le bouton annonce COMBIEN il reste', () => {
    // « Voir plus » sans nombre ne dit pas s'il en reste trois ou trois cents.
    expect(src).toMatch(/resteArtistes = \$derived\(artistes\.length - vusArtistes\.length\)/);
    expect(src).toMatch(/resteAlbums = \$derived\(albums\.length - vusAlbums\.length\)/);
    expect(src).toMatch(/resteTitres = \$derived\(titres\.length - vusTitres\.length\)/);
    expect(src).toContain("$t('v2.rech.seeMore' as any).replace('{n}', String(n))");
  });

  it("il n'apparaît QUE s'il reste quelque chose", () => {
    for (const r of ['resteArtistes', 'resteAlbums', 'resteTitres'])
      expect(src).toContain(`{#if ${r} > 0}`);
  });

  it('une nouvelle recherche REPLIE les trois listes', () => {
    // Sans cela, une requête large laissait la suivante ouverte sur des
    // centaines de vignettes.
    const i = src.indexOf('$effect(() => {\n    void q;');
    expect(i, 'aucun effet ne remet les compteurs à leur pas').toBeGreaterThan(-1);
    const bloc = src.slice(i, i + 300);
    expect(bloc).toContain('montreArtistes = PAS_ARTISTES');
    expect(bloc).toContain('montreAlbums = PAS_ALBUMS');
    expect(bloc).toContain('montreTitres = PAS_TITRES');
  });
});

describe("ce que le bouton NE promet PAS", () => {
  it("il ne relance aucun appel au service", () => {
    // Le serveur ne pagine pas les services ; un bouton qui appellerait
    // rendrait exactement les mêmes 50 lignes, et paraîtrait cassé.
    const src = sansCommentaires(lire('src/components/v2/SearchV2.svelte'));
    const clics = src.match(/onclick=\{\(\) => \(montre\w+ \+= PAS_\w+\)\}/g);
    expect(clics, 'les trois boutons doivent se contenter d incrémenter').toHaveLength(3);
  });

  it("la limite d'appel reste celle qui a été CHOISIE, et documentée", () => {
    const api = lire('src/lib/api.ts');
    // 50 est le plafond de page de l'API Qobuz (#2036, Vincent). Le relever
    // ne rend pas davantage de lignes ; c'est la pagination qui manque.
    expect(api).toMatch(/export const SEARCH_PAGE_LIMIT = 50;/);
  });
});
