import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Revalider la licence — porté de l'ancienne interface vers la section
 * Licence v2. Une licence à clé que rien ne revalide retombe en gratuit ;
 * l'interface actuelle n'offrait pas le geste.
 *
 * 🔴 #570 : la route répond 200 dans TOUS ses cas d'échec. Un succès annoncé
 * sur le seul code HTTP a laissé Bruno seize jours en gratuit. La règle
 * partagée (`verdictValidationLicence`, gardée par ses propres tests) exige
 * que l'état RELU montre le palier ; ce fichier garde qu'elle est BRANCHÉE.
 */
const V2 = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
const i = V2.indexOf('async function validateLic(');
const corps = V2.slice(i, V2.indexOf('\n  }\n', i));
const debut = V2.indexOf("{:else if s.id === 'license'}");
const bloc = V2.slice(debut, V2.indexOf('{:else if s.id ===', debut + 1));

describe('la licence se revalide depuis la section Licence', () => {
  it('le bouton est offert quand une clé est posée', () => {
    const cle = bloc.indexOf('{#if lic.licenseKey}');
    expect(cle).toBeGreaterThan(-1);
    expect(bloc.slice(cle, bloc.indexOf('{:else}', cle))).toContain('onclick={validateLic}');
  });

  it('🔴 le verdict vient de la règle partagée, APRÈS la relecture de l’état', () => {
    expect(i).toBeGreaterThan(-1);
    const relu = corps.indexOf('await loadLicense()');
    const verdict = corps.indexOf('verdictValidationLicence(reponse,');
    expect(relu, 'l’état n’est pas relu').toBeGreaterThan(-1);
    expect(verdict, 'le verdict ne passe pas par la règle partagée').toBeGreaterThan(relu);
    expect(corps).toMatch(/if \(verdict\.succes\) notifications\.success\(texte\);\s*else notifications\.error\(texte\);/);
  });

  it('un refus pour excès de requêtes met le bouton au repos', () => {
    expect(corps).toContain('if (verdict.repos) licReposer();');
    expect(corps).toMatch(/e\?\.status === 429[^\n]*licReposer\(\)/);
    expect(bloc).toContain('disabled={licValidating || licCooldown}');
  });
});
