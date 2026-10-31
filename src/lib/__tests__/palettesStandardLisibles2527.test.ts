import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JETONS_MON_THEME, jugerTheme, pairesIllisibles, type CouleursTheme } from '../monTheme';

// #2527 — « Partir du thème actuel » copie les couleurs de la palette active
// dans « Mon thème ». Si cette palette échoue aux règles de lisibilité (WCAG
// AA, les mêmes que le serveur), le thème copié est refusé à l'enregistrement.
// Garde : les NEUF palettes standard de `tune-v2.css` passent `jugerTheme`.

const css = readFileSync(resolve(process.cwd(), 'src/styles/tune-v2.css'), 'utf-8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const IDS = [
  'black-green', 'black-blue', 'midnight-orange', 'brown',
  'clear-white', 'clear-grey', 'dark-grey', 'mozaiklabs', 'mozaiklabs-logo',
] as const;

function declarations(selecteur: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')).includes(selecteur)) {
      for (const d of m[2].matchAll(/(--v2-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*(?:;|$)/g)) out[d[1]] = d[2];
    }
  }
  return out;
}

/** La palette telle que le navigateur la résout : base `.tune-v2`, puis le bloc du thème. */
function palette(id: string): CouleursTheme {
  const base = declarations('.tune-v2');
  const surcharge = id === 'black-green' ? {} : declarations(`:root[data-v2-theme="${id}"] .tune-v2`);
  const tout = { ...base, ...surcharge };
  const colors: CouleursTheme = {};
  for (const j of JETONS_MON_THEME) colors[j] = tout[j];
  return colors;
}

describe('#2527 — les neuf palettes standard sont enregistrables comme « Mon thème »', () => {
  it('lit bien neuf palettes complètes', () => {
    for (const id of IDS) {
      const c = palette(id);
      expect(Object.values(c).every((v) => /^#[0-9a-fA-F]{6}$/.test(v)), id).toBe(true);
    }
  });

  for (const id of IDS) {
    it(`🔴 ${id} : aucune paire sous son seuil, jugerTheme l'accepte`, () => {
      const colors = palette(id);
      const mal = pairesIllisibles(colors).map((p) => `${p.texte} sur ${p.fond} = ${p.ratio} (min ${p.minimum})`);
      expect(mal, `${id} illisible`).toEqual([]);
      expect(jugerTheme({ format: 'tune-theme', version: 1, name: id, colors }).ok).toBe(true);
    });
  }
});
