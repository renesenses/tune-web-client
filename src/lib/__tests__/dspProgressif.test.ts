/**
 * LAT-F1 (phase 1, serveur v0.9.139) : le réglage `dsp_progressif_reseau`
 * existe côté serveur, désactivé par défaut. Sans bascule à l'écran il ne
 * servait à personne. Cette garde tient la ligne de réglage, sa lecture, son
 * écriture et ses onze traductions.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('bascule « traitement au fil de l’eau sur les lecteurs réseau »', () => {
  it('a sa ligne dans Réglages, au niveau expert, à côté du DSD', () => {
    const v = lire('src/lib/v2Settings.ts');
    expect(v).toContain("id: 'dspProgressif'");
    expect(v.indexOf("id: 'dsd'")).toBeLessThan(v.indexOf("id: 'dspProgressif'"));
  });

  it('lit et écrit la clé serveur exacte', () => {
    const s = lire('src/components/v2/SettingsV2.svelte');
    expect(s).toContain('dspProgressif = c?.dsp_progressif_reseau ?? false');
    expect(s).toContain('patch({ dsp_progressif_reseau: v }');
    expect(s).toContain("s.id === 'dspProgressif'");
  });

  it('les sept clés existent dans les onze langues', () => {
    const cles = ['settings.dspProgressifTitle', 'settings.dspProgressifLabel', 'settings.dspProgressifHint', 'settings.dspOptionFile', 'settings.dspOptionStream', 'settings.dspProgressifOn', 'settings.dspProgressifOff'];
    for (const l of ['fr', 'en', 'de', 'es', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh']) {
      const src = lire(`src/lib/locales/${l}.ts`);
      for (const k of cles) expect(src, `${k} manque en ${l}`).toContain(`"${k}"`);
    }
  });
});
