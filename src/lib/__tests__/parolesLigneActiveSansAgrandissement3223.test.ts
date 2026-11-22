import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * #3223 (fil forum 2343) : en Grand écran, la ligne de paroles active
 * grossissait par `transform: scale(1.06)`. Un transform ne remet pas le texte
 * en page : une ligne longue (qui passe à la ligne) dépassait de `.tv-lyrics`
 * (overflow-y: auto, donc overflow-x rogné) et sa fin était coupée à droite.
 *
 * jsdom ne calcule aucune mise en page (scrollWidth vaut toujours 0) : la
 * garde porte donc sur les règles CSS des vues de paroles.
 */
const src = (rel: string) => readFileSync(resolve(__dirname, '../../components', rel), 'utf-8');
const style = (code: string) => code.slice(code.indexOf('<style'));

/** Corps de toutes les règles dont le sélecteur se termine par `selecteur`. */
function regles(css: string, selecteur: string): string[] {
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const sels = m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((x) => x.trim());
    if (sels.some((x) => x.endsWith(selecteur))) out.push(m[2]);
  }
  return out;
}

const vues: Array<[string, string, string]> = [
  ['Grand écran (TvView)', 'v2-heritage/TvView.svelte', '.tv-line.active'],
  ['Lecture en cours / plein écran (NowPlayingLyrics)', 'partages/NowPlayingLyrics.svelte', '.karaoke-line.active'],
];

describe('#3223 — ligne de paroles active : aucun agrandissement par transform', () => {
  for (const [nom, fichier, sel] of vues) {
    it(`${nom} : ${sel} existe et n'utilise ni transform ni scale`, () => {
      const corps = regles(style(src(fichier)), sel);
      expect(corps.length).toBeGreaterThan(0);
      for (const c of corps) {
        expect(c).not.toMatch(/\btransform\s*:/);
        expect(c).not.toMatch(/\bscale\s*:/);
        expect(c).not.toMatch(/\bzoom\s*:/);
      }
    });
  }

  it('Grand écran : la ligne active reste distinguée par la couleur d’accent et l’opacité pleine', () => {
    const [corps] = regles(style(src('v2-heritage/TvView.svelte')), '.tv-line.active');
    expect(corps).toMatch(/color:\s*var\(--tune-accent/);
    expect(corps).toMatch(/opacity:\s*1\b/);
  });

  it('Grand écran : la ligne active garde la taille de police des autres lignes (pas de saut de mise en page)', () => {
    const css = style(src('v2-heritage/TvView.svelte'));
    for (const c of regles(css, '.tv-line.active')) {
      expect(c).not.toMatch(/font-size\s*:/);
      expect(c).not.toMatch(/letter-spacing\s*:/);
    }
    // .tv-line ne prépare plus de transform (origine, transition).
    const [ligne] = regles(css, '.tv-line');
    expect(ligne).not.toMatch(/transform/);
  });
});
