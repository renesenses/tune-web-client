// web#1869 — « L'onglet "Coffrets" a disparu » (Belkadi Yacine, fil 2092,
// 1.0.0-rc1 Linux, ticket support 212).
//
// L'écran exact n'est pas connu (voir l'issue). Ce témoin couvre la seule
// cause que le code de la Bibliothèque porte lui-même : sa barre d'onglets
// (`nav.tabs`, huit onglets, « Coffrets » en DERNIER) était en
// `display:flex` SANS `flex-wrap`, dans un écran en `overflow:hidden`. Sur
// une fenêtre étroite, le dernier onglet sortait du cadre et disparaissait.
//
// Sous jsdom, aucune mise en page : la cascade est résolue sur la feuille
// LIVRÉE (`lib/cascadeCss`). ⛔ Ni le rendu réel ni le cas du testeur ne sont
// établis ici.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extraireFeuilleDeStyle, releverDeclarations, valeurEffective } from '../cascadeCss';

const source = readFileSync(resolve(__dirname, '../../components/v2/LibraryV2.svelte'), 'utf-8');
const regles = releverDeclarations(extraireFeuilleDeStyle(source), ['flex-wrap', 'white-space', 'overflow', 'display']);
const etroit = { ecran: { largeur: 900, hauteur: 700 }, survol: false };

describe('web#1869 — la barre d’onglets de la Bibliothèque ne rogne pas « Coffrets »', () => {
  it('« Coffrets » est bien le dernier onglet de la barre', () => {
    const ids = [...source.matchAll(/\{ id: '([a-z]+)', label:/g)].map((m) => m[1]);
    expect(ids.at(-1)).toBe('coffrets');
  });

  it('l’écran rogne ce qui dépasse : la barre doit donc passer à la ligne', () => {
    expect(valeurEffective(regles, ['.v2-lib'], 'overflow', etroit)).toBe('hidden');
    expect(valeurEffective(regles, ['.tabs'], 'display', etroit)).toBe('flex');
    expect(valeurEffective(regles, ['.tabs'], 'flex-wrap', etroit)).toBe('wrap');
  });

  it('un onglet ne se coupe pas en deux en passant à la ligne', () => {
    expect(valeurEffective(regles, ['.tab'], 'white-space', etroit)).toBe('nowrap');
  });
});
