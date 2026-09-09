/**
 * DUP-1 côté écran (v0.9.138 → client) : le serveur sait fusionner deux zones
 * d'un même appareil et dater la dernière réponse de chacune ; l'écran Zones
 * du nouveau client le montre — badge de présence, bouton « Fusionner dans »
 * sur la zone hors ligne dont la jumelle est en ligne. Cette garde tient les
 * trois fils ensemble : l'API, l'écran, et les onze langues.
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

describe('fusion des zones en double', () => {
  it("l'API porte les deux routes du serveur, telles quelles", () => {
    const api = sansCommentaires(lire('src/lib/api.ts'));
    expect(api).toContain('/zones/${doublon}/fusionner-dans/${cible}');
    expect(api).toContain("`${BASE}/system/diagnostics`");
    expect(api).toContain('zones_doublons');
  });

  it("l'écran Zones propose la fusion et montre la présence", () => {
    const src = sansCommentaires(lire('src/components/v2/ZonesV2.svelte'));
    expect(src).toContain('api.mergeZoneInto(');
    expect(src).toContain('api.getZonesDoublons()');
    expect(src).toContain('onclick={(e) => fusionner(z, j!, e)}');
    // La fusion se confirme d'un second clic, comme la suppression.
    expect(src).toContain("confirmMerge === z.id ? $t('v2.zone.mergeConfirm'");
    for (const code of ['eteinte_recemment', 'absente_depuis', 'jamais_vue']) {
      expect(src).toContain(`'${code}'`);
    }
  });

  it('le type Zone connaît la présence', () => {
    const t = lire('src/lib/types.ts');
    expect(t).toContain("presence?: 'en_ligne' | 'eteinte_recemment' | 'absente_depuis' | 'jamais_vue'");
    expect(t).toContain('jours_absente?: number');
  });

  it('les cinq clés existent dans les onze langues', () => {
    const cles = ['v2.zone.mergeInto', 'v2.zone.mergeConfirm', 'v2.zone.presenceRecent', 'v2.zone.presenceAbsent', 'v2.zone.presenceNever'];
    for (const l of ['fr', 'en', 'de', 'es', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh']) {
      const src = lire(`src/lib/locales/${l}.ts`);
      for (const k of cles) expect(src, `${k} manque en ${l}`).toContain(`"${k}"`);
    }
  });
});
