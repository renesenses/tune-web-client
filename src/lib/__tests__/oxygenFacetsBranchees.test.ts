// @vitest-environment jsdom
//
// `preferences.ts` lit `localStorage` au chargement du module : sans DOM,
// l'import seul lève.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OXYGEN_FACETS_ALL } from '../stores/preferences';

/**
 * Une facette peut être PROPOSÉE dans Réglages sans être BRANCHÉE : c'est
 * exactement ce qui est arrivé au Dynamic Range (#2144, #3196).
 *
 * Le serveur servait la facette sous `fields=…,dr` depuis la v0.9.130 — les
 * notes de version l'annonçaient — mais le client ne la demandait nulle part.
 * `oxygenFacets.test.ts` ne pouvait rien voir : il vérifie les libellés des
 * facettes PRÉSENTES dans `OXYGEN_FACETS_ALL`, et `dr` en était absente. Le
 * défaut était en amont de la garde.
 *
 * Ce test ferme l'autre moitié : toute facette livrée doit aussi être
 * demandée au serveur et traduite en paramètre de filtre, sans quoi elle
 * s'affiche dans Réglages, se coche, et ne fait rien.
 *
 * `folder` est la seule exception, et elle est structurelle : le rail la rend
 * en fil d'Ariane par `getFolderFacet`, pas par l'index de facettes.
 */
const SANS_INDEX_SERVEUR = new Set(['folder']);

function corps(source: string, motif: RegExp, quoi: string): string {
  const m = source.match(motif);
  // Une garde textuelle qui ne trouve plus son ancre passerait À VIDE : on
  // échoue explicitement plutôt que de valider un tableau vide.
  expect(m, `ancre introuvable dans OxygenView.svelte : ${quoi}`).not.toBeNull();
  return m![1];
}
/** Les valeurs d'un tableau de chaînes littérales. */
const valeurs = (bloc: string) =>
  [...bloc.matchAll(/['"]([a-z_]+)['"]/g)].map((x) => x[1]);
/** Les CLÉS d'un objet littéral — et non ses valeurs : `source` s'y traduit en
 *  `source_media`, donc lire les valeurs manquerait la seule entrée dont le
 *  nom de paramètre diffère du nom de facette. */
const cles = (bloc: string) =>
  [...bloc.matchAll(/([a-z_]+)\s*:/g)].map((x) => x[1]);

describe('facettes Oxygen réellement branchées', () => {
  const src = readFileSync(
    resolve(__dirname, '../../components/OxygenView.svelte'),
    'utf-8',
  );
  const demandees = valeurs(corps(src, /const SERVER_FACET_FIELDS = \[([^\]]+)\]/, 'SERVER_FACET_FIELDS'));
  const parametrees = cles(corps(src, /const FACET_PARAM: Record<string, string> = \{([^}]+)\}/, 'FACET_PARAM'));

  it("l'ancre a bien trouvé les deux listes", () => {
    expect(demandees.length).toBeGreaterThan(10);
    expect(parametrees.length).toBeGreaterThan(10);
  });

  it('chaque facette livrée est demandée au serveur', () => {
    const attendues = OXYGEN_FACETS_ALL.filter((f) => !SANS_INDEX_SERVEUR.has(f));
    const manquantes = attendues.filter((f) => !demandees.includes(f));
    expect(
      manquantes,
      `facettes proposées dans Réglages mais jamais demandées au serveur : ${manquantes.join(', ')}`,
    ).toEqual([]);
  });

  it('chaque facette livrée se traduit en paramètre de filtre', () => {
    const manquantes = OXYGEN_FACETS_ALL.filter((f) => !parametrees.includes(f));
    expect(
      manquantes,
      `facettes sans entrée dans FACET_PARAM (cocher ne filtrerait rien) : ${manquantes.join(', ')}`,
    ).toEqual([]);
  });
});
