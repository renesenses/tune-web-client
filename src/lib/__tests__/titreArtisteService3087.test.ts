// Fil 3087 : sur #streamingartist (MacBook, Chrome), « Amy Winehouse » était
// écrasé en 5 lignes (« Am / y / Win / eho / use ») : `.ident` (flex:1,
// min-width:0) se faisait manger par les 4 chiffres (flex:none) et
// `overflow-wrap:anywhere` coupait n'importe où. Garde sur le source.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../../components/v2/EnTeteArtiste.svelte'), 'utf8');
const regle = (sel: string) => {
  const i = src.indexOf(sel + '{');
  expect(i).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('}', i));
};

describe('titre de la fiche artiste (fil 3087)', () => {
  it('le nom ne se coupe plus au milieu d un mot', () => {
    const h1 = regle('.tete.maquette .ident h1');
    expect(h1).not.toContain('anywhere');
    expect(h1).not.toContain('break-all');
    expect(h1).toContain('overflow-wrap:break-word');
  });
  it('l identité garde une base minimale et l en-tête passe à la ligne', () => {
    expect(regle('.tete.maquette')).toContain('flex-wrap:wrap');
    expect(regle('.tete.maquette .ident')).toMatch(/flex:1 1 320px/);
  });
});
