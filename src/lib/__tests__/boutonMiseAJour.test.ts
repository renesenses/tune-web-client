/**
 * « Mise à jour : manque le bouton de maj ! » (Bertrand, 06/09/2026, v0.9.138).
 *
 * Le bouton n'était pas absent du code — il était INATTEIGNABLE. Huitième cas
 * d'« écrit mais pas branché » : `POST /system/update/install`, le traitement
 * des refus 409, la surveillance du redémarrage, l'avertissement de coupure,
 * tout était écrit dans `SettingsV2`. Le bloc entier vit sous
 * `{#if updateInfo?.latest_version}`, et ce champ n'existe pas.
 *
 * Mesuré sur le .18 :
 *
 *   /system/update/check  → {"current":"0.9.138","latest":"0.9.138", …}
 *   /system/update/status → {"current_version":"0.9.138", …}
 *
 * Deux routes voisines, deux conventions. L'ancien client TRADUISAIT ; la
 * traduction avait été perdue en écrivant le nouveau, pas remplacée.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normaliserVerificationMaj } from '../miseAJour';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('normalisation de /system/update/check', () => {
  it('traduit la réponse RÉELLE du serveur', () => {
    // Copiée telle quelle du .18, 06/09/2026.
    const reel = {
      channel: 'auto', current: '0.9.138', download_url: null,
      effective_channel: 'stable', install_hint: null, installable: true,
      latest: '0.9.140', release_notes: null, size_bytes: 0,
      update_available: true,
    };
    const v = normaliserVerificationMaj(reel)!;
    expect(v.latest_version).toBe('0.9.140');
    expect(v.current_version).toBe('0.9.138');
    expect(v.update_available).toBe(true);
  });

  it('les champs bruts survivent : rien n est perdu au passage', () => {
    const v = normaliserVerificationMaj({ current: '1', latest: '2', release_notes: 'ok' })!;
    expect(v.release_notes).toBe('ok');
  });

  it('accepte déjà les noms normalisés, sans les écraser', () => {
    const v = normaliserVerificationMaj({
      latest_version: '2.0', current_version: '1.0', latest: 'X', current: 'Y',
    })!;
    expect(v.latest_version).toBe('2.0');
    expect(v.current_version).toBe('1.0');
  });

  it('une absence reste une absence, pas un faux « à jour »', () => {
    expect(normaliserVerificationMaj(null)).toBeNull();
    expect(normaliserVerificationMaj(undefined)).toBeNull();
    expect(normaliserVerificationMaj('boom')).toBeNull();
  });

  it('`update_available` est un BOOLÉEN, jamais une valeur molle', () => {
    // Le serveur pourrait rendre l'absence du champ ; `undefined` sous un
    // `{#if}` se comporte comme faux, mais `!!` le dit explicitement.
    expect(normaliserVerificationMaj({})!.update_available).toBe(false);
    expect(normaliserVerificationMaj({ update_available: 'oui' })!.update_available).toBe(false);
  });
});

describe('les écrans passent tous par cette traduction', () => {
  it("l'écran Réglages du nouveau client", () => {
    const src = sansCommentaires(lire('src/components/v2/SettingsV2.svelte'));
    expect(src).toContain('normaliserVerificationMaj(d)');
    // 🔴 La garde qui compte : le bouton d'installation dépend d'un champ que
    // SEULE la normalisation produit (`update_available`, un vrai booléen).
    // Sans elle, le bouton est invisible pour toujours, et aucun test de rendu
    // ne le dirait. Le bloc lui-même, depuis la v0.9.139, est toujours visible.
    expect(src).toContain('{#if updateInfo?.update_available}');
    expect(src, "la réponse brute ne doit plus être posée telle quelle").not.toMatch(
      /updateInfo = d\?\.update_available \? d : null/,
    );
  });

  it('le magasin qui alimente le bandeau', () => {
    const src = sansCommentaires(lire('src/lib/stores/updates.ts'));
    expect(src).toContain('normaliserVerificationMaj(await api.checkForUpdate())');
  });

  it("`/update/status` garde SON nom : c'est une autre route", () => {
    // `current_version` y est le vrai champ. Le normaliser aussi serait une
    // correction en trop, qui casserait la détection du redémarrage.
    const src = sansCommentaires(lire('src/components/v2/SettingsV2.svelte'));
    expect(src).toMatch(/st\?\.current_version/);
  });
});

/**
 * « MAJ v2 toujours pas de bouton comme dans la version actuelle » (Bertrand,
 * 06/09/2026, v0.9.139). Corriger le nom du champ ne suffisait pas : le bloc
 * entier restait sous « une mise à jour est disponible », donc un serveur à
 * jour n'affichait RIEN — ni « À jour », ni moyen de revérifier. L'ancien
 * client montre « ✓ À jour » ; le nouveau le montre aussi, avec un bouton.
 */
describe('le bloc de mise à jour de SettingsV2 est toujours visible', () => {
  const src = sansCommentaires(lire('src/components/v2/SettingsV2.svelte'));

  it('n efface plus le résultat quand aucune mise à jour n est disponible', () => {
    expect(src).not.toContain("updateInfo = v?.update_available ? v : null");
    expect(src).toContain('updateInfo = normaliserVerificationMaj(d)');
  });

  it('conditionne le bloc d installation sur update_available, et rien d autre', () => {
    expect(src).toContain('{#if updateInfo?.update_available}');
    expect(src).not.toContain('{#if updateInfo?.latest_version}');
  });

  it('dit « à jour » et offre de revérifier', () => {
    expect(src).toContain("settings.upToDate");
    expect(src).toContain("settings.checkUpdatesNow");
    expect(src).toContain('onclick={verifierMaj}');
  });

  it('la clé du bouton existe dans les onze langues', () => {
    for (const l of ['fr', 'en', 'de', 'es', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh']) {
      expect(lire(`src/lib/locales/${l}.ts`)).toContain('"settings.checkUpdatesNow"');
    }
  });
});
