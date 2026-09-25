import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * renesenses/tune-server-rust#5074 — rapport UI, fil 1940 (0.9.164, Windows) :
 * « Bug affichage DR sur la bibliothèque ». Les valeurs 4 à 19 du filtre DR
 * sont en gris très clair sur fond blanc dans la liste déroulée.
 *
 * 🔴 La pastille `.chip.dr` porte deux `<select>` NATIFS. Leur règle était
 * `background:transparent; color:inherit`, et rien ne visait les `<option>`.
 * La liste déroulée est dessinée par le système : sous Windows (Chrome, Edge)
 * elle prend le fond du `<select>` — transparent, donc le blanc du système —
 * et sa couleur de texte — héritée de la pastille, `--v2-txt2`, un gris clair
 * dans les thèmes sombres. Gris clair sur blanc.
 *
 * Les autres `<select>` du projet (`.tricol select`, `.plafond select`,
 * `.tpage select`) posent un fond et une couleur de thème EXPLICITES, que la
 * liste reprend : ils ne sont pas touchés.
 *
 * jsdom ne dessine pas la liste native : ce fichier tient l'invariant CSS qui
 * produit le rendu, pas le rendu lui-même.
 */
const COMPOSANTS = resolve(__dirname, '../../components');
const styleDe = (source: string) => {
  const i = source.lastIndexOf('<style');
  return i < 0 ? '' : source.slice(i);
};

/** Règles `sélecteur { déclarations }` d'un bloc de style, commentaires ôtés. */
function regles(css: string): { sel: string; decl: string }[] {
  const net = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: { sel: string; decl: string }[] = [];
  for (const m of net.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ sel: m[1].trim().replace(/\s+/g, ' '), decl: m[2] });
  }
  return out;
}

const vue = readFileSync(join(COMPOSANTS, 'v2/LibraryV2.svelte'), 'utf-8');

describe('Bibliothèque, filtre DR : les valeurs de la liste déroulée sont lisibles (#5074)', () => {
  it('la pastille DR porte bien des <select> natifs, sinon la garde ne garde rien', () => {
    const debut = vue.indexOf('<span class="chip dr"');
    expect(debut).toBeGreaterThan(-1);
    const pastille = vue.slice(debut, vue.indexOf('</span>\n      {/if}', debut));
    expect(pastille.match(/<select\b/g)?.length).toBe(2);
    expect(pastille).toContain('<option');
  });

  it('les <option> de la pastille DR ont un fond ET une couleur de thème explicites', () => {
    const r = regles(styleDe(vue)).filter((x) =>
      x.sel.split(',').some((s) => /\.chip\.dr\b.*\boption\b/.test(s)),
    );
    expect(r.length, 'aucune règle ne vise `.chip.dr … option`').toBeGreaterThan(0);
    const decl = r.map((x) => x.decl).join(';');
    // Un jeton de thème, jamais `inherit` ni `transparent` : c'est précisément
    // ce qui rendait gris sur blanc.
    expect(decl).toMatch(/(^|[;\s])background(-color)?\s*:\s*var\(--v2-surface2?\)/);
    expect(decl).toMatch(/(^|[;\s])color\s*:\s*var\(--v2-txt\)/);
    expect(decl).not.toMatch(/color\s*:\s*inherit/);
  });

  it('aucun <select> transparent des écrans v2 ne laisse ses <option> sans style', () => {
    // Garde large : le même piège, ailleurs, rendrait le même gris sur blanc.
    const dir = join(COMPOSANTS, 'v2');
    const fautifs: string[] = [];
    for (const nom of readdirSync(dir).filter((n) => n.endsWith('.svelte'))) {
      const rs = regles(styleDe(readFileSync(join(dir, nom), 'utf-8')));
      for (const { sel, decl } of rs) {
        for (const s of sel.split(',').map((x) => x.trim())) {
          if (!/\bselect$/.test(s)) continue;
          if (!/background(-color)?\s*:\s*transparent/.test(decl)) continue;
          const prefixe = s.replace(/\bselect$/, '').trim();
          const couvert = rs.some((o) =>
            o.sel.split(',').some((os) => os.trim().startsWith(prefixe) && /\boption\b/.test(os)),
          );
          if (!couvert) fautifs.push(`${nom} : ${s}`);
        }
      }
    }
    expect(fautifs).toEqual([]);
  });
});
