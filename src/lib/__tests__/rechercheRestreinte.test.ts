import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  phrasesEntreGuillemets, respecteLesPhrases, sectionVisible, normaliser,
} from '../rechercheRestreinte';

describe('recherche restreinte — point 8 (Yves Corbat, 17/09/2026)', () => {
  it('extrait les phrases entre guillemets, guillemet ouvert compris', () => {
    expect(phrasesEntreGuillemets('kind of blue')).toEqual([]);
    expect(phrasesEntreGuillemets('"Kind of Blue" miles')).toEqual(['kind of blue']);
    expect(phrasesEntreGuillemets('miles "so what" "Blue in Green"')).toEqual(['so what', 'blue in green']);
    expect(phrasesEntreGuillemets('"kind of')).toEqual(['kind of']);
    expect(phrasesEntreGuillemets('""')).toEqual([]);
  });

  it('une phrase exige les mots entiers, dans l’ordre, dans un même champ', () => {
    const p = phrasesEntreGuillemets('"kind of blue"');
    expect(respecteLesPhrases({ title: 'Kind of Blue (Legacy Edition)' }, p)).toBe(true);
    expect(respecteLesPhrases({ title: 'Blue Kind of Day' }, p)).toBe(false);
    expect(respecteLesPhrases({ title: 'Kind of Bluegrass' }, p)).toBe(false);
    // À cheval sur deux champs : pas une phrase.
    expect(respecteLesPhrases({ title: 'Kind of', artist_name: 'Blue' }, p)).toBe(false);
    // Accents et casse ignorés, comme au serveur.
    expect(respecteLesPhrases({ name: 'Köln Concert' }, phrasesEntreGuillemets('"koln concert"'))).toBe(true);
    expect(respecteLesPhrases({ title: 'X' }, [])).toBe(true);
  });

  it('le type est un choix unique', () => {
    expect(sectionVisible('tout', 'albums')).toBe(true);
    expect(sectionVisible('albums', 'albums')).toBe(true);
    expect(sectionVisible('albums', 'artistes')).toBe(false);
    expect(sectionVisible('labels', 'titres')).toBe(false);
    expect(normaliser('AC/DC')).toBe('ac dc');
  });

  it('l’écran branche le type, les labels et les guillemets', () => {
    const src = readFileSync('src/components/v2/SearchV2.svelte', 'utf8');
    expect(src).toContain("let typeRecherche = $state<TypeRecherche>('tout')");
    expect(src).toContain('respecteLesPhrases(x, phrases)');
    expect(src).toContain("tune:v2-facette");
    expect(src).toMatch(/local\?\.labels/);
  });

  it('le réglage « Recherche exacte » est déclaré, rangé, et branché sur la recherche', () => {
    const prefs = readFileSync('src/lib/stores/preferences.ts', 'utf8');
    expect(prefs).toMatch(/searchExact: false,/);
    expect(readFileSync('src/lib/v2Settings.ts', 'utf8')).toContain("id: 'searchExact'");
    expect(readFileSync('src/components/v2/SettingsV2.svelte', 'utf8')).toContain("s.id === 'searchExact'");
    const rech = readFileSync('src/components/v2/SearchV2.svelte', 'utf8');
    expect(rech).toContain('api.searchLibrary(requeteExacte(query), 40)');
    expect(rech).toContain('phrasesEntreGuillemets(requeteExacte(q))');
  });
});
