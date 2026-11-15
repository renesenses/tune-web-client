import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// web#2665 — fiche artiste : « Albums manquants » plus gros que les autres
// titres, « Albums principaux » collé aux pochettes des Lives. vitest n'a pas
// de moteur de mise en page : la garde porte sur les règles qui fixent l'un et
// l'autre.
const lire = (f: string) => readFileSync(new URL(`../../components/v2/${f}`, import.meta.url), 'utf-8');
const DISCO = lire('DiscographieCommune.svelte');
const MANQUANTS = lire('AlbumsManquants.svelte');

function fautes(disco: string, manquants: string): string[] {
  const f: string[] = [];
  // Chaque section de sortie porte `connexes` (l'écart au-dessus du titre).
  for (const m of disco.matchAll(/<section([^>]*)data-section="(live|albums-principaux|eps|singles|compilations|apparitions)"/g)) {
    if (!/class="[^"]*\bconnexes\b/.test(m[1])) f.push(`section ${m[2]} sans écart`);
  }
  const titre = disco.match(/\.titre-connexes\s*\{[^}]*font:\s*([^;]+);/);
  const h3 = manquants.match(/\.manquants h3\s*\{[^}]*font:\s*([^;]+);/);
  if (!titre) f.push('style de .titre-connexes introuvable');
  if (!h3 || (titre && h3[1].trim() !== titre[1].trim())) f.push('« Albums manquants » n’a pas le style des autres titres');
  return f;
}

describe('web#2665 — titres de section de la fiche artiste', () => {
  it('même style de titre et même écart au-dessus de chaque section', () => {
    expect(fautes(DISCO, MANQUANTS)).toEqual([]);
  });

  it('contre-épreuve : le balisage et le style d’avant échouent', () => {
    const disco = DISCO.replace('<section class="connexes" data-section="albums-principaux">', '<section data-section="albums-principaux">');
    const manquants = MANQUANTS.replace(/\.manquants h3 \{[^}]*\}/, '.manquants h3 { margin: 0; }');
    expect(fautes(disco, manquants)).toEqual([
      'section albums-principaux sans écart',
      '« Albums manquants » n’a pas le style des autres titres',
    ]);
  });
});
