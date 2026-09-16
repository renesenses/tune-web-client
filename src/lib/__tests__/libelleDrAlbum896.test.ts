/**
 * #896 — Patatorz, fils 1683 (11/09) et 1800 (15/09) : « clarifier dans la
 * vue oxygène si "dynamic" est celle de l'album ou des titres ». Arbitrage
 * de Bertrand du 11/09 : la facette porte le DR de l'ALBUM, et le libellé
 * doit le dire. Mesuré sur le tag v0.9.150 : il ne le disait pas encore.
 *
 * Deux choses : le libellé nomme l'album ; l'infobulle dit d'où vient la
 * valeur — le tag ALBUM DYNAMIC RANGE, sinon la moyenne des pistes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'ro', 'sv', 'hu', 'ja', 'ko', 'zh'];

describe('#896 — le libellé de la facette Dynamic Range', () => {
  it('🔴 fr et en nomment l’ALBUM', async () => {
    const fr = (await import('../locales/fr')).default as Record<string, string>;
    const en = (await import('../locales/en')).default as Record<string, string>;
    expect(fr['oxygen.facet.dr'].toLowerCase()).toContain('album');
    expect(en['oxygen.facet.dr'].toLowerCase()).toContain('album');
    expect(fr['oxygen.facet.dr']).not.toBe('Dynamique');
  });
  for (const code of LANGUES) {
    it(`${code} : une infobulle dit d’où vient la valeur`, async () => {
      const dico = (await import(`../locales/${code}`)).default as Record<string, string>;
      expect(dico['oxygen.facet.drHelp'], 'drHelp').toBeTruthy();
      expect(dico['oxygen.facet.drHelp']).toContain('ALBUM DYNAMIC RANGE');
    });
  }
  it('🔴 le rail porte cette infobulle sur le titre de la facette DR — et sur elle seule', () => {
    const rail = readFileSync(resolve(process.cwd(), 'src/components/v2-heritage/OxygenFacetRail.svelte'), 'utf-8');
    expect(rail).toContain("title={f === 'dr' ? $t('oxygen.facet.drHelp') : undefined}");
  });
});
