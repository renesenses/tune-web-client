import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe("Tri « Ajout récent » (forum, 05/09/2026)", () => {
  /**
   * L'option existait depuis toujours dans la Bibliothèque, mais elle n'est
   * offerte que si `added_at` est présent. Mesuré sur le .18 : le chemin TRIÉ
   * du serveur rend `added_at: null` sur les 2000 albums, le chemin non trié
   * les rend tous. La coquille demandait `sort=title` au démarrage : la donnée
   * n'arrivait donc jamais, et l'option restait invisible.
   */
  it('la coquille ne demande AUCUN tri au serveur', () => {
    const boot = sansCommentaires(lire('src/lib/v2Bootstrap.ts'));
    expect(boot).toContain('api.getAllAlbums(100, null, null, 1, 100)');
    expect(boot).toContain('api.getAllAlbums(2000, null, null)');
    // Le tri par titre était CE QUI PERDAIT la date d'ajout.
    expect(boot).not.toContain("'title', 'asc'");
  });

  it("`null` OMET le paramètre au lieu de l'écrire", () => {
    // `&sort=null` remettrait le serveur sur son chemin trié : la nuance est
    // toute la correction.
    const api = sansCommentaires(lire('src/lib/api.ts'));
    expect(api).toContain('const triq = sort == null');
    expect(api).toContain('?limit=${pageSize}&offset=${offset}${triq}');
    expect(api).toContain('?limit=${limit}&offset=${offset}${triq}');
    // Plus aucune construction d'URL ne pose le tri en dur.
    expect(api).not.toContain('&sort=${sort}&order=${order}');
  });

  it("la signature accepte `null`, sinon le défaut reprend la main", () => {
    // `undefined` retomberait sur `'title'` : c'est le piège de ce correctif.
    const api = lire('src/lib/api.ts');
    expect(api).toContain("getAllAlbums(pageSize = 2000, sort: string | null = 'title', order: string | null = 'asc'");
    expect(api).toContain("getAllAlbumsSeeded(pageSize = 2000, sort: string | null = 'title', order: string | null = 'asc'");
  });

  it("l'option reste proposée dès que la donnée existe", () => {
    const lib = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));
    expect(lib).toContain("{ k: 'added', l: 'Ajout récent' }");
    expect(lib).toContain("const hasAddedAt = $derived(src.some((a) => (a.added_at ?? 0) > 0))");
    expect(lib).toContain("(b.added_at ?? 0) - (a.added_at ?? 0)");
  });
});
