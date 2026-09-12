// @vitest-environment jsdom
//
// Lot D — les deux cœurs de la radio.
//
// 🔴 #874 — Reivax66, 0.9.143 Windows, fil 1729, ticket 104.
// 🔴 #857 — FabienM, 0.9.145 Windows, fil 1749 point 6.
//
// CE QUE CE FICHIER TIENT, ET RIEN DE PLUS
// -----------------------------------------
// jsdom n'a AUCUNE mise en page et n'injecte pas les feuilles de style de
// composant : on ne mesure pas une opacité. Ce qui SE mesure, c'est la règle
// écrite — un sélecteur qui ne peut désigner aucun élément du composant est
// mort, et ça se démontre sans navigateur.
//
// CONTRE-ÉPREUVES : chaque bloc en porte une qui rejoue l'état d'AVANT et
// exige que le prédicat le refuse.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) =>
  readFileSync(resolve(__dirname, '../../components/v2/', p), 'utf-8');

/**
 * Les classes que CE composant rend lui-même.
 *
 * ⚠️ Svelte en pose de TROIS façons, et il faut les trois — mon premier
 * détecteur n'en lisait qu'une et criait au loup sur `on`, `busy`, `ouvert`
 * et `lh` : `class="x"`, `class:x={…}` et `class:x` tout court. Une garde qui
 * se trompe finit désarmée, ce qui est pire que pas de garde.
 */
function classesRendues(source: string): Set<string> {
  const balisage = source.slice(0, source.lastIndexOf('<style'));
  const vues = new Set<string>();
  // `class="a b"` et `class={expr}`
  for (const m of balisage.matchAll(/\bclass=["{]([^"}]*)["}]/g)) {
    for (const c of m[1].split(/\s+/)) if (c && !c.includes('$')) vues.add(c.replace(/^\./, ''));
  }
  // `class:nom={expr}` et `class:nom`
  for (const m of balisage.matchAll(/\bclass:([a-zA-Z][\w-]*)/g)) vues.add(m[1]);
  return vues;
}

/** Les sélecteurs de classe employés dans le `<style>`, hors `:global`. */
function classesCiblees(source: string): string[] {
  const css = source.slice(source.lastIndexOf('<style')).replace(/\/\*[\s\S]*?\*\//g, ' ');
  const sansGlobal = css.replace(/:global\([^)]*\)/g, ' ');
  return [...new Set([...sansGlobal.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]))];
}

describe('#874 — le survol qui devait révéler le cœur était un sélecteur MORT', () => {
  const src = lire('HistoriqueV2.svelte');

  it('🔴 aucun sélecteur de style ne vise une classe que l’écran ne rend pas', () => {
    const rendues = classesRendues(src);
    const orphelines = classesCiblees(src).filter((c) => !rendues.has(c));
    expect(
      orphelines,
      'ces règles ne peuvent désigner aucun élément : Svelte porte ses styles par composant',
    ).toEqual([]);
  });

  it('le cœur n’est plus caché derrière un survol', () => {
    const css = src.slice(src.lastIndexOf('<style')).replace(/\/\*[\s\S]*?\*\//g, ' ');
    const regle = /\.fav\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(regle, 'la règle `.fav` a disparu').not.toBe('');
    expect(
      /opacity:\s*0/.test(regle),
      'le cœur naît invisible : sur un poste de bureau il est inatteignable',
    ).toBe(false);
  });

  it('CONTRE-ÉPREUVE : l’ancienne règle est bien REFUSÉE', () => {
    // `.row:hover .fav` dans un composant qui ne rend aucun `class="row"` —
    // la ligne vient de `ListePistesV2`, qui l'appelle `.trow`.
    const avant = `<div class="fav" class:on={x}></div><style>.fav{opacity:0}.row:hover .fav{opacity:1}</style>`;
    const rendues = classesRendues(avant);
    expect(rendues.has('row'), 'le témoin rend `row` : il ne reproduit pas le défaut').toBe(false);
    expect(rendues.has('on'), 'le détecteur rate encore `class:nom`').toBe(true);
    expect(classesCiblees(avant).filter((c) => !rendues.has(c))).toEqual(['row']);
  });
});

describe('#857 — la station en favori a enfin son cœur de retrait', () => {
  const src = lire('FavoritesV2.svelte');

  it('🔴 la carte porte un bouton de retrait, à côté de celui de lecture', () => {
    const i = src.indexOf('class="stgrille"');
    expect(i, 'la grille des stations a disparu').toBeGreaterThan(-1);
    const bloc = src.slice(i, src.indexOf('{/each}', i));
    expect(bloc).toContain('retirerStation(r)');
    expect(bloc).toContain('lireStation(r)');
  });

  it('🔴 un bouton n’est pas imbriqué dans un autre — c’est ce qui l’empêchait', () => {
    const i = src.indexOf('class="stgrille"');
    const bloc = src.slice(i, src.indexOf('{/each}', i));
    const enveloppe = bloc.indexOf('class="stcarte"');
    expect(enveloppe, 'la carte a disparu').toBeGreaterThan(-1);
    expect(
      bloc.slice(enveloppe - 6, enveloppe).includes('<div'),
      'la carte est redevenue un bouton : le cœur ne peut pas y tenir',
    ).toBe(true);
  });

  it('le retrait passe par le champ que le serveur connaît, sans route nouvelle', () => {
    const i = src.indexOf('async function retirerStation');
    expect(i, '`retirerStation` a disparu').toBeGreaterThan(-1);
    const corps = src.slice(i, src.indexOf('\n  }', i));
    // `RadiosV2:102` bascule déjà ce champ par le même appel.
    expect(corps).toContain("api.updateRadio(r.id, { favorite: false })");
    // La carte disparaît : un favori retiré qui reste affiché se lit comme un échec.
    expect(corps).toContain('stations = stations.filter');
  });

  it('CONTRE-ÉPREUVE : la carte d’avant ne pouvait PAS porter de cœur', () => {
    const avant = `<button class="stcarte" onclick={() => lireStation(r)}><span class="stnom"></span></button>`;
    expect(
      /<button class="stcarte"/.test(avant),
      'le témoin ne reproduit pas la carte-bouton',
    ).toBe(true);
    // Un bouton dans un bouton n'est pas du HTML valide : le cœur n'avait pas
    // de place, et c'est pourquoi il manquait.
    expect(avant.split('<button').length - 1).toBe(1);
  });
});
