/**
 * Les onglets des Réglages v2 doivent être TRADUISIBLES, et leurs clés doivent
 * exister.
 *
 * Les sept libellés étaient des chaînes françaises en dur (`label: 'Général'`,
 * `'Bibliothèque'`, `'Accès et jetons'`…) alors que les *sections* du même
 * fichier portaient déjà `titleKey`. Conséquence visible sur la capture du
 * 01/09/2026 : Langue réglée sur **English**, et les sept onglets toujours en
 * français — la moitié de la navigation ignorait la langue.
 *
 * Le contrôleur `check-i18n.mjs` ne pouvait pas l'attraper : il balaie les
 * `.svelte`, et ces libellés vivent dans un `.ts`. D'où ce test.
 *
 * Il vérifie trois choses, et la troisième est celle qui mord vraiment :
 *  1. chaque onglet porte `labelKey` OU `label` — jamais rien ;
 *  2. `label` littéral n'est toléré QUE pour un nom produit (« CLAP »), qui ne
 *     se traduit pas ;
 *  3. toute `labelKey` déclarée existe dans `fr.ts` ET dans `en.ts`. Sans ce
 *     point, une clé mal orthographiée passerait inaperçue : `$t()` retombe sur
 *     la clé elle-même, donc l'onglet afficherait « settings.tabAudio » sans
 *     qu'aucune porte ne rougisse.
 */
import { describe, it, expect } from 'vitest';
import { V2_SETTINGS, tabLabel } from '../v2Settings';
import fr from '../locales/fr';
import en from '../locales/en';

/** Noms produit admis en dur : ils ne se traduisent dans aucune langue. */
const NOMS_PRODUIT = new Set(['CLAP']);

describe('Réglages v2 — libellés d’onglets', () => {
  it('chaque onglet porte une clé i18n, ou un nom produit assumé', () => {
    for (const tab of V2_SETTINGS) {
      const aQuelqueChose = Boolean(tab.labelKey || tab.label);
      expect(aQuelqueChose, `l'onglet « ${tab.id} » n'a ni labelKey ni label`).toBe(true);

      if (!tab.labelKey) {
        expect(
          NOMS_PRODUIT.has(tab.label ?? ''),
          `l'onglet « ${tab.id} » porte le libellé littéral « ${tab.label} » : ` +
            `s'il se traduit, il lui faut une labelKey ; sinon, ajoutez-le à NOMS_PRODUIT.`,
        ).toBe(true);
      }
    }
  });

  it('toute clé de libellé existe en français ET en anglais', () => {
    const manquantes: string[] = [];
    for (const tab of V2_SETTINGS) {
      if (!tab.labelKey) continue;
      if (!(tab.labelKey in fr)) manquantes.push(`fr.ts → ${tab.labelKey} (onglet ${tab.id})`);
      if (!(tab.labelKey in en)) manquantes.push(`en.ts → ${tab.labelKey} (onglet ${tab.id})`);
    }
    expect(manquantes, `clés absentes :\n  ${manquantes.join('\n  ')}`).toEqual([]);
  });

  it('tabLabel résout la clé, et retombe sur le nom produit sans clé', () => {
    const general = V2_SETTINGS.find((t) => t.id === 'general')!;
    expect(tabLabel(general, (k) => (fr as Record<string, string>)[k] ?? k)).toBe('Général');
    expect(tabLabel(general, (k) => (en as Record<string, string>)[k] ?? k)).toBe('General');

    const clap = V2_SETTINGS.find((t) => t.id === 'clap');
    if (clap) expect(tabLabel(clap, (k) => k)).toBe('CLAP');
  });

  it('la résolution ne rend jamais la clé technique elle-même', () => {
    // Le piège du repli silencieux : `$t()` rend la clé quand elle manque, donc
    // un onglet peut afficher « settings.tabAudio » à l'écran. Un libellé qui
    // ressemble à une clé est toujours un défaut.
    for (const tab of V2_SETTINGS) {
      const rendu = tabLabel(tab, (k) => (fr as Record<string, string>)[k] ?? k);
      expect(
        rendu.startsWith('settings.'),
        `l'onglet « ${tab.id} » affiche sa clé technique « ${rendu} » : la clé n'existe pas dans fr.ts`,
      ).toBe(false);
    }
  });
});
