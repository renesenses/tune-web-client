/**
 * « Dans réglages, entre Appareils et Extensions, je veux un onglet Affichage,
 *  et après CLAP un onglet Licence » (Bertrand, 06/09/2026).
 *
 * Le premier pensionnaire de l'onglet Affichage vient du forum : « l'affichage
 * des collections me paraît moins agréable dans la V1. Les 4 pochettes
 * accolées, ce n'est pas ma préférence. J'aimais beaucoup l'écran collection
 * de l'ancienne version, épuré, compact » (Gros Bidon, fil 1671, 05/09/2026).
 *
 * Un GOÛT, pas un défaut : d'où un interrupteur, et un défaut qui ne bouge
 * pas — personne ne doit voir son écran changer sans l'avoir demandé, c'est la
 * règle qui m'a déjà arrêté sur le widget d'accueil.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { V2_SETTINGS } from '../v2Settings';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const ids = () => V2_SETTINGS.map((t) => t.id);

describe('les deux onglets demandés', () => {
  it('Affichage est ENTRE Appareils et Extensions', () => {
    const l = ids();
    expect(l.indexOf('display')).toBe(l.indexOf('devices') + 1);
    expect(l.indexOf('extensions')).toBe(l.indexOf('display') + 1);
  });

  it('Licence est APRÈS CLAP', () => {
    const l = ids();
    expect(l.indexOf('license')).toBe(l.indexOf('clap') + 1);
  });

  it('🔴 la Licence a DÉMÉNAGÉ : elle n’est pas dupliquée', () => {
    // Un réglage à deux endroits finit par diverger — la règle est déjà écrite
    // pour les Extensions, qui ont quitté la barre latérale pour les Réglages.
    const systeme = V2_SETTINGS.find((t) => t.id === 'system')!;
    expect(systeme.sections.map((s) => s.id)).not.toContain('license');
    const onglet = V2_SETTINGS.find((t) => t.id === 'license')!;
    expect(onglet.sections.map((s) => s.id)).toEqual(['license']);
  });

  it('savoir ce qu’on a payé n’est pas un réglage d’expert', () => {
    expect(V2_SETTINGS.find((t) => t.id === 'license')!.min).toBe('beginner');
    expect(V2_SETTINGS.find((t) => t.id === 'display')!.min).toBe('beginner');
  });

  it('les deux onglets portent une CLÉ, pas un libellé', () => {
    for (const id of ['display', 'license']) {
      const t = V2_SETTINGS.find((x) => x.id === id)!;
      expect(t.labelKey, `${id} doit être traduisible`).toBeTruthy();
      expect(t.label, `${id} ne doit pas porter de libellé littéral`).toBeUndefined();
    }
  });

  it('chaque onglet a au moins une section, sinon il s’ouvre vide', () => {
    for (const t of V2_SETTINGS) expect(t.sections.length, t.id).toBeGreaterThan(0);
  });
});

describe('le réglage de Gros Bidon', () => {
  it('la préférence existe et vaut VRAI par défaut', () => {
    // Le défaut ne bouge pas : l'interrupteur est là pour ceux qui préfèrent
    // l'autre, pas pour changer l'écran de tout le monde.
    const prefs = sansCommentaires(lire('src/lib/stores/preferences.ts'));
    expect(prefs).toMatch(/v2CollectionsMosaique: boolean;/);
    expect(prefs).toMatch(/v2CollectionsMosaique: true,/);
  });

  it("l'écran Collections l'applique", () => {
    const col = sansCommentaires(lire('src/components/v2/CollectionsV2.svelte'));
    expect(col).toContain('{#if $preferences.v2CollectionsMosaique}');
    expect(col).toContain('<MosaiquePochettes pochettes={e.covers}');
    // Décoché : la PREMIÈRE case de la mosaïque, pas une pochette inventée.
    expect(col).toMatch(/coverPath=\{e\.covers\[0\] \?\? null\}/);
  });

  it("le store est IMPORTÉ là où il est lu", () => {
    // `check-svelte` a attrapé l'oubli une première fois : sans l'import, le
    // composant lève à l'exécution et l'écran entier disparaît (0.9.62,
    // `albumWall`).
    const col = lire('src/components/v2/CollectionsV2.svelte');
    expect(col).toContain("import { preferences } from '../../lib/stores/preferences';");
  });

  it("l'interrupteur vit dans l'onglet Affichage", () => {
    const set = sansCommentaires(lire('src/components/v2/SettingsV2.svelte'));
    expect(set).toContain("{:else if s.id === 'displayPrefs'}");
    expect(set).toContain("$t('settings.collectionsMosaic' as any)");
    expect(set).toMatch(/v2CollectionsMosaique: \(e\.currentTarget as HTMLInputElement\)\.checked/);
  });
});
