import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Appliance Tune OS — stockage et extinction, portés de l'ancienne interface
 * vers les Réglages v2 (section « Emplacement des données », état du serveur).
 *
 * Deux gestes y sont IRRÉVERSIBLES : installer Tune OS EFFACE un disque, et
 * déplacer les données redémarre le serveur. Ce fichier garde leurs verrous
 * plus que leur présence.
 */
const V2 = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
const corps = (nom: string) => {
  const i = V2.indexOf(`async function ${nom}(`);
  expect(i, `fonction introuvable : ${nom}`).toBeGreaterThan(-1);
  return V2.slice(i, V2.indexOf('\n  }\n', i));
};
const debut = V2.indexOf("{:else if s.id === 'dataLoc'}");
const bloc = V2.slice(debut, V2.indexOf('{:else if s.id ===', debut + 1));

describe('🔴 installer sur disque EFFACE : il faut TAPER le mot', () => {
  it('la saisie « EFFACER » précède l’écriture, et rien d’autre ne suffit', () => {
    const c = corps('installToDisk');
    const saisie = c.indexOf("if (tape !== 'EFFACER') return;");
    expect(saisie, 'plus de saisie exigée avant d’effacer un disque').toBeGreaterThan(-1);
    expect(saisie).toBeLessThan(c.indexOf('api.applianceInstallToDisk('));
  });

  it('une seconde installation ne peut pas partir pendant la saisie', () => {
    const c = corps('installToDisk');
    const apres = c.slice(c.indexOf("if (tape !== 'EFFACER') return;"));
    expect(apres).toMatch(/^[^\n]*\n\s*if \(installBusy\) return;/);
  });

  it('seuls les disques internes non amorçables sont proposés', () => {
    expect(bloc).toContain("dataDisks.filter((d) => !d.is_boot && d.tran !== 'usb')");
  });
});

describe('déplacer les données : confirmation dangereuse, jamais en double', () => {
  it('la confirmation précède le déplacement, et le garde est relu après elle', () => {
    const c = corps('relocateData');
    const conf = c.indexOf('dialogs.confirm(');
    expect(conf).toBeGreaterThan(-1);
    expect(c.slice(conf, c.indexOf('api.applianceRelocateData('))).toContain('if (dataMoving) return;');
    expect(c).toContain('{ danger: true }');
  });
});

describe('éteindre la machine, et le tout réservé à l’appliance', () => {
  it('l’extinction est confirmée, et n’est offerte que sur Tune OS', () => {
    const c = corps('eteindreLaMachine');
    expect(c.indexOf('dialogs.confirm(')).toBeLessThan(c.indexOf('api.applianceShutdown()'));
    const i = V2.indexOf('onclick={eteindreLaMachine}');
    expect(V2.lastIndexOf('{#if isAppliance === true}', i)).toBeGreaterThan(V2.lastIndexOf('{/if}', i));
  });

  it('le stockage n’est lu, et montré, que sur une appliance', () => {
    expect(V2).toMatch(/if \(isAppliance === true && !applianceLu\) \{ applianceLu = true; void loadApplianceStorage\(\); \}/);
    expect(bloc).toContain('{#if isAppliance === true}');
  });
});
