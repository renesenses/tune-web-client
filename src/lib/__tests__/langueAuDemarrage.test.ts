/**
 * « Sur .18, les traductions ne marchent plus du tout » (Bertrand,
 * 06/09/2026).
 *
 * Elles marchaient. Elles ne SURVIVAIENT pas au rechargement.
 *
 * ONZIÈME « écrit mais pas branché » de ce client, et le plus visible depuis
 * que le client est traduit. `main.ts` monte `ShellV2` OU `App`, jamais les
 * deux ; la seule ligne qui appliquait la langue enregistrée au démarrage
 * vivait dans `App.svelte`, la coquille de l'ANCIEN client :
 *
 *     preferences.subscribe((prefs) => { applyTheme(prefs.theme);
 *                                        locale.set(prefs.language ?? 'fr'); });
 *
 * En v2, le magasin `locale` gardait donc sa valeur par défaut — `'fr'` — quoi
 * qu'on ait choisi. Le sélecteur des Réglages appelait bien `locale.set`, d'où
 * l'impression que ça marchait : jusqu'au premier F5.
 *
 * Le défaut existait AVANT la passe de traduction. Elle ne l'a pas créé, elle
 * l'a rendu visible : tant que tout était en français, un client bloqué en
 * français ne se remarquait pas.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('la langue enregistrée au démarrage', () => {
  const shell = sansCommentaires(lire('src/components/v2/ShellV2.svelte'));

  it('la coquille v2 applique la préférence', () => {
    expect(shell).toContain("import { t, locale } from '../../lib/i18n';");
    expect(shell).toMatch(/\$effect\(\(\) => \{ locale\.set\(\$preferences\.language \?\? 'fr'\); \}\);/);
  });

  it('🔴 les DEUX coquilles le font, chacune pour elle-même', () => {
    // La garde qui compte. `main.ts` monte l'une OU l'autre : ce qu'une seule
    // fait n'est fait qu'une fois sur deux. C'est exactement ce qui s'est
    // passé — et le commentaire de `bootstrapV2` décrivait déjà ce piège pour
    // les magasins partagés, trois lignes plus bas.
    const main = sansCommentaires(lire('src/main.ts'));
    expect(main).toMatch(/futureInterface\(\) \? ShellV2 : App/);
    const v0 = sansCommentaires(lire('src/App.svelte'));
    expect(v0, "l'ancienne coquille l'a toujours fait").toMatch(
      /locale\.set\(prefs\.language \?\? 'fr'\)/,
    );
    expect(shell, 'la nouvelle doit le faire aussi').toMatch(/locale\.set\(\$preferences\.language/);
  });

  it("aucune boucle : `locale` n'écrit jamais dans `preferences`", () => {
    // L'effet lit `$preferences.language` et écrit `locale`. Si `locale`
    // pilotait `preferences` en retour, les deux se relanceraient sans fin —
    // le piège du champ de recherche (forum 1686), une couche plus haut.
    const i18n = sansCommentaires(lire('src/lib/i18n.ts'));
    expect(i18n).not.toMatch(/preferences/);
  });

  it('le sélecteur des Réglages reste explicite', () => {
    // Il met les deux à jour. L'effet le rend redondant, pas inutile : sans
    // lui, le changement n'aurait lieu qu'au prochain montage de la coquille.
    const set = sansCommentaires(lire('src/components/v2/SettingsV2.svelte'));
    expect(set).toMatch(/preferences\.update\(\(pr\) => \(\{ \.\.\.pr, language: l \}\)\); locale\.set\(l\);/);
  });
});

describe('barre latérale repliée — le bouton de dépliage', () => {
  const src = sansCommentaires(lire('src/components/v2/Sidebar.svelte'));

  it("il n'est plus posé EN ABSOLU par-dessus le logo", () => {
    // « The icon to extend the sidebar is hidden by Tune logo » (Bertrand,
    // 06/09/2026). Mesuré : la barre repliée fait 72 px, moins 20 px de
    // marges il reste 52 px ; le logo en prend 40 centrés (x ≈ 6→46) et le
    // bouton 26 posé à `right:8px` (x ≈ 18→44). Recouvrement total.
    expect(src, "l'ancienne pose en absolu doit avoir disparu").not.toMatch(
      /\.v2-sidebar\.collapsed \.collapse\{position:absolute/,
    );
    expect(src).toMatch(/\.v2-sidebar\.collapsed \.collapse\{position:static/);
  });

  it('la marque passe en COLONNE quand la barre est repliée', () => {
    // Empilés, les deux tiennent dans les 52 px sans se croiser.
    expect(src).toMatch(/\.v2-sidebar\.collapsed \.brand\{flex-direction:column/);
  });

  it('le bouton reste nommé dans les deux états', () => {
    // Un bouton sans nom accessible est invisible pour qui ne voit pas
    // l'icône — et c'est le seul chemin de retour quand la barre est repliée.
    expect(src).toContain("aria-label={collapsed ? $t('v2.nav.expandAria' as any) : $t('v2.nav.collapseAria' as any)}");
  });
});
