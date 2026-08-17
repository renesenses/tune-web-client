// @vitest-environment jsdom
//
// `preferences.ts` lit `localStorage` au chargement du module : sans DOM,
// l'import seul lève. L'environnement par défaut de ce dépôt est `node`.
import { describe, it, expect } from 'vitest';
import { OXYGEN_FACETS_ALL } from '../stores/preferences';
import fr from '../locales/fr';
import en from '../locales/en';

/**
 * Le rail affiche le nom d'une facette par `$t('oxygen.facet.' + f)` — une clé
 * CONSTRUITE à l'exécution. `check-i18n` ne peut pas la voir : il cherche des
 * littéraux dans les composants. Une facette ajoutée à `OXYGEN_FACETS_ALL` sans
 * sa traduction afficherait donc « oxygen.facet.machin » en toutes lettres à
 * l'écran, et aucun garde-fou existant ne le dirait.
 *
 * Ce test est le chaînon manquant. Il a une histoire : `collection`, `folder`,
 * `rating` et `untagged` ont disparu du rail SANS UN MOT (bf46fad7) parce
 * qu'une seconde liste locale les ignorait. Cette liste a été supprimée, mais
 * la dépendance à une clé i18n dynamique, elle, reste.
 */
describe('facettes Oxygen', () => {
  it('chaque facette livrée a son libellé en français', () => {
    const missing = OXYGEN_FACETS_ALL.filter((f) => !(`oxygen.facet.${f}` in fr));
    expect(missing, `clés absentes de fr.ts : ${missing.join(', ')}`).toEqual([]);
  });

  it('chaque facette livrée a son libellé en anglais', () => {
    // L'anglais n'a pas de repli : une clé absente s'affiche telle quelle.
    const missing = OXYGEN_FACETS_ALL.filter((f) => !(`oxygen.facet.${f}` in en));
    expect(missing, `clés absentes de en.ts : ${missing.join(', ')}`).toEqual([]);
  });

  it('aucun doublon dans la liste des facettes', () => {
    // Une entrée en double produit deux blocs identiques dans le rail, et un
    // `{#each}` sans clé stable — silencieux, mais visible à l'écran.
    expect(new Set(OXYGEN_FACETS_ALL).size).toBe(OXYGEN_FACETS_ALL.length);
  });
});
