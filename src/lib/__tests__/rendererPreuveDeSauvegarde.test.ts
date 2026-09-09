/**
 * « Et un bouton "sauvegarder mes réglages" dans configuration du renderer ?? »
 * — Bertrand, 09/09/2026, onglet Appareils des Réglages.
 *
 * ## Ce que la lecture du code a montré
 *
 * Les sept réglages du renderer SONT enregistrés, un par un, dès le clic :
 * `setNativeFlac`, `setAlac`, `setAac`, `setCap16`, `setForceWav`,
 * `setPlayDelay` appellent tous `save(() => api.updateZone…)`.
 *
 * Ce qui manquait n'était donc pas la sauvegarde, c'était sa PREUVE : seul
 * l'échec parlait (`renderer.saveError`), un succès ne disait rien, et rien ne
 * distinguait « c'est écrit » de « le clic n'a rien fait ».
 *
 * 🔴 L'incohérence était dans le MÊME onglet : `ZoneDeviceEditor`, le bloc
 * voisin, montre un « Enregistré » après sa sauvegarde. Deux blocs côte à
 * côte, deux comportements.
 *
 * On n'ajoute donc PAS de bouton : il ferait croire que rien n'est écrit tant
 * qu'on ne l'a pas pressé, ce qui serait faux — et pire que le silence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const rc = () => sansCommentaires(lire('src/components/RendererConfig.svelte'));

describe('la sauvegarde du renderer se VOIT', () => {
  it('🔴 un succès pose le témoin — avant, seul l’échec parlait', () => {
    const src = rc();
    expect(src, 'le succès ne laisse toujours aucune trace').toContain('enregistreLe = Date.now();');
    expect(src).toMatch(/<span class="rc-saved"[^>]*>\{\$t\('common\.saved'\)\}<\/span>/);
  });

  it('le témoin s’efface — un témoin permanent cesse d’être lu', () => {
    // Laissé à l'écran, il ne dirait plus rien du clic SUIVANT : on ne saurait
    // pas si le second réglage est passé.
    expect(rc()).toMatch(/setTimeout\(\(\) => \{ enregistreLe = 0; \}/);
    expect(rc(), 'deux clics rapides laisseraient deux minuteries en vol')
      .toContain('if (minuterie) clearTimeout(minuterie);');
  });

  it('l’échec continue de parler — on n’a rien remplacé', () => {
    expect(rc()).toContain("notifications.error($t('renderer.saveError'));");
  });

  it('🔴 les SEPT réglages passent par le même `save` — donc tous le montrent', () => {
    // Si l'un d'eux appelait l'API en direct, il resterait muet et l'écran
    // serait à moitié corrigé. C'est le vrai invariant.
    const src = rc();
    const appels = src.match(/api\.updateZone\w+\(/g) ?? [];
    expect(appels.length, 'aucun appel de sauvegarde trouvé : fichier déplacé ?')
      .toBeGreaterThanOrEqual(6);
    const horsSave = src
      .split(/api\.updateZone\w+\(/)
      .slice(0, -1)
      .filter((avant) => !/save\(\(\) => $/.test(avant));
    expect(horsSave, 'un réglage s’enregistre hors de `save` : il restera muet').toEqual([]);
  });

  it('AUCUN bouton « enregistrer » n’a été ajouté — ce serait un mensonge', () => {
    // Les réglages sont déjà écrits au clic. Un bouton laisserait croire le
    // contraire, et le fermer sans l'avoir pressé donnerait l'impression
    // d'avoir tout perdu.
    expect(rc()).not.toMatch(/\$t\('common\.save'\)/);
  });

  it('le voisin du même onglet montre le même témoin — c’est la maison', () => {
    // Contre-épreuve du raisonnement : si `ZoneDeviceEditor` cessait de le
    // faire, ce fichier n'aurait plus de référence et devrait être relu.
    expect(sansCommentaires(lire('src/components/ZoneDeviceEditor.svelte')))
      .toContain("{$t('common.saved')}");
  });
});
