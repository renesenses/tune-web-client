// Bertrand, 26/10/2026 (capture « Bibliothèque › Labels » sur le .18) : la
// grille des labels ne montrait que deux colonnes étroites à gauche, et un
// grand vide à droite, sur un écran large.
//
// Cause : `.fliste` (la liste des valeurs de facette, et la grille des labels
// qui y vit) est un enfant de `.body`, un flex en LIGNE. Sans `flex:1`, un
// enfant de flex prend la largeur de son contenu ; une grille `auto-fill`
// sans largeur imposée se réduit alors à quelques colonnes. Les grilles de
// référence de la même page — `.grid` (Albums, Artistes), `.facets`,
// `.tracklist` — portent toutes `flex:1`.
//
// jsdom ne calcule aucune mise en page : le témoin lit donc les règles de
// style de la Bibliothèque elle-même, et compare la liste aux grilles de
// référence.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync('src/components/v2/LibraryV2.svelte', 'utf8');
const STYLE = SOURCE.slice(SOURCE.lastIndexOf('<style'));

/** Les déclarations de la règle dont le sélecteur est EXACTEMENT `selecteur`. */
function regle(selecteur: string): Map<string, string> {
  const echappe = selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = STYLE.match(new RegExp(`(?:^|[}\\s])${echappe}\\s*\\{([^}]*)\\}`));
  expect(m, `règle « ${selecteur} » introuvable dans LibraryV2.svelte`).toBeTruthy();
  const decls = new Map<string, string>();
  for (const d of m![1].split(';')) {
    const i = d.indexOf(':');
    if (i > 0) decls.set(d.slice(0, i).trim(), d.slice(i + 1).replace(/\s+/g, ' ').trim());
  }
  return decls;
}

describe('Bibliothèque › Labels — la grille occupe la largeur (26/10)', () => {
  it('le corps est un flex en ligne : ses enfants doivent prendre flex:1', () => {
    const body = regle('.body');
    expect(body.get('display')).toBe('flex');
    expect(body.get('flex-direction') ?? 'row').toBe('row');
    for (const reference of ['.grid', '.facets', '.tracklist']) {
      expect(regle(reference).get('flex'), `${reference} (référence)`).toBe('1');
    }
  });

  it('`.fliste` prend toute la largeur, comme la grille des albums', () => {
    const liste = regle('.fliste');
    expect(
      liste.get('flex'),
      '`.fliste` sans flex:1 se réduit à la largeur de son contenu : deux colonnes à gauche, le reste vide',
    ).toBe('1');
    expect(liste.get('min-width'), 'une ligne longue ne doit pas élargir la liste au-delà du corps').toBe('0');
  });

  it('la grille des labels suit le pas de la grille des albums', () => {
    const albums = regle('.grid');
    const labels = regle('.fliste:has(.lgcase)');
    expect(labels.get('grid-template-columns')).toBe(albums.get('grid-template-columns'));
    expect(labels.get('gap')).toBe(albums.get('gap'));
  });
});
